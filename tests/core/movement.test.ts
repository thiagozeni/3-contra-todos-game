// Pure TS — zero Phaser. Tests for src/core/systems/movement.ts

import { describe, it, expect } from 'vitest'
import { movePlayer, applySeparationEnemiesFromEnemies, applySeparationEnemiesFromChars, resolveWandCollision } from '../../src/core/systems/movement'
import type { PlayerState, EnemyState, WandState } from '../../src/core/types'
import { RING } from '../../src/core/config/ring'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
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
    x: 500,
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

const INPUT_IDLE = { up: false, down: false, left: false, right: false, block: false, punch: false, kick: false }
const INPUT_RIGHT = { ...INPUT_IDLE, right: true }
const INPUT_LEFT  = { ...INPUT_IDLE, left: true }
const INPUT_UP    = { ...INPUT_IDLE, up: true }
const INPUT_DOWN  = { ...INPUT_IDLE, down: true }
const INPUT_BLOCK = { ...INPUT_IDLE, block: true }

// ── movePlayer ────────────────────────────────────────────────────────────────

describe('movePlayer', () => {
  describe('basic movement', () => {
    it('returns a new object (immutable)', () => {
      const p = makePlayer()
      const result = movePlayer(p, INPUT_RIGHT, 16)
      expect(result).not.toBe(p)
    })

    it('moves right when right=true', () => {
      const p = makePlayer({ x: 960, groundY: 840 })
      const result = movePlayer(p, INPUT_RIGHT, 1000) // 1s
      // speed=180, dt=1s → dx=180
      expect(result.x).toBeGreaterThan(960)
    })

    it('moves left when left=true', () => {
      const p = makePlayer({ x: 960, groundY: 840 })
      const result = movePlayer(p, INPUT_LEFT, 1000)
      expect(result.x).toBeLessThan(960)
    })

    it('moves up when up=true (Y damping 0.6)', () => {
      const p = makePlayer({ x: 960, groundY: 840 })
      const result = movePlayer(p, INPUT_UP, 1000)
      // speed=180, damping=0.6 → dy=-108 per second
      expect(result.groundY).toBeLessThan(840)
    })

    it('moves down when down=true (Y damping 0.6)', () => {
      const p = makePlayer({ x: 960, groundY: 840 })
      const result = movePlayer(p, INPUT_DOWN, 1000)
      expect(result.groundY).toBeGreaterThan(840)
    })

    it('horizontal speed is correct (speed*dt)', () => {
      const p = makePlayer({ x: 960, groundY: 840 })
      const result = movePlayer(p, INPUT_RIGHT, 1000)
      // werdum speed=180, dt=1s
      const expectedX = 960 + 180 * 1
      // ring clamp: rightAt(840)
      const expected = Math.min(expectedX, RING.rightAt(840))
      expect(result.x).toBeCloseTo(expected, 1)
    })

    it('vertical speed is speed*0.6*dt', () => {
      const p = makePlayer({ x: 960, groundY: 840 })
      const result = movePlayer(p, INPUT_DOWN, 1000)
      const expectedY = Math.min(840 + 180 * 0.6 * 1, RING.bottom)
      expect(result.groundY).toBeCloseTo(expectedY, 1)
    })
  })

  describe('ring clamping', () => {
    it('clamps X to ring rightAt(groundY)', () => {
      const p = makePlayer({ x: 1500, groundY: 840 })
      const result = movePlayer(p, INPUT_RIGHT, 1000)
      expect(result.x).toBeLessThanOrEqual(RING.rightAt(840))
    })

    it('clamps X to ring leftAt(groundY)', () => {
      const p = makePlayer({ x: 450, groundY: 840 })
      const result = movePlayer(p, INPUT_LEFT, 1000)
      expect(result.x).toBeGreaterThanOrEqual(RING.leftAt(840))
    })

    it('clamps groundY to RING.top', () => {
      const p = makePlayer({ x: 960, groundY: 660 })
      const result = movePlayer(p, INPUT_UP, 1000)
      expect(result.groundY).toBeGreaterThanOrEqual(RING.top)
    })

    it('clamps groundY to RING.bottom', () => {
      const p = makePlayer({ x: 960, groundY: 990 })
      const result = movePlayer(p, INPUT_DOWN, 1000)
      expect(result.groundY).toBeLessThanOrEqual(RING.bottom)
    })
  })

  describe('facing', () => {
    it('facing becomes 1 (right) when moving right', () => {
      const p = makePlayer({ facing: -1 })
      const result = movePlayer(p, INPUT_RIGHT, 16)
      expect(result.facing).toBe(1)
    })

    it('facing becomes -1 (left) when moving left', () => {
      const p = makePlayer({ facing: 1 })
      const result = movePlayer(p, INPUT_LEFT, 16)
      expect(result.facing).toBe(-1)
    })

    it('facing stays unchanged when not moving horizontally', () => {
      const p = makePlayer({ facing: 1 })
      const result = movePlayer(p, INPUT_UP, 16)
      expect(result.facing).toBe(1)
    })
  })

  describe('state restrictions', () => {
    it('blocking stops movement — state transitions to blocking', () => {
      const p = makePlayer({ x: 960, groundY: 840 })
      const result = movePlayer(p, INPUT_BLOCK, 16)
      expect(result.fsm).toBe('blocking')
      expect(result.isBlocking).toBe(true)
    })

    it('blocking stops X movement', () => {
      const p = makePlayer({ x: 960, groundY: 840 })
      const result = movePlayer(p, { ...INPUT_BLOCK, right: true }, 1000)
      expect(result.x).toBe(960)
    })

    it('blocking stops Y movement', () => {
      const p = makePlayer({ x: 960, groundY: 840 })
      const result = movePlayer(p, { ...INPUT_BLOCK, up: true }, 1000)
      expect(result.groundY).toBe(840)
    })

    it('knockdown state prevents movement', () => {
      const p = makePlayer({ x: 960, groundY: 840, fsm: 'knockdown' })
      const result = movePlayer(p, INPUT_RIGHT, 1000)
      expect(result.x).toBe(960)
      expect(result.groundY).toBe(840)
    })

    it('recovering state prevents movement', () => {
      const p = makePlayer({ x: 960, groundY: 840, fsm: 'recovering' })
      const result = movePlayer(p, INPUT_RIGHT, 1000)
      expect(result.x).toBe(960)
      expect(result.groundY).toBe(840)
    })

    it('releasing block (was blocking, no block input) transitions to normal', () => {
      const p = makePlayer({ fsm: 'blocking', isBlocking: true })
      const result = movePlayer(p, INPUT_IDLE, 16)
      expect(result.fsm).toBe('normal')
      expect(result.isBlocking).toBe(false)
    })

    it('idle input while normal: no movement', () => {
      const p = makePlayer({ x: 960, groundY: 840 })
      const result = movePlayer(p, INPUT_IDLE, 16)
      expect(result.x).toBe(960)
      expect(result.groundY).toBe(840)
    })
  })
})

