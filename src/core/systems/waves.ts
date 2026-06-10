// Pure TS — zero Phaser. Wave progression / spawning core system.
// Ported from GameScene.startNextWave, spawnNextEnemy, and the wave-end logic
// in GameScene.update(). All V1 semantics preserved; seeded RNG used instead
// of Math.random / Phaser.Math.Between (determinism is a V2 design goal).

import { WAVES } from '../config/waves'
import { ENEMY_STATS } from '../config/stats'
import { RING } from '../config/ring'
import { createRng } from '../rng'
import type { EnemyType } from '../config/waves'
import type { EnemyState, GameState, SimEvent } from '../types'

// ── Public factory ─────────────────────────────────────────────────────────────

/**
 * Build a fresh EnemyState with defaults matching V1 Enemy constructor logic.
 * Exported so GameScene bridge and tests can use it directly.
 */
export function createEnemyState(
  id: number,
  enemyType: EnemyType,
  x: number,
  y: number,
): EnemyState {
  const stats = ENEMY_STATS[enemyType]
  return {
    id,
    enemyType,
    isBoss: stats.isBoss === true,
    hp: stats.hp,
    maxHp: stats.hp,
    x,
    y,
    isDead: false,
    fsm: 'approach',
    baseSpeed: stats.speed,
    currentSpeed: stats.speed,
    target: 'wand',
    noHitTimer: 0,
    waitTimer: 0,
    attackCooldown: 0,
    knockdownTimer: 0,
    staggerTimer: 0,
    inPhase2: false,
  }
}

// ── Wave result type ───────────────────────────────────────────────────────────

export interface WaveResult {
  state: GameState
  events: SimEvent[]
}

// ── startNextWave ──────────────────────────────────────────────────────────────

/**
 * Advance to the next wave.
 *
 * - Increments currentWave.
 * - If past WAVES.length → emits 'victory' and sets status='victory'.
 * - Otherwise fills spawnQueue, shuffles (non-boss only), sets timers/flags,
 *   restores +15% HP (not on wave 1), emits 'waveStarted'.
 *
 * Mirrors GameScene.startNextWave exactly, replacing Phaser.Utils.Array.Shuffle
 * with the seeded RNG shuffle for determinism.
 */
export function startNextWave(state: GameState): WaveResult {
  const nextWave = state.wave.currentWave + 1

  // Victory: past the last wave
  if (nextWave > WAVES.length) {
    const nextState: GameState = {
      ...state,
      status: 'victory',
      wave: {
        ...state.wave,
        currentWave: nextWave,
        spawnQueue: [],
        waveActive: false,
        waveEndTimer: 0,
      },
    }
    const events: SimEvent[] = [{ type: 'victory' }]
    return { state: nextState, events }
  }

  const config = WAVES[nextWave - 1]

  // Build spawn queue from wave config
  const rawQueue: EnemyType[] = []
  for (const g of config.enemies) {
    for (let i = 0; i < g.count; i++) rawQueue.push(g.type)
  }

  // Shuffle non-boss waves using the seeded RNG (mirrors V1 Phaser.Utils.Array.Shuffle)
  const rng = createRng(state.rngState)
  const spawnQueue = config.isBoss ? rawQueue : rng.shuffle(rawQueue)

  // HP restore: +15% of maxHP, capped at maxHP, not on wave 1
  let newPlayerHp = state.player.hp
  if (nextWave > 1) {
    newPlayerHp = Math.min(state.player.maxHp, state.player.hp + state.player.maxHp * 0.15)
  }

  const nextState: GameState = {
    ...state,
    rngState: rng.getState(),
    player: {
      ...state.player,
      hp: newPlayerHp,
    },
    wave: {
      ...state.wave,
      currentWave: nextWave,
      spawnQueue,
      spawnTimer: 800,
      spawnInterval: config.spawnInterval,
      waveActive: true,
      waveEndTimer: 0,
      waveDamageTaken: false,
    },
  }

  const events: SimEvent[] = [{ type: 'waveStarted', wave: nextWave }]
  return { state: nextState, events }
}

// ── stepSpawning ───────────────────────────────────────────────────────────────

/**
 * Tick the spawn timer by deltaMs. When the timer reaches 0, dequeue one enemy
 * and append its EnemyState, then reset the timer to spawnInterval.
 *
 * Uses the seeded RNG for side (left/right) and Y within RING bounds.
 * Mirrors GameScene.spawnNextEnemy exactly.
 */
