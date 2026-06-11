// Adapters: project the network Schema (ArenaState / PlayerNet / EnemyNet) onto the
// shapes the Fatia 1 VIEW classes already understand (PlayerState / EnemyState).
//
// The views (Player, Enemy) were written for the single-player core and consume the
// rich core state objects. In net mode we only receive the minimal synced projection,
// so these adapters fill the gaps with view-only defaults (the missing fields drive
// nothing the view actually reads for rendering).
//
// Pure TS — zero Phaser, fully unit-testable.

import type { PlayerState, EnemyState, AllyState, PlayerFsm, EnemyFsm, AllyFsm, EnemyType } from '../core/types'

/** Minimal duck-typed view of a PlayerNet schema instance (no @colyseus import here). */
export interface PlayerNetLike {
  sessionId: string
  charKey: string
  x: number
  y: number
  hp: number
  maxHp: number
  fsm: string
  facing: number
  connected: boolean
}

/** Minimal duck-typed view of an EnemyNet schema instance. */
export interface EnemyNetLike {
  id: number
  enemyType: string
  isBoss: boolean
  x: number
  y: number
  hp: number
  maxHp: number
  fsm: string
}

/** Minimal duck-typed view of an AllyNet schema instance. */
export interface AllyNetLike {
  charKey: string
  x: number
  y: number
  fsm: string
}

const PLAYER_FSMS: ReadonlySet<string> = new Set([
  'normal', 'knockdown', 'recovering', 'blocking', 'down',
])

const ALLY_FSMS: ReadonlySet<string> = new Set([
  'idle', 'moveToEnemy', 'attack', 'knockdown', 'recover',
])

const ENEMY_FSMS: ReadonlySet<string> = new Set([
  'approach', 'waitBeforeAttack', 'chasePlayer', 'knockdown', 'recover', 'staggered', 'dead',
])

/**
 * Build a PlayerState the Player view can consume from a PlayerNet snapshot.
 * `y` from the wire is the logical ground Y (the server projects human.y).
 */
export function netToPlayerState(p: PlayerNetLike): PlayerState {
  const fsm: PlayerFsm = PLAYER_FSMS.has(p.fsm) ? (p.fsm as PlayerFsm) : 'normal'
  const facing: 1 | -1 = p.facing === -1 ? -1 : 1
  return {
    charKey: p.charKey,
    hp: p.hp,
    maxHp: p.maxHp,
    x: p.x,
    y: p.y,
    groundY: p.y,
    fsm,
    knockdownTimer: 0,
    attackCooldown: 0,
    isBlocking: fsm === 'blocking',
    facing,
    scaleX: 1,
  }
}

/**
 * Build an EnemyState the Enemy view can consume from an EnemyNet snapshot.
 * Fields with no wire equivalent are filled with inert defaults; the view only
 * reads x/y/hp/fsm/target for rendering. `target` is approximated as 'wand' (the
 * default chase target) — the view uses it only to pick a facing reference.
 */
/**
 * Build an AllyState the Ally view can consume from an AllyNet snapshot.
 * The Ally view reads charKey/x/y/fsm for rendering; the timer fields drive nothing
 * the view reads (the sim owns them server-side), so they default to 0.
 */
export function netToAllyState(a: AllyNetLike): AllyState {
  const fsm: AllyFsm = ALLY_FSMS.has(a.fsm) ? (a.fsm as AllyFsm) : 'idle'
  return {
    charKey: a.charKey,
    x: a.x,
    y: a.y,
    fsm,
    attackCooldown: 0,
    knockdownTimer: 0,
  }
}

export function netToEnemyState(e: EnemyNetLike): EnemyState {
  const fsm: EnemyFsm = ENEMY_FSMS.has(e.fsm) ? (e.fsm as EnemyFsm) : 'approach'
  return {
    id: e.id,
    enemyType: e.enemyType as EnemyType,
    isBoss: e.isBoss,
    hp: e.hp,
    maxHp: e.maxHp,
    x: e.x,
    y: e.y,
    isDead: fsm === 'dead',
    fsm,
    baseSpeed: 0,
    currentSpeed: 0,
    target: fsm === 'chasePlayer' ? 'player' : 'wand',
    noHitTimer: 0,
    waitTimer: 0,
    attackCooldown: 0,
    knockdownTimer: 0,
    staggerTimer: 0,
    inPhase2: false,
  }
}
