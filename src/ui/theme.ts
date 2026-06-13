/**
 * UI Theme — Fatia V, Trilha 1 · direção "pixel retro + Tekken life bars".
 *
 * Single source of truth for the consolidated palette + Phaser helpers that draw
 * the angled (parallelogram) HP bars and the angled portrait frames, both pixel
 * retro. Replaces the 40+ ad-hoc hexes audited across the scenes with tokens.
 *
 * Phaser 4. Bars are drawn with Graphics so they redraw on HP change (the fill
 * shrinks correctly — no fixed-width sliver left behind).
 */
import Phaser from 'phaser'

/** Numeric tokens (shapes/Graphics). */
export const COLORS = {
  gold: 0xffd23f,
  goldHi: 0xfff3b0,
  goldMid: 0xf3c204,
  goldLo: 0x9c6b00,
  cyan: 0x2a93e6,
  cyanHi: 0xbfefff,
  danger: 0xff4d4d,
  warn: 0xffaa22,
  ok: 0x22cc44,
  p1: 0x3b9eff,
  p2: 0xff4fd8,
  p3: 0x52e85c,
  night: 0x0d0d1a,
  trough: 0x0a0e1c,
  troughEdge: 0x2a3566,
  ink: 0x000000,
} as const

/** CSS-hex tokens (Phaser Text). */
export const CSS = {
  gold: '#ffd23f',
  goldMid: '#f3c204',
  cyan: '#bfe6ff',
  danger: '#ff4d4d',
  warn: '#ffaa22',
  ok: '#22cc44',
  textHi: '#ffffff',
  textMid: '#cccccc',
  ink: '#000000',
} as const

export const FONT = {
  hud: '"Press Start 2P", monospace',     // numeric/labels — arcade icon
  display: '"Pixelify Sans", monospace',  // chunky timer/combo
} as const

/** Default slant: horizontal shift between the top and bottom edges (≈ tan16·h). */
export const SKEW = 0.287

// ── parallelogram geometry ──────────────────────────────────────────────────
// A parallelogram occupies [x..x+w] × [y..y+h] but its left/right edges are
// slanted: the top edge is shifted +skew/2, the bottom edge −skew/2.

/** Left-edge x at a given absolute y inside a parallelogram of height h. */
function edgeX(x: number, y: number, h: number, skew: number, atY: number): number {
  const t = (atY - y) / h // 0 at top, 1 at bottom
  return x + skew / 2 - t * skew
}

/** Trace a parallelogram sub-band [yTopFrac..yBotFrac] of the full box into the path. */
function paraBandPath(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number, skew: number,
  yTopFrac: number, yBotFrac: number,
): void {
  const yt = y + h * yTopFrac
  const yb = y + h * yBotFrac
  const lt = edgeX(x, y, h, skew, yt)
  const lb = edgeX(x, y, h, skew, yb)
  g.beginPath()
  g.moveTo(lt, yt)
  g.lineTo(lt + w, yt)
  g.lineTo(lb + w, yb)
  g.lineTo(lb, yb)
  g.closePath()
}

/** Fill a full parallelogram. */
export function fillPara(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number, skew: number,
  color: number, alpha = 1,
): void {
  g.fillStyle(color, alpha)
  paraBandPath(g, x, y, w, h, skew, 0, 1)
  g.fillPath()
}

/** Stroke a full parallelogram outline. */
export function strokePara(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number, skew: number,
  width: number, color: number, alpha = 1,
): void {
  g.lineStyle(width, color, alpha)
  paraBandPath(g, x, y, w, h, skew, 0, 1)
  g.strokePath()
}

/** Pixel-retro 16-bit fill: hard horizontal bands (highlight → base → shadow). */
function fillBands(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number, skew: number,
  hi: number, mid: number, lo: number,
): void {
  g.fillStyle(hi, 1); paraBandPath(g, x, y, w, h, skew, 0, 0.28); g.fillPath()
  g.fillStyle(mid, 1); paraBandPath(g, x, y, w, h, skew, 0.28, 0.72); g.fillPath()
  g.fillStyle(lo, 1); paraBandPath(g, x, y, w, h, skew, 0.72, 1); g.fillPath()
}

export interface AngledBarOpts {
  x: number
  y: number
  w: number
  h: number
  anchor?: 'left' | 'right'
  depth?: number
  skew?: number
}

/**
 * Angled (parallelogram) HP bar, pixel-retro. Redraws on HP change so the fill
 * shrinks correctly. The cyan "recent damage" chip sits at the leading edge.
 */
export class AngledBar {
  private g: Phaser.GameObjects.Graphics
  private readonly x: number
  private readonly y: number
  private readonly w: number
  private readonly h: number
  private readonly skew: number
  private readonly anchor: 'left' | 'right'
  private ratio = 1

  constructor(scene: Phaser.Scene, o: AngledBarOpts) {
    this.x = o.x; this.y = o.y; this.w = o.w; this.h = o.h
    this.anchor = o.anchor ?? 'left'
    this.skew = o.skew ?? Math.round(o.h * SKEW)
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(o.depth ?? 0)
    this.redraw(1)
  }

