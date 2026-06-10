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
 * // TUNING: non-boss enemy `count` is multiplied by `playerCount` (linear).
 * Bosses stay at their original count; spawnInterval is left as-is. playerCount 1
 * returns a deep-equal copy (no scaling). The input wave is never mutated.
 */
export function scaleWaveForPlayers(wave: WaveConfig, playerCount: 1 | 2 | 3): WaveConfig {
  return {
    ...wave,
    enemies: wave.enemies.map(g =>
      BOSS_TYPES.has(g.type)
        ? { ...g }
        : { ...g, count: g.count * playerCount },
    ),
  }
}
