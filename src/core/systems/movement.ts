// Pure TS — zero Phaser. Player movement and separation logic.
// Ported from Player.move, GameScene.separateEnemiesFromChars,
// Enemy.applySeparationForce, and GameScene.enforceWandCollision.

import { RING } from '../config/ring'
import { PLAYER_STATS } from '../config/stats'
import type { PlayerState, MoveInput, EnemyState, WandState } from '../types'

// ── Internal helpers ──────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

// ── Wand collision (solid body) ───────────────────────────────────────────────
// Faithful pure port of GameScene.enforceWandCollision. The wand ("Wanderlei")
// is a solid obstacle in the ring: characters that walk inside its elliptical
// footprint are pushed back out to the ellipse border. V1 derived the ellipse
// from the Phaser ProtectedChar's display scale; here we recompute that scale
// deterministically from the wand's logical Y (same perspective formula as
// ProtectedChar's constructor: dispH = Linear(204,420,t) * 0.877, scale = dispH/768).

// Content dimensions of the wand-ko art (928×250 inside a 1280×768 canvas).
const WAND_CONTENT_W = 928
const WAND_CONTENT_H = 250
const WAND_FRAME_H = 768
// Center-of-content offset relative to the image center (640,384).
const WAND_OFFSET_X = 635 - 640
const WAND_OFFSET_Y = 391 - 384

/** Wand display scale from logical Y — mirrors ProtectedChar constructor. */
function wandScale(wandY: number): number {
  const t = clamp((wandY - RING.top) / (RING.bottom - RING.top), 0, 1)
  const dispH = RING.top === RING.bottom ? 204 : (204 + (420 - 204) * t)
  // 0.877 * 1.06 * 1.04 * 1.03: wand +6% (r3) + 4% (r4) + 3% (r5) — em sincronia com ProtectedChar.baseScaleY.
  return (dispH / WAND_FRAME_H) * 0.877 * 1.06 * 1.04 * 1.03
}

/**
 * If (cx,cy) is inside the wand's elliptical footprint, return the corrected
 * position projected onto the ellipse border (clamped to ring). Otherwise null.
 * Pure port of GameScene.enforceWandCollision.resolveEllipse.
 */
export function resolveWandCollision(
  cx: number,
  cy: number,
  wand: WandState,
): { x: number; y: number } | null {
  const scale = wandScale(wand.y)
  const RX = (WAND_CONTENT_W / 2) * scale
  const RY = (WAND_CONTENT_H / 2) * scale
  const wx = wand.x + WAND_OFFSET_X * scale
  const wy = wand.y + WAND_OFFSET_Y * scale

  const dx = cx - wx
  const dy = cy - wy
  if ((dx / RX) ** 2 + (dy / RY) ** 2 >= 1) return null

  const angle = Math.atan2(dy / RY, dx / RX)
  return {
    x: clamp(wx + RX * Math.cos(angle), RING.left, RING.right),
    y: clamp(wy + RY * Math.sin(angle), RING.top, RING.bottom),
  }
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
