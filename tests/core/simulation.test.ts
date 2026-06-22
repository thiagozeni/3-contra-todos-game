/**
 * Tests for src/core/Simulation.ts — the full deterministic, Phaser-free game loop.
 * Keystone of the V2 refactor. STRICT TDD — RED phase first.
 *
 * The simulation composes all extracted core systems in V1 GameScene.update order,
 * centralizing intent→damage application (no event bus).
 */

import { describe, it, expect } from 'vitest'
import { createInitialState, update } from '../../src/core/Simulation'
import type { GameState, SimEvent } from '../../src/core/types'
import { PLAYER_STATS, ENEMY_STATS } from '../../src/core/config/stats'
import { WAVES } from '../../src/core/config/waves'

// ── Test helpers ────────────────────────────────────────────────────────────────

type SimInput = import('../../src/core/Simulation').SimInput

const NEUTRAL: SimInput = {
  up: false, down: false, left: false, right: false,
  block: false, punch: false, kick: false,
}

/** A scripted input function: given (state, tick) return the input for that tick. */
type Script = (state: GameState, tick: number) => SimInput

/**
 * Run `n` ticks of the simulation, accumulating events.
 * Returns the final state and the concatenated event log.
 */
function runTicks(
  state: GameState,
  script: Script,
  n: number,
  dt = 16.67,
): { state: GameState; events: SimEvent[] } {
  let cur = state
  const allEvents: SimEvent[] = []
  for (let t = 0; t < n; t++) {
    const input = script(cur, t)
    const { state: next, events } = update(cur, input, dt)
    cur = next
    allEvents.push(...events)
  }
  return { state: cur, events: allEvents }
}

// ── 1. createInitialState ───────────────────────────────────────────────────────

describe('createInitialState', () => {
  it('builds correct initial hp/positions/wave/rng for werdum', () => {
    const s = createInitialState('werdum', 12345)
    expect(s.status).toBe('playing')
    expect(s.player.charKey).toBe('werdum')
    expect(s.player.maxHp).toBe(PLAYER_STATS.werdum.maxHp)
    expect(s.player.hp).toBe(PLAYER_STATS.werdum.maxHp)
    // GameScene.create: player at (960, 840)
    expect(s.player.x).toBe(960)
    expect(s.player.y).toBe(840)
    expect(s.player.groundY).toBe(840)
    expect(s.player.fsm).toBe('normal')
    // wand at (1250, 660), hp 200 (round 2: movido 100px dir / 50px cima)
    expect(s.wand.x).toBe(1250)
    expect(s.wand.y).toBe(660)
    expect(s.wand.hp).toBe(200)
    expect(s.wand.maxHp).toBe(200)
    // wave 0, not started (create() defers startNextWave to delayedCall)
    expect(s.wave.currentWave).toBe(0)
    expect(s.wave.waveActive).toBe(false)
    expect(s.enemies).toEqual([])
    // rng seeded
    expect(s.rngState).toBe(12345 >>> 0)
    expect(s.gameTimerMs).toBe(0)
    expect(s.cheatUsed).toBe(false)
  })

  it('builds 2 allies from the other two characters', () => {
    const s = createInitialState('werdum', 1)
    expect(s.allies.map(a => a.charKey).sort()).toEqual(['dida', 'thor'])
    // ally spawn positions from GameScene.create
    expect(s.allies[0]).toMatchObject({ x: 760, y: 800 })
    expect(s.allies[1]).toMatchObject({ x: 1160, y: 810 })
  })

  it('applies the correct stats per character', () => {
    for (const c of ['werdum', 'dida', 'thor'] as const) {
      const s = createInitialState(c, 1)
      expect(s.player.maxHp).toBe(PLAYER_STATS[c].maxHp)
      expect(s.player.hp).toBe(PLAYER_STATS[c].maxHp)
      expect(s.player.charKey).toBe(c)
    }
  })
})

// ── 2. Scripted match ───────────────────────────────────────────────────────────

