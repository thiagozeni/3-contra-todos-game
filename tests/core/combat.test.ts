/**
 * Tests for src/core/systems/combat.ts — performAttack pure function.
 * All tests are pure: no Phaser, no side effects.
 */

import { describe, it, expect } from 'vitest'
import { performAttack } from '../../src/core/systems/combat'
import type { GameState, EnemyState, PlayerState } from '../../src/core/types'
import { COMBAT, KNOCKDOWN_THRESHOLDS } from '../../src/core/config/combat'
import { ENEMY_SCORE_TABLE } from '../../src/core/config/stats'

// ── State builder helpers ─────────────────────────────────────────────────────

function makeEnemy(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 1,
    enemyType: 'weak',
    isBoss: false,
    hp: 40,
    maxHp: 40,
    x: 900,
    y: 800,
    isDead: false,
    fsm: 'approach',
    baseSpeed: 75,
    currentSpeed: 75,
    target: 'wand',
    noHitTimer: 100,
    waitTimer: 0,
    attackCooldown: 0,
    knockdownTimer: 0,
    staggerTimer: 0,
    inPhase2: false,
    ...overrides,
  }
}

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    charKey: 'werdum',
    hp: 150,
    maxHp: 200,
    x: 800,
    y: 800,
    groundY: 800,
    fsm: 'normal',
    knockdownTimer: 0,
    attackCooldown: 0,
    isBlocking: false,
    facing: 1,
    scaleX: 1,
    ...overrides,
  }
}

function makeState(overrides: {
  player?: Partial<PlayerState>
  enemies?: EnemyState[]
  comboCount?: number
  score?: number
  enemiesDefeated?: number
} = {}): GameState {
  return {
    status: 'playing',
    player: makePlayer(overrides.player),
    enemies: overrides.enemies ?? [makeEnemy()],
    allies: [],
    wand: { hp: 100, maxHp: 100, x: 900, y: 900 },
    wave: {
      currentWave: 1,
      spawnQueue: [],
      spawnTimer: 0,
      spawnInterval: 1800,
      waveActive: true,
      waveEndTimer: 0,
      waveDamageTaken: false,
    },
    score: {
      score: overrides.score ?? 0,
      comboCount: overrides.comboCount ?? 0,
      comboTimer: 0,
      enemiesDefeated: overrides.enemiesDefeated ?? 0,
      maxComboReached: 0,
    },
    gameTimerMs: 0,
    rngState: 0,
    cheatUsed: false,
  }
}

// ── Helper: compute expected hitOriginX ──────────────────────────────────────
// player.x + facing * reach * scaleX
// werdum: punchReach=150, kickReach=170
const WERDUM_PUNCH_REACH = 150
const WERDUM_KICK_REACH = 170

// Default player: x=800, facing=1, scaleX=1
// punchHitX = 800 + 1 * 150 * 1 = 950
// kickHitX  = 800 + 1 * 170 * 1 = 970

// rangeH punch = 80, rangeV = 40, enemy at y=800 → groundY=800 → dy=0
// hit condition: |enemy.x - hitOriginX| < 80 AND |enemy.y - 800| < 40

