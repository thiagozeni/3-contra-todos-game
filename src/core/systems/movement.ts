// Pure TS — zero Phaser. Player movement and separation logic.
// Ported from Player.move, GameScene.separateEnemiesFromChars,
// and Enemy.applySeparationForce.

import { RING } from '../config/ring'
import { PLAYER_STATS } from '../config/stats'
import type { PlayerState, MoveInput, EnemyState } from '../types'

// ── Internal helpers ──────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

// ── movePlayer ────────────────────────────────────────────────────────────────

/**
 * Pure player movement function.
 *
 * Mirrors Player.move logic exactly:
 * - Blocking: sets fsm='blocking', isBlocking=true, no movement
 * - Release block: transitions to normal
 * - knockdown/recovering: no movement
 * - Normal: dx = speed*dt, dy = speed*0.6*dt, clamped to ring
 * - Facing updated from horizontal direction
 *
 * Returns a new PlayerState (input is never mutated).
 */
export function movePlayer(player: PlayerState, input: MoveInput, deltaMs: number): PlayerState {
  const dt = deltaMs / 1000
  const stats = PLAYER_STATS[player.charKey] ?? PLAYER_STATS['werdum']
  const speed = stats.speed

  const wasBlocking = player.fsm === 'blocking'
  const wantBlock = !!(input.block && (player.fsm === 'normal' || player.fsm === 'blocking'))

  // Blocking state
  if (wantBlock) {
    return {
      ...player,
      fsm: 'blocking',
      isBlocking: true,
    }
  }

  // Releasing block
  let currentState = player
  if (wasBlocking) {
    currentState = {
      ...player,
      fsm: 'normal',
      isBlocking: false,
    }
  }

  // Knockdown / recovering: no movement
  if (currentState.fsm === 'knockdown' || currentState.fsm === 'recovering') {
    return currentState
  }

  // Normal movement
  let dx = 0
  let dy = 0

  if (currentState.fsm === 'normal') {
    if (input.left)  dx -= speed
    if (input.right) dx += speed
    if (input.up)    dy -= speed * 0.6
    if (input.down)  dy += speed * 0.6
  }

  // Facing update
  let facing: 1 | -1 = currentState.facing
  if (dx < 0) facing = -1
  if (dx > 0) facing = 1

  const newGroundY = clamp(currentState.groundY + dy * dt, RING.top, RING.bottom)
  const newX = clamp(currentState.x + dx * dt, RING.leftAt(newGroundY), RING.rightAt(newGroundY))

  return {
    ...currentState,
    x: newX,
    y: newGroundY,
    groundY: newGroundY,
    facing,
  }
}

// ── Separation: enemies from each other ──────────────────────────────────────

/**
 * Applies enemy-vs-enemy separation forces.
 * Mirrors Enemy.applySeparationForce logic.
 * Minimum distance: 48px.
 * Returns a new array of updated EnemyState (inputs not mutated).
 */
export function applySeparationEnemiesFromEnemies(enemies: EnemyState[]): EnemyState[] {
  const minDist = 48

  // Start with a copy
  const result: EnemyState[] = enemies.map(e => ({ ...e }))

  for (let i = 0; i < result.length; i++) {
    if (result[i].isDead) continue
    for (let j = 0; j < result.length; j++) {
      if (i === j || result[j].isDead) continue
      const dx = result[i].x - result[j].x
      const dy = result[i].y - result[j].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < minDist && dist > 0) {
        const force = (minDist - dist) / minDist * 1.5
        const newX = clamp(result[i].x + (dx / dist) * force, RING.leftAt(result[i].y), RING.rightAt(result[i].y))
        const newY = clamp(result[i].y + (dy / dist) * force * 0.6, RING.top, RING.bottom)
        result[i] = { ...result[i], x: newX, y: newY }
      }
    }
  }

  return result
}

// ── Separation: enemies from player + allies ──────────────────────────────────

/**
 * Applies separation forces pushing enemies away from player and allies.
 * Mirrors GameScene.separateEnemiesFromChars logic.
 * Minimum distance: 52px.
 * Returns a new array of updated EnemyState (inputs not mutated).
 */
export function applySeparationEnemiesFromChars(
  enemies: EnemyState[],
  chars: Array<{ x: number; y: number }>,
): EnemyState[] {
  const minDist = 52

  return enemies.map(enemy => {
    if (enemy.isDead) return { ...enemy }

    let ex = enemy.x
    let ey = enemy.y

    for (const char of chars) {
      const dx = ex - char.x
      const dy = ey - char.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < minDist && dist > 0) {
        const force = (minDist - dist) / minDist * 1.5
        ey = clamp(ey + (dy / dist) * force * 0.6, RING.top, RING.bottom)
        ex = clamp(ex + (dx / dist) * force, RING.leftAt(ey), RING.rightAt(ey))
      }
    }

    return { ...enemy, x: ex, y: ey }
  })
}
