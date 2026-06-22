/**
 * Tests for scaleWaveForPlayers — co-op wave scaling.
 * STRICT TDD — RED first.
 *
 * Rule (// TUNING in the impl — playtest rebalance):
 *   - playerCount 1 → wave returned UNCHANGED (deep-equal).
 *   - playerCount 2|3 → every NON-boss enemy group count grows SUB-LINEARLY:
 *     count = ceil(orig * (1 + 0.6*(pc-1)))  → ×1.6 (2p) / ×2.2 (3p);
 *     spawnInterval is stretched: round(orig * (1 + 0.15*(pc-1)));
 *     boss groups (boss_*) are left untouched.
 *   - Pure & immutable: the input WaveConfig is never mutated.
 */

import { describe, it, expect } from 'vitest'
import { WAVES } from '../../src/core/config/waves'
import type { WaveConfig } from '../../src/core/config/waves'
import { scaleWaveForPlayers } from '../../src/core/systems/waveScaling'

const BOSS_TYPES = new Set(['boss_son', 'boss_coach', 'boss_coco'])
const countMult = (pc: number) => 1 + 0.6 * (pc - 1)
const intervalMult = (pc: number) => 1 + 0.15 * (pc - 1)

describe('scaleWaveForPlayers', () => {
  it('playerCount 1 returns a deep-equal wave (no scaling)', () => {
    for (const w of WAVES) {
      expect(scaleWaveForPlayers(w, 1)).toEqual(w)
    }
  })

  it('playerCount 2 scales non-boss counts ×1.6 (ceil) + stretches interval, bosses untouched', () => {
    for (const w of WAVES) {
      const scaled = scaleWaveForPlayers(w, 2)
      expect(scaled.id).toBe(w.id)
      expect(scaled.spawnInterval).toBe(Math.round(w.spawnInterval * intervalMult(2)))
      expect(scaled.isBoss).toBe(w.isBoss)
      for (let i = 0; i < w.enemies.length; i++) {
        const orig = w.enemies[i]
        const got = scaled.enemies[i]
        expect(got.type).toBe(orig.type)
        if (BOSS_TYPES.has(orig.type)) {
          expect(got.count).toBe(orig.count) // boss never scales
        } else {
          expect(got.count).toBe(Math.ceil(orig.count * countMult(2)))
        }
      }
    }
  })

  it('playerCount 3 scales non-boss counts ×2.2 (ceil), bosses untouched', () => {
    for (const w of WAVES) {
      const scaled = scaleWaveForPlayers(w, 3)
      for (let i = 0; i < w.enemies.length; i++) {
        const orig = w.enemies[i]
        const got = scaled.enemies[i]
        if (BOSS_TYPES.has(orig.type)) {
          expect(got.count).toBe(orig.count)
        } else {
          expect(got.count).toBe(Math.ceil(orig.count * countMult(3)))
        }
      }
    }
  })

  it('a boss wave keeps the boss at count 1 but scales its escort sub-linearly', () => {
    // wave 8: boss_coach x1 + weak x3
    const w8 = WAVES.find(w => w.id === 8)!
    const scaled = scaleWaveForPlayers(w8, 3)
    const boss = scaled.enemies.find(e => e.type === 'boss_coach')!
    const escort = scaled.enemies.find(e => e.type === 'weak')!
    expect(boss.count).toBe(1)
    expect(escort.count).toBe(Math.ceil(3 * countMult(3))) // ceil(3*2.2)=7
    expect(scaled.isBoss).toBe(true)
  })

  it('does not mutate the input wave', () => {
    const w: WaveConfig = { id: 99, enemies: [{ type: 'weak', count: 4 }], spawnInterval: 1000 }
    const snapshot = JSON.stringify(w)
    scaleWaveForPlayers(w, 3)
    expect(JSON.stringify(w)).toBe(snapshot)
  })

  it('is deterministic (same input → same output)', () => {
    const w = WAVES.find(w => w.id === 7)!
    expect(JSON.stringify(scaleWaveForPlayers(w, 2))).toBe(JSON.stringify(scaleWaveForPlayers(w, 2)))
  })
})
