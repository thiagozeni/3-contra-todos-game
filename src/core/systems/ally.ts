// Pure TS — zero Phaser. Ally AI logic.
// Ported from Ally.update and Ally.updateSeekEnemy.

import { RING } from '../config/ring'
import { ALLY_STATS } from '../config/stats'
import { applyDamageToEnemy } from './combat'
import type { AllyState, EnemyState, SimEvent } from '../types'

// ── Internal helpers ──────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

// ── stepAlly result ───────────────────────────────────────────────────────────

export interface AllyStepResult {
  ally: AllyState
  enemies: EnemyState[]
  events: SimEvent[]
  rngState: number
}

// ── stepAlly ──────────────────────────────────────────────────────────────────

/**
 * Pure ally AI step function.
 *
 * Mirrors Ally.update logic exactly:
 * - Ticks down attackCooldown
 * - idle/moveToEnemy: call seek behavior
 * - attack: wait for cooldown to expire → moveToEnemy
 * - knockdown: count down timer → recover
 * - recover: → idle
 *
 * Returns new AllyState + updated EnemyState array (immutable).
 */
export function stepAlly(
  ally: AllyState,
  enemies: EnemyState[],
  deltaMs: number,
  rngState: number,
): AllyStepResult {
  const dt = deltaMs / 1000

  // Tick down cooldown
  let a: AllyState = {
    ...ally,
    attackCooldown: Math.max(0, ally.attackCooldown - deltaMs),
  }

  let updatedEnemies = enemies
  const events: SimEvent[] = []

  switch (a.fsm) {
    case 'idle':
    case 'moveToEnemy': {
      const result = seekEnemy(a, updatedEnemies, dt, events)
      a = result.ally
      updatedEnemies = result.enemies
      break
    }

    case 'attack':
      if (a.attackCooldown <= 0) {
        a = { ...a, fsm: 'moveToEnemy' }
      }
      break

    case 'knockdown': {
      const newTimer = a.knockdownTimer - deltaMs
      if (newTimer <= 0) {
        a = { ...a, knockdownTimer: 0, fsm: 'recover' }
      } else {
        a = { ...a, knockdownTimer: newTimer }
      }
      break
    }

    case 'recover':
      a = { ...a, fsm: 'idle' }
      break
  }

  return { ally: a, enemies: updatedEnemies, events, rngState }
}

// ── seekEnemy ─────────────────────────────────────────────────────────────────

function seekEnemy(
  ally: AllyState,
  enemies: EnemyState[],
  dt: number,
  events: SimEvent[],
): { ally: AllyState; enemies: EnemyState[] } {
  const stats = ALLY_STATS[ally.charKey] ?? ALLY_STATS['werdum']
  const speed = stats.speed

  const liveEnemies = enemies.filter(e => !e.isDead)

  if (liveEnemies.length === 0) {
    return { ally: { ...ally, fsm: 'idle' }, enemies }
  }

  // Find nearest enemy
  let nearest: EnemyState | null = null
  let nearestDist = Infinity
  for (const e of liveEnemies) {
    const dx = e.x - ally.x
    const dy = e.y - ally.y
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < nearestDist) { nearestDist = d; nearest = e }
  }

  if (!nearest) return { ally: { ...ally, fsm: 'idle' }, enemies }

  const dx = nearest.x - ally.x
  const dy = nearest.y - ally.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  // In attack range
  if (dist < 75 && ally.attackCooldown <= 0) {
    // Apply damage via shared combat function
    const { enemy: damagedEnemy, events: dmgEvents } = applyDamageToEnemy(nearest, 6)

    // Emit hit event
    events.push({ type: 'hit', targetId: nearest.id, amount: 6, x: nearest.x, y: nearest.y, source: 'ally' })
    events.push(...dmgEvents)

    // Update enemies array
    const updatedEnemies = enemies.map(e => e.id === nearest!.id ? damagedEnemy : { ...e })

    return {
      ally: { ...ally, fsm: 'attack', attackCooldown: 900 },
      enemies: updatedEnemies,
    }
  }

  // Move toward nearest
  if (dist === 0) {
    return { ally: { ...ally, fsm: 'moveToEnemy' }, enemies: enemies.map(e => ({ ...e })) }
  }

  const nx = dx / dist
  const ny = dy / dist
  const newX = clamp(ally.x + nx * speed * dt, RING.left, RING.right)
  const newY = clamp(ally.y + ny * speed * 0.7 * dt, RING.top, RING.bottom)

  return {
    ally: { ...ally, x: newX, y: newY, fsm: 'moveToEnemy' },
    enemies: enemies.map(e => ({ ...e })),
  }
}