describe('scripted match: clear a wave by attacking', () => {
  it('kills enemies, scores points, clears the wave and starts the next', () => {
    // Controlled, deterministic scenario that exercises the full player loop end
    // to end: a wave-1-active state with 3 weak enemies hand-placed inside the
    // player's punch hitbox, an empty spawn queue, no allies (so the PLAYER lands
    // every kill and earns the score), and the wand parked far away. The player
    // stands still facing right and spams punch; the punch hitbox is an 80px-wide
    // box centred 150px ahead (originX = 960 + 1*150 = 1110), so enemies in
    // x∈[1030,1190], y≈840 are struck and beaten down (40hp / 10dmg ≈ 4 punches).
    // When all 3 die the wave clears and the 3s waveEndTimer rolls into wave 2.
    const base = createInitialState('werdum', 99)
    const mkEnemy = (id: number, x: number, y: number) => ({
      id, enemyType: 'weak' as const, isBoss: false,
      hp: 40, maxHp: 40, x, y, isDead: false,
      fsm: 'approach' as const,
      baseSpeed: 75, currentSpeed: 75,
      target: 'wand' as const,
      noHitTimer: 0, waitTimer: 0, attackCooldown: 0,
      knockdownTimer: 0, staggerTimer: 0, inPhase2: false,
    })
    const s: GameState = {
      ...base,
      allies: [],
      // Wand far in the corner so enemies never reach it during the test.
      wand: { ...base.wand, x: 200, y: 980, hp: 1e9, maxHp: 1e9 },
      player: { ...base.player, facing: 1 },
      enemies: [mkEnemy(0, 1100, 840), mkEnemy(1, 1120, 845), mkEnemy(2, 1090, 835)],
      wave: {
        ...base.wave,
        currentWave: 1, waveActive: true,
        spawnQueue: [], spawnTimer: 0,
        nextEnemyId: 3,
      },
    }

    // Stationary punch-spam: facing right, hammer the enemies in the hitbox.
    const script: Script = () => ({ ...NEUTRAL, punch: true })

    const run = runTicks(s, script, 6000)
    const ev = run.events

    // enemies were hit and all three died
    expect(ev.some(e => e.type === 'hit')).toBe(true)
    expect(ev.filter(e => e.type === 'enemyDied').length).toBeGreaterThanOrEqual(3)
    // score climbed
    expect(run.state.score.score).toBeGreaterThan(0)
    expect(run.state.score.enemiesDefeated).toBeGreaterThanOrEqual(3)
    // wave 1 cleared and wave 2 started
    expect(ev.some(e => e.type === 'waveCleared' && e.wave === 1)).toBe(true)
    expect(ev.some(e => e.type === 'waveStarted' && e.wave === 2)).toBe(true)
    expect(run.state.wave.currentWave).toBeGreaterThanOrEqual(2)
    // still playing
    expect(run.state.status).toBe('playing')
  })
})

// ── 3. Wand death → game over ────────────────────────────────────────────────────

describe('wand death → game over', () => {
  it('accumulates wandDamaged then emits gameOver and freezes', () => {
    // Isolate the wand: no allies defending, several effectively-immortal enemies
    // streaming in toward the wand from the ring's right edge, player idle and far
    // away. The wand is a SOLID body now (wand-collision pushes attackers to its
    // ellipse border), so attackers chip it down across repeated approaches rather
    // than parking on top of it — they beat it to 0 → gameOver.
    const base = createInitialState('werdum', 7)
    const mkEnemy = (id: number, x: number, y: number) => ({
      id, enemyType: 'strong' as const, isBoss: false,
      hp: 9999, maxHp: 9999, // immortal: keep returning to the wand
      x, y,
      isDead: false, fsm: 'approach' as const,
      baseSpeed: 120, currentSpeed: 120,
      target: 'wand' as const,
      noHitTimer: 0, waitTimer: 0, attackCooldown: 0,
      knockdownTimer: 0, staggerTimer: 0, inPhase2: false,
    })
    const enemies = Array.from({ length: 8 }, (_, i) => mkEnemy(i, 1500, 660 + i * 40))
    const s: GameState = {
      ...base,
      allies: [], // no defenders
      // Player parked in the far left corner, out of every enemy's path.
      player: { ...base.player, x: 500, y: 950, groundY: 950 },
      enemies,
      wand: { ...base.wand, hp: 300 },
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }

    // Player idle (far from the enemies): the wand gets pounded.
    const run = runTicks(s, () => NEUTRAL, 20000)
    const ev = run.events

    expect(ev.some(e => e.type === 'wandDamaged')).toBe(true)
    expect(ev.some(e => e.type === 'gameOver')).toBe(true)
    expect(run.state.status).toBe('gameover')
    expect(run.state.wand.hp).toBe(0)
    // player never took damage (enemies stayed on the wand)
    expect(ev.some(e => e.type === 'playerDamaged')).toBe(false)

    // update after gameover is inert (no further events, state unchanged)
    const after = update(run.state, NEUTRAL, 16.67)
    expect(after.events).toEqual([])
    expect(after.state).toBe(run.state)
  })
})

