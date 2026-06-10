// Pure TS — zero Phaser. Shared by server simulation and Phaser client.

export type EnemyType = 'weak' | 'fat' | 'strong' | 'chair' | 'boss_son' | 'boss_coach' | 'boss_coco'

export interface WaveEnemy  { type: EnemyType; count: number }
export interface WaveConfig { id: number; enemies: WaveEnemy[]; spawnInterval: number; isBoss?: boolean }

export const WAVES: WaveConfig[] = [
  { id: 1,  enemies: [{ type: 'weak',       count: 3 }],                                           spawnInterval: 1800 },
  { id: 2,  enemies: [{ type: 'weak',       count: 5 }],                                           spawnInterval: 1500 },
  { id: 3,  enemies: [{ type: 'weak',       count: 5 }, { type: 'strong', count: 1 }],             spawnInterval: 1400 },
  { id: 4,  enemies: [{ type: 'weak',       count: 6 }, { type: 'fat',    count: 1 }],             spawnInterval: 1200 },
  { id: 5,  enemies: [{ type: 'weak',       count: 4 }, { type: 'chair',  count: 1 }],             spawnInterval: 1200 },
  { id: 6,  enemies: [{ type: 'weak',       count: 6 }, { type: 'strong', count: 2 }],             spawnInterval: 1100 },
  { id: 7,  enemies: [{ type: 'weak',       count: 5 }, { type: 'fat',    count: 1 }, { type: 'strong', count: 1 }], spawnInterval: 1000 },
  { id: 8,  enemies: [{ type: 'boss_coach', count: 1 }, { type: 'weak',   count: 3 }],                              spawnInterval: 1500, isBoss: true },
  { id: 9,  enemies: [{ type: 'weak',       count: 5 }, { type: 'strong', count: 2 }, { type: 'fat',    count: 1 }], spawnInterval: 900  },
  { id: 10, enemies: [{ type: 'boss_son',   count: 1 }, { type: 'weak',   count: 3 }],                              spawnInterval: 1500, isBoss: true },
  { id: 11, enemies: [{ type: 'weak',       count: 4 }, { type: 'strong', count: 2 }, { type: 'chair',  count: 1 }], spawnInterval: 900  },
  { id: 12, enemies: [{ type: 'boss_coco',  count: 1 }, { type: 'weak',   count: 4 }],                              spawnInterval: 1200, isBoss: true },
]
