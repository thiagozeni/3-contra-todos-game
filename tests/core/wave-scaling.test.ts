/**
 * Tests for scaleWaveForPlayers — co-op wave scaling.
 * STRICT TDD — RED first.
 *
 * Rule (fixed here, // TUNING in the impl):
 *   - playerCount 1 → wave returned UNCHANGED (deep-equal).
 *   - playerCount 2|3 → every NON-boss enemy group count is multiplied by
 *     playerCount; boss groups (boss_*) are left untouched.
 *   - spawnInterval and isBoss flag are never changed.
 *   - Pure & immutable: the input WaveConfig is never mutated.
 */

import { describe, it, expect } from 'vitest'
import { WAVES } from '../../src/core/config/waves'
import type { WaveConfig } from '../../src/core/config/waves'
import { scaleWaveForPlayers } from '../../src/core/systems/waveScaling'

const BOSS_TYPES = new Set(['boss_son', 'boss_coach', 'boss_coco'])

describe('scaleWaveForPlayers', () => {
  it('playerCount 1 returns a deep-equal wave (no scaling)', () => {
    for (const w of WAVES) {
      expect(scaleWaveForPlayers(w, 1)).toEqual(w)
    }
  })

  it('playerCount 2 doubles non-boss counts, bosses untouched', () => {
    for (const w of WAVES) {
      const scaled = scaleWaveForPlayers(w, 2)
      expect(scaled.id).toBe(w.id)
      expect(scaled.spawnInterval).toBe(w.spawnInterval)
      expect(scaled.isBoss).toBe(w.isBoss)
      for (let i = 0; i < w.enemies.length; i++) {
        const orig = w.enemies[i]
        const got = scaled.enemies[i]
        expect(got.type).toBe(orig.type)
        if (BOSS_TYPES.has(orig.type)) {
          expect(got.count).toBe(orig.count) // boss never scales
        } else {
          expect(got.count).toBe(orig.count * 2)
        }
      }
    }
  })

  it('playerCount 3 triples non-boss counts, bosses untouched', () => {
    for (const w of WAVES) {
      const scaled = scaleWaveForPlayers(w, 3)
      for (let i = 0; i < w.enemies.length; i++) {
        const orig = w.enemies[i]
        const got = scaled.enemies[i]
        if (BOSS_TYPES.has(orig.type)) {
          expect(got.count).toBe(orig.count)
        } else {
          expect(got.count).toBe(orig.count * 3)
        }
      }
    }
  })

  it('a boss wave keeps the boss at count 1 but scales its escort', () => {
    // wave 8: boss_coach x1 + weak x3
    const w8 = WAVES.find(w => w.id === 8)!
    const scaled = scaleWaveForPlayers(w8, 3)
    const boss = scaled.enemies.find(e => e.type === 'boss_coach')!
    const escort = scaled.enemies.find(e => e.type === 'weak')!
    expect(boss.count).toBe(1)
    expect(escort.count).toBe(3 * 3)
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
