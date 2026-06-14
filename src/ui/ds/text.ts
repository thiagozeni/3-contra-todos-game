import type Phaser from 'phaser'
import { TYPE, FAMILY, type TypeRole, type FamilyId } from './tokens/type'
import { semantic, hex, type SemanticColorId } from './tokens/colors'

export interface DsTextOpts {
  role: TypeRole
  color?: SemanticColorId
  family?: FamilyId
  align?: 'left' | 'center' | 'right'
  origin?: [number, number]
}

/** Pure — resolves a DS text spec to a Phaser text style object. Unit-tested. */
export function resolveTextStyle(o: DsTextOpts) {
  const t = TYPE[o.role]
  return {
    fontFamily: FAMILY[o.family ?? 'display'],
    fontSize: `${t.px}px`,
    color: hex(semantic[o.color ?? 'textPrimary']),
    stroke: hex(semantic.ink),
    strokeThickness: t.stroke,
    align: o.align ?? 'left',
  }
}

/** Phaser wrapper — the ONLY way screens create text. Validated visually. */
export function dsText(
  scene: Phaser.Scene, x: number, y: number, text: string, o: DsTextOpts,
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, resolveTextStyle(o))
  const [ox, oy] = o.origin ?? [0, 0]
  return t.setOrigin(ox, oy)
}
