// Pure TS — zero Phaser. Tests for src/core/systems/ally.ts

import { describe, it, expect } from 'vitest'
import { stepAlly } from '../../src/core/systems/ally'
import type { AllyState, EnemyState } from '../../src/core/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAlly(overrides: Partial<AllyState> = {}): AllyState {
  return {
    charKey: 'dida',
    x: 760,
    y: 800,
    fsm: 'idle',
    attackCooldown: 0,
    knockdownTimer: 0,
    ...overrides,
  }
}

function makeEnemy(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 0,
    enemyType: 'weak',
    isBoss: false,
    hp: 40,
    maxHp: 40,
    x: 700,
    y: 800,
    isDead: false,
    fsm: 'approach',
    baseSpeed: 75,
    currentSpeed: 75,
    target: 'wand',
    noHitTimer: 0,
    waitTimer: 0,
    attackCooldown: 0,
    knockdownTimer: 0,
    staggerTimer: 0,
    inPhase2: false,
    ...overrides,
  }
}

// ── stepAlly — general ────────────────────────────────────────────────────────

describe('stepAlly — general', () => {
  it('returns a new ally object (immutable)', () => {
    const ally = makeAlly()
    const { ally: result } = stepAlly(ally, [], 16, 42)
    expect(result).not.toBe(ally)
  })

  it('returns new enemy objects (immutable)', () => {
    const ally = makeAlly()
    const e = makeEnemy({ x: 760, y: 800 }) // same position → in range
    const { enemies } = stepAlly(ally, [e], 16, 42)
    expect(enemies[0]).not.toBe(e)
  })

  it('returns rngState', () => {
    const ally = makeAlly()
    const result = stepAlly(ally, [], 16, 42)
    expect(typeof result.rngState).toBe('number')
  })
})

// ── seek and movement ─────────────────────────────────────────────────────────

describe('stepAlly — seek enemy', () => {
  it('stays idle when no enemies', () => {
    const ally = makeAlly({ fsm: 'idle' })
    const { ally: result } = stepAlly(ally, [], 16, 42)
    expect(result.fsm).toBe('idle')
  })

  it('moves toward nearest enemy (fsm = moveToEnemy)', () => {
    const ally = makeAlly({ x: 760, y: 800, fsm: 'idle' })
    const e = makeEnemy({ x: 900, y: 800 }) // 140px away
    const { ally: result } = stepAlly(ally, [e], 100, 42)
    // Should move toward enemy
    expect(result.x).toBeGreaterThan(760)
    expect(result.fsm).toBe('moveToEnemy')
  })

  it('skips dead enemies when seeking', () => {
    const ally = makeAlly({ x: 760, y: 800, fsm: 'idle' })
    const deadEnemy = makeEnemy({ x: 765, y: 800, isDead: true })
    const { ally: result } = stepAlly(ally, [deadEnemy], 16, 42)
    // No live enemies → stays idle
    expect(result.fsm).toBe('idle')
  })

  it('attacks nearest enemy when dist<75 and cooldown<=0', () => {
    const ally = makeAlly({ x: 760, y: 800, fsm: 'idle', attackCooldown: 0 })
    const e = makeEnemy({ x: 790, y: 800 }) // 30px away
    const { ally: result, enemies } = stepAlly(ally, [e], 16, 42)
    expect(result.fsm).toBe('attack')
    expect(result.attackCooldown).toBe(900)
    // Enemy takes 4 damage (playtest #6: ally damage 6→4)
    expect(enemies[0].hp).toBe(36) // 40 - 4
  })

  it('does not attack when cooldown > 0', () => {
    const ally = makeAlly({ x: 760, y: 800, fsm: 'idle', attackCooldown: 500 })
    const e = makeEnemy({ x: 790, y: 800 }) // 30px away
    const { ally: result, enemies } = stepAlly(ally, [e], 16, 42)
    expect(result.fsm).not.toBe('attack')
    expect(enemies[0].hp).toBe(40) // unchanged
  })

  it('does not attack when dist>=75', () => {
    const ally = makeAlly({ x: 760, y: 800, fsm: 'idle', attackCooldown: 0 })
    const e = makeEnemy({ x: 850, y: 800 }) // 90px away
    const { ally: result, enemies } = stepAlly(ally, [e], 16, 42)
    expect(result.fsm).toBe('moveToEnemy')
    expect(enemies[0].hp).toBe(40) // unchanged
  })

  it('emits hit event when attacking', () => {
    const ally = makeAlly({ x: 760, y: 800, fsm: 'idle', attackCooldown: 0 })
    const e = makeEnemy({ x: 790, y: 800 })
    const { events } = stepAlly(ally, [e], 16, 42)
    const hitEvent = events.find(ev => ev.type === 'hit')
    expect(hitEvent).toBeDefined()
    expect((hitEvent as { type: 'hit'; amount: number }).amount).toBe(4)
  })

  it('moves toward attack target with Y damping 0.7', () => {
    // Enemy directly above ally
    const ally = makeAlly({ x: 760, y: 800, fsm: 'idle' })
    const e = makeEnemy({ x: 760, y: 700 }) // 100px above
    const { ally: result } = stepAlly(ally, [e], 1000, 42)
    // Y should decrease (moving up)
    expect(result.y).toBeLessThan(800)
  })
})

