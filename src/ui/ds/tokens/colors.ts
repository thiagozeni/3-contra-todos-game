/** Color tokens — Phaser-free (unit-testable). Primitives are numeric (0xRRGGBB)
 *  for Phaser Graphics; hex() converts to '#rrggbb' for Phaser Text. */

/** Tier 1 — raw ramp, named by hue.
 *  Alinhada à paleta canônica "Retro Fight Night Premium" (design system sheet — GPT 5.5):
 *  Arcade Gold #FFC400 · Amber #E39A00 · Impact Red #E83A24 · Blood Red #871F18
 *  Electric Cyan #31C7FF · Life Green #44D84B · Night Panel #0C1118 · Ink Black #07080D
 *  Bone White #F3F4EF · HUD Muted #8B919B. */
export const primitive = {
  goldHi: 0xfff3b0, gold: 0xffc400, goldBrand: 0xffc400, goldLo: 0x9c6b00,
  red: 0xe83a24, bloodRed: 0x871f18, orange: 0xe39a00, green: 0x44d84b,
  cyan: 0x31c7ff, cyanHi: 0x9ee3ff,
  p1: 0x3b9eff, p2: 0xff4fd8, p3: 0x52e85c,
  white: 0xf3f4ef, gray20: 0xcccccc, gray33: 0xaaaaaa, gray50: 0x888888, black: 0x000000,
  night: 0x0c1118, panel: 0x141926, trough: 0x0a0e1c, troughEdge: 0x2a3566, steel: 0x8b919b,
  // Feedback ramp — anchored to the ad-hoc hex already used across the screens
  // (proposta 07, Opção A). Promoted to primitives so the migration is byte-identical.
  greenOk: 0x44ff88, redErr: 0xff4444, amber: 0xffdd44,
} as const

/** Tier 2 — semantic, by role. Screens consume ONLY this tier. */
export const semantic = {
  textPrimary: primitive.white, textSecondary: primitive.gray20, textDisabled: primitive.gray50,
  textMuted: primitive.gray33, textBrand: primitive.goldBrand,
  feedbackOk: primitive.greenOk, feedbackError: primitive.redErr, feedbackWarn: primitive.amber,
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
