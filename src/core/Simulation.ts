// Pure TypeScript — ZERO Phaser. The keystone of the V2 refactor.
//
// Simulation.ts is the deterministic, headless game-loop orchestrator. It composes
// every extracted core system (combat, movement, enemyAi, ally, waves) in the exact
// V1 GameScene.update() order, and CENTRALIZES intent→damage application here (no
// event bus, no Phaser events). The same loop runs identically on a server (for
// anti-cheat replay / authoritative scoring) and behind the Phaser renderer.
//
// Audited V1 update() order (GameScene.ts):
//   (1) gameTimerMs += delta
//   (2) input → player.move + player FSM timers + attack dispatch (cooldown gate)
//   (3) combo timer decay
//   (4) per-enemy: separation force + enemy AI step (intents → damage HERE)
//   (5) ally update
//   (6) wand update (no-op in the sim)
//   (7) spawn stepping
//   (8) wave-end check
//   (9) wand-collision enforcement is rendering-adjacent; we apply the pure
//       separate-enemies-from-chars (V1 did this in update); depth sort is
//       RENDERING ONLY and lives in the renderer, not the sim.
//
// Damage rules (from GameScene.onEnemyAttackWand / onEnemyAttackPlayer):
//   - attackWand intent → wand.hp -= enemy.damageToWand; event wandDamaged;
//     gameOver when wand.hp <= 0. (Wand damage does NOT set waveDamageTaken — V1
//     only sets it on player hits while not blocking.)
//   - attackPlayer intent → ignored if player is knocked down (V1 guard).
//       * blocking: damage = 1 (V1's "minimum"), NO playerDamaged event,
//         waveDamageTaken untouched, attacker is staggered.
//       * not blocking: damage = enemy.damageToPlayer, playerDamaged event,
//         waveDamageTaken = true. Player is knocked down when
//         (damageToPlayer >= 25 || hp <= 0); knockdown also zeroes the combo.
//       * gameOver when player.hp <= 0.

import { performAttack } from './systems/combat'
import { movePlayer, applySeparationEnemiesFromEnemies, applySeparationEnemiesFromChars, resolveWandCollision } from './systems/movement'
import { stepEnemy, staggerEnemy } from './systems/enemyAi'
import type { EnemyAiCtx, StaggerCtx } from './systems/enemyAi'
import { stepAlly } from './systems/ally'
import { startNextWave, stepSpawning, checkWaveEnd } from './systems/waves'
import { PLAYER_STATS, ENEMY_STATS } from './config/stats'
import type {
  GameState, PlayerState, EnemyState, AllyState, WandState, SimEvent, MoveInput,
} from './types'

// ── Input ─────────────────────────────────────────────────────────────────────

/**
 * The full per-tick input: movement + block + the two attack buttons.
 * MoveInput already carries up/down/left/right/block/punch/kick, so SimInput is
 * an alias today; it stays a named type so the renderer/server can target it.
 */
export type SimInput = MoveInput

// ── Constants (faithful to V1) ──────────────────────────────────────────────────

const ALL_CHARS = ['werdum', 'dida', 'thor'] as const
type CharKey = (typeof ALL_CHARS)[number]

// GameScene.create() spawn positions
const PLAYER_SPAWN = { x: 960, y: 840 }
const WAND_SPAWN = { x: 1150, y: 710 }
const WAND_HP = 200 // ProtectedChar default
const ALLY_SPAWN: ReadonlyArray<{ x: number; y: number }> = [
  { x: 760, y: 800 },
  { x: 1160, y: 810 },
]

// Player FSM timers (Player.knockdown / Player.update)
const PLAYER_KNOCKDOWN_MS = 2000
const PLAYER_RECOVERING_MS = 500
// V1 knockdown trigger: enemy.damageToPlayer >= 25 (or hp depleted)
const PLAYER_KNOCKDOWN_DAMAGE = 25

// ── createInitialState ───────────────────────────────────────────────────────

/**
 * Build the initial GameState for a new match.
 *
 * Mirrors GameScene.create():
 * - player at (960, 840), hp = maxHp from PLAYER_STATS[character]
 * - wand at (1150, 710), hp 200
 * - two allies from the other two characters, at fixed positions
 * - wave 0, not started (V1 defers startNextWave via a 1200ms delayedCall; the sim
 *   auto-starts wave 1 on the first update tick, which is functionally equivalent
 *   for the headless loop — the delay is purely a cosmetic fade-in)
 * - rngState seeded from `seed`
 */
