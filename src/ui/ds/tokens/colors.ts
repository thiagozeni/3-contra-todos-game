/** Color tokens — Phaser-free (unit-testable). Primitives are numeric (0xRRGGBB)
 *  for Phaser Graphics; hex() converts to '#rrggbb' for Phaser Text. */

/** Tier 1 — raw ramp, named by hue. */
export const primitive = {
  goldHi: 0xfff3b0, gold: 0xffd23f, goldBrand: 0xf3c204, goldLo: 0x9c6b00,
  red: 0xff4d4d, orange: 0xffaa22, green: 0x22cc44, cyan: 0x2a93e6, cyanHi: 0xbfefff,
  p1: 0x3b9eff, p2: 0xff4fd8, p3: 0x52e85c,
  white: 0xffffff, gray20: 0xcccccc, gray50: 0x888888, black: 0x000000,
  night: 0x0d0d1a, panel: 0x1a1a2e, trough: 0x0a0e1c, troughEdge: 0x2a3566, steel: 0x8a8a9a,
} as const

/** Tier 2 — semantic, by role. Screens consume ONLY this tier. */
export const semantic = {
  textPrimary: primitive.white, textSecondary: primitive.gray20, textDisabled: primitive.gray50,
  textBrand: primitive.goldBrand,
  bgScreen: primitive.night, bgPanel: primitive.panel, ink: primitive.black,
  borderDefault: primitive.black, borderBrand: primitive.goldBrand, borderMuted: primitive.steel,
  hpFull: primitive.green, hpMid: primitive.orange, hpLow: primitive.red,
  accentCombo: primitive.goldBrand, accentDamage: primitive.cyan, accentDamageHi: primitive.cyanHi,
  player1: primitive.p1, player2: primitive.p2, player3: primitive.p3,
} as const

/** bg.overlay = ink @ this alpha. */
export const overlayAlpha = 0.78

export type PrimitiveId = keyof typeof primitive
export type SemanticColorId = keyof typeof semantic

/** Numeric color → '#rrggbb' css string for Phaser Text. */
export function hex(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0')
}
