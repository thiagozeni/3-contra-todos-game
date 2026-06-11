/**
 * interstitialCadence.test.ts — Task 3, Step 1 (RED → GREEN)
 *
 * Tests the pure cadence machine that decides whether to show an interstitial ad.
 *
 * Default constants (from plan §Questões abertas #2):
 *   - NEVER on the first game-over (gameOverCount === 1 after increment)
 *   - At most 1 per every MIN_INTERVAL_EVENTS game-overs (default 3)
 *   - At least COOLDOWN_MS milliseconds since the last interstitial (default 90 000)
 *   - NEVER in co-op / net mode
 *
 * The module exposes:
 *   - nextCadence(state, event, opts?) → { show: boolean; nextState: CadenceState }
 *   - initialCadenceState() → CadenceState
 *
 * State is immutable — nextCadence always returns a NEW CadenceState object.
 * The injected clock (opts.nowMs) makes the logic fully testable without real timers.
 */

import { describe, it, expect } from 'vitest'
import {
  initialCadenceState,
  nextCadence,
  type CadenceState,
} from '../../src/ads/interstitialCadence'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Fire N game-over events, starting from the given state. Returns the last state. */
function fireN(
  n: number,
  state: CadenceState,
  opts: { nowMs?: number; isNet?: boolean } = {},
): { show: boolean; nextState: CadenceState } {
  let result = { show: false, nextState: state }
  for (let i = 0; i < n; i++) {
    result = nextCadence(result.nextState, 'gameOver', opts)
  }
  return result
}

// ── initialCadenceState ───────────────────────────────────────────────────────

describe('initialCadenceState', () => {
  it('returns a well-formed initial state', () => {
    const s = initialCadenceState()
    expect(typeof s.gameOverCount).toBe('number')
    expect(s.gameOverCount).toBe(0)
    expect(typeof s.lastShownMs).toBe('number')
    expect(s.lastShownMs).toBe(-1) // -1 = never shown sentinel
  })
})

// ── First game-over: NEVER show ───────────────────────────────────────────────

describe('nextCadence — first game-over', () => {
  it('never shows interstitial on the very first game-over', () => {
    const { show } = nextCadence(initialCadenceState(), 'gameOver', { nowMs: 999_999 })
    expect(show).toBe(false)
  })

  it('increments the counter on the first game-over', () => {
    const { nextState } = nextCadence(initialCadenceState(), 'gameOver')
    expect(nextState.gameOverCount).toBe(1)
  })
})

// ── Interval gate: at most 1 per MIN_INTERVAL_EVENTS ─────────────────────────

describe('nextCadence — interval gate (every 3 game-overs)', () => {
  it('does NOT show on game-over #2 (one short of interval)', () => {
    // #1 → no show; #2 → no show (need count divisible by 3, min=3)
    const s1 = nextCadence(initialCadenceState(), 'gameOver', { nowMs: 0 }).nextState
    const { show } = nextCadence(s1, 'gameOver', { nowMs: 100_000 })
    expect(show).toBe(false)
  })

  it('shows on game-over #3 (first eligible: count=3, no prior show)', () => {
    const { show } = fireN(3, initialCadenceState(), { nowMs: 100_000 })
    expect(show).toBe(true)
  })

  it('does NOT show on game-over #4 (one past interval)', () => {
    // After showing on #3, clock must advance past cooldown to show again
    const stateAfter3 = fireN(3, initialCadenceState(), { nowMs: 100_000 }).nextState
    const { show } = nextCadence(stateAfter3, 'gameOver', { nowMs: 100_001 })
    expect(show).toBe(false)
  })

  it('shows on game-over #6 (second interval, cooldown passed)', () => {
    const stateAfter3 = fireN(3, initialCadenceState(), { nowMs: 0 }).nextState
    const { show } = fireN(3, stateAfter3, { nowMs: 120_000 })
    expect(show).toBe(true)
  })

  it('does NOT show on game-over #5 (between intervals, no cooldown issue)', () => {
    const stateAfter3 = fireN(3, initialCadenceState(), { nowMs: 0 }).nextState
    // #4 → no; #5 → no (interval not met — needs multiples of 3 past previous show)
    const s4 = nextCadence(stateAfter3, 'gameOver', { nowMs: 120_000 }).nextState
    const { show } = nextCadence(s4, 'gameOver', { nowMs: 120_001 })
    expect(show).toBe(false)
  })
})

