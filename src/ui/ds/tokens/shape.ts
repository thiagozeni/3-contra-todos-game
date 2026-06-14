/** Shape tokens + pure parallelogram math — Phaser-free (testable).
 *  The Graphics-drawing helpers live in ds/components/para.ts (later). */

/** Horizontal shift between top and bottom edges (≈ tan16·h). */
export const SKEW = 0.287

export const STROKE = { hair: 2, bold: 3, heavy: 6 } as const

/** Left-edge x at absolute y inside a parallelogram of height h:
 *  top (t=0) shifted +skew/2, bottom (t=1) shifted -skew/2. */
export function edgeX(x: number, y: number, h: number, skew: number, atY: number): number {
  const t = (atY - y) / h
  return x + skew / 2 - t * skew
}

export interface Pt { x: number; y: number }

/** Four corners (TL,TR,BR,BL) of a parallelogram sub-band [topFrac..botFrac]. */
export function paraCorners(
  x: number, y: number, w: number, h: number, skew: number,
  topFrac: number, botFrac: number,
): [Pt, Pt, Pt, Pt] {
  const yt = y + h * topFrac
  const yb = y + h * botFrac
  const lt = edgeX(x, y, h, skew, yt)
  const lb = edgeX(x, y, h, skew, yb)
  return [
    { x: lt, y: yt }, { x: lt + w, y: yt },
    { x: lb + w, y: yb }, { x: lb, y: yb },
  ]
}
