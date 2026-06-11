/**
 * prediction unit tests — client-side prediction of the LOCAL character's movement
 * + reconciliation against the authoritative server snapshot. Pure: no Phaser, no
 * network. Prediction is MOVEMENT-only (co-op PvE is latency-tolerant); hp/fsm/combat
 * always come from the server.
 */

import { describe, it, expect } from 'vitest'
import {
  predictStep,
  reconcile,
  SNAP_THRESHOLD_PX,
  SMOOTH_FACTOR,
} from '../../src/net/prediction'
import { movePlayer } from '../../src/core/systems/movement'
import type { PlayerState, MoveInput } from '../../src/core/types'

const NO_INPUT: MoveInput = {
  up: false, down: false, left: false, right: false, block: false, punch: false, kick: false,
}

function basePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    charKey: 'werdum',
    hp: 200,
    maxHp: 200,
    x: 800,
    y: 800,
    groundY: 800,
    fsm: 'normal',
    knockdownTimer: 0,
    attackCooldown: 0,
    isBlocking: false,
    facing: 1,
    scaleX: 1,
    ...over,
  }
}

describe('predictStep — delegation to movePlayer (no duplicated movement math)', () => {
  it('produces exactly the same result as movePlayer for right-held input', () => {
    const p = basePlayer()
    const input: MoveInput = { ...NO_INPUT, right: true }

    const predicted = predictStep(p, input, 16)
    const expected = movePlayer(p, input, 16)

    expect(predicted).toEqual(expected)
  })

  it('matches movePlayer for diagonal up-left input', () => {
    const p = basePlayer({ x: 900, y: 820 })
    const input: MoveInput = { ...NO_INPUT, up: true, left: true }
    expect(predictStep(p, input, 16)).toEqual(movePlayer(p, input, 16))
  })

  it('matches movePlayer across many frames (accumulated)', () => {
    let pred = basePlayer()
    let ref = basePlayer()
    const input: MoveInput = { ...NO_INPUT, right: true }
    for (let i = 0; i < 30; i++) {
      pred = predictStep(pred, input, 16)
      ref = movePlayer(ref, input, 16)
    }
    expect(pred.x).toBeCloseTo(ref.x)
    expect(pred.y).toBeCloseTo(ref.y)
  })

  it('does not mutate the input state', () => {
    const p = basePlayer()
    const snapshot = { ...p }
    predictStep(p, { ...NO_INPUT, right: true }, 16)
    expect(p).toEqual(snapshot)
  })
})

describe('reconcile — within threshold → smooth correction', () => {
  it('nudges toward the server position without snapping when divergence is small', () => {
    const predicted = basePlayer({ x: 800, y: 800 })
    const authoritative = basePlayer({ x: 810, y: 800 }) // 10px off (< threshold)

    const { state, corrected } = reconcile(predicted, authoritative)

    // Not a hard snap: lands strictly between predicted and server x.
    expect(state.x).toBeGreaterThan(800)
    expect(state.x).toBeLessThan(810)
    expect(corrected).toBe(false)
  })

  it('repeated smooth corrections converge toward the server position', () => {
    let state = basePlayer({ x: 800, y: 800 })
    const authoritative = basePlayer({ x: 830, y: 800 }) // within threshold
    for (let i = 0; i < 40; i++) {
      state = reconcile(state, authoritative).state
    }
    expect(state.x).toBeCloseTo(830, 1)
  })

  it('does nothing when already at the server position', () => {
    const p = basePlayer({ x: 800, y: 800 })
    const { state, corrected } = reconcile(p, basePlayer({ x: 800, y: 800 }))
    expect(state.x).toBeCloseTo(800)
    expect(state.y).toBeCloseTo(800)
    expect(corrected).toBe(false)
  })
})

describe('reconcile — divergence > threshold → hard snap', () => {
  it('snaps exactly to the server position when the gap exceeds the threshold', () => {
    const predicted = basePlayer({ x: 800, y: 800 })
    const authoritative = basePlayer({ x: 800 + SNAP_THRESHOLD_PX + 10, y: 800 })

    const { state, corrected } = reconcile(predicted, authoritative)

    expect(state.x).toBe(authoritative.x)
    expect(state.y).toBe(authoritative.y)
    expect(corrected).toBe(true)
  })
})

describe('reconcile — server-authoritative non-position fields', () => {
  it('always takes hp / maxHp / fsm / facing from the server, never from prediction', () => {
    const predicted = basePlayer({ x: 805, y: 800, hp: 200, fsm: 'normal', facing: 1 })
    const authoritative = basePlayer({ x: 800, y: 800, hp: 120, maxHp: 200, fsm: 'knockdown', facing: -1 })

    const { state } = reconcile(predicted, authoritative)

    expect(state.hp).toBe(120)
    expect(state.maxHp).toBe(200)
    expect(state.fsm).toBe('knockdown')
    expect(state.facing).toBe(-1)
  })

  it('reconciles position smoothly while still overriding combat fields (hard-snap branch too)', () => {
    const predicted = basePlayer({ x: 800, hp: 200, fsm: 'normal' })
    const authoritative = basePlayer({ x: 800 + SNAP_THRESHOLD_PX + 50, hp: 50, fsm: 'recovering' })
    const { state } = reconcile(predicted, authoritative)
    expect(state.hp).toBe(50)
    expect(state.fsm).toBe('recovering')
  })
})

describe('prediction respects a server-imposed knockdown', () => {
  it('cannot move locally once reconciliation has applied the knockdown fsm', () => {
    // Server says we are knocked down.
    const predicted = basePlayer({ x: 800, fsm: 'normal' })
    const authoritative = basePlayer({ x: 800, fsm: 'knockdown' })
    const { state } = reconcile(predicted, authoritative)
    expect(state.fsm).toBe('knockdown')

    // Now a subsequent predictStep with right-held must NOT move (movePlayer rule).
    const after = predictStep(state, { ...NO_INPUT, right: true }, 16)
    expect(after.x).toBeCloseTo(state.x)
  })
})

describe('tuning constants', () => {
  it('hard-snap threshold is a sensible large value (~48px)', () => {
    expect(SNAP_THRESHOLD_PX).toBeGreaterThanOrEqual(32)
    expect(SNAP_THRESHOLD_PX).toBeLessThanOrEqual(96)
  })

  it('smooth factor is a fraction in (0,1)', () => {
    expect(SMOOTH_FACTOR).toBeGreaterThan(0)
    expect(SMOOTH_FACTOR).toBeLessThan(1)
  })
})
