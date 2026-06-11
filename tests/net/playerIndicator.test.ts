/**
 * playerIndicator unit tests — FB4
 *
 * Tests the pure slot-index → color/label mapping from playerColors.ts.
 * No Phaser, no SDK — fully headless.
 */

import { describe, it, expect } from 'vitest'
import { playerColor, PLAYER_COLORS } from '../../src/net/playerColors'

describe('PLAYER_COLORS', () => {
  it('has exactly 3 entries (P1/P2/P3)', () => {
    expect(PLAYER_COLORS.length).toBe(3)
  })

  it('P1 slot (index 0) is blue', () => {
    const c = PLAYER_COLORS[0]
    expect(c.css).toBe('#3aa0ff')
    expect(c.num).toBe(0x3aa0ff)
    expect(c.label).toBe('P1')
  })

  it('P2 slot (index 1) is red', () => {
    const c = PLAYER_COLORS[1]
    expect(c.css).toBe('#ff4d4d')
    expect(c.num).toBe(0xff4d4d)
    expect(c.label).toBe('P2')
  })

  it('P3 slot (index 2) is green', () => {
    const c = PLAYER_COLORS[2]
    expect(c.css).toBe('#46d65f')
    expect(c.num).toBe(0x46d65f)
    expect(c.label).toBe('P3')
  })
})

describe('playerColor(slotIndex)', () => {
  it('returns the correct color for slot 0 (P1)', () => {
    const c = playerColor(0)
    expect(c.label).toBe('P1')
    expect(c.css).toBe('#3aa0ff')
  })

  it('returns the correct color for slot 1 (P2)', () => {
    const c = playerColor(1)
    expect(c.label).toBe('P2')
    expect(c.css).toBe('#ff4d4d')
  })

  it('returns the correct color for slot 2 (P3)', () => {
    const c = playerColor(2)
    expect(c.label).toBe('P3')
    expect(c.css).toBe('#46d65f')
  })

  it('returns fallback color for out-of-range slot (3)', () => {
    const c = playerColor(3)
    expect(c.label).toBe('P?')
    expect(c.css).toBe('#f3c204')
  })

  it('returns fallback color for negative slot (-1)', () => {
    const c = playerColor(-1)
    expect(c.label).toBe('P?')
    expect(c.css).toBe('#f3c204')
  })

  it('P1 label is shown for slot 0 — matches lobby CoopSelector slot ordering', () => {
    // The lobby (CoopSelector) assigns slot 0 to the first player in sessionId-sorted order.
    // The server (ArenaRoom.startMatch) assigns slot 0 to the first player in join order.
    // Both route through playerColor(slotIndex), so the in-game indicator always matches
    // the lobby cursor color as long as slotIndex is read from the same authority.
    expect(playerColor(0).label).toBe('P1')
    expect(playerColor(1).label).toBe('P2')
    expect(playerColor(2).label).toBe('P3')
  })

  it('each slot label corresponds to slot number + 1', () => {
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      expect(PLAYER_COLORS[i].label).toBe(`P${i + 1}`)
    }
  })

  it('css and num fields represent the same color', () => {
    for (const c of PLAYER_COLORS) {
      // Parse the CSS hex and compare to the numeric field.
      const parsed = parseInt(c.css.slice(1), 16)
      expect(parsed).toBe(c.num)
    }
  })
})

describe('slot ordering consistency (FB4 lobby ↔ game)', () => {
  it('all 3 slots have distinct labels and colors', () => {
    const labels = PLAYER_COLORS.map(c => c.label)
    const cssColors = PLAYER_COLORS.map(c => c.css)
    const numColors = PLAYER_COLORS.map(c => c.num)
    expect(new Set(labels).size).toBe(3)
    expect(new Set(cssColors).size).toBe(3)
    expect(new Set(numColors).size).toBe(3)
  })
})