// ── Cooldown gate: at least 90 000 ms between shows ──────────────────────────

describe('nextCadence — cooldown gate (90 000 ms)', () => {
  it('does NOT show if cooldown has not elapsed since the last show', () => {
    // Show on #3 at t=0; try #6 at t=89 999 → blocked by cooldown
    const stateAfter3 = fireN(3, initialCadenceState(), { nowMs: 0 }).nextState
    const { show } = fireN(3, stateAfter3, { nowMs: 89_999 })
    expect(show).toBe(false)
  })

  it('shows if cooldown has exactly elapsed (boundary: ≥ 90 000 ms)', () => {
    const stateAfter3 = fireN(3, initialCadenceState(), { nowMs: 0 }).nextState
    const { show } = fireN(3, stateAfter3, { nowMs: 90_000 })
    expect(show).toBe(true)
  })

  it('shows if cooldown has more than elapsed', () => {
    const stateAfter3 = fireN(3, initialCadenceState(), { nowMs: 0 }).nextState
    const { show } = fireN(3, stateAfter3, { nowMs: 200_000 })
    expect(show).toBe(true)
  })

  it('updates lastShownMs when a show is granted', () => {
    const { show, nextState } = fireN(3, initialCadenceState(), { nowMs: 12_345 })
    expect(show).toBe(true)
    expect(nextState.lastShownMs).toBe(12_345)
  })

  it('does NOT update lastShownMs when show is NOT granted (stays at sentinel -1)', () => {
    const { show, nextState } = nextCadence(initialCadenceState(), 'gameOver', { nowMs: 12_345 })
    expect(show).toBe(false)
    expect(nextState.lastShownMs).toBe(-1) // sentinel: never shown
  })
})

// ── Co-op / net mode: NEVER show ─────────────────────────────────────────────

describe('nextCadence — co-op guard', () => {
  it('never shows when isNet=true, even on eligible game-over', () => {
    const { show } = fireN(3, initialCadenceState(), { nowMs: 100_000, isNet: true })
    expect(show).toBe(false)
  })

  it('still increments count in net mode (does not corrupt future single-player cadence)', () => {
    const { nextState } = fireN(3, initialCadenceState(), { nowMs: 100_000, isNet: true })
    expect(nextState.gameOverCount).toBe(3)
  })

  it('resumes normal cadence for single-player after net sessions', () => {
    // Suppose player had 3 net game-overs, then switches to single-player
    const netState = fireN(3, initialCadenceState(), { nowMs: 0, isNet: true }).nextState
    // Now 3 single-player game-overs with clock advanced — should show
    const { show } = fireN(3, netState, { nowMs: 100_000, isNet: false })
    expect(show).toBe(true)
  })
})

// ── Immutability ──────────────────────────────────────────────────────────────

describe('nextCadence — immutability', () => {
  it('never mutates the input state', () => {
    const original = initialCadenceState()
    const frozen = Object.freeze({ ...original })
    expect(() => nextCadence(frozen as CadenceState, 'gameOver', { nowMs: 0 })).not.toThrow()
    expect(frozen.gameOverCount).toBe(0)
    expect(frozen.lastShownMs).toBe(-1) // sentinel unchanged
  })

  it('returns a new state object on every call', () => {
    const s = initialCadenceState()
    const { nextState: a } = nextCadence(s, 'gameOver')
    const { nextState: b } = nextCadence(s, 'gameOver')
    expect(a).not.toBe(b)
    expect(a).not.toBe(s)
  })
})

// ── Default nowMs (uses Date.now()) ──────────────────────────────────────────

describe('nextCadence — default clock', () => {
  it('works without injecting nowMs (uses Date.now())', () => {
    const { show } = nextCadence(initialCadenceState(), 'gameOver')
    // First game-over never shows regardless of clock
    expect(show).toBe(false)
  })
})