export function createInitialState(character: CharKey, seed: number): GameState {
  const stats = PLAYER_STATS[character] ?? PLAYER_STATS.werdum

  const player: PlayerState = {
    charKey: character,
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

  const allyChars = ALL_CHARS.filter(c => c !== character)
  const allies: AllyState[] = allyChars.map((charKey, i) => ({
    charKey,
    x: ALLY_SPAWN[i].x,
    y: ALLY_SPAWN[i].y,
    fsm: 'idle',
    attackCooldown: 0,
    knockdownTimer: 0,
  }))

  const wand: WandState = {
    hp: WAND_HP,
    maxHp: WAND_HP,
    x: WAND_SPAWN.x,
    y: WAND_SPAWN.y,
  }

  return {
    status: 'playing',
    player,
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

// ── update ──────────────────────────────────────────────────────────────────────

export interface UpdateResult {
  state: GameState
  events: SimEvent[]
}

/**
 * Advance the simulation by one tick of `deltaMs`.
 *
 * Composes all core systems in V1 GameScene.update() order, centralizing
 * intent→damage application. Returns a NEW GameState (never mutates `state`)
 * plus the SimEvents produced this tick.
 *
 * Once status !== 'playing', update is a no-op that returns `state` unchanged
 * (same reference) and an empty event list.
 */
export function update(state: GameState, input: SimInput, deltaMs: number): UpdateResult {
  // ── Freeze guard ──────────────────────────────────────────────────────────
  if (state.status !== 'playing') {
    return { state, events: [] }
  }

  const events: SimEvent[] = []
  let s = state

  // ── Boot: auto-start wave 1 (V1 defers via delayedCall) ─────────────────────
  if (s.wave.currentWave === 0 && !s.wave.waveActive && s.wave.waveEndTimer === 0) {
    const { state: started, events: startEvents } = startNextWave(s)
    s = started
    events.push(...startEvents)
  }

  // ── (1) gameTimerMs ─────────────────────────────────────────────────────────
  s = { ...s, gameTimerMs: s.gameTimerMs + deltaMs }

  // ── (2a) player movement + FSM timers + attack-cooldown decay ───────────────
  // V1 GameScene decremented attackCooldown each frame (Math.max(0, cd - delta))
  // BEFORE the gate; performAttack only reads the cooldown, it never ticks it.
  const movedPlayer = movePlayer(s.player, input, deltaMs)
  const tickedPlayer = tickPlayerFsm(movedPlayer, deltaMs)
  const cooledPlayer: PlayerState = {
    ...tickedPlayer,
    attackCooldown: Math.max(0, tickedPlayer.attackCooldown - deltaMs),
  }
  s = { ...s, player: cooledPlayer }

  // ── (2b) attack dispatch (cooldown gate is inside performAttack) ────────────
  // V1: punch checked before kick; both gated by attackCooldown<=0 and canAttack
  // (fsm==='normal'). performAttack enforces both gates internally.
  if (input.punch) {
    const r = performAttack(s, 'punch')
    s = r.state
    events.push(...r.events)
  }
  if (input.kick) {
    const r = performAttack(s, 'kick')
    s = r.state
    events.push(...r.events)
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
  // V1 filtered dead sprites at the top of the enemy block; do the same so combat
  // results from step (2b) that killed enemies are pruned before AI.
  let enemies = s.enemies.filter(e => !e.isDead)

  // Separation between enemies (whole-array snapshot — matches the extracted system)
  enemies = applySeparationEnemiesFromEnemies(enemies)

  // Per-enemy AI step in ARRAY ORDER, applying each enemy's intents immediately
  // (V1 emitted enemyAttackWand/enemyAttackPlayer events synchronously inside the
  // per-enemy update loop, so handlers ran in array order).
  const aiCtx: EnemyAiCtx = {
    playerX: s.player.x,
    playerGroundY: s.player.groundY,
    wandX: s.wand.x,
    wandY: s.wand.y,
    rngState: s.rngState,
  }

  let rngState = s.rngState
  let player = s.player
  let wand = s.wand
  let waveDamageTaken = s.wave.waveDamageTaken
  let comboBrokenByKnockdown = false
  let gameOver = false

  const steppedEnemies: EnemyState[] = []
  for (let i = 0; i < enemies.length; i++) {
    const result = stepEnemy(enemies[i], { ...aiCtx, rngState }, deltaMs)
    rngState = result.rngState
    let enemy = result.enemy
    events.push(...result.events)

    // Apply intents centrally — replaces the V1 event-bus handlers.
    if (result.intents.attackWand && !gameOver) {
      const dmg = ENEMY_STATS[enemy.enemyType].damageToWand
      const newHp = Math.max(0, wand.hp - dmg)
      wand = { ...wand, hp: newHp }
      events.push({ type: 'enemyAttacked', id: enemy.id, kind: 'kick' })
      events.push({ type: 'wandDamaged', amount: dmg })
      if (newHp <= 0) gameOver = true
    }

    if (result.intents.attackPlayer && !gameOver) {
      // V1 guard: knocked-down player takes no hit.
      if (player.fsm !== 'knockdown') {
        const enemyDmg = ENEMY_STATS[enemy.enemyType].damageToPlayer
        if (player.isBlocking) {
          // Blocking: minimum damage (1), no playerDamaged event, attacker staggered.
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
          // staggerEnemy is a no-op if already staggered/knocked down — only emit
          // the event when the FSM actually transitioned.
          if (st.enemy.fsm === 'staggered' && enemy.fsm !== 'staggered') {
            events.push({ type: 'enemyStaggered', id: enemy.id })
          }
          enemy = st.enemy
        } else {
          // Not blocking: full damage + flags.
          player = { ...player, hp: Math.max(0, player.hp - enemyDmg) }
          const isKnockdownHit = enemyDmg >= PLAYER_KNOCKDOWN_DAMAGE || player.hp <= 0
          events.push({ type: 'enemyAttacked', id: enemy.id, kind: 'punch' })
          events.push({ type: 'playerDamaged', amount: enemyDmg, knockdown: isKnockdownHit || undefined })
          waveDamageTaken = true

          if (isKnockdownHit) {
            player = {
              ...player,
              fsm: 'knockdown',
              isBlocking: false,
              knockdownTimer: PLAYER_KNOCKDOWN_MS,
            }
            comboBrokenByKnockdown = true
            events.push({ type: 'playerKnockdown' })
          }
        }
        if (player.hp <= 0) gameOver = true
      }
    }

    steppedEnemies.push(enemy)
  }

  if (comboBrokenByKnockdown) {
    s = { ...s, score: { ...s.score, comboCount: 0, comboTimer: 0 } }
  }

  s = {
    ...s,
    player,
    wand,
    enemies: steppedEnemies,
    rngState,
    wave: { ...s.wave, waveDamageTaken },
  }

  // Short-circuit to game over if the wand or player died this tick.
  if (gameOver) {
    return finalizeGameOver(s, events)
  }

  // ── (5) allies ──────────────────────────────────────────────────────────────
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

  // ── (6) wand update — no-op in the sim (ProtectedChar.update is visual only) ──

  // ── (7) spawn stepping ──────────────────────────────────────────────────────
  if (s.wave.spawnQueue.length > 0) {
    const r = stepSpawning(s, deltaMs)
    s = r.state
    events.push(...r.events)
  }

  // ── (8) wave-end check (may start the next wave / emit victory) ──────────────
  {
    const r = checkWaveEnd(s, deltaMs)
    s = r.state
    events.push(...r.events)
  }

  // checkWaveEnd may have set status='victory' via startNextWave
  if (s.status === 'victory') {
    return { state: s, events }
  }

  // ── (9) wand collision: push player/enemies/allies out of the wand body ──────
  // V1 ran enforceWandCollision BEFORE separateEnemiesFromChars. The wand is a
  // SOLID obstacle (affects positions), so it belongs in the sim, not the renderer.
  {
    const pr = resolveWandCollision(s.player.x, s.player.groundY, s.wand)
    if (pr) {
      s = { ...s, player: { ...s.player, x: pr.x, y: pr.y, groundY: pr.y } }
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

    if (enemiesChanged || alliesChanged) {
      s = { ...s, enemies: collidedEnemies, allies: collidedAllies }
    }
  }

  // ── (10) separation: enemies from player + allies (V1 separateEnemiesFromChars) ─
  {
    const chars = [
      { x: s.player.x, y: s.player.groundY },
      ...s.allies.map(a => ({ x: a.x, y: a.y })),
    ]
    const separated = applySeparationEnemiesFromChars(s.enemies, chars)
    s = { ...s, enemies: separated }
  }

  // NOTE: depth sorting is a RENDERING concern handled by the renderer (Task 8),
  // not part of the deterministic sim.

  return { state: s, events }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Tick the player knockdown→recovering→normal FSM, mirroring Player.update.
 * - knockdown: knockdownTimer -= dt; at <=0 → recovering (timer reset to 500)
 * - recovering: knockdownTimer -= dt; at <=0 → normal
 * (Player.update uses a delayedCall for the recovering→normal step; we model it
 *  with a 500ms recovering timer reusing the knockdownTimer field.)
 */
function tickPlayerFsm(player: PlayerState, deltaMs: number): PlayerState {
  if (player.fsm === 'knockdown') {
    const t = player.knockdownTimer - deltaMs
    if (t <= 0) {
      return { ...player, fsm: 'recovering', knockdownTimer: PLAYER_RECOVERING_MS }
    }
    return { ...player, knockdownTimer: t }
  }
  if (player.fsm === 'recovering') {
    const t = player.knockdownTimer - deltaMs
    if (t <= 0) {
      return { ...player, fsm: 'normal', knockdownTimer: 0 }
    }
    return { ...player, knockdownTimer: t }
  }
  return player
}

/** Set status='gameover' and append the gameOver event (idempotent within a tick). */
function finalizeGameOver(s: GameState, events: SimEvent[]): UpdateResult {
  events.push({ type: 'gameOver' })
  return { state: { ...s, status: 'gameover' }, events }
}