// ── 4. Player block staggers the attacker, no damage ─────────────────────────────

describe('player block', () => {
  it('blocking → no playerDamaged, attacker is staggered', () => {
    // Construct a state with one enemy already chasing the player, in range, ready
    // to attack. Player is blocking.
    const base = createInitialState('werdum', 3)
    const enemy = {
      id: 0,
      enemyType: 'weak' as const,
      isBoss: false,
      hp: 40, maxHp: 40,
      x: base.player.x + 60, // within 120 range
      y: base.player.groundY,
      isDead: false,
      fsm: 'chasePlayer' as const,
      baseSpeed: ENEMY_STATS.weak.speed,
      currentSpeed: ENEMY_STATS.weak.speed,
      target: 'player' as const,
      noHitTimer: 0,
      waitTimer: 0,
      attackCooldown: 0,
      knockdownTimer: 0,
      staggerTimer: 0,
      inPhase2: false,
    }
    const s: GameState = {
      ...base,
      enemies: [enemy],
      wave: { ...base.wave, currentWave: 1, waveActive: true },
    }

    const blockInput: SimInput = { ...NEUTRAL, block: true }
    const run = runTicks(s, () => blockInput, 5)

    // No playerDamaged event while blocking (the block path applies chip damage,
    // does not emit playerDamaged, and does not set waveDamageTaken).
    expect(run.events.some(e => e.type === 'playerDamaged')).toBe(false)
    expect(run.state.wave.waveDamageTaken).toBe(false)
    // hp dropped at most by the block chip (playtest #5: weak enemy → 1 per landed attack)
    expect(base.player.hp - run.state.player.hp).toBeLessThanOrEqual(1)
    // attacker got staggered
    expect(run.events.some(e => e.type === 'enemyStaggered')).toBe(true)
    expect(run.state.enemies[0].fsm).toBe('staggered')
  })

  it('not blocking → playerDamaged and hp drops', () => {
    const base = createInitialState('werdum', 3)
    const enemy = {
      id: 0,
      enemyType: 'weak' as const,
      isBoss: false,
      hp: 40, maxHp: 40,
      x: base.player.x + 60,
      y: base.player.groundY,
      isDead: false,
      fsm: 'chasePlayer' as const,
      baseSpeed: ENEMY_STATS.weak.speed,
      currentSpeed: ENEMY_STATS.weak.speed,
      target: 'player' as const,
      noHitTimer: 0, waitTimer: 0, attackCooldown: 0,
      knockdownTimer: 0, staggerTimer: 0, inPhase2: false,
    }
    const s: GameState = {
      ...base,
      enemies: [enemy],
      wave: { ...base.wave, currentWave: 1, waveActive: true },
    }

    const run = runTicks(s, () => NEUTRAL, 5)
    expect(run.events.some(e => e.type === 'playerDamaged')).toBe(true)
    expect(run.state.player.hp).toBeLessThan(base.player.hp)
    expect(run.state.wave.waveDamageTaken).toBe(true)
  })
})

