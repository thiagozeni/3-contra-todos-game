/** MenuButton — the DS menu/action button. Three variants:
 *  primary (gold-filled), ghost (outlined), link (bare gold text, e.g. "< VOLTAR").
 *  Composes AngledPanel geometry + dsText + an expanded hit area. The caller's
 *  onClick fires only while enabled (play sound inside onClick if desired). */
import type Phaser from 'phaser'
import { primitive, semantic, type SemanticColorId } from '../tokens/colors'
import { SKEW, STROKE } from '../tokens/shape'
import { fillPara, strokePara } from './para'
import { dsText } from '../text'
import type { TypeRole } from '../tokens/type'
import { padInteractive } from '../../../utils/iosVideo'

export type MenuButtonVariant = 'primary' | 'ghost' | 'link'

export interface MenuButtonOpts {
  x: number
  y: number
  label: string
  onClick: () => void
  variant?: MenuButtonVariant
  role?: TypeRole
  w?: number
  h?: number
  depth?: number
}

export interface MenuButtonHandle {
  setEnabled(v: boolean): void
  setVisible(v: boolean): void
  destroy(): void
}

export function makeMenuButton(scene: Phaser.Scene, o: MenuButtonOpts): MenuButtonHandle {
  const variant = o.variant ?? 'primary'
  const role: TypeRole = o.role ?? 'body'
  const depth = o.depth ?? 0
  const objects: Phaser.GameObjects.GameObject[] = []
  let enabled = true

  const fire = () => { if (enabled) o.onClick() }

  if (variant === 'link') {
    const label = dsText(scene, o.x, o.y, o.label, { role, color: 'textBrand', origin: [0, 0.5] })
      .setDepth(depth + 1).setScrollFactor(0)
    padInteractive(label)
    label.on('pointerdown', fire)
    label.on('pointerover', () => { if (enabled) label.setAlpha(0.7) })
    label.on('pointerout', () => label.setAlpha(1))
    objects.push(label)
  } else {
    const w = o.w ?? 300
    const h = o.h ?? 70
    const skew = Math.round(h * SKEW)
    const g = scene.add.graphics().setScrollFactor(0).setDepth(depth)
    if (variant === 'primary') {
      fillPara(g, o.x, o.y, w, h, skew, primitive.goldBrand, 1)
      strokePara(g, o.x, o.y, w, h, skew, STROKE.heavy, primitive.black, 1)
      strokePara(g, o.x + 1, o.y + 1, w - 2, h - 2, skew, STROKE.bold, primitive.goldHi, 1)
    } else { // ghost
      strokePara(g, o.x, o.y, w, h, skew, STROKE.heavy, primitive.black, 1)
      strokePara(g, o.x + 1, o.y + 1, w - 2, h - 2, skew, STROKE.bold, semantic.borderBrand, 1)
    }
    const labelColor: SemanticColorId = variant === 'primary' ? 'ink' : 'textBrand'
    const label = dsText(scene, o.x + w / 2, o.y + h / 2, o.label, { role, color: labelColor, origin: [0.5, 0.5] })
      .setDepth(depth + 1).setScrollFactor(0)
    const hit = scene.add.rectangle(o.x + w / 2, o.y + h / 2, w, h, 0x000000, 0)
      .setScrollFactor(0).setDepth(depth + 2)
    padInteractive(hit)
    hit.on('pointerdown', fire)
    hit.on('pointerover', () => { if (enabled) g.setAlpha(0.85) })
    hit.on('pointerout', () => g.setAlpha(1))
    objects.push(g, label, hit)
  }

  return {
    setEnabled: (v: boolean) => {
      enabled = v
      const a = v ? 1 : 0.4
      objects.forEach((ob) => { (ob as { setAlpha?: (n: number) => void }).setAlpha?.(a) })
    },
    setVisible: (v: boolean) => {
      objects.forEach((ob) => { (ob as { setVisible?: (b: boolean) => void }).setVisible?.(v) })
    },
    destroy: () => { objects.forEach((ob) => ob.destroy()) },
  }
}
