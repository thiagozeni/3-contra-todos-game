/**
 * AngledBar — parallelogram HP bar, pixel-retro (Tekken-style).
 * Moved from src/ui/theme.ts; consumes DS tokens instead of COLORS.*.
 */
import Phaser from 'phaser'
import { primitive } from '../tokens/colors'
import { SKEW } from '../tokens/shape'
import { fillPara, strokePara, fillBands, fillConcaveBands } from './para'

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
  private scene: Phaser.Scene
  private g: Phaser.GameObjects.Graphics
  private readonly x: number
  private readonly y: number
  private readonly w: number
  private readonly h: number
  private readonly skew: number
  private readonly anchor: 'left' | 'right'
  private ratio = 1

  // Shine sweep (premium): a thin same-skew highlight that travels across the
  // filled portion. No mask needed — the parallelogram shares the bar's skew and
  // is clamped to the fill rect, so it never bleeds past the outline (Phaser 4
  // WebGL geometry masks are finicky — see reference-phaser4-mask-filter).
  private shineG?: Phaser.GameObjects.Graphics
  private shineTween?: Phaser.Tweens.Tween

  // Flash de dano: overlay vermelho que pisca sobre a barra quando o personagem
  // toma dano (criado sob demanda).
  private flashG?: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, o: AngledBarOpts) {
    this.scene = scene
    this.x = o.x; this.y = o.y; this.w = o.w; this.h = o.h
    this.anchor = o.anchor ?? 'left'
    this.skew = o.skew ?? Math.round(o.h * SKEW)
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(o.depth ?? 0)
    this.redraw(1)
  }

  /**
   * ratio 0..1; optional override of the band base color (HP color).
   *
   * Semântica (pedido do Thiago): o life é TODO AMARELO (dourado) e a porção PERDIDA
   * (de `ratio` até 100%) aparece em VERMELHO — não mais um chip azul de "dano recente".
   * Amarelo = vida atual; vermelho = vida já perdida desde 100%.
   */
  redraw(ratio: number, baseColor?: number): void {
    this.ratio = Phaser.Math.Clamp(ratio, 0, 1)
    const { x, y, w, h, skew, anchor } = this
    const g = this.g
    g.clear()

    // trough + inner edge
    fillPara(g, x, y, w, h, skew, primitive.trough, 1)
    strokePara(g, x + 1, y + 1, w - 2, h - 2, skew, 2, primitive.troughEdge, 1)

    const innerW = w - 4
    const baseX = x + 2
    const fillW = Math.round(innerW * this.ratio)
    const lostW = innerW - fillW

    // VERMELHO — vida perdida (de ratio até 100%), do lado que esvazia.
    // Bandas CÔNCAVAS sutis: bordas (topo/base) em semitons mais escuros e o
    // centro no vermelho base → sensação de sulco/"volume negativo" (afundado),
    // sem virar o relevo convexo do amarelo. Bordas finas = efeito discreto.
    if (lostW > 1) {
      const lx = anchor === 'left' ? baseX + fillW : baseX
      const rMid = primitive.red
      const rTop = Phaser.Display.Color.IntegerToColor(rMid).darken(42).color
      const rBot = Phaser.Display.Color.IntegerToColor(rMid).darken(24).color
      fillConcaveBands(g, lx, y + 2, lostW, h - 4, skew, rTop, rMid, rBot)
    }

    // AMARELO — vida atual.
    if (fillW > 1) {
      const fx = anchor === 'left' ? baseX : baseX + lostW
      const mid = baseColor ?? primitive.goldBrand
      const hi = baseColor ? Phaser.Display.Color.IntegerToColor(mid).brighten(40).color : primitive.goldHi
      const lo = baseColor ? Phaser.Display.Color.IntegerToColor(mid).darken(40).color : primitive.goldLo
      fillBands(g, fx, y + 2, fillW, h - 4, skew, hi, mid, lo)
    }

    // bold black outline (pixel)
    strokePara(g, x, y, w, h, skew, 3, primitive.black, 1)
  }

  /** Pisca um overlay vermelho sobre a barra (feedback de dano recebido). */
  flashDamage(): void {
    if (!this.flashG) {
      this.flashG = this.scene.add.graphics().setScrollFactor(0).setDepth(this.g.depth + 1)
    }
    const { x, y, w, h, skew } = this
    const fg = this.flashG
    fg.clear()
    fillPara(fg, x, y, w, h, skew, primitive.red, 0.65)
    this.scene.tweens.killTweensOf(fg)
    fg.setAlpha(1)
    this.scene.tweens.add({ targets: fg, alpha: 0, duration: 280, ease: 'Quad.Out' })
  }

  /**
   * Start a looping shine sweep across the filled portion. `sweepMs` is the
   * duration of one pass; `gapMs` the pause between passes. Idempotent.
   */
  enableShine(sweepMs = 850, gapMs = 2600): this {
    if (this.shineG) return this
    this.shineG = this.scene.add.graphics().setScrollFactor(0).setDepth(this.g.depth)
    this.shineTween = this.scene.tweens.addCounter({
      from: 0, to: 1, duration: sweepMs, repeat: -1, repeatDelay: gapMs,
      onUpdate: (tw) => this.drawShine(tw.getValue() ?? 0),
      onRepeat: () => this.shineG?.clear(),
    })
    return this
  }

  /** Draws the shine band at normalized position p (slightly overshoots 0..1). */
  private drawShine(p: number): void {
    const sg = this.shineG
    if (!sg) return
    sg.clear()
    const { x, y, w, h, skew, anchor } = this
    const fillW = Math.round((w - 4) * this.ratio)
    if (fillW <= 1) return
    const fillStart = anchor === 'left' ? x + 2 : x + 2 + (w - 4 - fillW)
    const SHINE_W = 22
    // center travels across the fill with a small overshoot on both ends
    const pos = -0.12 + p * 1.24
    const sx = fillStart + pos * fillW - SHINE_W / 2
    const left = Math.max(sx, fillStart)
    const right = Math.min(sx + SHINE_W, fillStart + fillW)
    if (right - left <= 0.5) return
    fillPara(sg, left, y + 2, right - left, h - 4, skew, primitive.white, 0.16)
  }

  setDepth(d: number): this { this.g.setDepth(d); this.shineG?.setDepth(d); return this }
  setAlpha(a: number): this { this.g.setAlpha(a); this.shineG?.setAlpha(a); return this }
  destroy(): void {
    this.shineTween?.remove()
    this.shineG?.destroy()
    this.flashG?.destroy()
    this.g.destroy()
  }
}