describe('performAttack', () => {

  // ── Case 1: Hit/miss geometry ────────────────────────────────────────────
  describe('hit detection geometry (punch)', () => {
    // punchHitX = 950, rangeH = 80, rangeV = 40
    it('hits enemy at dx=79 (just inside rangeH)', () => {
      // enemy.x = 950 + 79 = 1029 → dx = 79 < 80 ✓, dy = 0 < 40 ✓
      const state = makeState({ enemies: [makeEnemy({ x: 1029, y: 800 })] })
      const result = performAttack(state, 'punch')
      const hit = result.events.find(e => e.type === 'hit')
      expect(hit).toBeDefined()
    })

    it('misses enemy at dx=80 (equals rangeH, not strictly less)', () => {
      // enemy.x = 950 + 80 = 1030 → dx = 80, not < 80 → miss
      const state = makeState({ enemies: [makeEnemy({ x: 1030, y: 800 })] })
      const result = performAttack(state, 'punch')
      const hit = result.events.find(e => e.type === 'hit')
      expect(hit).toBeUndefined()
    })

    it('misses enemy at dx=81', () => {
      // enemy.x = 950 + 81 = 1031 → dx = 81 > 80 → miss
      const state = makeState({ enemies: [makeEnemy({ x: 1031, y: 800 })] })
      const result = performAttack(state, 'punch')
      const hit = result.events.find(e => e.type === 'hit')
      expect(hit).toBeUndefined()
    })

    it('hits enemy at dy=39 (just inside rangeV)', () => {
      // enemy.x = 950 → dx = 0, enemy.y = 800+39 = 839 → dy=39 < 40 ✓
      const state = makeState({ enemies: [makeEnemy({ x: 950, y: 839 })] })
      const result = performAttack(state, 'punch')
      const hit = result.events.find(e => e.type === 'hit')
      expect(hit).toBeDefined()
    })

    it('misses enemy at dy=40 (equals rangeV, not strictly less)', () => {
      // enemy.y = 800+40 = 840 → dy=40, not < 40 → miss
      const state = makeState({ enemies: [makeEnemy({ x: 950, y: 840 })] })
      const result = performAttack(state, 'punch')
      const hit = result.events.find(e => e.type === 'hit')
      expect(hit).toBeUndefined()
    })

    it('misses enemy at dy=41', () => {
      // enemy.y = 800+41 = 841 → dy=41 > 40 → miss
      const state = makeState({ enemies: [makeEnemy({ x: 950, y: 841 })] })
      const result = performAttack(state, 'punch')
      const hit = result.events.find(e => e.type === 'hit')
      expect(hit).toBeUndefined()
    })

    it('skips dead enemies', () => {
      const state = makeState({ enemies: [makeEnemy({ x: 950, y: 800, isDead: true })] })
      const result = performAttack(state, 'punch')
      const hit = result.events.find(e => e.type === 'hit')
      expect(hit).toBeUndefined()
    })
  })

  // ── Case 2: Base damage and cooldown ────────────────────────────────────
  describe('damage and cooldown', () => {
    it('punch deals 10 base damage (no combo)', () => {
      // enemy at exact hitOriginX x=950, y=800 → dx=0, dy=0
      const state = makeState({ enemies: [makeEnemy({ x: 950, y: 800, hp: 40 })] })
      const result = performAttack(state, 'punch')
      const hitEvent = result.events.find(e => e.type === 'hit')
      expect(hitEvent).toBeDefined()
      if (hitEvent?.type === 'hit') {
        expect(hitEvent.amount).toBe(10)
      }
      expect(result.state.enemies[0].hp).toBe(30)
    })

    it('kick deals 16 base damage (no combo)', () => {
      // kickHitX = 800 + 1 * 170 * 1 = 970, enemy at x=970
      const state = makeState({ enemies: [makeEnemy({ x: 970, y: 800, hp: 40 })] })
      const result = performAttack(state, 'kick')
      const hitEvent = result.events.find(e => e.type === 'hit')
      expect(hitEvent).toBeDefined()
      if (hitEvent?.type === 'hit') {
        expect(hitEvent.amount).toBe(16)
      }
      expect(result.state.enemies[0].hp).toBe(24)
    })

    it('punch sets attackCooldown to 150ms', () => {
      const state = makeState({ enemies: [makeEnemy({ x: 950, y: 800 })] })
      const result = performAttack(state, 'punch')
      expect(result.state.player.attackCooldown).toBe(150)
    })

    it('kick sets attackCooldown to 500ms', () => {
      const state = makeState({ enemies: [makeEnemy({ x: 970, y: 800 })] })
      const result = performAttack(state, 'kick')
      expect(result.state.player.attackCooldown).toBe(500)
    })
  })

  // ── Case 3: Combo multipliers ────────────────────────────────────────────
  // Multiplier uses comboCount BEFORE increment.
  // tier1.hits=3, tier1.mult=1.5; tier2.hits=5, tier2.mult=2
  describe('combo multipliers', () => {
    it('comboCount=2 (pre-hit) → 1x multiplier (base damage 10)', () => {
      const state = makeState({ comboCount: 2, enemies: [makeEnemy({ x: 950, y: 800 })] })
      const result = performAttack(state, 'punch')
      const hitEvent = result.events.find(e => e.type === 'hit')
      if (hitEvent?.type === 'hit') {
        expect(hitEvent.amount).toBe(10) // 10 * 1 = 10
      }
    })

    it('comboCount=3 (pre-hit) → 1.5x multiplier → damage 15', () => {
      const state = makeState({ comboCount: 3, enemies: [makeEnemy({ x: 950, y: 800 })] })
      const result = performAttack(state, 'punch')
      const hitEvent = result.events.find(e => e.type === 'hit')
      if (hitEvent?.type === 'hit') {
        expect(hitEvent.amount).toBe(15) // Math.round(10 * 1.5) = 15
      }
    })

    it('comboCount=4 (pre-hit) → 1.5x multiplier → damage 15', () => {
      const state = makeState({ comboCount: 4, enemies: [makeEnemy({ x: 950, y: 800 })] })
      const result = performAttack(state, 'punch')
      const hitEvent = result.events.find(e => e.type === 'hit')
      if (hitEvent?.type === 'hit') {
        expect(hitEvent.amount).toBe(15) // Math.round(10 * 1.5) = 15
      }
    })

    it('comboCount=5 (pre-hit) → 2x multiplier → damage 20', () => {
      const state = makeState({ comboCount: 5, enemies: [makeEnemy({ x: 950, y: 800 })] })
      const result = performAttack(state, 'punch')
      const hitEvent = result.events.find(e => e.type === 'hit')
      if (hitEvent?.type === 'hit') {
        expect(hitEvent.amount).toBe(20) // Math.round(10 * 2) = 20
      }
    })

    it('comboCount=10 (pre-hit) → 2x multiplier → kick damage 32', () => {
      // kickHitX=970, enemy at x=970
      const state = makeState({ comboCount: 10, enemies: [makeEnemy({ x: 970, y: 800 })] })
      const result = performAttack(state, 'kick')
      const hitEvent = result.events.find(e => e.type === 'hit')
      if (hitEvent?.type === 'hit') {
        expect(hitEvent.amount).toBe(32) // Math.round(16 * 2) = 32
      }
    })
  })

  // ── Case 4: Multiple enemies in range ───────────────────────────────────
  describe('multi-enemy hit', () => {
    it('both enemies in range both take damage', () => {
      const e1 = makeEnemy({ id: 1, x: 950, y: 800, hp: 40 })
      const e2 = makeEnemy({ id: 2, x: 960, y: 810, hp: 30 })
      const state = makeState({ enemies: [e1, e2] })
      const result = performAttack(state, 'punch')
      const hits = result.events.filter(e => e.type === 'hit')
      expect(hits).toHaveLength(2)
      expect(result.state.enemies[0].hp).toBe(30) // 40 - 10
      expect(result.state.enemies[1].hp).toBe(20) // 30 - 10
    })

    it('only enemy in range takes damage, out-of-range one unaffected', () => {
      const e1 = makeEnemy({ id: 1, x: 950, y: 800, hp: 40 }) // in range
      const e2 = makeEnemy({ id: 2, x: 200, y: 800, hp: 40 }) // far left
      const state = makeState({ enemies: [e1, e2] })
      const result = performAttack(state, 'punch')
      const hits = result.events.filter(e => e.type === 'hit')
      expect(hits).toHaveLength(1)
      expect(result.state.enemies[0].hp).toBe(30)
      expect(result.state.enemies[1].hp).toBe(40) // unchanged
    })
  })

  // ── Case 5: Miss events ──────────────────────────────────────────────────
  describe('miss behavior', () => {
    it('emits attackSwung hit=false when no enemy in range', () => {
      const state = makeState({ enemies: [makeEnemy({ x: 200, y: 800 })] })
      const result = performAttack(state, 'punch')
      const swung = result.events.find(e => e.type === 'attackSwung')
      expect(swung).toBeDefined()
      if (swung?.type === 'attackSwung') {
        expect(swung.hit).toBe(false)
      }
    })

    it('does NOT increment comboCount on miss', () => {
      const state = makeState({ comboCount: 2, enemies: [makeEnemy({ x: 200, y: 800 })] })
      const result = performAttack(state, 'punch')
      expect(result.state.score.comboCount).toBe(2)
    })

    it('does NOT reset comboTimer on miss (timer unchanged)', () => {
      const state = makeState({ enemies: [makeEnemy({ x: 200, y: 800 })] })
      // Override comboTimer
      const stateWithTimer = {
        ...state,
        score: { ...state.score, comboCount: 3, comboTimer: 1200 },
      }
      const result = performAttack(stateWithTimer, 'punch')
      expect(result.state.score.comboTimer).toBe(1200)
    })

    it('emits attackSwung hit=true when enemy hit', () => {
      const state = makeState({ enemies: [makeEnemy({ x: 950, y: 800 })] })
      const result = performAttack(state, 'punch')
      const swung = result.events.find(e => e.type === 'attackSwung')
      expect(swung).toBeDefined()
      if (swung?.type === 'attackSwung') {
        expect(swung.hit).toBe(true)
      }
    })
  })

  // ── Case 6: Kill behavior ────────────────────────────────────────────────
  describe('kill', () => {
    it('enemy hp goes to 0 on lethal hit, fsm set to dead', () => {
      const state = makeState({ enemies: [makeEnemy({ x: 950, y: 800, hp: 5 })] })
      const result = performAttack(state, 'punch') // 10 damage > 5 hp
      expect(result.state.enemies[0].hp).toBe(0)
      expect(result.state.enemies[0].fsm).toBe('dead')
      expect(result.state.enemies[0].isDead).toBe(true)
    })

    it('emits enemyDied event on kill', () => {
      const state = makeState({ enemies: [makeEnemy({ x: 950, y: 800, hp: 5 })] })
      const result = performAttack(state, 'punch')
      const died = result.events.find(e => e.type === 'enemyDied')
      expect(died).toBeDefined()
      if (died?.type === 'enemyDied') {
        expect(died.id).toBe(1)
        expect(died.enemyType).toBe('weak')
      }
    })

    it('score increases by ENEMY_SCORE × scoreMult on kill (comboCount=0 before hit → scoreMult=1)', () => {
      // addScore: mult = Math.max(1, Math.floor(comboCount / 2))
      // comboCount=0 before hit → after hit comboCount=1 → scoreMult = Math.max(1, floor(1/2)) = Math.max(1,0) = 1
      const state = makeState({ comboCount: 0, enemies: [makeEnemy({ x: 950, y: 800, hp: 5 })] })
      const result = performAttack(state, 'punch')
      const expectedScore = ENEMY_SCORE_TABLE['weak'] * 1 // 10 * 1 = 10
      expect(result.state.score.score).toBe(expectedScore)
    })

    it('score increases by ENEMY_SCORE × scoreMult (comboCount=4 before hit → after=5 → scoreMult=floor(5/2)=2)', () => {
      // comboCount=4 → after hit becomes 5 → Math.max(1, floor(5/2)) = Math.max(1,2) = 2
      const state = makeState({ comboCount: 4, enemies: [makeEnemy({ x: 950, y: 800, hp: 5 })] })
      const result = performAttack(state, 'punch')
      const expectedScore = ENEMY_SCORE_TABLE['weak'] * 2 // 10 * 2 = 20
      expect(result.state.score.score).toBe(expectedScore)
    })

    it('enemiesDefeated increments on kill', () => {
      const state = makeState({ enemiesDefeated: 3, enemies: [makeEnemy({ x: 950, y: 800, hp: 5 })] })
      const result = performAttack(state, 'punch')
      expect(result.state.score.enemiesDefeated).toBe(4)
    })
  })

  // ── Case 7: Knockdown ────────────────────────────────────────────────────
  describe('knockdown', () => {
    it('weak enemy taking damage >= 18 → fsm=knockdown + event (10 damage = no knockdown)', () => {
      // punch=10 < 18 → no knockdown
      const state = makeState({ enemies: [makeEnemy({ x: 950, y: 800, hp: 40, enemyType: 'weak' })] })
      const result = performAttack(state, 'punch')
      expect(result.state.enemies[0].fsm).toBe('approach') // unchanged
      const kd = result.events.find(e => e.type === 'enemyKnockdown')
      expect(kd).toBeUndefined()
    })

    it('weak enemy taking damage >= 18 (kick=16 → no knockdown, but comboCount=3 → 24 → knockdown)', () => {
      // kick=16, comboCount=3 → mult=1.5 → damage=24 >= 18 → knockdown
      const state = makeState({
        comboCount: 3,
        enemies: [makeEnemy({ x: 970, y: 800, hp: 40, enemyType: 'weak' })],
      })
      const result = performAttack(state, 'kick')
      expect(result.state.enemies[0].fsm).toBe('knockdown')
      const kd = result.events.find(e => e.type === 'enemyKnockdown')
      expect(kd).toBeDefined()
    })

    it('weak enemy with base kick (16) → no knockdown (16 < 18)', () => {
      const state = makeState({ enemies: [makeEnemy({ x: 970, y: 800, hp: 40, enemyType: 'weak' })] })
      const result = performAttack(state, 'kick')
      expect(result.state.enemies[0].fsm).toBe('approach') // no knockdown
    })

    it('fat enemy never knocked down (threshold 9999)', () => {
      // punch=10 with comboCount=5 → 20 << 9999
      const state = makeState({
        comboCount: 5,
        enemies: [makeEnemy({ x: 950, y: 800, hp: 100, enemyType: 'fat' })],
      })
      const result = performAttack(state, 'punch')
      const kd = result.events.find(e => e.type === 'enemyKnockdown')
      expect(kd).toBeUndefined()
      expect(result.state.enemies[0].fsm).not.toBe('knockdown')
    })

    it('strong enemy needs ≥30 to knockdown (kick=16 × 2x = 32 → knockdown)', () => {
      const state = makeState({
        comboCount: 5,
        enemies: [makeEnemy({ id: 1, x: 970, y: 800, hp: 100, enemyType: 'strong', isBoss: false })],
      })
      const result = performAttack(state, 'kick') // 16 * 2 = 32 >= 30
      expect(result.state.enemies[0].fsm).toBe('knockdown')
    })

    it('strong enemy: damage < 30 → no knockdown', () => {
      const state = makeState({
        comboCount: 0,
        enemies: [makeEnemy({ id: 1, x: 970, y: 800, hp: 100, enemyType: 'strong', isBoss: false })],
      })
      const result = performAttack(state, 'kick') // 16 < 30
      expect(result.state.enemies[0].fsm).not.toBe('knockdown')
    })

    it('boss enemy knockdown timer = 800', () => {
      // boss_coach: isBoss=true, threshold=30; kick*2=32 → knockdown
      const state = makeState({
        comboCount: 5,
        enemies: [makeEnemy({ id: 1, x: 970, y: 800, hp: 100, enemyType: 'boss_coach', isBoss: true })],
      })
      const result = performAttack(state, 'kick')
      expect(result.state.enemies[0].fsm).toBe('knockdown')
      expect(result.state.enemies[0].knockdownTimer).toBe(800)
    })

    it('non-boss knockdown timer = 1500', () => {
      // weak: comboCount=3, kick=16*1.5=24 >= 18
      const state = makeState({
        comboCount: 3,
        enemies: [makeEnemy({ id: 1, x: 970, y: 800, hp: 100, enemyType: 'weak', isBoss: false })],
      })
      const result = performAttack(state, 'kick')
      expect(result.state.enemies[0].knockdownTimer).toBe(1500)
    })
  })

  // ── Case 8: Boss phase 2 (boss_coco) ────────────────────────────────────
  describe('boss_coco phase 2', () => {
    it('hp drops below 100 → bossPhase2 event + currentSpeed = baseSpeed * 1.4', () => {
      // boss_coco at hp=110, kick=16 → new hp=94 < 100
      const state = makeState({
        enemies: [makeEnemy({
          id: 5,
          enemyType: 'boss_coco',
          isBoss: true,
          hp: 110,
          baseSpeed: 95,
          currentSpeed: 95,
          inPhase2: false,
          x: 970,
          y: 800,
        })],
      })
      const result = performAttack(state, 'kick')
      const phase2 = result.events.find(e => e.type === 'bossPhase2')
      expect(phase2).toBeDefined()
      if (phase2?.type === 'bossPhase2') {
        expect(phase2.id).toBe(5)
      }
      expect(result.state.enemies[0].inPhase2).toBe(true)
      expect(result.state.enemies[0].currentSpeed).toBeCloseTo(95 * 1.4)
    })

    it('second hit below 100 when already inPhase2 → NO bossPhase2 event', () => {
      const state = makeState({
        enemies: [makeEnemy({
          id: 5,
          enemyType: 'boss_coco',
          isBoss: true,
          hp: 50,
          baseSpeed: 95,
          currentSpeed: 95 * 1.4,
          inPhase2: true, // already in phase 2
          x: 970,
          y: 800,
        })],
      })
      const result = performAttack(state, 'kick')
      const phase2Events = result.events.filter(e => e.type === 'bossPhase2')
      expect(phase2Events).toHaveLength(0)
    })

    it('boss_coco at exactly hp=100 taking 1 damage → hp=99 < 100 → bossPhase2', () => {
      // Need to get 1 damage. Use punch with comboCount=0 → 10 damage.
      // Actually hp=109, kick=16 → hp=93 < 100. Let's try hp exactly at threshold.
      // boss_coco hp=108, punch (comboCount=0) = 10 → hp=98 < 100 → triggers
      const state = makeState({
        enemies: [makeEnemy({
          id: 5,
          enemyType: 'boss_coco',
          isBoss: true,
          hp: 108,
          baseSpeed: 95,
          currentSpeed: 95,
          inPhase2: false,
          x: 950,
          y: 800,
        })],
      })
      const result = performAttack(state, 'punch')
      expect(result.state.enemies[0].inPhase2).toBe(true)
    })

    it('boss_coco at hp=110 with no inPhase2, takes kick (16) → hp=94, bossPhase2 event emitted once', () => {
      const state = makeState({
        enemies: [makeEnemy({
          id: 5,
          enemyType: 'boss_coco',
          isBoss: true,
          hp: 110,
          baseSpeed: 95,
          currentSpeed: 95,
          inPhase2: false,
          x: 970,
          y: 800,
        })],
      })
      const result = performAttack(state, 'kick')
      const phase2Events = result.events.filter(e => e.type === 'bossPhase2')
      expect(phase2Events).toHaveLength(1)
      expect(result.state.enemies[0].hp).toBe(94)
    })
  })

  // ── Case 9: Target switch ────────────────────────────────────────────────
  describe('target switch', () => {
    it('enemy targeting wand that gets hit → switches target to player', () => {
      const state = makeState({
        enemies: [makeEnemy({ x: 950, y: 800, target: 'wand' })],
      })
      const result = performAttack(state, 'punch')
      expect(result.state.enemies[0].target).toBe('player')
    })

    it('noHitTimer reset to 0 on hit', () => {
      const state = makeState({
        enemies: [makeEnemy({ x: 950, y: 800, noHitTimer: 999 })],
      })
      const result = performAttack(state, 'punch')
      expect(result.state.enemies[0].noHitTimer).toBe(0)
    })
  })

  // ── Case 10: Immutability ────────────────────────────────────────────────
  describe('immutability', () => {
    it('input state is not mutated after performAttack', () => {
      const enemy = makeEnemy({ x: 950, y: 800, hp: 40 })
      const state = makeState({ enemies: [enemy] })
      const originalHp = state.enemies[0].hp
      const originalScore = state.score.score
      const originalCombo = state.score.comboCount

      performAttack(state, 'punch')

      // Original state unchanged
      expect(state.enemies[0].hp).toBe(originalHp)
      expect(state.score.score).toBe(originalScore)
      expect(state.score.comboCount).toBe(originalCombo)
      expect(state.player.attackCooldown).toBe(0)
    })

    it('returned state is a different object from input state', () => {
      const state = makeState({ enemies: [makeEnemy({ x: 950, y: 800 })] })
      const result = performAttack(state, 'punch')
      expect(result.state).not.toBe(state)
      expect(result.state.enemies[0]).not.toBe(state.enemies[0])
      expect(result.state.score).not.toBe(state.score)
      expect(result.state.player).not.toBe(state.player)
    })
  })

  // ── Case 11: Cooldown gate ───────────────────────────────────────────────
  describe('cooldown gate', () => {
    it('attackCooldown > 0 → no-op (state unchanged, no events)', () => {
      const enemy = makeEnemy({ x: 950, y: 800, hp: 40 })
      const state = makeState({ enemies: [enemy] })
      const stateWithCooldown = {
        ...state,
        player: { ...state.player, attackCooldown: 100 },
      }
      const result = performAttack(stateWithCooldown, 'punch')
      expect(result.events).toHaveLength(0)
      expect(result.state.enemies[0].hp).toBe(40)
      expect(result.state.player.attackCooldown).toBe(100) // unchanged
    })

    it('fsm != normal → no-op (knockdown cannot attack)', () => {
      const enemy = makeEnemy({ x: 950, y: 800, hp: 40 })
      const state = makeState({ enemies: [enemy] })
      const knockdownState = {
        ...state,
        player: { ...state.player, fsm: 'knockdown' as const },
      }
      const result = performAttack(knockdownState, 'punch')
      expect(result.events).toHaveLength(0)
      expect(result.state.enemies[0].hp).toBe(40)
    })
  })

  // ── Case 12: Combo increment and milestone events ────────────────────────
  describe('combo increment and milestones', () => {
    it('hit → comboCount increments by 1', () => {
      const state = makeState({ comboCount: 0, enemies: [makeEnemy({ x: 950, y: 800 })] })
      const result = performAttack(state, 'punch')
      expect(result.state.score.comboCount).toBe(1)
    })

    it('hit → comboTimer set to COMBAT.combo.windowMs (1800)', () => {
      const state = makeState({ enemies: [makeEnemy({ x: 950, y: 800 })] })
      const result = performAttack(state, 'punch')
      expect(result.state.score.comboTimer).toBe(COMBAT.combo.windowMs)
    })

    it('comboCount reaching 10 → comboMilestone event emitted', () => {
      // comboCount=9 → after hit becomes 10
      const state = makeState({ comboCount: 9, enemies: [makeEnemy({ x: 950, y: 800 })] })
      const result = performAttack(state, 'punch')
      const milestone = result.events.find(e => e.type === 'comboMilestone')
      expect(milestone).toBeDefined()
      if (milestone?.type === 'comboMilestone') {
        expect(milestone.count).toBe(10)
      }
    })

    it('comboCount reaching 20 → comboMilestone event emitted', () => {
      // comboCount=19 → after hit becomes 20
      const state = makeState({ comboCount: 19, enemies: [makeEnemy({ x: 950, y: 800 })] })
      const result = performAttack(state, 'punch')
      const milestone = result.events.find(e => e.type === 'comboMilestone')
      expect(milestone).toBeDefined()
      if (milestone?.type === 'comboMilestone') {
        expect(milestone.count).toBe(20)
      }
    })

    it('comboCount reaching 11 (not milestone) → no comboMilestone event', () => {
      const state = makeState({ comboCount: 10, enemies: [makeEnemy({ x: 950, y: 800 })] })
      const result = performAttack(state, 'punch')
      const milestone = result.events.find(e => e.type === 'comboMilestone')
      expect(milestone).toBeUndefined()
    })
  })

  // ── Case 13: facing direction ────────────────────────────────────────────
  describe('facing left (facing=-1)', () => {
    it('facing=-1 → hitOriginX offset to the left', () => {
      // player.x=800, facing=-1, scaleX=1
      // punchHitX = 800 + (-1) * 150 * 1 = 650
      // enemy at x=650, rangeH=80 → dx=0, dy=0 → hit
      const state = makeState({
        player: { facing: -1 as const, x: 800, y: 800, groundY: 800, scaleX: 1 },
        enemies: [makeEnemy({ x: 650, y: 800 })],
      })
      const result = performAttack(state, 'punch')
      const hit = result.events.find(e => e.type === 'hit')
      expect(hit).toBeDefined()
    })

    it('facing=-1 → enemy at original hitOriginX (950) → miss', () => {
      // punchHitX = 650 when facing=-1; enemy at 950 → dx=|950-650|=300 > 80 → miss
      const state = makeState({
        player: { facing: -1 as const, x: 800, y: 800, groundY: 800, scaleX: 1 },
        enemies: [makeEnemy({ x: 950, y: 800 })],
      })
      const result = performAttack(state, 'punch')
      const hit = result.events.find(e => e.type === 'hit')
      expect(hit).toBeUndefined()
    })
  })
})