  /** ratio 0..1; optional override of the band base color (HP color). */
  redraw(ratio: number, baseColor?: number): void {
    this.ratio = Phaser.Math.Clamp(ratio, 0, 1)
    const { x, y, w, h, skew, anchor } = this
    const g = this.g
    g.clear()

    // trough + inner edge
    fillPara(g, x, y, w, h, skew, COLORS.trough, 1)
    strokePara(g, x + 1, y + 1, w - 2, h - 2, skew, 2, COLORS.troughEdge, 1)

    const fillW = Math.round((w - 4) * this.ratio)
    if (fillW > 1) {
      const fx = anchor === 'left' ? x + 2 : x + 2 + (w - 4 - fillW)
      const mid = baseColor ?? COLORS.goldMid
      const hi = baseColor ? Phaser.Display.Color.IntegerToColor(mid).brighten(40).color : COLORS.goldHi
      const lo = baseColor ? Phaser.Display.Color.IntegerToColor(mid).darken(40).color : COLORS.goldLo
      fillBands(g, fx, y + 2, fillW, h - 4, skew, hi, mid, lo)

      // cyan "recent damage" chip at the leading edge
      const chipW = Math.min(Math.round(w * 0.05), fillW)
      const cx = anchor === 'left' ? fx + fillW - chipW : fx
      fillBands(g, cx, y + 2, chipW, h - 4, skew, COLORS.cyanHi, COLORS.cyan, 0x0a5aa0)
    }

    // bold black outline (pixel)
    strokePara(g, x, y, w, h, skew, 3, COLORS.ink, 1)
  }

  setDepth(d: number): this { this.g.setDepth(d); return this }
  setAlpha(a: number): this { this.g.setAlpha(a); return this }
  destroy(): void { this.g.destroy() }
}

/**
 * Angled portrait. The HUD portrait textures (`hud-*`) are square "cards" that
 * already carry a gold frame + blue backing, so instead of masking we render the
 * card upright and CHAMFER two opposite corners (top-left + bottom-right) with
 * triangles — turning the square card into a parallelogram that matches the bars.
 * Geometry masks were unreliable here (HUD is scrollFactor-0, masks are world-space).
 *
 * Parallelogram (within the box): TL=(x+skew,y) TR=(x+size,y)
 * BR=(x+size−skew,y+size) BL=(x,y+size) — left/right edges slanted at ~16°.
 */
export function makeAngledPortrait(
  scene: Phaser.Scene,
  o: { x: number; y: number; size: number; texture: string; frameColor: number; depth: number; skew?: number },
): { sprite: Phaser.GameObjects.Sprite; frame: Phaser.GameObjects.Graphics; setTexture: (k: string) => void; setAlpha: (a: number) => void; destroy: () => void } {
  const { x, y, size } = o
  const s = o.skew ?? Math.round(size * SKEW)
  const d = o.depth
  // parallelogram corners (within the box): top shifted right by s
  const pts = [
    { x: x + s, y }, { x: x + size, y },
    { x: x + size - s, y: y + size }, { x, y: y + size },
  ]

  const trace = (g: Phaser.GameObjects.Graphics) => {
    g.beginPath()
    g.moveTo(pts[0].x, pts[0].y); g.lineTo(pts[1].x, pts[1].y)
    g.lineTo(pts[2].x, pts[2].y); g.lineTo(pts[3].x, pts[3].y)
    g.closePath()
  }

  // night backing behind the photo (fills the parallelogram cleanly)
  const back = scene.add.graphics().setScrollFactor(0).setDepth(d)
  back.fillStyle(COLORS.night, 1); trace(back); back.fillPath()

  // Phaser 4 + WebGL: masks are applied via the FILTER system (enableFilters +
  // filters.external.addMask), NOT setMask (which is Canvas-renderer only).
  const maskG = scene.make.graphics()
  maskG.fillStyle(0xffffff, 1); trace(maskG); maskG.fillPath()

  // photo, scaled up 1.3× so the card's own gold frame falls OUTSIDE the clip,
  // leaving only the face; centered and clipped to the parallelogram.
  const ZOOM = 1.3
  const sprite = scene.add.sprite(x + size / 2, y + size / 2, o.texture)
    .setOrigin(0.5, 0.5)
    .setDisplaySize(size * ZOOM, size * ZOOM)
    .setScrollFactor(0)
    .setDepth(d + 1)
  sprite.enableFilters()
  sprite.filters?.external.addMask(maskG)

  // parallelogram outline: bold black + slot-color filet
  const frame = scene.add.graphics().setScrollFactor(0).setDepth(d + 2)
  frame.lineStyle(6, COLORS.ink, 1); trace(frame); frame.strokePath()
  frame.lineStyle(3, o.frameColor, 1); trace(frame); frame.strokePath()

  return {
    sprite,
    frame,
    setTexture: (k: string) => { sprite.setTexture(k).setDisplaySize(size * ZOOM, size * ZOOM) },
    setAlpha: (a: number) => { sprite.setAlpha(a); back.setAlpha(a); frame.setAlpha(a) },
    destroy: () => { sprite.destroy(); back.destroy(); frame.destroy(); maskG.destroy() },
  }
}

/** A single diagonal dot (small parallelogram), on/off. */
export function drawDot(
  scene: Phaser.Scene,
  x: number, y: number, s: number, on: boolean, depth: number, skew?: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(depth)
  const sk = skew ?? Math.round(s * SKEW)
  if (on) {
    fillPara(g, x, y, s, s, sk, COLORS.gold, 1)
    fillPara(g, x, y, s, s * 0.4, sk, COLORS.goldHi, 1)
  } else {
    fillPara(g, x, y, s, s, sk, 0x222a44, 1)
  }
  strokePara(g, x, y, s, s, sk, 2, COLORS.ink, 1)
  return g
}

/** Subtle CRT scanlines over a region. */
export function addScanlines(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, depth: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(depth)
  g.fillStyle(COLORS.ink, 0.14)
  for (let yy = y; yy < y + h; yy += 4) g.fillRect(x, yy, w, 2)
  return g
}