// ── 5. waveDamageTaken / flawless propagation ────────────────────────────────────

describe('flawless propagation', () => {
  it('clears wave 1 flawlessly when the wand is never touched and player unhurt', () => {
    let s = createInitialState('werdum', 1234)
    s = runTicks(s, () => NEUTRAL, 5).state

    // Aggressive player intercepts enemies before they touch the wand.
    const script: Script = (state) => {
      const live = state.enemies.filter(e => !e.isDead)
      if (live.length === 0) return NEUTRAL
      let nearest = live[0]; let nd = Infinity
      for (const e of live) {
        const d = Math.hypot(e.x - state.player.x, e.y - state.player.groundY)
        if (d < nd) { nd = d; nearest = e }
      }
      const dx = nearest.x - state.player.x
      const dy = nearest.y - state.player.groundY
      const close = Math.abs(dx) < 70 && Math.abs(dy) < 35
      return {
        up: dy < -10, down: dy > 10, left: dx < -10, right: dx > 10,
        block: false, punch: close, kick: false,
      }
    }

    const run = runTicks(s, script, 4000)
    const cleared = run.events.find(e => e.type === 'waveCleared' && e.wave === 1)
    expect(cleared).toBeDefined()
    // If neither wand nor player took damage during wave 1, it is flawless.
    if (cleared && cleared.type === 'waveCleared') {
      const playerHurt = run.events.some(e => e.type === 'playerDamaged')
      const wandHurt = run.events.some(e => e.type === 'wandDamaged')
      if (!playerHurt && !wandHurt) {
        expect(cleared.flawless).toBe(true)
      }
    }
  })

  it('sets waveDamageTaken=true when the player is hit (NOT flawless)', () => {
    const base = createInitialState('werdum', 5)
    const enemy = {
      id: 0, enemyType: 'weak' as const, isBoss: false,
      hp: 40, maxHp: 40,
      x: base.player.x + 60, y: base.player.groundY,
      isDead: false, fsm: 'chasePlayer' as const,
      baseSpeed: 75, currentSpeed: 75,
      target: 'player' as const,
      noHitTimer: 0, waitTimer: 0, attackCooldown: 0,
      knockdownTimer: 0, staggerTimer: 0, inPhase2: false,
    }
    let s: GameState = {
      ...base,
      enemies: [enemy],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }
    s = runTicks(s, () => NEUTRAL, 5).state
    expect(s.wave.waveDamageTaken).toBe(true)
  })
})

// ── 6. DETERMINISM ───────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('two runs with same seed + same input script over 60s are byte-identical', () => {
    const SEED = 0xC0FFEE
    const TICKS = 3600 // 60s at 16.67ms

    // A deterministic, stateful-but-pure script: derive input from the state only.
    const script: Script = (state, t) => {
      const live = state.enemies.filter(e => !e.isDead)
      const blockPhase = (t % 120) < 20 // periodically block
      if (live.length === 0) return { ...NEUTRAL, block: blockPhase }
      let nearest = live[0]; let nd = Infinity
      for (const e of live) {
        const d = Math.hypot(e.x - state.player.x, e.y - state.player.groundY)
        if (d < nd) { nd = d; nearest = e }
      }
      const dx = nearest.x - state.player.x
      const dy = nearest.y - state.player.groundY
      const close = Math.abs(dx) < 75 && Math.abs(dy) < 35
      return {
        up: dy < -10, down: dy > 10, left: dx < -10, right: dx > 10,
        block: blockPhase,
        punch: close && !blockPhase,
        kick: false,
      }
    }

    const runA = runTicks(createInitialState('werdum', SEED), script, TICKS)
    const runB = runTicks(createInitialState('werdum', SEED), script, TICKS)

    expect(JSON.stringify(runA.state)).toBe(JSON.stringify(runB.state))
    expect(JSON.stringify(runA.events)).toBe(JSON.stringify(runB.events))
  })

  it('different seeds diverge', () => {
    const TICKS = 1200
    const script: Script = () => NEUTRAL
    const a = runTicks(createInitialState('werdum', 1), script, TICKS)
    const b = runTicks(createInitialState('werdum', 2), script, TICKS)
    expect(JSON.stringify(a.state)).not.toBe(JSON.stringify(b.state))
  })
})

