/** StatLine — a label (small, secondary) stacked over a value (h2, gold).
 *  x,y is the centered top anchor; value sits below the label. Numeric values
 *  (scores, counts, times) use the Pixelify family. */
import type Phaser from 'phaser'
import { dsText } from '../text'

export interface StatLineOpts {
  x: number
  y: number
  label: string
  value: string
  valueNumeric?: boolean
  depth?: number
}

export interface StatLineHandle { destroy(): void }

export function makeStatLine(scene: Phaser.Scene, o: StatLineOpts): StatLineHandle {
  const depth = o.depth ?? 0
  const label = dsText(scene, o.x, o.y, o.label, {
    role: 'small', color: 'textSecondary', origin: [0.5, 0],
  }).setDepth(depth).setScrollFactor(0)
  const value = dsText(scene, o.x, o.y + 30, o.value, {
    role: 'h2', color: 'accentCombo', family: o.valueNumeric ? 'numeric' : 'display', origin: [0.5, 0],
  }).setDepth(depth).setScrollFactor(0)
  return { destroy: () => { label.destroy(); value.destroy() } }
}
