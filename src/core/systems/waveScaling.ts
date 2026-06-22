// Pure TS — zero Phaser. Co-op wave scaling.
//
// Scales a WaveConfig for the number of HUMAN players in the match. Non-boss
// enemy counts grow with the player count so a 3-player co-op wave has 3x the
// fodder; bosses are NEVER multiplied (one boss is one boss). spawnInterval and
// the isBoss flag are untouched. Pure & immutable.

import type { WaveConfig, EnemyType } from '../config/waves'

const BOSS_TYPES: ReadonlySet<EnemyType> = new Set<EnemyType>([
  'boss_son',
  'boss_coach',
  'boss_coco',
])

/**
 * Return a new WaveConfig scaled for `playerCount` humans.
 *
 * // TUNING (playtest finding): the old rule multiplied non-boss `count` by
 * `playerCount` LINEARLY (×2 / ×3) while the wand HP was fixed, making co-op
 * strictly harder than solo. Now:
 *   - enemy count grows SUB-LINEARLY: ceil(count * (1 + 0.6*(playerCount-1)))
 *     → ×1 / ×1.6 / ×2.2 (so more fodder for more players, but not 3× a fixed wand);
 *   - spawnInterval is STRETCHED slightly in co-op (×(1 + 0.15*(playerCount-1)))
 *     to reduce simultaneous saturation around the wand.
 * Bosses are never multiplied. playerCount 1 returns a deep-equal copy (no scaling).
 * The input wave is never mutated. Pair with the per-player wand-HP scaling in multi.ts.
 */
export function scaleWaveForPlayers(wave: WaveConfig, playerCount: 1 | 2 | 3): WaveConfig {
  const countMult = 1 + 0.6 * (playerCount - 1)
  const intervalMult = 1 + 0.15 * (playerCount - 1)
  return {
    ...wave,
    spawnInterval: Math.round(wave.spawnInterval * intervalMult),
    enemies: wave.enemies.map(g =>
      BOSS_TYPES.has(g.type)
        ? { ...g }
        : { ...g, count: Math.ceil(g.count * countMult) },
    ),
  }
}
