/**
 * Shared per-player colors for the co-op arcade selector (FB3) and future in-game HUD
 * markers (FB4). Defined once here so the selector cursors, the lock framing, and the
 * future player labels all stay consistent.
 *
 * Classic arcade convention: P1 azul, P2 vermelho, P3 verde.
 */

/** Player color entry — both a CSS hex string (for Phaser text) and a numeric (for shapes). */
export interface PlayerColor {
  /** CSS hex, e.g. for Text.setColor / stroke. */
  css: string
  /** Numeric 0xRRGGBB, e.g. for Rectangle.setStrokeStyle / fillColor. */
  num: number
  /** Short label shown on the cursor (P1/P2/P3). */
  label: string
}

/** Ordered by player slot index (0 = P1, 1 = P2, 2 = P3). */
export const PLAYER_COLORS: readonly PlayerColor[] = [
  { css: '#3aa0ff', num: 0x3aa0ff, label: 'P1' }, // azul
  { css: '#ff4d4d', num: 0xff4d4d, label: 'P2' }, // vermelho
  { css: '#46d65f', num: 0x46d65f, label: 'P3' }, // verde
] as const

/** Fallback color for any slot beyond the 3 defined (defensive; never expected). */
const FALLBACK: PlayerColor = { css: '#f3c204', num: 0xf3c204, label: 'P?' }

/** Get the color for a player slot index (0-based), wrapping safely to the fallback. */
export function playerColor(slotIndex: number): PlayerColor {
  if (slotIndex < 0 || slotIndex >= PLAYER_COLORS.length) return FALLBACK
  return PLAYER_COLORS[slotIndex]
}
