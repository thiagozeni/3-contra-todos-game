// Pure TS — zero Phaser. Shared by server simulation and Phaser client.

import type { EnemyType } from './waves'

// ── Player stats ──────────────────────────────────────────────────────────────

export interface PlayerStatEntry {
  speed: number
  maxHp: number
  sizeScale: number
  scaleH: number
  punchReach: number
  kickReach: number
}

export const PLAYER_STATS: Record<string, PlayerStatEntry> = {
  werdum: { speed: 180, maxHp: 200, sizeScale: 1.02,  scaleH: 0.75, punchReach: 150, kickReach: 170 },
  dida:   { speed: 190, maxHp: 190, sizeScale: 1.015, scaleH: 0.98, punchReach: 140, kickReach: 160 },
  thor:   { speed: 200, maxHp: 200, sizeScale: 0.99,  scaleH: 0.94, punchReach: 130, kickReach: 150 },
}

// ── Ally stats ────────────────────────────────────────────────────────────────

export interface AllyStatEntry {
  speed: number
  sizeScale: number
  scaleH: number
  svKey?: string
}

export const ALLY_STATS: Record<string, AllyStatEntry> = {
  werdum: { speed: 80,  sizeScale: 1.02,  scaleH: 0.75 },
  dida:   { speed: 110, sizeScale: 1.015, scaleH: 0.98 },
  thor:   { speed: 130, sizeScale: 0.99,  scaleH: 0.94 },
}

// ── Enemy stats ───────────────────────────────────────────────────────────────

export interface EnemyStatEntry {
  hp: number
  speed: number
  damageToPlayer: number
  damageToWand: number
  scale: number
  isBoss?: boolean
  sizeScale?: number
}

export const ENEMY_STATS: Record<EnemyType, EnemyStatEntry> = {
  weak:       { hp: 40,  speed: 75,  damageToPlayer: 10, damageToWand: 12, scale: 0.90 },
  fat:        { hp: 130, speed: 45,  damageToPlayer: 18, damageToWand: 20, scale: 0.90 },
  strong:     { hp: 90,  speed: 60,  damageToPlayer: 15, damageToWand: 18, scale: 0.90 },
  chair:      { hp: 50,  speed: 65,  damageToPlayer: 18, damageToWand: 20, scale: 0.90 },
  boss_coach: { hp: 180, speed: 55,  damageToPlayer: 18, damageToWand: 20, scale: 0.90, isBoss: true },
  boss_son:   { hp: 280, speed: 85,  damageToPlayer: 25, damageToWand: 28, scale: 0.90, isBoss: true },
  boss_coco:  { hp: 420, speed: 95,  damageToPlayer: 35, damageToWand: 40, scale: 0.90, isBoss: true, sizeScale: 1.21 },
}

// ── Enemy score table ─────────────────────────────────────────────────────────

export const ENEMY_SCORE_TABLE: Record<EnemyType, number> = {
  weak: 10, strong: 25, chair: 25, fat: 40,
  boss_son: 200, boss_coach: 300, boss_coco: 500,
}
