// Pure TypeScript — ZERO Phaser, ZERO Colyseus. Co-op multiplayer core.
//
// multi.ts generalizes the single-player Simulation ("1 human + 2 AI allies") to
// "1–3 human players + AI filling the empty slots", WITHOUT changing the combat /
// enemy-AI / wave systems. The forms that change are:
//   (1) input shape: MultiInput = Record<sessionId, MoveInput> (one per human);
//   (2) how many characters are HUMAN-controlled.
//
// Modeling decisions (fixed by the Fatia 2 plan):
//   - `slots: PlayerSlot[]` always lists the 3 characters (1–3 occupied as humans,
//     the rest AI). This keeps the single-player regression trivial: slot[0]=human,
//     slots[1..2]=ai → identical to createInitialState.
//   - Every HUMAN slot is a full `PlayerState` (knockdown FSM, per-character reach,
//     performAttack with real combat rules). Every AI slot is an `AllyState` driven
//     by `stepAlly` (6dmg / 75px / 900ms — unchanged).
//   - Enemy `chasePlayer` targeting generalizes from "the player" to "the nearest
//     LIVING human" (computed per enemy). With exactly one human this is byte-identical
//     to single-player → Simulation.update delegates here (option (a)).
//   - A human at hp ≤ 0 goes 'down' (inert, no respawn this fatia). The match
//     continues while ANY human is alive AND the wand is alive. gameOver fires when
//     the wand dies (as today) OR when ALL humans are down.
//
// rng-order: with 1 human + 2 AI, the rng is consumed in the SAME order as
// Simulation.update — humans never consume rng, AI allies (stepAlly) never consume
// rng, and only the wave system (startNextWave shuffle, stepSpawning) consumes it.
// So delegation preserves determinism. (Verified by the equivalence test.)

import { performAttack } from './systems/combat'
import {
  movePlayer,
  applySeparationEnemiesFromEnemies,
  applySeparationEnemiesFromChars,
  resolveWandCollision,
} from './systems/movement'
import { stepEnemy, staggerEnemy } from './systems/enemyAi'
import type { EnemyAiCtx, StaggerCtx } from './systems/enemyAi'
import { stepAlly } from './systems/ally'
import { startNextWave, stepSpawning, checkWaveEnd } from './systems/waves'
import { scaleWaveForPlayers } from './systems/waveScaling'
import { WAVES } from './config/waves'
import { PLAYER_STATS, ENEMY_STATS } from './config/stats'
import type {
  GameState, GameStatus, PlayerState, EnemyState, AllyState, WandState,
  ScoreState, WaveState, SimEvent, MoveInput,
} from './types'

// ── Public types ────────────────────────────────────────────────────────────────

export type ControlledBy = 'human' | 'ai'
export type CharKey = 'werdum' | 'dida' | 'thor'

export interface PlayerSlot {
  sessionId: string
  charKey: CharKey
  controlledBy: ControlledBy
}

/** Spec for a HUMAN slot passed to createMultiInitialState. */
export interface HumanSlotSpec {
  sessionId: string
  charKey: CharKey
}

/** Per-tick input keyed by sessionId (one entry per human slot). */
export type MultiInput = Record<string, MoveInput>

/**
 * Co-op game state. Mirrors GameState but splits the single `player` into:
 *   - `slots`: metadata for the 3 characters (human|ai)
 *   - `humans`: full PlayerState per human sessionId
 *   - `allies`: AllyState per AI slot (unchanged from single-player)
 */
export interface MultiGameState {
  status: GameStatus
  slots: PlayerSlot[]
  humans: Record<string, PlayerState>
  enemies: EnemyState[]
  allies: AllyState[]
  wand: WandState
  wave: WaveState
  score: ScoreState
  gameTimerMs: number
  rngState: number
  cheatUsed: boolean
}

export interface MultiUpdateResult {
  state: MultiGameState
  events: SimEvent[]
}

// ── Constants (faithful to Simulation.ts / V1) ──────────────────────────────────

const ALL_CHARS: ReadonlyArray<CharKey> = ['werdum', 'dida', 'thor']