// ── applySeparationEnemiesFromEnemies ────────────────────────────────────────

describe('applySeparationEnemiesFromEnemies', () => {
  it('returns an array of the same length', () => {
    const e1 = makeEnemy({ id: 0, x: 500, y: 800 })
    const e2 = makeEnemy({ id: 1, x: 520, y: 800 })
    const result = applySeparationEnemiesFromEnemies([e1, e2])
    expect(result).toHaveLength(2)
  })

  it('returns new objects (immutable)', () => {
    const e1 = makeEnemy({ id: 0, x: 500, y: 800 })
    const e2 = makeEnemy({ id: 1, x: 520, y: 800 })
    const result = applySeparationEnemiesFromEnemies([e1, e2])
    expect(result[0]).not.toBe(e1)
    expect(result[1]).not.toBe(e2)
  })

  it('pushes enemies apart when closer than minDist=48', () => {
    const e1 = makeEnemy({ id: 0, x: 500, y: 800 })
    const e2 = makeEnemy({ id: 1, x: 510, y: 800 }) // only 10px apart
    const result = applySeparationEnemiesFromEnemies([e1, e2])
    const distAfter = Math.abs(result[0].x - result[1].x)
    const distBefore = 10
    expect(distAfter).toBeGreaterThan(distBefore)
  })

  it('does not move enemies when already far enough apart', () => {
    const e1 = makeEnemy({ id: 0, x: 500, y: 800 })
    const e2 = makeEnemy({ id: 1, x: 700, y: 800 }) // 200px apart
    const result = applySeparationEnemiesFromEnemies([e1, e2])
    expect(result[0].x).toBe(500)
    expect(result[1].x).toBe(700)
  })

  it('skips dead enemies', () => {
    const e1 = makeEnemy({ id: 0, x: 500, y: 800 })
    const e2 = makeEnemy({ id: 1, x: 510, y: 800, isDead: true })
    const result = applySeparationEnemiesFromEnemies([e1, e2])
    // e1 should not be pushed since e2 is dead
    expect(result[0].x).toBe(500)
  })

  it('clamps separated positions to ring boundaries', () => {
    // Enemy near left edge of ring at y=800 (leftAt(800)~567) — use valid ring positions
    const e1 = makeEnemy({ id: 0, x: 600, y: 800 })
    const e2 = makeEnemy({ id: 1, x: 610, y: 800 }) // 10px apart, minDist=48 → push
    const result = applySeparationEnemiesFromEnemies([e1, e2])
    for (const e of result) {
      expect(e.x).toBeGreaterThanOrEqual(RING.leftAt(e.y))
      expect(e.x).toBeLessThanOrEqual(RING.rightAt(e.y))
    }
  })
})

