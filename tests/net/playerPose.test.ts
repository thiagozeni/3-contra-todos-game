/**
 * FB5 — Player fallen-pose decision (knockdown freeze on death).
 *
 * A co-op player who runs out of HP enters fsm:'down' and must LIE on the ground for
 * the rest of the match. The bug: the per-frame view sync fell back to idle/run once the
 * knockdown anim completed, standing the corpse upright. These tests pin the pure pose
 * rules that Player.syncFromState now uses so the regression cannot return silently.
 */

import { describe, it, expect } from 'vitest'
import { isFallenPose, mayPlayIdleOrRun } from '../../src/entities/playerPose'
import type { PlayerFsm } from '../../src/core/types'

describe('isFallenPose (FB5)', () => {
  it("treats 'down' as a fallen pose", () => {
    expect(isFallenPose('down')).toBe(true)
  })

  it.each<PlayerFsm>(['normal', 'knockdown', 'recovering', 'blocking'])(
    'does not treat %s as a fallen pose',
    (fsm) => {
      expect(isFallenPose(fsm)).toBe(false)
    },
  )
})

describe('mayPlayIdleOrRun (FB5)', () => {
  const base = { fsm: 'normal' as PlayerFsm, holdingDown: false, animLocked: false, blockAnimStarted: false }

  it('allows idle/run in the plain normal state', () => {
    expect(mayPlayIdleOrRun(base)).toBe(true)
  })

  it("NEVER allows idle/run while fsm is 'down' — the corpse must stay on the ground", () => {
    expect(mayPlayIdleOrRun({ ...base, fsm: 'down' })).toBe(false)
  })

  it('NEVER allows idle/run while down-held, even if the fsm momentarily reads normal', () => {
    // This is the exact regression: after the knockdown anim completed and animLocked
    // cleared, a stray sync with fsm carrying a transient value must not stand the
    // player up while still flagged as down-held.
    expect(mayPlayIdleOrRun({ ...base, holdingDown: true })).toBe(false)
    expect(mayPlayIdleOrRun({ ...base, fsm: 'normal', holdingDown: true })).toBe(false)
  })

  it('blocks idle/run while blocking (managed by the block anim)', () => {
    expect(mayPlayIdleOrRun({ ...base, fsm: 'blocking' })).toBe(false)
  })

  it('blocks idle/run while a combat anim is locked', () => {
    expect(mayPlayIdleOrRun({ ...base, animLocked: true })).toBe(false)
  })

  it('blocks idle/run while a block anim is mid-play', () => {
    expect(mayPlayIdleOrRun({ ...base, blockAnimStarted: true })).toBe(false)
  })

  it('a down player is blocked regardless of the other flags (independent guard)', () => {
    for (const animLocked of [false, true]) {
      for (const blockAnimStarted of [false, true]) {
        for (const holdingDown of [false, true]) {
          expect(mayPlayIdleOrRun({ fsm: 'down', holdingDown, animLocked, blockAnimStarted })).toBe(false)
        }
      }
    }
  })
})
