/**
 * addScanlines — subtle CRT scanlines over a region.
 * Moved from src/ui/theme.ts; consumes DS tokens instead of COLORS.*.
 */
import Phaser from 'phaser'
import { primitive } from '../tokens/colors'

/** Subtle CRT scanlines over a region. */
export function addScanlines(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, depth: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(depth)
  g.fillStyle(primitive.black, 0.14)
  for (let yy = y; yy < y + h; yy += 4) g.fillRect(x, yy, w, 2)
  return g
}
