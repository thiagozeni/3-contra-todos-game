// Pure TS — zero Phaser. Enemy AI FSM logic.
// Ported from Enemy.update, updateApproach, updateWait, updateChasePlayer,
// updateKnockdown, updateStagger, stagger.

import { RING } from '../config/ring'
import type { EnemyState, SimEvent } from '../types'

// ── Internal helpers ──────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

// ── Step context ──────────────────────────────────────────────────────────────

export interface EnemyAiCtx {
  playerX: number
  playerGroundY: number
  wandX: number
  wandY: number
  rngState: number
}

export interface EnemyAiResult {
  enemy: EnemyState
  intents: {
    attackWand?: boolean
    attackPlayer?: boolean
  }
  events: SimEvent[]
  rngState: number
}

// ── stepEnemy ─────────────────────────────────────────────────────────────────

/**
 * Pure enemy AI step function.
 *
 * Advances one frame of enemy AI and returns new state + intents.
 * Intents (attackWand / attackPlayer) are signals to the Phaser bridge to
 * emit 'enemyAttackWand' / 'enemyAttackPlayer' events and apply damage.
 *
 * Returns a new EnemyState (input is never mutated).
 */
export function stepEnemy(
  enemy: EnemyState,
  ctx: EnemyAiCtx,
  deltaMs: number,
): EnemyAiResult {
  if (enemy.isDead) {
    return { enemy: { ...enemy }, intents: {}, events: [], rngState: ctx.rngState }
  }

  const dt = deltaMs / 1000
  const intents: { attackWand?: boolean; attackPlayer?: boolean } = {}
  const events: SimEvent[] = []

  // Tick down attackCooldown
  let e: EnemyState = {
    ...enemy,
    attackCooldown: Math.max(0, enemy.attackCooldown - deltaMs),
    noHitTimer: enemy.noHitTimer + deltaMs,
  }

  // Retarget to wand if noHitTimer exceeded 1500ms
  if (e.noHitTimer > 1500 && e.target !== 'wand') {
    e = { ...e, target: 'wand' }
  }

  // FSM dispatch
  switch (e.fsm) {
    case 'approach':
      e = stepApproach(e, ctx, dt)
      break

    case 'waitBeforeAttack': {
      const result = stepWait(e, ctx, deltaMs)
      e = result.enemy
      if (result.attackWand) intents.attackWand = true
      break
    }

    case 'chasePlayer': {
      const result = stepChasePlayer(e, ctx, dt)
      e = result.enemy
      if (result.attackPlayer) intents.attackPlayer = true
      break
    }

    case 'knockdown':
      e = stepKnockdown(e, deltaMs)
      break

    case 'staggered':
      e = stepStagger(e, deltaMs)
      break

    case 'recover':
      // Immediately transition to approach
      e = { ...e, fsm: 'approach' }
      break
  }

  return { enemy: e, intents, events, rngState: ctx.rngState }
}

// ── FSM sub-functions ─────────────────────────────────────────────────────────

function stepApproach(e: EnemyState, ctx: EnemyAiCtx, dt: number): EnemyState {
  const targetX = e.target === 'wand' ? ctx.wandX : ctx.playerX
  const targetY = e.target === 'wand' ? ctx.wandY : ctx.playerGroundY
  const arrivalDist = e.target === 'wand' ? 60 : 120
  // Faixa vertical de ataque. P/ o wand é mais larga (48) porque a elipse de colisão
  // dele cresceu com os bounds maiores da arena v2 (ver RING / reference-ring-wand-coupling):
  // os atacantes assentam na borda da elipse (~±40 em y) e precisam caber na faixa.
  const arrivalDy = e.target === 'wand' ? 48 : 30

  const dx = targetX - e.x
  const dy = targetY - e.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist < arrivalDist && Math.abs(dy) < arrivalDy) {
    if (e.target === 'wand') {
      return { ...e, fsm: 'waitBeforeAttack', waitTimer: 1000 }
    } else {
      return { ...e, fsm: 'chasePlayer' }
    }
  }

  if (dist === 0) return e

  const nx = dx / dist
  const ny = dy / dist
  const newY = clamp(e.y + ny * e.currentSpeed * 0.7 * dt, RING.top, RING.bottom)
  const newX = clamp(e.x + nx * e.currentSpeed * dt, RING.leftAt(newY), RING.rightAt(newY))

  return { ...e, x: newX, y: newY }
}

