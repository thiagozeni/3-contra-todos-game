/**
 * Tests for src/core/systems/waves.ts — wave progression pure functions.
 * All tests are pure: no Phaser, no side effects. RED phase first.
 */

import { describe, it, expect } from 'vitest'
import {
  startNextWave,
  stepSpawning,
  checkWaveEnd,
  createEnemyState,
} from '../../src/core/systems/waves'
import type { GameState, WaveState, EnemyState } from '../../src/core/types'
import { WAVES } from '../../src/core/config/waves'
import { ENEMY_STATS } from '../../src/core/config/stats'
import { RING } from '../../src/core/config/ring'

// ── State builder helpers ──────────────────────────────────────────────────────

function makeWaveState(overrides: Partial<WaveState> = {}): WaveState {
  return {
    currentWave: 0,
    spawnQueue: [],
    spawnTimer: 0,
    spawnInterval: 1500,
    waveActive: false,
    waveEndTimer: 0,
    waveDamageTaken: false,
    nextEnemyId: 0,
    ...overrides,
  }
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    status: 'playing',
    player: {
      charKey: 'werdum',
      hp: 200,
      maxHp: 200,
      x: 960,
      y: 840,
      groundY: 840,
      fsm: 'normal',
      knockdownTimer: 0,
      attackCooldown: 0,
      isBlocking: false,
      facing: 1,
      scaleX: 1,
    },
    enemies: [],
    allies: [],
    wand: { hp: 100, maxHp: 100, x: 1150, y: 710 },
    wave: makeWaveState(),
    score: {
      score: 0,
      comboCount: 0,
      comboTimer: 0,
      enemiesDefeated: 0,
      maxComboReached: 0,
    },
    gameTimerMs: 0,
    rngState: 42,
    cheatUsed: false,
    ...overrides,
  }
}

// ── createEnemyState ─────────────────────────────────────────────────────────

describe('createEnemyState', () => {
  it('creates state with correct hp from ENEMY_STATS', () => {
    const e = createEnemyState(0, 'weak', 450, 800)
    expect(e.hp).toBe(ENEMY_STATS['weak'].hp)
    expect(e.maxHp).toBe(ENEMY_STATS['weak'].hp)
  })

  it('creates state with correct position', () => {
    const e = createEnemyState(5, 'strong', 100, 200)
    expect(e.x).toBe(100)
    expect(e.y).toBe(200)
    expect(e.id).toBe(5)
  })

  it('creates state with fsm=approach and target=wand', () => {
    const e = createEnemyState(1, 'fat', 500, 750)
    expect(e.fsm).toBe('approach')
    expect(e.target).toBe('wand')
    expect(e.isDead).toBe(false)
  })

  it('marks boss types with isBoss=true', () => {
    const boss = createEnemyState(0, 'boss_coco', 500, 700)
    expect(boss.isBoss).toBe(true)
    const regular = createEnemyState(0, 'weak', 500, 700)
    expect(regular.isBoss).toBe(false)
  })

  it('sets speed from ENEMY_STATS', () => {
    const e = createEnemyState(0, 'strong', 500, 700)
    expect(e.baseSpeed).toBe(ENEMY_STATS['strong'].speed)
    expect(e.currentSpeed).toBe(ENEMY_STATS['strong'].speed)
  })
})

// ── startNextWave ─────────────────────────────────────────────────────────────

