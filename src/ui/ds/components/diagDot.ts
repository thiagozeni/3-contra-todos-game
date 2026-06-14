/**
 * drawDot — a single diagonal dot (small parallelogram), on/off state.
 * Moved from src/ui/theme.ts; consumes DS tokens instead of COLORS.*.
 */
import Phaser from 'phaser'
import { primitive } from '../tokens/colors'
import { SKEW } from '../tokens/shape'
import { fillPara, strokePara } from './para'

/** A single diagonal dot (small parallelogram), on/off. */
export function drawDot(
  scene: Phaser.Scene,
  x: number, y: number, s: number, on: boolean, depth: number, skew?: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(depth)
  const sk = skew ?? Math.round(s * SKEW)
  if (on) {
    fillPara(g, x, y, s, s, sk, primitive.gold, 1)
    fillPara(g, x, y, s, s * 0.4, sk, primitive.goldHi, 1)
  } else {
    fillPara(g, x, y, s, s, sk, 0x222a44, 1)
  }
  strokePara(g, x, y, s, s, sk, 2, primitive.black, 1)
  return g
}