// ── 7. PERFORMANCE ───────────────────────────────────────────────────────────────

describe('performance', () => {
  it('runs 36,000 ticks (10 min simulated) in < 2s wall clock', () => {
    // Realistic mid-game state with ~6 enemies.
    const base = createInitialState('werdum', 42)
    const mkEnemy = (id: number, x: number, y: number) => ({
      id, enemyType: 'weak' as const, isBoss: false,
      hp: 40, maxHp: 40, x, y, isDead: false,
      fsm: 'approach' as const,
      baseSpeed: 75, currentSpeed: 75,
      target: 'wand' as const,
      noHitTimer: 0, waitTimer: 0, attackCooldown: 0,
      knockdownTimer: 0, staggerTimer: 0, inPhase2: false,
    })
    const enemies = [
      mkEnemy(0, 500, 700), mkEnemy(1, 1400, 720), mkEnemy(2, 700, 900),
      mkEnemy(3, 1200, 850), mkEnemy(4, 900, 680), mkEnemy(5, 1100, 950),
    ]
    const s: GameState = {
      ...base,
      enemies,
      wand: { ...base.wand, hp: 9_999_999, maxHp: 9_999_999 }, // keep alive
      player: { ...base.player, hp: 9_999_999, maxHp: 9_999_999 },
      wave: {
        ...base.wave,
        currentWave: 5, waveActive: true,
        spawnQueue: ['weak', 'weak', 'weak', 'weak'],
        spawnInterval: 1200, spawnTimer: 1200,
      },
    }

    const script: Script = () => ({ ...NEUTRAL, punch: true })

    const t0 = Date.now()
    runTicks(s, script, 36_000)
    const elapsed = Date.now() - t0
    // eslint-disable-next-line no-console
    console.log(`[perf] 36,000 ticks in ${elapsed}ms`)
    expect(elapsed).toBeLessThan(2000)
  })
})

// ── 8. status freeze guards ──────────────────────────────────────────────────────

describe('status freeze', () => {
  it('once status is not playing, update is a no-op returning the same state', () => {
    const base = createInitialState('werdum', 1)
    const over: GameState = { ...base, status: 'gameover' }
    const r1 = update(over, NEUTRAL, 16.67)
    expect(r1.state).toBe(over)
    expect(r1.events).toEqual([])

    const win: GameState = { ...base, status: 'victory' }
    const r2 = update(win, NEUTRAL, 16.67)
    expect(r2.state).toBe(win)
    expect(r2.events).toEqual([])
  })
})

// ── 9. gameOver while blocking ──────────────────────────────────────────────────

describe('gameOver while blocking', () => {
  it('blocking chip damage at hp=1 → hp=0 → gameOver, no playerDamaged, no waveDamageTaken, attacker staggered', () => {
    // Player at hp=1 and blocking. Enemy in chasePlayer state at close range
    // with attackCooldown=0 so the attackPlayer intent fires on the very first tick.
    const base = createInitialState('werdum', 42)
    const enemy = {
      id: 0,
      enemyType: 'weak' as const,
      isBoss: false,
      hp: 40, maxHp: 40,
      x: base.player.x + 60, // within 120px range
      y: base.player.groundY,
      isDead: false,
      fsm: 'chasePlayer' as const,
      baseSpeed: ENEMY_STATS.weak.speed,
      currentSpeed: ENEMY_STATS.weak.speed,
      target: 'player' as const,
      noHitTimer: 0,
      waitTimer: 0,
      attackCooldown: 0, // fires immediately
      knockdownTimer: 0,
      staggerTimer: 0,
      inPhase2: false,
    }
    const s: GameState = {
      ...base,
      allies: [],
      player: {
        ...base.player,
        hp: 1,      // one hit away from death
        isBlocking: true,
        fsm: 'normal',
      },
      enemies: [enemy],
      wave: {
        ...base.wave,
        currentWave: 1,
        waveActive: true,
        spawnQueue: [],
        waveDamageTaken: false,
      },
    }

    const blockInput: SimInput = { ...NEUTRAL, block: true }
    // One tick is enough for the enemy to fire its attack intent.
    const { state: next, events } = update(s, blockInput, 16.67)

    // Player hp must have dropped to 0 via chip damage.
    expect(next.player.hp).toBe(0)
    // Game must be over.
    expect(next.status).toBe('gameover')
    // Must contain gameOver event.
    expect(events.some(e => e.type === 'gameOver')).toBe(true)
    // No playerDamaged event (blocking suppresses it even at lethal chip damage).
    expect(events.some(e => e.type === 'playerDamaged')).toBe(false)
    // waveDamageTaken must stay false (blocking never sets it per V1 semantics).
    expect(next.wave.waveDamageTaken).toBe(false)
    // Attacker must have been staggered.
    expect(next.enemies[0].fsm).toBe('staggered')
    expect(events.some(e => e.type === 'enemyStaggered' && e.id === 0)).toBe(true)
  })
})

