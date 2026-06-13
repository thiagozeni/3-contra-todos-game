/** Typography tokens — Phaser-free. Fonts unchanged (loaded in index.html). */

export const FAMILY = {
  display: '"Press Start 2P", monospace', // titles, labels, HUD, body
  numeric: '"Pixelify Sans", monospace',  // highlight numbers (timer/score/combo)
} as const
export type FamilyId = keyof typeof FAMILY

export const ROLES = ['mega','title','display','h1','h2','h3','body','small','caption'] as const
export type TypeRole = typeof ROLES[number]

/** role → px (@1920×1080) + text stroke thickness. */
export const TYPE: Record<TypeRole, { px: number; stroke: number }> = {
  mega:    { px: 110, stroke: 14 },
  title:   { px: 90,  stroke: 10 },
  display: { px: 72,  stroke: 8 },
  h1:      { px: 60,  stroke: 7 },
  h2:      { px: 44,  stroke: 6 },
  h3:      { px: 32,  stroke: 5 },
  body:    { px: 26,  stroke: 4 },
  small:   { px: 20,  stroke: 3 },
  caption: { px: 16,  stroke: 3 },
}
