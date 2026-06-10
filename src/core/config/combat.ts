// Pure TS — zero Phaser. Shared by server simulation and Phaser client.

import type { EnemyType } from './waves'

// ── Combat tuning ─────────────────────────────────────────────────────────────

export interface AttackSpec {
  rangeH: number
  rangeV: number
  damage: number
  cooldownMs: number
}

export interface ComboSpec {
  windowMs: number
  tier1: { hits: number; mult: number }
  tier2: { hits: number; mult: number }
}

export const COMBAT: { punch: AttackSpec; kick: AttackSpec; combo: ComboSpec } = {
  punch: { rangeH: 80,  rangeV: 40, damage: 10, cooldownMs: 150 },
  kick:  { rangeH: 100, rangeV: 40, damage: 16, cooldownMs: 500 },
  combo: {
    windowMs: 1800,
    tier1: { hits: 3, mult: 1.5 },
    tier2: { hits: 5, mult: 2   },
  },
}

// ── Knockdown thresholds (Enemy.takeDamage) ───────────────────────────────────
// fat: 9999 = never knocked down
// strong or isBoss: 30
// default: 18

export const KNOCKDOWN_THRESHOLDS: Record<EnemyType | 'boss' | 'default', number> = {
  fat:        9999,
  strong:     30,
  boss:       30,
  boss_coach: 30,
  boss_son:   30,
  boss_coco:  30,
  weak:       18,
  chair:      18,
  default:    18,
}
