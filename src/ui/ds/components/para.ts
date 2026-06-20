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

/**
 * Pixel rounded-rect FILL — cantos arredondados aproximados por uma ESCADA de
 * degraus de `step` px (em vez de curva lisa anti-aliased). Preenche em faixas
 * horizontais de altura `step`, com o recuo do canto quantizado no grid → dá o
 * arredondado em escada do pixel-art. Use a MESMA assinatura p/ fundo e máscara
 * (a forma casa exatamente). Bordas retas (topo/base/lados) ficam nítidas.
 */
export function fillPixelRoundRect(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number, r: number, step: number,
  color: number, alpha = 1,
): void {
  const rr = Math.min(r, Math.floor(Math.min(w, h) / 2))
  g.fillStyle(color, alpha)
  const insetAt = (dyEdge: number): number => {
    if (dyEdge >= rr) return 0
    const k = rr - dyEdge
    const raw = rr - Math.sqrt(Math.max(0, rr * rr - k * k))
    return Math.round(raw / step) * step
  }
  for (let yy = 0; yy < h; yy += step) {
    const bandH = Math.min(step, h - yy)
    const dyEdge = Math.min(yy, h - (yy + bandH))
    const inset = insetAt(dyEdge)
    g.fillRect(x + inset, y + yy, w - 2 * inset, bandH)
  }
}

/**
 * Pixel PANEL — moldura com cantos em escada: fundo + borda preta + filete da
 * cor da marca, desenhados como 3 fills pixel-round concêntricos (cantos
 * pixelados, não curva lisa). O conteúdo (texto/ícones) é desenhado por cima.
 */
export function pixelPanel(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number, r: number, step: number,
  fillColor: number, fillAlpha: number, borderColor: number, filletColor: number,
  borderW = 3, filletW = 3,
): void {
  const B = borderW + filletW
  fillPixelRoundRect(g, x, y, w, h, r, step, borderColor, 1)
  fillPixelRoundRect(g, x + borderW, y + borderW, w - 2 * borderW, h - 2 * borderW, Math.max(1, r - borderW), step, filletColor, 1)
  fillPixelRoundRect(g, x + B, y + B, w - 2 * B, h - 2 * B, Math.max(1, r - B), step, fillColor, fillAlpha)
}

/**
 * Pixel CIRCLE fill — disco com borda em ESCADA (scanlines quantizadas no grid
 * de `step`), em vez de círculo liso anti-aliased.
 */
export function fillPixelCircle(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number, radius: number, step: number,
  color: number, alpha = 1,
): void {
  g.fillStyle(color, alpha)
  const top = Math.round((cy - radius) / step) * step
  for (let yy = top; yy < cy + radius; yy += step) {
    const dy = Math.min(Math.abs(yy - cy), Math.abs(yy + step - cy))
    if (dy > radius) continue
    const half = Math.round(Math.sqrt(Math.max(0, radius * radius - dy * dy)) / step) * step
    if (half <= 0) continue
    g.fillRect(cx - half, yy, half * 2, step)
  }
}

/**
 * Concave fill: 5 symmetric horizontal bands, LIGHTEST at the edges and
 * DARKEST in the center (edge → mid → center → mid → edge). Reads as a SUNKEN
 * groove lit from outside ("negative volume") — the deepest point (center) is
 * in shadow and the rims catch the light. Used for the lost-life red so it
 * doesn't look flat.
 */
export function fillConcaveBands(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number, skew: number,
  edge: number, mid: number, center: number,
): void {
  g.fillStyle(edge, 1); tracePara(g, x, y, w, h, skew, 0, 0.16); g.fillPath()
  g.fillStyle(mid, 1); tracePara(g, x, y, w, h, skew, 0.16, 0.38); g.fillPath()
  g.fillStyle(center, 1); tracePara(g, x, y, w, h, skew, 0.38, 0.62); g.fillPath()
  g.fillStyle(mid, 1); tracePara(g, x, y, w, h, skew, 0.62, 0.84); g.fillPath()
  g.fillStyle(edge, 1); tracePara(g, x, y, w, h, skew, 0.84, 1); g.fillPath()
}