// ── 10. update() input-state immutability ───────────────────────────────────────

describe('update() immutability', () => {
  it('original state is not mutated by update() on the playing path', () => {
    const base = createInitialState('werdum', 7)
    const mkEnemy = (id: number, x: number, y: number) => ({
      id, enemyType: 'weak' as const, isBoss: false,
      hp: 40, maxHp: 40, x, y, isDead: false,
      fsm: 'chasePlayer' as const,
      baseSpeed: ENEMY_STATS.weak.speed,
      currentSpeed: ENEMY_STATS.weak.speed,
      target: 'player' as const,
      noHitTimer: 0, waitTimer: 0, attackCooldown: 0,
      knockdownTimer: 0, staggerTimer: 0, inPhase2: false,
    })
    const s: GameState = {
      ...base,
      player: { ...base.player, hp: base.player.maxHp },
      enemies: [
        mkEnemy(0, base.player.x + 60, base.player.groundY),
        mkEnemy(1, base.player.x - 50, base.player.groundY + 10),
      ],
      wave: {
        ...base.wave,
        currentWave: 3,
        waveActive: true,
        spawnQueue: ['weak', 'strong'],
      },
    }

    // Deep-clone the original state before calling update.
    const snapshot = structuredClone(s)

    // Call update with active inputs that exercise multiple code paths.
    const activeInput: SimInput = { ...NEUTRAL, punch: true, block: false }
    update(s, activeInput, 16.67)

    // The original state must be byte-identical to the snapshot taken before update.
    expect(s).toEqual(snapshot)
  })
})

// ── 11. Fix 1: enemyAttacked event emitted with correct kind ───────────────────