describe('startNextWave', () => {
  it('increments currentWave from 0 to 1', () => {
    const state = makeGameState()
    const { state: next } = startNextWave(state)
    expect(next.wave.currentWave).toBe(1)
  })

  it('fills spawnQueue with exact enemy composition from WAVES config (wave 1)', () => {
    const state = makeGameState()
    const { state: next } = startNextWave(state)
    // Wave 1: 3 weak enemies
    expect(next.wave.spawnQueue.length).toBe(3)
    expect(next.wave.spawnQueue.every(t => t === 'weak')).toBe(true)
  })

  it('fills spawnQueue with exact enemy composition from WAVES config (wave 7)', () => {
    const state = makeGameState({ wave: makeWaveState({ currentWave: 6 }) })
    const { state: next } = startNextWave(state)
    // Wave 7: 5 weak + 1 fat + 1 strong = 7 total
    expect(next.wave.spawnQueue.length).toBe(7)
    const counts = { weak: 0, fat: 0, strong: 0 }
    for (const t of next.wave.spawnQueue) {
      if (t in counts) counts[t as keyof typeof counts]++
    }
    expect(counts.weak).toBe(5)
    expect(counts.fat).toBe(1)
    expect(counts.strong).toBe(1)
  })

  it('fills spawnQueue with exact enemy composition from WAVES config (wave 8 boss)', () => {
    const state = makeGameState({ wave: makeWaveState({ currentWave: 7 }) })
    const { state: next } = startNextWave(state)
    // Wave 8: 1 boss_coach + 3 weak = 4 total
    expect(next.wave.spawnQueue.length).toBe(4)
    const coachCount = next.wave.spawnQueue.filter(t => t === 'boss_coach').length
    const weakCount = next.wave.spawnQueue.filter(t => t === 'weak').length
    expect(coachCount).toBe(1)
    expect(weakCount).toBe(3)
  })

  it('shuffles the queue for non-boss waves (deterministic by seed)', () => {
    // Wave 3: 5 weak + 1 strong. With shuffling the order should vary from [weak,weak,weak,weak,weak,strong].
    // We just verify the shuffle happened (or not) by checking multiple seeds
    const state = makeGameState({ wave: makeWaveState({ currentWave: 2 }), rngState: 999 })
    const { state: next } = startNextWave(state)
    // All 6 enemies must still be there
    expect(next.wave.spawnQueue.length).toBe(6)
    // Count types: must be exactly 5 weak + 1 strong regardless of order
    const weakCount = next.wave.spawnQueue.filter(t => t === 'weak').length
    const strongCount = next.wave.spawnQueue.filter(t => t === 'strong').length
    expect(weakCount).toBe(5)
    expect(strongCount).toBe(1)
  })

  it('does NOT shuffle boss waves (queue order preserved)', () => {
    // Wave 8 (boss): boss_coach first, then weak x3
    const state = makeGameState({ wave: makeWaveState({ currentWave: 7 }), rngState: 42 })
    const { state: next } = startNextWave(state)
    // Boss wave: queue preserves order from config (boss_coach, weak, weak, weak)
    expect(next.wave.spawnQueue[0]).toBe('boss_coach')
  })

  it('shuffle for non-boss is deterministic per seed', () => {
    const state1 = makeGameState({ wave: makeWaveState({ currentWave: 2 }), rngState: 12345 })
    const state2 = makeGameState({ wave: makeWaveState({ currentWave: 2 }), rngState: 12345 })
    const { state: next1 } = startNextWave(state1)
    const { state: next2 } = startNextWave(state2)
    expect(next1.wave.spawnQueue).toEqual(next2.wave.spawnQueue)
  })

  it('sets spawnTimer to 800', () => {
    const state = makeGameState()
    const { state: next } = startNextWave(state)
    expect(next.wave.spawnTimer).toBe(800)
  })

  it('sets spawnInterval from wave config', () => {
    const state = makeGameState()
    const { state: next } = startNextWave(state)
    expect(next.wave.spawnInterval).toBe(WAVES[0].spawnInterval) // wave 1 = 1800
  })

  it('sets waveActive=true and waveDamageTaken=false', () => {
    const state = makeGameState({ wave: makeWaveState({ waveDamageTaken: true }) })
    const { state: next } = startNextWave(state)
    expect(next.wave.waveActive).toBe(true)
    expect(next.wave.waveDamageTaken).toBe(false)
  })

  it('emits waveStarted event with correct wave number', () => {
    const state = makeGameState()
    const { events } = startNextWave(state)
    const waveStarted = events.find(e => e.type === 'waveStarted')
    expect(waveStarted).toBeDefined()
    expect(waveStarted).toMatchObject({ type: 'waveStarted', wave: 1 })
  })

  // ── HP restore ──────────────────────────────────────────────────────────────

  it('does NOT restore HP on wave 1 (first wave)', () => {
    const state = makeGameState({ player: { charKey: 'werdum', hp: 100, maxHp: 200, x: 960, y: 840, groundY: 840, fsm: 'normal', knockdownTimer: 0, attackCooldown: 0, isBlocking: false, facing: 1, scaleX: 1 } })
    const { state: next } = startNextWave(state)
    expect(next.player.hp).toBe(100) // unchanged
  })

  it('restores +15% of maxHP on wave 2+', () => {
    const state = makeGameState({
      wave: makeWaveState({ currentWave: 1 }),
      player: { charKey: 'werdum', hp: 100, maxHp: 200, x: 960, y: 840, groundY: 840, fsm: 'normal', knockdownTimer: 0, attackCooldown: 0, isBlocking: false, facing: 1, scaleX: 1 },
    })
    const { state: next } = startNextWave(state)
    // wave becomes 2, so +15% of 200 = 30. 100+30 = 130
    expect(next.player.hp).toBe(130)
  })

  it('caps HP restore at maxHP', () => {
    const state = makeGameState({
      wave: makeWaveState({ currentWave: 1 }),
      player: { charKey: 'werdum', hp: 196, maxHp: 200, x: 960, y: 840, groundY: 840, fsm: 'normal', knockdownTimer: 0, attackCooldown: 0, isBlocking: false, facing: 1, scaleX: 1 },
    })
    const { state: next } = startNextWave(state)
    // 196 + 30 = 226, capped at 200
    expect(next.player.hp).toBe(200)
  })

  // ── Victory ──────────────────────────────────────────────────────────────────

  it('emits victory event when advancing past wave 12', () => {
    const state = makeGameState({
      wave: makeWaveState({ currentWave: WAVES.length }), // already at 12
    })
    const { state: next, events } = startNextWave(state)
    const victory = events.find(e => e.type === 'victory')
    expect(victory).toBeDefined()
    expect(next.status).toBe('victory')
  })

  it('does not fill spawnQueue on victory', () => {
    const state = makeGameState({
      wave: makeWaveState({ currentWave: WAVES.length }),
    })
    const { state: next } = startNextWave(state)
    expect(next.wave.spawnQueue.length).toBe(0)
    expect(next.wave.waveActive).toBe(false)
  })
})