export function stepSpawning(state: GameState, deltaMs: number): WaveResult {
  if (state.wave.spawnQueue.length === 0) {
    return { state, events: [] }
  }

  const newTimer = state.wave.spawnTimer - deltaMs

  if (newTimer > 0) {
    // Timer not yet reached — just decrement
    const nextState: GameState = {
      ...state,
      wave: { ...state.wave, spawnTimer: newTimer },
    }
    return { state: nextState, events: [] }
  }

  // Timer hit 0: spawn the next enemy
  const rng = createRng(state.rngState)

  // side = Phaser.Math.Between(0, 1) === 0 → left or right
  const side = rng.between(0, 1) === 0
  const x = side ? RING.left + 20 : RING.right - 20
  const y = rng.between(RING.top + 30, RING.bottom - 30)

  const id = state.wave.nextEnemyId
  const [enemyType, ...remainingQueue] = state.wave.spawnQueue
  const newEnemy = createEnemyState(id, enemyType, x, y)

  const events: SimEvent[] = [
    {
      type: 'enemySpawned',
      id,
      enemyType,
      x,
      y,
    },
  ]

  const nextState: GameState = {
    ...state,
    rngState: rng.getState(),
    enemies: [...state.enemies, newEnemy],
    wave: {
      ...state.wave,
      spawnQueue: remainingQueue,
      spawnTimer: state.wave.spawnInterval,
      nextEnemyId: id + 1,
    },
  }

  return { state: nextState, events }
}

// ── checkWaveEnd ───────────────────────────────────────────────────────────────

/**
 * Check if the current wave has ended (spawnQueue empty + no live enemies).
 * On wave end: set waveActive=false, emit 'waveCleared' with flawless flag.
 *
 * - If this was the last wave (currentWave === WAVES.length), call startNextWave
 *   immediately (which will emit 'victory').
 * - Otherwise, set waveEndTimer=3000.
 *
 * Also counts down waveEndTimer and calls startNextWave when it hits 0.
 *
 * Mirrors GameScene.update() wave-end logic (lines 338–356).
 */
export function checkWaveEnd(state: GameState, deltaMs: number): WaveResult {
  const allEvents: SimEvent[] = []
  let cur = state

  // ── Detect wave-clear condition ────────────────────────────────────────────
  if (
    cur.wave.waveActive &&
    cur.wave.spawnQueue.length === 0 &&
    cur.enemies.length === 0
  ) {
    const flawless = !cur.wave.waveDamageTaken && !cur.cheatUsed

    if (cur.wave.currentWave >= WAVES.length) {
      // Last wave: do NOT emit waveCleared (no banner/sound); emit victory directly.
      // Flawless achievement is passed through the victory event so the bridge can
      // unlock it — matching V1 which evaluated flawless before the last-wave branch.
      cur = { ...cur, wave: { ...cur.wave, waveActive: false, waveEndTimer: 0 } }
      const { state: victoryState, events: victoryEvents } = startNextWave(cur)
      // Attach flawless to the victory event emitted by startNextWave
      const patchedVictoryEvents = victoryEvents.map(e =>
        e.type === 'victory' ? { ...e, flawless } : e,
      )
      allEvents.push(...patchedVictoryEvents)
      return { state: victoryState, events: allEvents }
    } else {
      // Not last wave: emit waveCleared and set waveEndTimer
      allEvents.push({
        type: 'waveCleared',
        wave: cur.wave.currentWave,
        flawless,
      })
      cur = {
        ...cur,
        wave: {
          ...cur.wave,
          waveActive: false,
          waveEndTimer: 3000,
        },
      }
      return { state: cur, events: allEvents }
    }
  }

  // ── Count down waveEndTimer ────────────────────────────────────────────────
  if (!cur.wave.waveActive && cur.wave.waveEndTimer > 0) {
    const newTimer = cur.wave.waveEndTimer - deltaMs
    if (newTimer <= 0) {
      // Timer expired: start next wave
      cur = { ...cur, wave: { ...cur.wave, waveEndTimer: 0 } }
      const { state: nextWaveState, events: nextWaveEvents } = startNextWave(cur)
      allEvents.push(...nextWaveEvents)
      return { state: nextWaveState, events: allEvents }
    } else {
      cur = { ...cur, wave: { ...cur.wave, waveEndTimer: newTimer } }
      return { state: cur, events: allEvents }
    }
  }

  return { state: cur, events: allEvents }
}
