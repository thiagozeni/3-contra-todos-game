/** AngledPanel — generic parallelogram panel/frame (pixel-retro). Base for lists,
 *  overlays and menu buttons. `filled` paints bgPanel; `outline` is transparent.
 *  Bold black outline + brand-color filet, matching the bars/portraits. */
import type Phaser from 'phaser'
import { primitive, semantic } from '../tokens/colors'
import { SKEW, STROKE } from '../tokens/shape'
import { fillPara, strokePara } from './para'

export interface AngledPanelOpts {
  x: number
  y: number
  w: number
  h: number
  variant?: 'filled' | 'outline'
  /** filet color (default = brand gold). */
  frame?: number
  skew?: number
  depth?: number
}

export interface AngledPanelHandle {
  graphics: Phaser.GameObjects.Graphics
  setVisible(v: boolean): void
  setAlpha(a: number): void
  destroy(): void
}

export function makeAngledPanel(scene: Phaser.Scene, o: AngledPanelOpts): AngledPanelHandle {
  const { x, y, w, h } = o
  const variant = o.variant ?? 'filled'
  const frame = o.frame ?? semantic.borderBrand
  const skew = o.skew ?? Math.round(h * SKEW)
  const g = scene.add.graphics().setScrollFactor(0).setDepth(o.depth ?? 0)

  if (variant === 'filled') {
    fillPara(g, x, y, w, h, skew, semantic.bgPanel, 1)
  }
  // bold black outline, then the brand-color filet just inside it
  strokePara(g, x, y, w, h, skew, STROKE.heavy, primitive.black, 1)
  strokePara(g, x + 1, y + 1, w - 2, h - 2, skew, STROKE.bold, frame, 1)

  return {
    graphics: g,
    setVisible: (v: boolean) => { g.setVisible(v) },
    setAlpha: (a: number) => { g.setAlpha(a) },
    destroy: () => { g.destroy() },
  }
}