// ── stepSpawning ──────────────────────────────────────────────────────────────

describe('stepSpawning', () => {
  function stateWithQueue(types: string[], rngSeed = 42): GameState {
    return makeGameState({
      rngState: rngSeed,
      wave: makeWaveState({
        currentWave: 1,
        spawnQueue: types as any,
        spawnTimer: 800,
        spawnInterval: 1500,
        waveActive: true,
        nextEnemyId: 0,
      }),
    })
  }

  it('decrements spawnTimer when timer > delta', () => {
    const state = stateWithQueue(['weak'])
    const { state: next } = stepSpawning(state, 300)
    expect(next.wave.spawnTimer).toBe(500)
    expect(next.enemies.length).toBe(0)
  })

  it('does nothing when spawnQueue is empty', () => {
    const state = makeGameState({
      wave: makeWaveState({ spawnQueue: [], spawnTimer: 0 }),
    })
    const { state: next, events } = stepSpawning(state, 1000)
    expect(next.enemies.length).toBe(0)
    expect(events.filter(e => e.type === 'enemySpawned').length).toBe(0)
  })

  it('spawns an enemy when spawnTimer <= 0 and resets to spawnInterval', () => {
    const state = stateWithQueue(['weak'])
    const { state: next } = stepSpawning(state, 800)
    expect(next.enemies.length).toBe(1)
    expect(next.wave.spawnQueue.length).toBe(0)
    expect(next.wave.spawnTimer).toBe(next.wave.spawnInterval) // 1500
  })

  it('emits enemySpawned event with correct type', () => {
    const state = stateWithQueue(['strong'])
    const { events } = stepSpawning(state, 800)
    const spawnEv = events.find(e => e.type === 'enemySpawned')
    expect(spawnEv).toBeDefined()
    expect(spawnEv).toMatchObject({ type: 'enemySpawned', enemyType: 'strong' })
  })

  it('spawn X is on left or right edge (RING.left+20 or RING.right-20)', () => {
    // Test with many seeds to cover both sides
    const spawnedXes = new Set<number>()
    for (let seed = 0; seed < 50; seed++) {
      const state = stateWithQueue(['weak'], seed)
      const { events } = stepSpawning(state, 800)
      const spawnEv = events.find(e => e.type === 'enemySpawned')
      if (spawnEv && spawnEv.type === 'enemySpawned') {
        spawnedXes.add(spawnEv.x)
        expect([RING.left + 20, RING.right - 20]).toContain(spawnEv.x)
      }
    }
    // Over 50 seeds, we should have seen both sides
    expect(spawnedXes.size).toBe(2)
  })

  it('spawn Y is within RING.top+30 to RING.bottom-30 bounds', () => {
    for (let seed = 0; seed < 20; seed++) {
      const state = stateWithQueue(['weak'], seed)
      const { events } = stepSpawning(state, 800)
      const spawnEv = events.find(e => e.type === 'enemySpawned')
      if (spawnEv && spawnEv.type === 'enemySpawned') {
        expect(spawnEv.y).toBeGreaterThanOrEqual(RING.top + 30)
        expect(spawnEv.y).toBeLessThanOrEqual(RING.bottom - 30)
      }
    }
  })

  it('spawned enemy has hp from ENEMY_STATS', () => {
    const state = stateWithQueue(['fat'])
    const { state: next } = stepSpawning(state, 800)
    const enemy = next.enemies[0]
    expect(enemy.hp).toBe(ENEMY_STATS['fat'].hp)
    expect(enemy.maxHp).toBe(ENEMY_STATS['fat'].hp)
  })

  it('spawned enemy has fsm=approach and target=wand', () => {
    const state = stateWithQueue(['weak'])
    const { state: next } = stepSpawning(state, 800)
    const enemy = next.enemies[0]
    expect(enemy.fsm).toBe('approach')
    expect(enemy.target).toBe('wand')
  })

  it('increments nextEnemyId for successive spawns', () => {
    // First spawn
    const state1 = stateWithQueue(['weak', 'fat'])
    const { state: after1 } = stepSpawning(state1, 800)
    expect(after1.enemies[0].id).toBe(0)
    expect(after1.wave.nextEnemyId).toBe(1)

    // Second spawn (timer reset to spawnInterval, advance past it)
    const { state: after2 } = stepSpawning(after1, after1.wave.spawnInterval)
    expect(after2.enemies[1].id).toBe(1)
    expect(after2.wave.nextEnemyId).toBe(2)
  })

  it('is deterministic: same seed → same spawn position', () => {
    const s1 = stateWithQueue(['weak'], 777)
    const s2 = stateWithQueue(['weak'], 777)
    const { events: ev1 } = stepSpawning(s1, 800)
    const { events: ev2 } = stepSpawning(s2, 800)
    const e1 = ev1.find(e => e.type === 'enemySpawned')!
    const e2 = ev2.find(e => e.type === 'enemySpawned')!
    expect(e1).toEqual(e2)
  })

  it('full determinism: same seed → identical spawn sequence (type+side+Y) across two runs', () => {
    const SEED = 99999
    // Build a state with wave 7 composition (5 weak + 1 fat + 1 strong)
    function runFullWave(seed: number) {
      let state = makeGameState({ rngState: seed })
      state = startNextWave({ ...state, wave: makeWaveState({ currentWave: 6 }) }).state

      const spawns: Array<{ type: string; x: number; y: number }> = []
      // Run until queue is empty
      while (state.wave.spawnQueue.length > 0 || state.enemies.length < 7) {
        const result = stepSpawning(state, state.wave.spawnTimer)
        state = result.state
        for (const ev of result.events) {
          if (ev.type === 'enemySpawned') spawns.push({ type: ev.enemyType, x: ev.x, y: ev.y })
        }
        if (spawns.length >= 7) break
      }
      return spawns
    }

    const run1 = runFullWave(SEED)
    const run2 = runFullWave(SEED)
    expect(run1).toEqual(run2)
    expect(run1.length).toBe(7)
  })
})

