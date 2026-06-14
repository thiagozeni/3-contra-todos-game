/**
 * Parallelogram Graphics draw helpers — Fatia V DS.
 * Consumes paraCorners() from tokens/shape (pure geometry, no Phaser import there).
 * These are the Phaser-drawing counterparts of the shape tokens.
 */
import type Phaser from 'phaser'
import { paraCorners } from '../tokens/shape'

/** Trace a path from a paraCorners result into the Graphics object. */
function tracePara(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number, skew: number,
  topFrac: number, botFrac: number,
): void {
  const [tl, tr, br, bl] = paraCorners(x, y, w, h, skew, topFrac, botFrac)
  g.beginPath()
  g.moveTo(tl.x, tl.y)
  g.lineTo(tr.x, tr.y)
  g.lineTo(br.x, br.y)
  g.lineTo(bl.x, bl.y)
  g.closePath()
}

/** Fill a full parallelogram. */
export function fillPara(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number, skew: number,
  color: number, alpha = 1,
): void {
  g.fillStyle(color, alpha)
  tracePara(g, x, y, w, h, skew, 0, 1)
  g.fillPath()
}

/** Stroke a full parallelogram outline. */
export function strokePara(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number, skew: number,
  width: number, color: number, alpha = 1,
): void {
  g.lineStyle(width, color, alpha)
  tracePara(g, x, y, w, h, skew, 0, 1)
  g.strokePath()
}

/** Pixel-retro 16-bit fill: hard horizontal bands (highlight → base → shadow). */
export function fillBands(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number, skew: number,
  hi: number, mid: number, lo: number,
): void {
  g.fillStyle(hi, 1); tracePara(g, x, y, w, h, skew, 0, 0.28); g.fillPath()
  g.fillStyle(mid, 1); tracePara(g, x, y, w, h, skew, 0.28, 0.72); g.fillPath()
  g.fillStyle(lo, 1); tracePara(g, x, y, w, h, skew, 0.72, 1); g.fillPath()
}