// ── knockdown ─────────────────────────────────────────────────────────────────

describe('stepAlly — knockdown', () => {
  it('counts down knockdownTimer', () => {
    const ally = makeAlly({ fsm: 'knockdown', knockdownTimer: 2500 })
    const { ally: result } = stepAlly(ally, [], 200, 42)
    expect(result.knockdownTimer).toBeCloseTo(2300, 0)
  })

  it('transitions to recover when knockdownTimer expires', () => {
    const ally = makeAlly({ fsm: 'knockdown', knockdownTimer: 100 })
    const { ally: result } = stepAlly(ally, [], 200, 42)
    expect(result.fsm).toBe('recover')
  })
})

// ── recover ───────────────────────────────────────────────────────────────────

describe('stepAlly — recover', () => {
  it('transitions from recover to idle', () => {
    const ally = makeAlly({ fsm: 'recover' })
    const { ally: result } = stepAlly(ally, [], 16, 42)
    expect(result.fsm).toBe('idle')
  })
})

// ── attack state ──────────────────────────────────────────────────────────────

describe('stepAlly — attack state', () => {
  it('transitions from attack to moveToEnemy when cooldown <= 0', () => {
    const ally = makeAlly({ fsm: 'attack', attackCooldown: 0 })
    const { ally: result } = stepAlly(ally, [], 16, 42)
    expect(result.fsm).toBe('moveToEnemy')
  })

  it('stays in attack while cooldown > 0', () => {
    const ally = makeAlly({ fsm: 'attack', attackCooldown: 500 })
    const { ally: result } = stepAlly(ally, [], 16, 42)
    expect(result.fsm).toBe('attack')
  })
})

// ── attackCooldown ticks down ──────────────────────────────────────────────────

describe('stepAlly — attackCooldown', () => {
  it('ticks down attackCooldown', () => {
    const ally = makeAlly({ fsm: 'attack', attackCooldown: 500 })
    const { ally: result } = stepAlly(ally, [], 100, 42)
    expect(result.attackCooldown).toBe(400)
  })

  it('does not go below 0', () => {
    const ally = makeAlly({ fsm: 'attack', attackCooldown: 50 })
    const { ally: result } = stepAlly(ally, [], 200, 42)
    expect(result.attackCooldown).toBe(0)
  })
})

// ── damage application ────────────────────────────────────────────────────────

describe('stepAlly — applyDamageToEnemy reuse', () => {
  it('ally attack applies exactly 4 damage to enemy', () => {
    const ally = makeAlly({ x: 760, y: 800, attackCooldown: 0 })
    const e = makeEnemy({ id: 0, x: 790, y: 800, hp: 40 })
    const { enemies } = stepAlly(ally, [e], 16, 42)
    expect(enemies[0].hp).toBe(36)
  })

  it('enemy can die from ally damage', () => {
    const ally = makeAlly({ x: 760, y: 800, attackCooldown: 0 })
    const e = makeEnemy({ id: 0, x: 790, y: 800, hp: 4 }) // low hp → dies from 4 dmg
    const { enemies, events } = stepAlly(ally, [e], 16, 42)
    expect(enemies[0].isDead).toBe(true)
    const dieEvent = events.find(ev => ev.type === 'enemyDied')
    expect(dieEvent).toBeDefined()
  })

  it('enemy retargets player after being hit', () => {
    const ally = makeAlly({ x: 760, y: 800, attackCooldown: 0 })
    const e = makeEnemy({ id: 0, x: 790, y: 800, target: 'wand' })
    const { enemies } = stepAlly(ally, [e], 16, 42)
    // applyDamageToEnemy sets target:'player', noHitTimer:0
    expect(enemies[0].target).toBe('player')
  })
})

// ── multiple enemies ──────────────────────────────────────────────────────────

describe('stepAlly — multiple enemies', () => {
  it('attacks the nearest enemy (not a farther one)', () => {
    const ally = makeAlly({ x: 760, y: 800, attackCooldown: 0 })
    const near = makeEnemy({ id: 0, x: 790, y: 800, hp: 40 }) // 30px
    const far  = makeEnemy({ id: 1, x: 900, y: 800, hp: 40 }) // 140px
    const { enemies } = stepAlly(ally, [near, far], 16, 42)
    // Only near enemy should take damage
    expect(enemies[0].hp).toBe(36) // damaged (40 - 4)
    expect(enemies[1].hp).toBe(40) // untouched
  })
})
