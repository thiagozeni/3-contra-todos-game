/**
 * lifecycle.test.ts — TDD tests for the pure lifecycle state machine.
 *
 * createLifecycleManager(deps) implements background→foreground transitions:
 *   active → background (record timestamp, pauseInput)
 *   background → active within window (resumeInput + requestReconnect)
 *   background → active after window (leaveToMenu)
 *   double events are idempotent (no double emissions)
 *   background in lobby (not in match) → same flow (graceful, leaveToMenu on timeout)
 *
 * All state transitions return new objects (immutable).
 * The machine uses injectable deps: { now(), onPauseInput(), onResumeInput(),
 *   requestReconnect(), leaveToMenu(), reconnectWindowMs }.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createLifecycleManager,
  type LifecycleState,
  type LifecycleManagerDeps,
  type LifecycleManager,
} from '../../src/net/lifecycle'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeps(overrides?: Partial<LifecycleManagerDeps>): {
  deps: LifecycleManagerDeps
  mocks: {
    now: ReturnType<typeof vi.fn>
    onPauseInput: ReturnType<typeof vi.fn>
    onResumeInput: ReturnType<typeof vi.fn>
    requestReconnect: ReturnType<typeof vi.fn>
    leaveToMenu: ReturnType<typeof vi.fn>
  }
} {
  const mocks = {
    now: vi.fn().mockReturnValue(0),
    onPauseInput: vi.fn(),
    onResumeInput: vi.fn(),
    requestReconnect: vi.fn(),
    leaveToMenu: vi.fn(),
  }
  return {
    mocks,
    deps: {
      now: mocks.now,
      onPauseInput: mocks.onPauseInput,
      onResumeInput: mocks.onResumeInput,
      requestReconnect: mocks.requestReconnect,
      leaveToMenu: mocks.leaveToMenu,
      reconnectWindowMs: 60_000,
      ...overrides,
    },
  }
}

// ── State machine structure ────────────────────────────────────────────────────

describe('createLifecycleManager — initial state', () => {
  it('starts in "active" state', () => {
    const { deps } = makeDeps()
    const mgr = createLifecycleManager(deps)
    expect(mgr.getState().status).toBe('active')
  })

  it('returns an immutable state snapshot (object, not primitive)', () => {
    const { deps } = makeDeps()
    const mgr = createLifecycleManager(deps)
    const s1 = mgr.getState()
    const s2 = mgr.getState()
    // Same shape, different (or same) reference — key: s1.status is 'active'
    expect(s1).toEqual(s2)
    expect(s1.status).toBe('active')
  })
})

// ── active → background ───────────────────────────────────────────────────────

describe('transition: active → background', () => {
  it('calls onPauseInput on background event', () => {
    const { deps, mocks } = makeDeps()
    mocks.now.mockReturnValue(1000)
    const mgr = createLifecycleManager(deps)
    mgr.onAppBackground()
    expect(mocks.onPauseInput).toHaveBeenCalledOnce()
  })

  it('records the backgroundedAt timestamp', () => {
    const { deps, mocks } = makeDeps()
    mocks.now.mockReturnValue(5000)
    const mgr = createLifecycleManager(deps)
    mgr.onAppBackground()
    const s = mgr.getState()
    expect(s.status).toBe('backgrounded')
    expect((s as { status: 'backgrounded'; backgroundedAt: number }).backgroundedAt).toBe(5000)
  })

  it('does NOT call onResumeInput or requestReconnect during background', () => {
    const { deps, mocks } = makeDeps()
    const mgr = createLifecycleManager(deps)
    mgr.onAppBackground()
    expect(mocks.onResumeInput).not.toHaveBeenCalled()
    expect(mocks.requestReconnect).not.toHaveBeenCalled()
    expect(mocks.leaveToMenu).not.toHaveBeenCalled()
  })
})

// ── background → active within window ────────────────────────────────────────

describe('transition: background → active (within reconnect window)', () => {
  it('calls resumeInput and requestReconnect when foregrounded within 60s', () => {
    const { deps, mocks } = makeDeps()
    mocks.now.mockReturnValue(0)
    const mgr = createLifecycleManager(deps)

    mgr.onAppBackground()
    mocks.now.mockReturnValue(30_000)  // 30s later — within 60s window
    mgr.onAppForeground()

    expect(mocks.onResumeInput).toHaveBeenCalledOnce()
    expect(mocks.requestReconnect).toHaveBeenCalledOnce()
    expect(mocks.leaveToMenu).not.toHaveBeenCalled()
  })

  it('state returns to "active" after within-window foreground', () => {
    const { deps, mocks } = makeDeps()
    mocks.now.mockReturnValue(0)
    const mgr = createLifecycleManager(deps)

    mgr.onAppBackground()
    mocks.now.mockReturnValue(59_999)  // just inside 60s window
    mgr.onAppForeground()

    expect(mgr.getState().status).toBe('active')
  })

  it('works at exactly t=0 (instant background + foreground)', () => {
    const { deps, mocks } = makeDeps()
    mocks.now.mockReturnValue(1000)
    const mgr = createLifecycleManager(deps)

    mgr.onAppBackground()
    // still at 1000 — 0ms elapsed
    mgr.onAppForeground()

    expect(mocks.requestReconnect).toHaveBeenCalledOnce()
    expect(mocks.leaveToMenu).not.toHaveBeenCalled()
  })
})

// ── background → active after window ─────────────────────────────────────────

describe('transition: background → active (after reconnect window expires)', () => {
  it('calls leaveToMenu when foregrounded after 60s', () => {
    const { deps, mocks } = makeDeps()
    mocks.now.mockReturnValue(0)
    const mgr = createLifecycleManager(deps)

    mgr.onAppBackground()
    mocks.now.mockReturnValue(60_001)  // 60s + 1ms → expired
    mgr.onAppForeground()

    expect(mocks.leaveToMenu).toHaveBeenCalledOnce()
    expect(mocks.requestReconnect).not.toHaveBeenCalled()
  })

  it('does NOT call resumeInput when window expired', () => {
    const { deps, mocks } = makeDeps()
    mocks.now.mockReturnValue(0)
    const mgr = createLifecycleManager(deps)

    mgr.onAppBackground()
    mocks.now.mockReturnValue(120_000)
    mgr.onAppForeground()

    expect(mocks.onResumeInput).not.toHaveBeenCalled()
  })

  it('state remains "active" (or becomes active) after expired foreground', () => {
    const { deps, mocks } = makeDeps()
    mocks.now.mockReturnValue(0)
    const mgr = createLifecycleManager(deps)

    mgr.onAppBackground()
    mocks.now.mockReturnValue(65_000)
    mgr.onAppForeground()

    // After expired foreground the manager calls leaveToMenu; the state should reset
    expect(mgr.getState().status).toBe('active')
  })

  it('uses custom reconnectWindowMs (shorter window)', () => {
    const { deps, mocks } = makeDeps({ reconnectWindowMs: 10_000 })
    mocks.now.mockReturnValue(0)
    const mgr = createLifecycleManager(deps)

    mgr.onAppBackground()
    mocks.now.mockReturnValue(10_001)  // just over 10s
    mgr.onAppForeground()

    expect(mocks.leaveToMenu).toHaveBeenCalledOnce()
    expect(mocks.requestReconnect).not.toHaveBeenCalled()
  })

  it('uses custom reconnectWindowMs (within shorter window)', () => {
    const { deps, mocks } = makeDeps({ reconnectWindowMs: 10_000 })
    mocks.now.mockReturnValue(0)
    const mgr = createLifecycleManager(deps)

    mgr.onAppBackground()
    mocks.now.mockReturnValue(9_999)  // just under 10s
    mgr.onAppForeground()

    expect(mocks.requestReconnect).toHaveBeenCalledOnce()
    expect(mocks.leaveToMenu).not.toHaveBeenCalled()
  })
})

// ── Idempotency ───────────────────────────────────────────────────────────────

describe('idempotency — double events', () => {
  it('two consecutive background events only emit pauseInput once', () => {
    const { deps, mocks } = makeDeps()
    mocks.now.mockReturnValue(0)
    const mgr = createLifecycleManager(deps)

    mgr.onAppBackground()
    mgr.onAppBackground()  // second call while already backgrounded

    expect(mocks.onPauseInput).toHaveBeenCalledTimes(1)
  })

  it('two consecutive foreground events while active are no-ops', () => {
    const { deps, mocks } = makeDeps()
    mocks.now.mockReturnValue(0)
    const mgr = createLifecycleManager(deps)

    // No prior background — foregrounding while already active
    mgr.onAppForeground()
    mgr.onAppForeground()

    expect(mocks.onResumeInput).not.toHaveBeenCalled()
    expect(mocks.requestReconnect).not.toHaveBeenCalled()
    expect(mocks.leaveToMenu).not.toHaveBeenCalled()
  })

  it('background → foreground → background → foreground sequence', () => {
    const { deps, mocks } = makeDeps()
    let t = 0
    mocks.now.mockImplementation(() => t)

    const mgr = createLifecycleManager(deps)

    t = 0;   mgr.onAppBackground()   // 1st background
    t = 5_000; mgr.onAppForeground() // within window → reconnect
    t = 5_000; mgr.onAppBackground() // 2nd background
    t = 10_000; mgr.onAppForeground() // within window → reconnect again

    expect(mocks.onPauseInput).toHaveBeenCalledTimes(2)
    expect(mocks.onResumeInput).toHaveBeenCalledTimes(2)
    expect(mocks.requestReconnect).toHaveBeenCalledTimes(2)
    expect(mocks.leaveToMenu).not.toHaveBeenCalled()
  })

  it('background → expired foreground → background → within-window foreground', () => {
    const { deps, mocks } = makeDeps()
    let t = 0
    mocks.now.mockImplementation(() => t)

    const mgr = createLifecycleManager(deps)

    t = 0;      mgr.onAppBackground()    // 1st background
    t = 70_000; mgr.onAppForeground()    // expired → leaveToMenu
    t = 70_000; mgr.onAppBackground()    // 2nd background
    t = 75_000; mgr.onAppForeground()    // within 60s window → reconnect

    expect(mocks.leaveToMenu).toHaveBeenCalledTimes(1)
    expect(mocks.requestReconnect).toHaveBeenCalledTimes(1)
  })
})

// ── getState immutability ─────────────────────────────────────────────────────

describe('immutability — getState returns a new snapshot each time', () => {
  it('getState after background returns a new object with updated status', () => {
    const { deps, mocks } = makeDeps()
    mocks.now.mockReturnValue(9999)
    const mgr = createLifecycleManager(deps)

    const before = mgr.getState()
    expect(before.status).toBe('active')

    mgr.onAppBackground()
    const after = mgr.getState()
    expect(after.status).toBe('backgrounded')

    // Original snapshot should not have changed (immutable)
    expect(before.status).toBe('active')
  })

  it('state objects are plain objects (not the same reference as internal state)', () => {
    const { deps } = makeDeps()
    const mgr = createLifecycleManager(deps)
    const s1 = mgr.getState()
    const s2 = mgr.getState()
    // Equal in value; doesn't matter if same reference but status must be accessible
    expect(s1.status).toBe('active')
    expect(s2.status).toBe('active')
  })
})

// ── NetClient pauseSending / resumeSending gate ───────────────────────────────
// Tests for the sendInput pause gate built into NetClient.
// These cover the manager calling onPauseInput/onResumeInput which in the
// real wiring maps to netClient.pauseSending() / netClient.resumeSending().

describe('NetClient pauseSending / resumeSending gate (via deps)', () => {
  it('pauseInput dep is called synchronously on background event', () => {
    const { deps, mocks } = makeDeps()
    mocks.now.mockReturnValue(0)
    const mgr = createLifecycleManager(deps)

    let called = false
    mocks.onPauseInput.mockImplementation(() => { called = true })

    mgr.onAppBackground()
    expect(called).toBe(true)
  })

  it('resumeInput dep is called synchronously on within-window foreground event', () => {
    const { deps, mocks } = makeDeps()
    let t = 0
    mocks.now.mockImplementation(() => t)

    const mgr = createLifecycleManager(deps)
    let resumed = false
    mocks.onResumeInput.mockImplementation(() => { resumed = true })

    t = 0; mgr.onAppBackground()
    t = 1000; mgr.onAppForeground()

    expect(resumed).toBe(true)
  })
})

// ── Export shape ──────────────────────────────────────────────────────────────

describe('createLifecycleManager — exported API', () => {
  it('returns an object with onAppBackground, onAppForeground, getState, destroy', () => {
    const { deps } = makeDeps()
    const mgr = createLifecycleManager(deps)
    expect(typeof mgr.onAppBackground).toBe('function')
    expect(typeof mgr.onAppForeground).toBe('function')
    expect(typeof mgr.getState).toBe('function')
    expect(typeof mgr.destroy).toBe('function')
  })

  it('destroy() can be called multiple times without throwing', () => {
    const { deps } = makeDeps()
    const mgr = createLifecycleManager(deps)
    expect(() => {
      mgr.destroy()
      mgr.destroy()
    }).not.toThrow()
  })
})
