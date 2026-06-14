/** Overlay — full-screen scrim + central angled panel with a title, optional
 *  stacked lines, and an optional footer. Backs defeat (FB12) / reconnect screens. */
import type Phaser from 'phaser'
import { primitive, overlayAlpha, type SemanticColorId } from '../tokens/colors'
import { dsText } from '../text'
import { makeAngledPanel } from './angledPanel'
import type { TypeRole } from '../tokens/type'

export interface OverlayLine {
  text: string
  role?: TypeRole
  color?: SemanticColorId
  numeric?: boolean
}

export interface OverlayOpts {
  title: string
  titleColor?: SemanticColorId
  lines?: OverlayLine[]
  footer?: string
  depth?: number
}

export interface OverlayHandle { destroy(): void }

export function makeOverlay(scene: Phaser.Scene, o: OverlayOpts): OverlayHandle {
  const { width, height } = scene.scale
  const cx = width / 2
  const cy = height / 2
  const depth = o.depth ?? 5000
  const objs: Array<{ destroy(): void }> = []

  const scrim = scene.add.rectangle(cx, cy, width, height, primitive.black, overlayAlpha)
    .setScrollFactor(0).setDepth(depth)
  objs.push(scrim)

  const pw = 760
  const ph = 420
  const panel = makeAngledPanel(scene, {
    x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph, variant: 'filled', depth: depth + 1,
  })
  objs.push(panel)

  const title = dsText(scene, cx, cy - ph / 2 + 70, o.title, {
    role: 'title', color: o.titleColor ?? 'textBrand', origin: [0.5, 0.5],
  }).setDepth(depth + 2).setScrollFactor(0)
  objs.push(title)

  let y = cy - 30
  for (const ln of o.lines ?? []) {
    const t = dsText(scene, cx, y, ln.text, {
      role: ln.role ?? 'body', color: ln.color ?? 'textPrimary',
      family: ln.numeric ? 'numeric' : 'display', origin: [0.5, 0.5],
    }).setDepth(depth + 2).setScrollFactor(0)
    objs.push(t)
    y += 52
  }

  if (o.footer) {
    const f = dsText(scene, cx, cy + ph / 2 - 40, o.footer, {
      role: 'caption', color: 'textSecondary', origin: [0.5, 0.5],
    }).setDepth(depth + 2).setScrollFactor(0)
    objs.push(f)
  }

  return { destroy: () => objs.forEach((ob) => ob.destroy()) }
}
