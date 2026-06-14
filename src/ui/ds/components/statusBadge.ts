/** StatusBadge — small angled chip showing a co-op ally status: DOWN (red) or
 *  OFF (gray, disconnected). DS upgrade of the HUD's plain-text FB10 badge. */
import type Phaser from 'phaser'
import { primitive } from '../tokens/colors'
import { SKEW, STROKE } from '../tokens/shape'
import { fillPara, strokePara } from './para'
import { dsText } from '../text'

export type BadgeState = 'down' | 'off'

const FILL: Record<BadgeState, number> = { down: primitive.red, off: primitive.gray50 }
const LABEL: Record<BadgeState, string> = { down: 'DOWN', off: 'OFF' }

export interface StatusBadgeOpts { w?: number; h?: number }

export interface StatusBadgeHandle {
  setState(s: BadgeState): void
  setVisible(v: boolean): void
  destroy(): void
}

export function makeStatusBadge(
  scene: Phaser.Scene, x: number, y: number, state: BadgeState, depth = 0, opts: StatusBadgeOpts = {},
): StatusBadgeHandle {
  const w = opts.w ?? 84
  const h = opts.h ?? 28
  const skew = Math.round(h * SKEW)
  const g = scene.add.graphics().setScrollFactor(0).setDepth(depth)
  const label = dsText(scene, x + w / 2, y + h / 2, LABEL[state], {
    role: 'caption', color: 'textPrimary', origin: [0.5, 0.5],
  }).setDepth(depth + 1).setScrollFactor(0)

  const draw = (s: BadgeState) => {
    g.clear()
    fillPara(g, x, y, w, h, skew, FILL[s], 1)
    strokePara(g, x, y, w, h, skew, STROKE.bold, primitive.black, 1)
    label.setText(LABEL[s])
  }
  draw(state)

  return {
    setState: (s: BadgeState) => draw(s),
    setVisible: (v: boolean) => { g.setVisible(v); label.setVisible(v) },
    destroy: () => { g.destroy(); label.destroy() },
  }
}
