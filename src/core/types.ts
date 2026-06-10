// Pure TypeScript — zero Phaser.
// Full simulation state inventory for the 3 Contra Todos game engine.
// All types are immutable-friendly (readonly where appropriate).

import type { EnemyType } from './config/waves'

// ── Input ─────────────────────────────────────────────────────────────────────

export interface MoveInput {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  block: boolean
  punch: boolean
  kick: boolean
}

// ── FSM string unions ─────────────────────────────────────────────────────────

export type PlayerFsm = 'normal' | 'knockdown' | 'recovering' | 'blocking'

export type EnemyFsm =
  | 'approach'
  | 'waitBeforeAttack'
  | 'chasePlayer'
  | 'knockdown'
  | 'recover'
  | 'staggered'
  | 'dead'

export type AllyFsm = 'idle' | 'moveToEnemy' | 'attack' | 'knockdown' | 'recover'

// ── Entity data snapshots ─────────────────────────────────────────────────────

export interface PlayerState {
  /** Character key: 'werdum' | 'dida' | 'thor' */
  charKey: string
  hp: number
  maxHp: number
  x: number
  y: number
  /** Ground Y position (logical ring depth, before jump offset). */
  groundY: number
  fsm: PlayerFsm
  knockdownTimer: number
  /** Milliseconds before the next attack is allowed. */
  attackCooldown: number
  isBlocking: boolean
  /** Horizontal facing direction: 1=right, -1=left. Used to compute hitOriginX. */
  facing: 1 | -1
  /** Phaser scaleX at the time of the attack snapshot — used with reach to compute hitOriginX. */
  scaleX: number
}

export interface EnemyState {
  id: number
  enemyType: EnemyType
  isBoss: boolean
  hp: number
  maxHp: number
  x: number
  y: number
  isDead: boolean
  fsm: EnemyFsm
  baseSpeed: number
  currentSpeed: number
  /** 'wand' means targeting the protected character; 'player' means chasing the player */
  target: 'wand' | 'player'
  noHitTimer: number
  waitTimer: number
  attackCooldown: number
  knockdownTimer: number
  staggerTimer: number
  /** Whether the boss has entered phase 2 (triggered at 50% HP). */
  inPhase2: boolean
}

export interface AllyState {
  /** Character key: 'werdum' | 'dida' | 'thor' */
  charKey: string
  x: number
  y: number
  fsm: AllyFsm
  attackCooldown: number
  knockdownTimer: number
}

/** ProtectedChar (the "wand") — fixed position, only hp matters at runtime. */
export interface WandState {
  hp: number
  maxHp: number
  x: number
  y: number
}

// ── Wave & score ──────────────────────────────────────────────────────────────

export interface WaveState {
  /** 0 = not started; 1–12 = current wave number. */
  currentWave: number
  /** Enemy types still queued to spawn. */
  spawnQueue: EnemyType[]
  spawnTimer: number
  /** Current ms between spawns. */
  spawnInterval: number
  waveActive: boolean
  /** Timer counting down after all enemies die before next wave starts. */
  waveEndTimer: number
  /** True if the player took any damage during this wave (used for flawless detection). */
  waveDamageTaken: boolean
}

export interface ScoreState {
  score: number
  comboCount: number
  comboTimer: number
  enemiesDefeated: number
  maxComboReached: number
}

// ── Top-level game state ──────────────────────────────────────────────────────

export type GameStatus = 'playing' | 'gameover' | 'victory'

export interface GameState {
  status: GameStatus
  player: PlayerState
  enemies: EnemyState[]
  allies: AllyState[]
  wand: WandState
  wave: WaveState
  score: ScoreState
  /** Elapsed game time in milliseconds. */
  gameTimerMs: number
  /** Serialised RNG state — sufficient to resume the deterministic sequence. */
  rngState: number
  /** True if any cheat code was used during this session. */
  cheatUsed: boolean
}

// ── Simulation event union ────────────────────────────────────────────────────

export type SimEvent =
  | { type: 'attackSwung'; kind: 'punch' | 'kick'; hit: boolean }
  | { type: 'hit'; targetId: number; amount: number; x: number; y: number }
  | { type: 'enemyDied'; id: number; enemyType: EnemyType; x: number; y: number }
  | { type: 'enemySpawned'; id: number; enemyType: EnemyType; x: number; y: number }
  | { type: 'playerDamaged'; amount: number }
  | { type: 'wandDamaged'; amount: number }
  | { type: 'playerKnockdown' }
  | { type: 'enemyKnockdown'; id: number }
  | { type: 'enemyStaggered'; id: number }
  | { type: 'waveStarted'; wave: number }
  | { type: 'waveCleared'; wave: number; flawless: boolean }
  | { type: 'bossPhase2'; id: number }
  | { type: 'comboMilestone'; count: number }
  | { type: 'gameOver' }
  | { type: 'victory' }

// Re-export EnemyType so consumers can import everything from core/types
export type { EnemyType }
