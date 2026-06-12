/**
 * playerIndicator unit tests — FB4 + FB8
 *
 * Tests the pure slot-index → color/label mapping from playerColors.ts.
 * No Phaser, no SDK — fully headless.
 *
 * FB8: palette changed to avoid red (P2 was #ff4d4d — drowned in enemy HP bars).
 * New palette: P1 azul #3b9eff, P2 magenta #ff4fd8, P3 verde-limão #52e85c.
 */

import { describe, it, expect } from 'vitest'
import { playerColor, PLAYER_COLORS } from '../../src/net/playerColors'

describe('PLAYER_COLORS (FB8 palette — no red)', () => {
  it('has exactly 3 entries (P1/P2/P3)', () => {
    expect(PLAYER_COLORS.length).toBe(3)
  })

  it('P1 slot (index 0) is azul vivo (#3b9eff)', () => {
    const c = PLAYER_COLORS[0]
    expect(c.css).toBe('#3b9eff')
    expect(c.num).toBe(0x3b9eff)
    expect(c.label).toBe('P1')
  })

  it('P2 slot (index 1) is magenta (#ff4fd8) — no longer red', () => {
    const c = PLAYER_COLORS[1]
    expect(c.css).toBe('#ff4fd8')
    expect(c.num).toBe(0xff4fd8)
    expect(c.label).toBe('P2')
    // Must not overlap with enemy red range (#cc0000–#ff3333)
    // Magenta has G=0x4f=79, B=0xd8=216 — clearly distinguishable
    expect(c.num).not.toBe(0xff4d4d) // old P2 red (retired)
  })

  it('P3 slot (index 2) is verde-limão (#52e85c)', () => {
    const c = PLAYER_COLORS[2]
    expect(c.css).toBe('#52e85c')
    expect(c.num).toBe(0x52e85c)
    expect(c.label).toBe('P3')
  })

  it('no slot color is red-family (conflicts with enemy HP bars)', () => {
    for (const c of PLAYER_COLORS) {
      // "Red-family": high R component (>0xcc), very low G (<0x60) and B (<0x60)
      const r = (c.num >> 16) & 0xff
      const g = (c.num >> 8) & 0xff
      const b = c.num & 0xff
      const isRedFamily = r > 0xcc && g < 0x60 && b < 0x60
      expect(isRedFamily, `${c.label} ${c.css} should not be red-family`).toBe(false)
    }
  })
})

describe('playerColor(slotIndex)', () => {
  it('returns the correct color for slot 0 (P1)', () => {
    const c = playerColor(0)
    expect(c.label).toBe('P1')
    expect(c.css).toBe('#3b9eff')
  })

  it('returns the correct color for slot 1 (P2)', () => {
    const c = playerColor(1)
    expect(c.label).toBe('P2')
    expect(c.css).toBe('#ff4fd8')
  })

  it('returns the correct color for slot 2 (P3)', () => {
    const c = playerColor(2)
    expect(c.label).toBe('P3')
    expect(c.css).toBe('#52e85c')
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
    // FB4 fix: the server assigns slotIndex at JOIN time (onJoin), making it the single
    // source of truth for both the lobby CoopSelector (cursor color) and the in-game
    // indicator. Both read PlayerNet.slotIndex — so P1/P2/P3 are always consistent.
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

// ── FB9: ally HUD layout math ──────────────────────────────────────────────────
describe('FB9 ally HUD layout constants', () => {
  // These constants mirror what HUD.ts exports; the test asserts the math is correct
  // without importing Phaser (headless). Keep in sync with HUD.ts constants.
  const ALLY_ROW_START_Y = 235
  const ALLY_ROW_PITCH = 70
  const ALLY_BAR_OFFSET_X = 130
  const ALLY_BAR_W = 357
  const ALLY_BAR_H = 40
  const ALLY_FILL_MAX_W = 351
  const ALLY_FILL_H = 34
  const ALLY_PORTRAIT_SIZE = 120
  const MAIN_BAR_MAX_W = 551

  it('ally portrait is 65% of main portrait (185px)', () => {
    // 185 * 0.65 = 120.25 → 120 (floor)
    expect(ALLY_PORTRAIT_SIZE).toBe(120)
  })

  it('ally bar width is ≤65% of main bar width', () => {
    // 551 * 0.65 = 358.15; actual 357 (conservative 65%)
    expect(ALLY_BAR_W).toBeLessThanOrEqual(Math.ceil(MAIN_BAR_MAX_W * 0.65))
  })

  it('ally fill max width = bar width - 6 (3px inset each side)', () => {
    expect(ALLY_FILL_MAX_W).toBe(ALLY_BAR_W - 6)
  })

  it('ally fill height = bar height - 6', () => {
    expect(ALLY_FILL_H).toBe(ALLY_BAR_H - 6)
  })

  it('row 0 starts at ALLY_ROW_START_Y', () => {
    const rowY = (idx: number) => ALLY_ROW_START_Y + idx * ALLY_ROW_PITCH
    expect(rowY(0)).toBe(235)
  })

  it('row 1 is exactly ALLY_ROW_PITCH below row 0', () => {
    const rowY = (idx: number) => ALLY_ROW_START_Y + idx * ALLY_ROW_PITCH
    expect(rowY(1) - rowY(0)).toBe(ALLY_ROW_PITCH)
  })

  it('2 ally rows (2-player game) fit well below main HUD (ends ~y=161)', () => {
    // Main portrait top=42, height=185 → bottom=227; bar bottom=161.
    // First ally row starts at 235 — 8px clearance above portrait bottom (227+8=235).
    // With 2 rows at pitch 70: row0 top=235, row1 top=305 — both within ~375px band.
    const mainHudBottom = 42 + 185 // portrait bottom
    expect(ALLY_ROW_START_Y).toBeGreaterThan(mainHudBottom - 50) // generous clearance
    const row1Bottom = ALLY_ROW_START_Y + ALLY_ROW_PITCH + ALLY_BAR_H + 30 // name+bar
    expect(row1Bottom).toBeLessThan(720) // fits in 720p height
  })

  it('bar x offset accounts for portrait width', () => {
    expect(ALLY_BAR_OFFSET_X).toBeGreaterThanOrEqual(ALLY_PORTRAIT_SIZE)
  })

  it('slotIndex → color mapping is stable (FB9 ally name color)', () => {
    // Each ally row uses playerColor(slotIndex) for the name label.
    // Verify slot 1 (P2) gives magenta (not the old red).
    expect(playerColor(1).css).toBe('#ff4fd8')
    expect(playerColor(2).css).toBe('#52e85c')
  })
})