function stepWait(
  e: EnemyState,
  _ctx: EnemyAiCtx,
  deltaMs: number,
): { enemy: EnemyState; attackWand: boolean } {
  const newTimer = e.waitTimer - deltaMs
  if (newTimer <= 0) {
    const cooldown = e.isBoss ? 1000 : 1500
    return {
      enemy: { ...e, waitTimer: 0, fsm: 'approach', attackCooldown: cooldown },
      attackWand: true,
    }
  }
  return { enemy: { ...e, waitTimer: newTimer }, attackWand: false }
}

function stepChasePlayer(
  e: EnemyState,
  ctx: EnemyAiCtx,
  dt: number,
): { enemy: EnemyState; attackPlayer: boolean } {
  // If target switched to wand, return to approach
  if (e.target === 'wand') {
    return { enemy: { ...e, fsm: 'approach' }, attackPlayer: false }
  }

  const dx = ctx.playerX - e.x
  const dy = ctx.playerGroundY - e.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  // In range + cooldown expired → attack
  if (dist < 120 && Math.abs(dy) < 30 && e.attackCooldown <= 0) {
    const cooldown = e.isBoss ? 900 : 1200
    return {
      enemy: { ...e, attackCooldown: cooldown },
      attackPlayer: true,
    }
  }

  // Too far → return to approach
  if (dist >= 120) {
    return { enemy: { ...e, fsm: 'approach' }, attackPlayer: false }
  }

  // Move toward player
  if (dist === 0) return { enemy: e, attackPlayer: false }

  const nx = dx / dist
  const ny = dy / dist
  const newY = clamp(e.y + ny * e.currentSpeed * 0.7 * dt, RING.top, RING.bottom)
  const newX = clamp(e.x + nx * e.currentSpeed * dt, RING.leftAt(newY), RING.rightAt(newY))

  return { enemy: { ...e, x: newX, y: newY }, attackPlayer: false }
}

function stepKnockdown(e: EnemyState, deltaMs: number): EnemyState {
  const newTimer = e.knockdownTimer - deltaMs
  if (newTimer <= 0) {
    return { ...e, knockdownTimer: 0, fsm: 'recover' }
  }
  return { ...e, knockdownTimer: newTimer }
}

function stepStagger(e: EnemyState, deltaMs: number): EnemyState {
  const newTimer = e.staggerTimer - deltaMs
  if (newTimer <= 0) {
    return { ...e, staggerTimer: 0, fsm: 'approach' }
  }
  return { ...e, staggerTimer: newTimer }
}

// ── staggerEnemy ──────────────────────────────────────────────────────────────

export interface StaggerCtx {
  playerX: number
  playerGroundY: number
  wandX: number
  wandY: number
  rngState: number
}

export interface StaggerResult {
  enemy: EnemyState
  rngState: number
}

/**
 * Pure stagger function (block reaction).
 *
 * Mirrors Enemy.stagger exactly:
 * - No-op if dead, knockdown, or already staggered
 * - Boss: staggerTimer=400, attackCooldown=1200, pushDist=40
 * - Normal: staggerTimer=650, attackCooldown=1800, pushDist=70
 * - Knockback: push away from player, clamped to ring
 *
 * Note: in the original code, stagger uses fixed values (not RNG). The rngState
 * is threaded through for API consistency but is not consumed here.
 */
export function staggerEnemy(enemy: EnemyState, ctx: StaggerCtx): StaggerResult {
  // No-op guards
  if (enemy.isDead || enemy.fsm === 'knockdown' || enemy.fsm === 'staggered') {
    return { enemy: { ...enemy }, rngState: ctx.rngState }
  }

  const staggerTimer = enemy.isBoss ? 400 : 650
  const attackCooldown = enemy.isBoss ? 1200 : 1800
  const pushDist = enemy.isBoss ? 40 : 70

  // Knockback: push away from player
  const dx = enemy.x - ctx.playerX
  const dir = dx >= 0 ? 1 : -1
  const newX = clamp(enemy.x + dir * pushDist, RING.leftAt(enemy.y), RING.rightAt(enemy.y))

  return {
    enemy: {
      ...enemy,
      fsm: 'staggered',
      staggerTimer,
      attackCooldown,
      x: newX,
    },
    rngState: ctx.rngState,
  }
}