const PLAYER_SPAWN = { x: 960, y: 840 }
const WAND_SPAWN = { x: 1150, y: 710 }
const WAND_HP = 200
const ALLY_SPAWN: ReadonlyArray<{ x: number; y: number }> = [
  { x: 760, y: 800 },
  { x: 1160, y: 810 },
]

const PLAYER_KNOCKDOWN_MS = 2000
const PLAYER_RECOVERING_MS = 500
const PLAYER_KNOCKDOWN_DAMAGE = 25

// ── createMultiInitialState ─────────────────────────────────────────────────────

/**
 * Build the initial co-op state from 1–3 HUMAN slot specs. Remaining characters
 * (those not chosen by a human) are filled as AI ally slots, at the same fixed
 * ally spawn positions as single-player.
 *
 * For a single human, this is equivalent to createInitialState(charKey, seed):
 *   - humans[sessionId] === the single-player `player`
 *   - allies === the single-player `allies`
 */
export function createMultiInitialState(humanSlots: HumanSlotSpec[], seed: number): MultiGameState {
  if (humanSlots.length < 1 || humanSlots.length > 3) {
    throw new Error(`createMultiInitialState: expected 1–3 human slots, got ${humanSlots.length}`)
  }
  const humanChars = new Set(humanSlots.map(h => h.charKey))
  if (humanChars.size !== humanSlots.length) {
    throw new Error('createMultiInitialState: duplicate charKey among human slots')
  }

  // slots[0..] = humans in given order; then the AI-filled remaining characters.
  const aiChars = ALL_CHARS.filter(c => !humanChars.has(c))

  const slots: PlayerSlot[] = [
    ...humanSlots.map(h => ({ sessionId: h.sessionId, charKey: h.charKey, controlledBy: 'human' as const })),
    ...aiChars.map(c => ({ sessionId: `ai:${c}`, charKey: c, controlledBy: 'ai' as const })),
  ]

  const humans: Record<string, PlayerState> = {}
  for (const h of humanSlots) {
    const stats = PLAYER_STATS[h.charKey] ?? PLAYER_STATS.werdum
    humans[h.sessionId] = {
      charKey: h.charKey,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      x: PLAYER_SPAWN.x,
      y: PLAYER_SPAWN.y,
      groundY: PLAYER_SPAWN.y,
      fsm: 'normal',
      knockdownTimer: 0,
      attackCooldown: 0,
      isBlocking: false,
      facing: 1,
      scaleX: 1,
    }
  }

  const allies: AllyState[] = aiChars.map((charKey, i) => ({
    charKey,
    x: ALLY_SPAWN[i].x,
    y: ALLY_SPAWN[i].y,
    fsm: 'idle',
    attackCooldown: 0,
    knockdownTimer: 0,
  }))

  const wand: WandState = { hp: WAND_HP, maxHp: WAND_HP, x: WAND_SPAWN.x, y: WAND_SPAWN.y }

  return {
    status: 'playing',
    slots,
    humans,
    enemies: [],
    allies,
    wand,
    wave: {
      currentWave: 0,
      spawnQueue: [],
      spawnTimer: 0,
      spawnInterval: 1500,
      waveActive: false,
      waveEndTimer: 0,
      waveDamageTaken: false,
      nextEnemyId: 0,
    },
    score: {
      score: 0,
      comboCount: 0,
      comboTimer: 0,
      enemiesDefeated: 0,
      maxComboReached: 0,
    },
    gameTimerMs: 0,
    rngState: seed >>> 0,
    cheatUsed: false,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** Ordered list of human sessionIds (slot order). */
function humanSessionOrder(state: MultiGameState): string[] {
  return state.slots.filter(s => s.controlledBy === 'human').map(s => s.sessionId)
}

/** A human is "alive" (active) when not down (hp > 0 and fsm !== 'down'). */
function isHumanAlive(p: PlayerState): boolean {
  return p.fsm !== 'down' && p.hp > 0
}

/**
 * Nearest LIVING human to a point, returning the sessionId + position. Ties are
 * broken by slot order (stable). Returns null if no human is alive.
 */
function nearestLivingHuman(
  state: MultiGameState,
  order: string[],
  px: number,
  py: number,
): { sessionId: string; x: number; groundY: number } | null {
  let best: { sessionId: string; x: number; groundY: number } | null = null
  let bestD = Infinity
  for (const sid of order) {
    const h = state.humans[sid]
    if (!isHumanAlive(h)) continue
    const dx = h.x - px
    const dy = h.groundY - py
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < bestD) {
      bestD = d
      best = { sessionId: sid, x: h.x, groundY: h.groundY }
    }
  }
  return best
}

/** Tick the human knockdown→recovering→normal FSM (identical to Simulation). */
function tickPlayerFsm(player: PlayerState, deltaMs: number): PlayerState {
  if (player.fsm === 'knockdown') {
    const t = player.knockdownTimer - deltaMs
    if (t <= 0) return { ...player, fsm: 'recovering', knockdownTimer: PLAYER_RECOVERING_MS }
    return { ...player, knockdownTimer: t }
  }
  if (player.fsm === 'recovering') {
    const t = player.knockdownTimer - deltaMs
    if (t <= 0) return { ...player, fsm: 'normal', knockdownTimer: 0 }
    return { ...player, knockdownTimer: t }
  }
  return player
}

// ── updateMulti ──────────────────────────────────────────────────────────────────

/**
 * Advance the co-op simulation by one tick of `deltaMs`. Pure: returns a NEW
 * MultiGameState (never mutates `state`) plus the SimEvents produced this tick.
 *
 * Order mirrors Simulation.update exactly:
 *   boot wave → gameTimer → per-human movement+FSM+attack (slot order) →
 *   combo decay → enemies (separation + AI + intents→damage) → allies →
 *   wand update (no-op) → spawn → wave-end → wand collision → enemy/char separation.
 */
export function updateMulti(state: MultiGameState, inputs: MultiInput, deltaMs: number): MultiUpdateResult {
  if (state.status !== 'playing') {
    return { state, events: [] }
  }

  const events: SimEvent[] = []
  let s = state
  const order = humanSessionOrder(s)

  // ── Boot: auto-start wave 1 ─────────────────────────────────────────────────
  if (s.wave.currentWave === 0 && !s.wave.waveActive && s.wave.waveEndTimer === 0) {
    const boot = startNextWaveMulti(s)
    s = boot.state
    events.push(...boot.events)
  }

  // ── (1) gameTimerMs ─────────────────────────────────────────────────────────
  s = { ...s, gameTimerMs: s.gameTimerMs + deltaMs }

  // ── (2) per-human: movement + FSM timers + attack-cooldown decay + attacks ───
  // Slot order. A 'down' human is inert: no movement, no FSM tick, no attacks.
  for (const sid of order) {
    const cur = s.humans[sid]
    if (cur.fsm === 'down') continue
    const input = inputs[sid] ?? NEUTRAL_INPUT

    const movedPlayer = movePlayer(cur, input, deltaMs)
    const tickedPlayer = tickPlayerFsm(movedPlayer, deltaMs)
    const cooledPlayer: PlayerState = {
      ...tickedPlayer,
      attackCooldown: Math.max(0, tickedPlayer.attackCooldown - deltaMs),
    }
    s = { ...s, humans: { ...s.humans, [sid]: cooledPlayer } }

    // Attack dispatch reuses the single-player combat by building a GameState view
    // around this human, then merging the result back. Tag attack events w/ sid.
    if (input.punch) {
      const r = performAttackForHuman(s, sid, 'punch')
      s = r.state
      events.push(...r.events)
    }
    if (input.kick) {
      const r = performAttackForHuman(s, sid, 'kick')
      s = r.state
      events.push(...r.events)
    }
  }

  // ── (3) combo timer decay ───────────────────────────────────────────────────
  if (s.score.comboCount > 0) {
    const newTimer = s.score.comboTimer - deltaMs
    if (newTimer <= 0) {
      s = { ...s, score: { ...s.score, comboCount: 0, comboTimer: 0 } }
    } else {
      s = { ...s, score: { ...s.score, comboTimer: newTimer } }
    }
  }

  // ── (4) enemies: drop dead, separation, AI step, intents → damage ───────────
  let enemies = s.enemies.filter(e => !e.isDead)
  enemies = applySeparationEnemiesFromEnemies(enemies)

  let rngState = s.rngState
  let humans = s.humans
  let wand = s.wand
  let waveDamageTaken = s.wave.waveDamageTaken
  let comboBrokenByKnockdown = false
  let gameOver = false

  const steppedEnemies: EnemyState[] = []
  for (let i = 0; i < enemies.length; i++) {
    // Per-enemy targeting: nearest LIVING human (single human → that human).
    const target = nearestLivingHuman(
      { ...s, humans }, order, enemies[i].x, enemies[i].y,
    )
    const aiCtx: EnemyAiCtx = {
      playerX: target ? target.x : enemies[i].x,
      playerGroundY: target ? target.groundY : enemies[i].y,
      wandX: wand.x,
      wandY: wand.y,
      rngState,
    }

    const result = stepEnemy(enemies[i], aiCtx, deltaMs)
    rngState = result.rngState
    let enemy = result.enemy
    events.push(...result.events)

    if (result.intents.attackWand && !gameOver) {
      const dmg = ENEMY_STATS[enemy.enemyType].damageToWand
      const newHp = Math.max(0, wand.hp - dmg)
      wand = { ...wand, hp: newHp }
      events.push({ type: 'enemyAttacked', id: enemy.id, kind: 'kick' })
      events.push({ type: 'wandDamaged', amount: dmg })
      if (newHp <= 0) gameOver = true
    }

    if (result.intents.attackPlayer && !gameOver && target) {
      const sid = target.sessionId
      let player = humans[sid]
      // Down/knocked-down humans take no hit (V1 guard generalized).
      if (player.fsm !== 'knockdown' && player.fsm !== 'down') {
        const enemyDmg = ENEMY_STATS[enemy.enemyType].damageToPlayer
        if (player.isBlocking) {
          player = { ...player, hp: Math.max(0, player.hp - 1) }
          const sctx: StaggerCtx = {
            playerX: player.x,
            playerGroundY: player.groundY,
            wandX: wand.x,
            wandY: wand.y,
            rngState,
          }
          const st = staggerEnemy(enemy, sctx)
          rngState = st.rngState
          if (st.enemy.fsm === 'staggered' && enemy.fsm !== 'staggered') {
            events.push({ type: 'enemyStaggered', id: enemy.id })
          }
          enemy = st.enemy
        } else {
          player = { ...player, hp: Math.max(0, player.hp - enemyDmg) }
          const isKnockdownHit = enemyDmg >= PLAYER_KNOCKDOWN_DAMAGE || player.hp <= 0
          events.push({ type: 'enemyAttacked', id: enemy.id, kind: 'punch' })
          events.push({ type: 'playerDamaged', amount: enemyDmg, knockdown: isKnockdownHit || undefined, sessionId: sid })
          waveDamageTaken = true

          if (isKnockdownHit) {
            player = { ...player, fsm: 'knockdown', isBlocking: false, knockdownTimer: PLAYER_KNOCKDOWN_MS }
            comboBrokenByKnockdown = true
            events.push({ type: 'playerKnockdown', sessionId: sid })
          }
        }
        // A human whose hp reaches 0 goes DOWN (inert) — no per-human gameOver.
        if (player.hp <= 0) {
          player = { ...player, fsm: 'down', isBlocking: false, knockdownTimer: 0 }
          events.push({ type: 'playerDown', sessionId: sid })
        }
        humans = { ...humans, [sid]: player }
        // If THIS death was the last living human, the match is over THIS tick.
        // Set gameOver so subsequent enemies in this same loop don't keep hitting
        // the wand / surviving state — mirroring V1's immediate freeze-on-death
        // (single-player set gameOver the instant the player hp hit 0, guarding the
        // rest of the tick). For multi with >1 human this only triggers when the
        // final human falls, which is exactly match-end, so it's correct there too.
        if (player.hp <= 0 && allHumansDown({ ...s, humans }, order)) {
          gameOver = true
        }
      }
    }

    steppedEnemies.push(enemy)
  }

  if (comboBrokenByKnockdown) {
    s = { ...s, score: { ...s.score, comboCount: 0, comboTimer: 0 } }
  }

  s = {
    ...s,
    humans,
    wand,
    enemies: steppedEnemies,
    rngState,
    wave: { ...s.wave, waveDamageTaken },
  }

  // gameOver if the wand died, or if ALL humans are down.
  if (gameOver || allHumansDown(s, order)) {
    return finalizeGameOver(s, events)
  }

  // ── (5) allies (AI slots) ───────────────────────────────────────────────────
  {
    let allyEnemies = s.enemies
    const newAllies: AllyState[] = []
    let allyRng = s.rngState
    for (const ally of s.allies) {
      const r = stepAlly(ally, allyEnemies, deltaMs, allyRng)
      allyRng = r.rngState
      allyEnemies = r.enemies
      newAllies.push(r.ally)
      events.push(...r.events)
    }
    s = { ...s, allies: newAllies, enemies: allyEnemies, rngState: allyRng }
  }

  // ── (6) wand update — no-op ─────────────────────────────────────────────────

  // ── (7) spawn stepping ──────────────────────────────────────────────────────
  if (s.wave.spawnQueue.length > 0) {
    const r = stepSpawningMulti(s, deltaMs)
    s = r.state
    events.push(...r.events)
  }

  // ── (8) wave-end check ──────────────────────────────────────────────────────
  {
    const r = checkWaveEndMulti(s, deltaMs)
    s = r.state
    events.push(...r.events)
  }

  if (s.status === 'victory') {
    return { state: s, events }
  }

  // ── (9) wand collision: push humans/enemies/allies out of the wand body ─────
  {
    let humans2 = s.humans
    let humansChanged = false
    for (const sid of order) {
      const h = humans2[sid]
      const pr = resolveWandCollision(h.x, h.groundY, s.wand)
      if (pr) {
        humans2 = { ...humans2, [sid]: { ...h, x: pr.x, y: pr.y, groundY: pr.y } }
        humansChanged = true
      }
    }

    let collidedEnemies = s.enemies
    let enemiesChanged = false
    const nextEnemies = s.enemies.map(e => {
      if (e.isDead) return e
      const er = resolveWandCollision(e.x, e.y, s.wand)
      if (!er) return e
      enemiesChanged = true
      return { ...e, x: er.x, y: er.y }
    })
    if (enemiesChanged) collidedEnemies = nextEnemies

    let collidedAllies = s.allies
    let alliesChanged = false
    const nextAllies = s.allies.map(a => {
      const ar = resolveWandCollision(a.x, a.y, s.wand)
      if (!ar) return a
      alliesChanged = true
      return { ...a, x: ar.x, y: ar.y }
    })
    if (alliesChanged) collidedAllies = nextAllies

    if (humansChanged || enemiesChanged || alliesChanged) {
      s = { ...s, humans: humans2, enemies: collidedEnemies, allies: collidedAllies }
    }
  }

  // ── (10) separation: enemies from humans + allies ───────────────────────────
  {
    const chars = [
      ...order.map(sid => ({ x: s.humans[sid].x, y: s.humans[sid].groundY })),
      ...s.allies.map(a => ({ x: a.x, y: a.y })),
    ]
    const separated = applySeparationEnemiesFromChars(s.enemies, chars)
    s = { ...s, enemies: separated }
  }

  return { state: s, events }
}

const NEUTRAL_INPUT: MoveInput = {
  up: false, down: false, left: false, right: false,
  block: false, punch: false, kick: false,
}

/** All humans are down → match over. (No humans alive.) */
function allHumansDown(state: MultiGameState, order: string[]): boolean {
  if (order.length === 0) return false
  return order.every(sid => !isHumanAlive(state.humans[sid]))
}

/** Set status='gameover' and append the gameOver event. */
function finalizeGameOver(s: MultiGameState, events: SimEvent[]): MultiUpdateResult {
  events.push({ type: 'gameOver' })
  return { state: { ...s, status: 'gameover' }, events }
}

// ── GameState bridge helpers ─────────────────────────────────────────────────────
//
// The combat/wave systems operate on a single-player GameState. We adapt them by
// building a transient GameState view around the relevant human and merging the
// result back into the MultiGameState. The view's `player` is the acting human;
// `allies` is empty (AI allies attack in their own phase). Score/enemies/wand/wave
// are shared by reference and read back out after the call.

/** Build a transient single-player GameState view around one human. */
function toGameStateView(s: MultiGameState, sid: string): GameState {
  return {
    status: s.status,
    player: s.humans[sid],
    enemies: s.enemies,
    allies: [],
    wand: s.wand,
    wave: s.wave,
    score: s.score,
    gameTimerMs: s.gameTimerMs,
    rngState: s.rngState,
    cheatUsed: s.cheatUsed,
  }
}

/** Run performAttack for a human via the GameState bridge; tag events w/ sessionId. */
function performAttackForHuman(
  s: MultiGameState,
  sid: string,
  kind: 'punch' | 'kick',
): MultiUpdateResult {
  const view = toGameStateView(s, sid)
  const { state: out, events } = performAttack(view, kind)
  const tagged = events.map(e =>
    e.type === 'attackSwung' || e.type === 'hit' ? { ...e, sessionId: sid } : e,
  )
  const merged: MultiGameState = {
    ...s,
    humans: { ...s.humans, [sid]: out.player },
    enemies: out.enemies,
    score: out.score,
  }
  return { state: merged, events: tagged }
}

// ── Wave bridge helpers ──────────────────────────────────────────────────────────
//
// startNextWave / stepSpawning / checkWaveEnd operate on a GameState. They touch
// `player.hp` (the +15% wave heal). In co-op we apply that heal to EVERY living
// human. We bridge by building a view with a placeholder player, capturing the
// hp delta, and reapplying it to all humans.

/** Apply a wave-system call (which heals player.hp) across all living humans. */
function applyWaveCall(
  s: MultiGameState,
  fn: (g: GameState) => { state: GameState; events: SimEvent[] },
): MultiUpdateResult {
  const order = humanSessionOrder(s)
  // Use the first living human (or first human) as the heal probe.
  const probeSid = order.find(sid => isHumanAlive(s.humans[sid])) ?? order[0]
  const view = toGameStateView(s, probeSid)
  const { state: out, events } = fn(view)

  // startNextWave heals +15% of maxHp (capped) on every wave > 1. Detect that a
  // NEW wave (>1) started this call by the currentWave increment, then apply the
  // same heal to every LIVING human (each has its own maxHp). This is independent
  // of the probe's hp, so a full-hp probe doesn't suppress healing the others.
  const newWaveStarted = out.wave.currentWave > s.wave.currentWave && out.wave.currentWave > 1
  let humans = s.humans
  if (newWaveStarted) {
    humans = { ...humans }
    for (const sid of order) {
      const h = s.humans[sid]
      if (!isHumanAlive(h)) continue // down humans are not healed
      humans[sid] = { ...h, hp: Math.min(h.maxHp, h.hp + h.maxHp * 0.15) }
    }
  }

  const merged: MultiGameState = {
    ...s,
    status: out.status,
    humans,
    enemies: out.enemies,
    wand: out.wand,
    wave: out.wave,
    score: out.score,
    rngState: out.rngState,
  }
  return { state: merged, events }
}

function startNextWaveMulti(s: MultiGameState): MultiUpdateResult {
  const humanCount = s.slots.filter(sl => sl.controlledBy === 'human').length as 1 | 2 | 3
  const nextWaveIndex = s.wave.currentWave + 1
  // Compute the scaled config only when the next wave is within range (avoid OOB
  // on the victory path — startNextWave handles nextWaveIndex > WAVES.length itself).
  const scaledConfig =
    nextWaveIndex >= 1 && nextWaveIndex <= WAVES.length
      ? scaleWaveForPlayers(WAVES[nextWaveIndex - 1], humanCount)
      : undefined
  return applyWaveCall(s, g => startNextWave(g, scaledConfig))
}

function stepSpawningMulti(s: MultiGameState, deltaMs: number): MultiUpdateResult {
  return applyWaveCall(s, g => stepSpawning(g, deltaMs))
}

function checkWaveEndMulti(s: MultiGameState, deltaMs: number): MultiUpdateResult {
  const humanCount = s.slots.filter(sl => sl.controlledBy === 'human').length as 1 | 2 | 3
  const nextWaveIndex = s.wave.currentWave + 1
  const scaledConfig =
    nextWaveIndex >= 1 && nextWaveIndex <= WAVES.length
      ? scaleWaveForPlayers(WAVES[nextWaveIndex - 1], humanCount)
      : undefined
  return applyWaveCall(s, g => checkWaveEnd(g, deltaMs, scaledConfig))
}