describe('enemyAttacked event — Fix 1', () => {
  // Helper to build an enemy in waitBeforeAttack state with waitTimer at 0
  // so it fires on the very first tick.
  const mkWandEnemy = (base: GameState) => ({
    id: 42,
    enemyType: 'weak' as const,
    isBoss: false,
    hp: 40, maxHp: 40,
    // Place the enemy directly on the wand so the approach → waitBeforeAttack
    // transition has already happened (target wand, very close).
    x: base.wand.x + 5,
    y: base.wand.y,
    isDead: false,
    fsm: 'waitBeforeAttack' as const,
    baseSpeed: 75, currentSpeed: 75,
    target: 'wand' as const,
    noHitTimer: 0,
    waitTimer: 0,       // fires immediately
    attackCooldown: 0,
    knockdownTimer: 0,
    staggerTimer: 0,
    inPhase2: false,
  })

  const mkPlayerEnemy = (base: GameState) => ({
    id: 43,
    enemyType: 'weak' as const,
    isBoss: false,
    hp: 40, maxHp: 40,
    x: base.player.x + 60,
    y: base.player.groundY,
    isDead: false,
    fsm: 'chasePlayer' as const,
    baseSpeed: 75, currentSpeed: 75,
    target: 'player' as const,
    noHitTimer: 0,
    waitTimer: 0,
    attackCooldown: 0,
    knockdownTimer: 0,
    staggerTimer: 0,
    inPhase2: false,
  })

  it('attackWand intent → enemyAttacked kind=kick co-emitted with wandDamaged', () => {
    const base = createInitialState('werdum', 99)
    const s: GameState = {
      ...base,
      allies: [],
      wand: { ...base.wand, hp: 200 },
      enemies: [mkWandEnemy(base)],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }

    // Run a few ticks until wandDamaged fires
    const run = runTicks(s, () => NEUTRAL, 10)
    const ev = run.events

    expect(ev.some(e => e.type === 'wandDamaged')).toBe(true)

    const kickEv = ev.find(e => e.type === 'enemyAttacked' && e.id === 42)
    expect(kickEv).toBeDefined()
    if (kickEv && kickEv.type === 'enemyAttacked') {
      expect(kickEv.kind).toBe('kick')
    }
  })

  it('attackPlayer intent → enemyAttacked kind=punch co-emitted with playerDamaged', () => {
    const base = createInitialState('werdum', 99)
    const s: GameState = {
      ...base,
      allies: [],
      enemies: [mkPlayerEnemy(base)],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }

    const run = runTicks(s, () => NEUTRAL, 10)
    const ev = run.events

    expect(ev.some(e => e.type === 'playerDamaged')).toBe(true)

    const punchEv = ev.find(e => e.type === 'enemyAttacked' && e.id === 43)
    expect(punchEv).toBeDefined()
    if (punchEv && punchEv.type === 'enemyAttacked') {
      expect(punchEv.kind).toBe('punch')
    }
  })
})

// ── 12. Fix 2: playerDamaged has knockdown flag on knockdown hits ───────────────

describe('playerDamaged knockdown flag — Fix 2', () => {
  it('hit causing knockdown → playerDamaged.knockdown === true', () => {
    const base = createInitialState('werdum', 99)
    // Use boss_son whose damageToPlayer === 25, which equals PLAYER_KNOCKDOWN_DAMAGE,
    // guaranteeing a knockdown hit.
    const enemy = {
      id: 0,
      enemyType: 'boss_son' as const,
      isBoss: true,
      hp: 999, maxHp: 999,
      x: base.player.x + 60,
      y: base.player.groundY,
      isDead: false,
      fsm: 'chasePlayer' as const,
      baseSpeed: 75, currentSpeed: 75,
      target: 'player' as const,
      noHitTimer: 0, waitTimer: 0, attackCooldown: 0,
      knockdownTimer: 0, staggerTimer: 0, inPhase2: false,
    }
    const s: GameState = {
      ...base,
      allies: [],
      player: { ...base.player, hp: 100 },
      enemies: [enemy],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }

    const run = runTicks(s, () => NEUTRAL, 10)
    const ev = run.events

    // Should have both playerKnockdown and playerDamaged
    expect(ev.some(e => e.type === 'playerKnockdown')).toBe(true)

    const dmgEv = ev.find(e => e.type === 'playerDamaged')
    expect(dmgEv).toBeDefined()
    if (dmgEv && dmgEv.type === 'playerDamaged') {
      expect(dmgEv.knockdown).toBe(true)
    }
  })

  it('hit that does NOT cause knockdown → playerDamaged.knockdown is falsy', () => {
    const base = createInitialState('werdum', 99)
    // Use 'weak' enemy (damageToPlayer < 25) with player at high HP
    const enemy = {
      id: 0,
      enemyType: 'weak' as const,
      isBoss: false,
      hp: 999, maxHp: 999,
      x: base.player.x + 60,
      y: base.player.groundY,
      isDead: false,
      fsm: 'chasePlayer' as const,
      baseSpeed: 75, currentSpeed: 75,
      target: 'player' as const,
      noHitTimer: 0, waitTimer: 0, attackCooldown: 0,
      knockdownTimer: 0, staggerTimer: 0, inPhase2: false,
    }
    const s: GameState = {
      ...base,
      allies: [],
      player: { ...base.player, hp: 200 },
      enemies: [enemy],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }

    const run = runTicks(s, () => NEUTRAL, 5)
    const ev = run.events

    const dmgEv = ev.find(e => e.type === 'playerDamaged')
    if (dmgEv && dmgEv.type === 'playerDamaged') {
      expect(dmgEv.knockdown).toBeFalsy()
    }
  })
})

