/**
 * coopDefeatSummary unit tests — FB12
 *
 * Pure builder for the co-op defeat overlay text. No Phaser — fully headless.
 * The overlay itself (GameScene.showCoopDefeatOverlay) renders these strings;
 * keeping the text logic pure lets us assert it without a running game.
 */

import { describe, it, expect } from 'vitest'
import { coopDefeatSummary } from '../../src/ui/coopSummary'

describe('coopDefeatSummary (score, wave, totalWaves)', () => {
  it('builds the co-op defeat lines', () => {
    const s = coopDefeatSummary(1234, 5, 12)
    expect(s.title).toBe('GAME OVER')
    expect(s.subtitle).toBe('TODOS CAÍRAM')
    expect(s.waveLine).toBe('WAVE 5/12')
    expect(s.scoreLine).toBe('1234 PTS')
  })

  it('floors fractional inputs (defensive against interpolated values)', () => {
    const s = coopDefeatSummary(1999.9, 3.7, 12.2)
    expect(s.waveLine).toBe('WAVE 3/12')
    expect(s.scoreLine).toBe('1999 PTS')
  })

  it('clamps negatives to zero', () => {
    const s = coopDefeatSummary(-50, -1, 12)
    expect(s.waveLine).toBe('WAVE 0/12')
    expect(s.scoreLine).toBe('0 PTS')
  })

  it('handles a zero score / wave 1 start', () => {
    const s = coopDefeatSummary(0, 1, 12)
    expect(s.scoreLine).toBe('0 PTS')
    expect(s.waveLine).toBe('WAVE 1/12')
  })
})
