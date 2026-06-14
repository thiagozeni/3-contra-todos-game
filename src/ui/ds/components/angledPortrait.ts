/**
 * makeAngledPortrait — parallelogram-clipped portrait card, pixel-retro.
 * Moved from src/ui/theme.ts; consumes DS tokens instead of COLORS.*.
 *
 * Parallelogram (within the box): TL=(x+skew,y) TR=(x+size,y)
 * BR=(x+size−skew,y+size) BL=(x,y+size) — left/right edges slanted at ~16°.
 */
import Phaser from 'phaser'
import { primitive } from '../tokens/colors'
import { SKEW } from '../tokens/shape'

export function makeAngledPortrait(
  scene: Phaser.Scene,
  o: { x: number; y: number; size?: number; w?: number; h?: number; texture: string; frameColor: number; depth: number; skew?: number; zoom?: number },
): { sprite: Phaser.GameObjects.Sprite; frame: Phaser.GameObjects.Graphics; setTexture: (k: string) => void; setFrameColor: (c: number) => void; setAlpha: (a: number) => void; setVisible: (v: boolean) => void; destroy: () => void } {
  const { x, y } = o
  const w = o.w ?? o.size ?? 100
  const h = o.h ?? o.size ?? 100
  const s = o.skew ?? Math.round(h * SKEW)
  const d = o.depth
  const ZOOM = o.zoom ?? 1.3
  // parallelogram corners (within the box): top shifted right by s
  const pts = [
    { x: x + s, y }, { x: x + w, y },
    { x: x + w - s, y: y + h }, { x, y: y + h },
  ]

  const trace = (g: Phaser.GameObjects.Graphics) => {
    g.beginPath()
    g.moveTo(pts[0].x, pts[0].y); g.lineTo(pts[1].x, pts[1].y)
    g.lineTo(pts[2].x, pts[2].y); g.lineTo(pts[3].x, pts[3].y)
    g.closePath()
  }

  // night backing behind the photo (fills the parallelogram cleanly)
  const back = scene.add.graphics().setScrollFactor(0).setDepth(d)
  back.fillStyle(primitive.night, 1); trace(back); back.fillPath()

  // Phaser 4 + WebGL: masks are applied via the FILTER system (enableFilters +
  // filters.external.addMask), NOT setMask (which is Canvas-renderer only).
  const maskG = scene.make.graphics()
  maskG.fillStyle(0xffffff, 1); trace(maskG); maskG.fillPath()

  // photo, scaled up so the card's own gold frame falls OUTSIDE the clip,
  // leaving only the face; centered and clipped to the parallelogram.
  const sprite = scene.add.sprite(x + w / 2, y + h / 2, o.texture)
    .setOrigin(0.5, 0.5)
    .setDisplaySize(w * ZOOM, h * ZOOM)
    .setScrollFactor(0)
    .setDepth(d + 1)
  sprite.enableFilters()
  sprite.filters?.external.addMask(maskG)

  // parallelogram outline: bold black + slot-color filet
  let frameColor = o.frameColor
  const frame = scene.add.graphics().setScrollFactor(0).setDepth(d + 2)
  const drawFrame = () => {
    frame.clear()
    frame.lineStyle(6, primitive.black, 1); trace(frame); frame.strokePath()
    frame.lineStyle(3, frameColor, 1); trace(frame); frame.strokePath()
  }
  drawFrame()

  return {
    sprite,
    frame,
    setTexture: (k: string) => { sprite.setTexture(k).setDisplaySize(w * ZOOM, h * ZOOM) },
    setFrameColor: (c: number) => { frameColor = c; drawFrame() },
    setAlpha: (a: number) => { sprite.setAlpha(a); back.setAlpha(a); frame.setAlpha(a) },
    setVisible: (v: boolean) => { sprite.setVisible(v); back.setVisible(v); frame.setVisible(v) },
    destroy: () => { sprite.destroy(); back.destroy(); frame.destroy(); maskG.destroy() },
  }
}