// ── checkWaveEnd ──────────────────────────────────────────────────────────────

describe('checkWaveEnd', () => {
  function waveActiveState(overrides: Partial<WaveState> = {}): GameState {
    return makeGameState({
      enemies: [],
      wave: makeWaveState({
        currentWave: 1,
        spawnQueue: [],
        waveActive: true,
        waveEndTimer: 0,
        ...overrides,
      }),
    })
  }

  it('does nothing when enemies are still alive', () => {
    const enemy = createEnemyState(0, 'weak', 450, 800)
    const state = makeGameState({
      enemies: [enemy],
      wave: makeWaveState({ currentWave: 1, spawnQueue: [], waveActive: true }),
    })
    const { state: next, events } = checkWaveEnd(state, 100)
    expect(events.filter(e => e.type === 'waveCleared').length).toBe(0)
    expect(next.wave.waveEndTimer).toBe(0)
  })

  // Fix 1: spawnQueue empty but live enemy present → wave must NOT clear
  it('does NOT clear wave when queue empty but 1 live (non-dead) enemy exists', () => {
    const liveEnemy = createEnemyState(0, 'weak', 450, 800) // isDead=false by default
    const state = makeGameState({
      enemies: [liveEnemy],
      wave: makeWaveState({ currentWave: 1, spawnQueue: [], waveActive: true }),
    })
    const { state: next, events } = checkWaveEnd(state, 100)
    // Wave must remain active; no waveCleared event
    expect(events.filter(e => e.type === 'waveCleared').length).toBe(0)
    expect(next.wave.waveActive).toBe(true)
    expect(next.wave.waveEndTimer).toBe(0)
  })

  it('does nothing when spawnQueue is not empty', () => {
    const state = makeGameState({
      enemies: [],
      wave: makeWaveState({ currentWave: 1, spawnQueue: ['weak'] as any, waveActive: true }),
    })
    const { events } = checkWaveEnd(state, 100)
    expect(events.filter(e => e.type === 'waveCleared').length).toBe(0)
  })

  it('sets waveActive=false and waveEndTimer=3000 when conditions met', () => {
    const state = waveActiveState()
    const { state: next } = checkWaveEnd(state, 100)
    expect(next.wave.waveActive).toBe(false)
    expect(next.wave.waveEndTimer).toBe(3000)
  })

  it('emits waveCleared with flawless=true when no damage was taken', () => {
    const state = waveActiveState({ waveDamageTaken: false })
    const { events } = checkWaveEnd(state, 100)
    const cleared = events.find(e => e.type === 'waveCleared')
    expect(cleared).toBeDefined()
    expect(cleared).toMatchObject({ type: 'waveCleared', wave: 1, flawless: true })
  })

  it('emits waveCleared with flawless=false when damage was taken', () => {
    const state = waveActiveState({ waveDamageTaken: true })
    const { events } = checkWaveEnd(state, 100)
    const cleared = events.find(e => e.type === 'waveCleared')
    expect(cleared).toMatchObject({ type: 'waveCleared', wave: 1, flawless: false })
  })

  it('emits waveCleared with flawless=false when cheat was used', () => {
    const state = makeGameState({
      enemies: [],
      cheatUsed: true,
      wave: makeWaveState({ currentWave: 1, spawnQueue: [], waveActive: true, waveDamageTaken: false }),
    })
    const { events } = checkWaveEnd(state, 100)
    const cleared = events.find(e => e.type === 'waveCleared')
    expect(cleared).toMatchObject({ type: 'waveCleared', flawless: false })
  })

  it('does not emit waveCleared on second call (waveActive already false)', () => {
    const state = waveActiveState()
    const { state: after1 } = checkWaveEnd(state, 100)
    const { events: ev2 } = checkWaveEnd(after1, 100)
    expect(ev2.filter(e => e.type === 'waveCleared').length).toBe(0)
  })

  it('counts down waveEndTimer and eventually calls startNextWave', () => {
    const state = waveActiveState()
    const { state: state2 } = checkWaveEnd(state, 100)
    expect(state2.wave.waveEndTimer).toBe(3000)
    expect(state2.wave.waveActive).toBe(false)

    // Step timer down
    const { state: state3 } = checkWaveEnd(state2, 2999)
    expect(state3.wave.waveEndTimer).toBeGreaterThan(0)

    const { state: state4, events } = checkWaveEnd(state3, 2)
    // Timer hits 0 → startNextWave called → wave 2 active
    expect(state4.wave.currentWave).toBe(2)
    expect(state4.wave.waveActive).toBe(true)
    expect(events.find(e => e.type === 'waveStarted')).toBeDefined()
  })

  // ── Last wave (wave 12) goes straight to victory ─────────────────────────────

  it('on last wave cleared, does NOT set waveEndTimer; calls startNextWave immediately', () => {
    const state = makeGameState({
      enemies: [],
      wave: makeWaveState({ currentWave: WAVES.length, spawnQueue: [], waveActive: true }),
    })
    const { state: next, events } = checkWaveEnd(state, 100)
    // Should have triggered startNextWave which emits victory
    const victory = events.find(e => e.type === 'victory')
    expect(victory).toBeDefined()
    expect(next.status).toBe('victory')
  })

  it('victory path does not set waveEndTimer=3000', () => {
    const state = makeGameState({
      enemies: [],
      wave: makeWaveState({ currentWave: WAVES.length, spawnQueue: [], waveActive: true }),
    })
    const { state: next } = checkWaveEnd(state, 100)
    expect(next.wave.waveEndTimer).toBe(0)
  })

  // Fix 2: last wave clear emits ONLY victory, NOT waveCleared (no spurious banner/sound)
  it('last wave clear: events contain victory and NOT waveCleared', () => {
    const state = makeGameState({
      enemies: [],
      wave: makeWaveState({ currentWave: WAVES.length, spawnQueue: [], waveActive: true }),
    })
    const { events } = checkWaveEnd(state, 100)
    expect(events.find(e => e.type === 'victory')).toBeDefined()
    expect(events.filter(e => e.type === 'waveCleared').length).toBe(0)
  })

  // Fix 2: flawless achievement info forwarded through victory event on last wave
  it('last wave clear with no damage: victory event carries flawless=true', () => {
    const state = makeGameState({
      enemies: [],
      cheatUsed: false,
      wave: makeWaveState({ currentWave: WAVES.length, spawnQueue: [], waveActive: true, waveDamageTaken: false }),
    })
    const { events } = checkWaveEnd(state, 100)
    const victory = events.find(e => e.type === 'victory')
    expect(victory).toBeDefined()
    expect(victory).toMatchObject({ type: 'victory', flawless: true })
  })

  it('last wave clear with damage taken: victory event carries flawless=false', () => {
    const state = makeGameState({
      enemies: [],
      cheatUsed: false,
      wave: makeWaveState({ currentWave: WAVES.length, spawnQueue: [], waveActive: true, waveDamageTaken: true }),
    })
    const { events } = checkWaveEnd(state, 100)
    const victory = events.find(e => e.type === 'victory')
    expect(victory).toMatchObject({ type: 'victory', flawless: false })
  })
})