// ── applySeparationEnemiesFromChars ──────────────────────────────────────────

describe('applySeparationEnemiesFromChars', () => {
  it('returns array of same length', () => {
    const e = makeEnemy({ id: 0, x: 960, y: 840 })
    const chars = [{ x: 960, y: 840 }]
    const result = applySeparationEnemiesFromChars([e], chars)
    expect(result).toHaveLength(1)
  })

  it('returns new objects (immutable)', () => {
    const e = makeEnemy({ id: 0, x: 960, y: 840 })
    const chars = [{ x: 960, y: 840 }]
    const result = applySeparationEnemiesFromChars([e], chars)
    expect(result[0]).not.toBe(e)
  })

  it('pushes enemy away from char when closer than minDist=52', () => {
    // Enemy slightly offset from char so dist>0 and force is applied
    const e = makeEnemy({ id: 0, x: 962, y: 840 }) // 2px right of char
    const chars = [{ x: 960, y: 840 }]
    const result = applySeparationEnemiesFromChars([e], chars)
    // Enemy should have moved further right (pushed away from char)
    expect(result[0].x).toBeGreaterThan(962)
  })

  it('does not move enemy when far from all chars', () => {
    const e = makeEnemy({ id: 0, x: 600, y: 800 })
    const chars = [{ x: 960, y: 840 }] // 360+ px away
    const result = applySeparationEnemiesFromChars([e], chars)
    expect(result[0].x).toBe(600)
    expect(result[0].y).toBe(800)
  })

  it('skips dead enemies', () => {
    const e = makeEnemy({ id: 0, x: 960, y: 840, isDead: true })
    const chars = [{ x: 960, y: 840 }]
    const result = applySeparationEnemiesFromChars([e], chars)
    // Dead enemy should stay in place
    expect(result[0].x).toBe(960)
    expect(result[0].y).toBe(840)
  })

  it('min separation distance is 52px from chars', () => {
    const e = makeEnemy({ id: 0, x: 960, y: 840 })
    const chars = [{ x: 960, y: 830 }] // only 10px away
    const result = applySeparationEnemiesFromChars([e], chars)
    const distAfter = Math.sqrt(
      (result[0].x - 960) ** 2 + (result[0].y - 830) ** 2
    )
    // After separation, distance should be greater than before
    expect(distAfter).toBeGreaterThan(10)
  })
})

// ── resolveWandCollision ────────────────────────────────────────────────────────

describe('resolveWandCollision', () => {
  function makeWand(overrides: Partial<WandState> = {}): WandState {
    return { hp: 200, maxHp: 200, x: 1150, y: 710, ...overrides }
  }

  it('returns null when the point is outside the wand ellipse', () => {
    const wand = makeWand()
    // Far left of the wand center, well outside the footprint
    expect(resolveWandCollision(700, 800, wand)).toBeNull()
  })

  it('returns null exactly at the wand center is FALSE — center is inside', () => {
    const wand = makeWand()
    const r = resolveWandCollision(wand.x, wand.y, wand)
    expect(r).not.toBeNull()
  })

  it('pushes a point inside the ellipse out to (approximately) its border', () => {
    const wand = makeWand()
    // A point near the wand center is inside; it must be pushed outward.
    const inside = { x: wand.x + 5, y: wand.y + 2 }
    const r = resolveWandCollision(inside.x, inside.y, wand)
    expect(r).not.toBeNull()
    // Corrected point must be further from center than the input.
    const distIn = Math.hypot(inside.x - wand.x, inside.y - wand.y)
    const distOut = Math.hypot(r!.x - wand.x, r!.y - wand.y)
    expect(distOut).toBeGreaterThan(distIn)
  })

  it('keeps corrected positions within ring bounds', () => {
    const wand = makeWand()
    const r = resolveWandCollision(wand.x, wand.y, wand)
    expect(r).not.toBeNull()
    expect(r!.x).toBeGreaterThanOrEqual(RING.left)
    expect(r!.x).toBeLessThanOrEqual(RING.right)
    expect(r!.y).toBeGreaterThanOrEqual(RING.top)
    expect(r!.y).toBeLessThanOrEqual(RING.bottom)
  })

  it('is deterministic (pure) for the same inputs', () => {
    const wand = makeWand()
    const a = resolveWandCollision(wand.x + 3, wand.y - 1, wand)
    const b = resolveWandCollision(wand.x + 3, wand.y - 1, wand)
    expect(a).toEqual(b)
  })
})
