/**
 * Shared per-player colors for the co-op arcade selector (FB3) and in-game HUD
 * markers (FB4, FB9). Defined once here so the selector cursors, the lock framing,
 * the player indicators, and the ally HUD rows all stay consistent.
 *
 * FB8 palette — no red (enemy HP bars are red; P2 was #ff4d4d, which drowned in them):
 *   P1 — azul vivo    #3b9eff  (0x3b9eff) — high contrast on dark crowd + green ring
 *   P2 — magenta      #ff4fd8  (0xff4fd8) — classic arcade P2 alt; zero conflict with
 *                                            enemy red or gold/yellow HUD accents
 *   P3 — verde-limão  #52e85c  (0x52e85c) — bright, distinct from ring grass & HP bars
 *
 * Contrast rationale (ring bg ≈ #2a6e1a, crowd ≈ #1a1a2e, HUD gold ≈ #f3c204):
 *   - Blue vs dark crowd: high ✓   Blue vs green ring: adequate ✓
 *   - Magenta vs all above: high ✓  No overlap with enemy red (#cc0000–#ff3333) ✓
 *   - Lime vs green ring: distinguishable (lighter + more yellow) ✓
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
  { css: '#3b9eff', num: 0x3b9eff, label: 'P1' }, // azul vivo
  { css: '#ff4fd8', num: 0xff4fd8, label: 'P2' }, // magenta/rosa choque
  { css: '#52e85c', num: 0x52e85c, label: 'P3' }, // verde-limão
] as const

/** Fallback color for any slot beyond the 3 defined (defensive; never expected). */
const FALLBACK: PlayerColor = { css: '#f3c204', num: 0xf3c204, label: 'P?' }

/** Get the color for a player slot index (0-based), wrapping safely to the fallback. */
export function playerColor(slotIndex: number): PlayerColor {
  if (slotIndex < 0 || slotIndex >= PLAYER_COLORS.length) return FALLBACK
  return PLAYER_COLORS[slotIndex]
}