// ── Integration: full wave cycle ─────────────────────────────────────────────

describe('full wave cycle integration', () => {
  it('wave 1 through 2: spawn, clear, auto-advance', () => {
    let state = makeGameState({ rngState: 1234 })

    // Start wave 1
    const { state: s1 } = startNextWave(state)
    expect(s1.wave.currentWave).toBe(1)
    expect(s1.wave.waveActive).toBe(true)

    // Spawn all 3 enemies
    let cur = s1
    const spawnedIds: number[] = []
    while (cur.wave.spawnQueue.length > 0) {
      const { state: next, events } = stepSpawning(cur, cur.wave.spawnTimer)
      cur = next
      for (const ev of events) {
        if (ev.type === 'enemySpawned') spawnedIds.push(ev.id)
      }
    }
    expect(spawnedIds.length).toBe(3)
    expect(cur.enemies.length).toBe(3)

    // Simulate all enemies dead (empty enemies array)
    cur = { ...cur, enemies: [] }

    // Check wave end: should set waveEndTimer=3000
    const { state: afterClear, events: clearEvents } = checkWaveEnd(cur, 16)
    expect(afterClear.wave.waveActive).toBe(false)
    expect(afterClear.wave.waveEndTimer).toBe(3000)
    expect(clearEvents.find(e => e.type === 'waveCleared')).toBeDefined()

    // Advance past waveEndTimer
    const { state: afterTimer, events: timerEvents } = checkWaveEnd(afterClear, 3001)
    expect(timerEvents.find(e => e.type === 'waveStarted')).toBeDefined()
    expect(afterTimer.wave.currentWave).toBe(2)
    expect(afterTimer.wave.waveActive).toBe(true)
  })

  it('all 12 waves can be advanced to completion ending in victory', () => {
    let state = makeGameState({ rngState: 5555 })

    for (let w = 1; w <= WAVES.length; w++) {
      const { state: waveState } = startNextWave(state)
      state = waveState
      expect(state.wave.currentWave).toBe(w)

      // Drain spawn queue
      while (state.wave.spawnQueue.length > 0) {
        state = stepSpawning(state, state.wave.spawnTimer).state
      }

      // Kill all enemies
      state = { ...state, enemies: [] }
    }

    // After wave 12, checkWaveEnd triggers startNextWave → victory
    const { state: final, events } = checkWaveEnd(state, 16)
    // startNextWave was called internally when wave 12 was the last wave
    expect(events.find(e => e.type === 'victory')).toBeDefined()
    expect(final.status).toBe('victory')
  })
})