// ── 13. LOCAL adapter contract: player death is V1-shaped (no co-op leakage) ─────
//
// Simulation.update delegates to updateMulti, which models a dying human as
// fsm:'down' + a `playerDown` event + sessionId-tagged events. The single-player
// adapter MUST hide all of that: no playerDown event ever reaches a LOCAL consumer,
// no event carries a sessionId, and the dying player is V1-knocked-down (or stays
// blocking on a chip death), never 'down'. This locks the Debt-2 premise that "in
// LOCAL mode the playerDown event never fires".

describe('LOCAL player-death adapter contract', () => {
  const lethalEnemy = (base: GameState, type: 'boss_coco' | 'weak') => ({
    id: 0, enemyType: type, isBoss: type === 'boss_coco',
    hp: 400, maxHp: 400,
    x: base.player.x + 60, y: base.player.groundY, isDead: false,
    fsm: 'chasePlayer' as const,
    baseSpeed: 60, currentSpeed: 60, target: 'player' as const,
    noHitTimer: 0, waitTimer: 0, attackCooldown: 0,
    knockdownTimer: 0, staggerTimer: 0, inPhase2: false,
  })

  it('non-block lethal hit → fsm knockdown (timer 2000), gameOver, NO playerDown, NO sessionId', () => {
    const base = createInitialState('werdum', 42)
    const s: GameState = {
      ...base,
      allies: [],
      player: { ...base.player, hp: 1, isBlocking: false, fsm: 'normal' },
      enemies: [lethalEnemy(base, 'boss_coco')],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }
    const { state: next, events } = update(s, NEUTRAL, 16.67)

    expect(next.player.hp).toBe(0)
    expect(next.status).toBe('gameover')
    // V1 single-player leaves the dying player knocked down, never 'down'.
    expect(next.player.fsm).toBe('knockdown')
    expect(next.player.knockdownTimer).toBe(2000)
    expect(next.player.isBlocking).toBe(false)
    // No co-op leakage.
    expect(events.some(e => e.type === 'playerDown')).toBe(false)
    expect(events.some(e => 'sessionId' in e && (e as { sessionId?: string }).sessionId !== undefined)).toBe(false)
    // V1 still emits playerKnockdown + gameOver.
    expect(events.some(e => e.type === 'playerKnockdown')).toBe(true)
    expect(events.some(e => e.type === 'gameOver')).toBe(true)
  })

  it('blocking chip lethal → fsm blocking, gameOver, NO playerDown, NO sessionId', () => {
    const base = createInitialState('werdum', 42)
    const s: GameState = {
      ...base,
      allies: [],
      player: { ...base.player, hp: 1, isBlocking: true, fsm: 'normal' },
      enemies: [lethalEnemy(base, 'weak')],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }
    const { state: next, events } = update(s, { ...NEUTRAL, block: true }, 16.67)

    expect(next.player.hp).toBe(0)
    expect(next.status).toBe('gameover')
    // Blocking chip death keeps the V1 blocking shape (NOT 'down', NOT 'knockdown').
    expect(next.player.fsm).toBe('blocking')
    expect(next.player.isBlocking).toBe(true)
    expect(next.player.knockdownTimer).toBe(0)
    expect(events.some(e => e.type === 'playerDown')).toBe(false)
    expect(events.some(e => 'sessionId' in e && (e as { sessionId?: string }).sessionId !== undefined)).toBe(false)
    expect(events.some(e => e.type === 'gameOver')).toBe(true)
  })
})

// reference WAVES so the import isn't flagged unused if assertions change
void WAVES
