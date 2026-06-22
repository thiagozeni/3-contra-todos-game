/**
 * Tests for src/core/multi.ts — co-op multiplayer core.
 * STRICT TDD — RED first.
 *
 * Design (fixed here):
 *  - `createMultiInitialState(humanSlots, seed)` takes 1–3 HUMAN slot specs
 *    ({ sessionId, charKey }) and auto-fills the remaining characters as AI slots.
 *  - The returned MultiGameState carries `slots: PlayerSlot[]` (always the 3
 *    characters, each marked human|ai), `humans: Record<sessionId, PlayerState>`
 *    (full PlayerState w/ knockdown FSM + real combat), and `allies: AllyState[]`
 *    (AI slots, driven by stepAlly — unchanged 6dmg/75px/900ms).
 *  - `updateMulti(state, inputs: MultiInput, deltaMs) → { state, events }` pure.
 *  - Single-player (one human) is byte-equivalent to Simulation.update.
 */

import { describe, it, expect } from 'vitest'
import { createInitialState, update } from '../../src/core/Simulation'
import {
  createMultiInitialState,
  updateMulti,
} from '../../src/core/multi'
import type { MultiGameState, MultiInput, PlayerSlot } from '../../src/core/multi'
import type { GameState, SimEvent, PlayerState } from '../../src/core/types'
import { ENEMY_STATS } from '../../src/core/config/stats'

const NEUTRAL = {
  up: false, down: false, left: false, right: false,
  block: false, punch: false, kick: false,
}

/** Build a MultiInput from a Record-ish of per-session inputs. */
function mkInputs(map: MultiInput): MultiInput {
  return map
}

function mkEnemy(id: number, x: number, y: number, over: Partial<any> = {}) {
  return {
    id, enemyType: 'weak' as const, isBoss: false,
    hp: 40, maxHp: 40, x, y, isDead: false,
    fsm: 'approach' as const,
    baseSpeed: 75, currentSpeed: 75,
    target: 'wand' as const,
    noHitTimer: 0, waitTimer: 0, attackCooldown: 0,
    knockdownTimer: 0, staggerTimer: 0, inPhase2: false,
    ...over,
  }
}

// ── 1. Single-player equivalence ────────────────────────────────────────────────

describe('single-player equivalence (createMultiInitialState 1 human ≡ createInitialState)', () => {
  it('initial state: combat-relevant shape matches createInitialState', () => {
    const sp = createInitialState('werdum', 12345)
    const mp = createMultiInitialState([{ sessionId: 'p1', charKey: 'werdum' }], 12345)

    // slot[0] is the human and equals the single-player player
    const human = mp.humans['p1']
    expect(human).toEqual(sp.player)

    // the 2 AI slots equal the single-player allies (same chars + positions)
    expect(mp.allies).toEqual(sp.allies)

    // shared sub-states identical
    expect(mp.enemies).toEqual(sp.enemies)
    expect(mp.wand).toEqual(sp.wand)
    expect(mp.wave).toEqual(sp.wave)
    expect(mp.score).toEqual(sp.score)
    expect(mp.rngState).toBe(sp.rngState)
    expect(mp.status).toBe(sp.status)
    expect(mp.gameTimerMs).toBe(sp.gameTimerMs)

    // slots metadata: 1 human + 2 ai
    expect(mp.slots.filter(s => s.controlledBy === 'human').length).toBe(1)
    expect(mp.slots.filter(s => s.controlledBy === 'ai').length).toBe(2)
    const humanSlot = mp.slots.find(s => s.controlledBy === 'human')!
    expect(humanSlot.charKey).toBe('werdum')
    expect(humanSlot.sessionId).toBe('p1')
  })

  it('30s simulated run: positions/hp/events identical vs single-player path', () => {
    const SEED = 0xBEEF
    const TICKS = 1800 // 30s @ 16.67ms
    const dt = 16.67

    // deterministic, state-derived script (single-player style)
    const spScript = (state: GameState, t: number) => {
      const live = state.enemies.filter(e => !e.isDead)
      const blockPhase = (t % 120) < 20
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
        block: blockPhase, punch: close && !blockPhase, kick: false,
      }
    }

    // single-player run
    let sp = createInitialState('werdum', SEED)
    const spEvents: SimEvent[] = []
    for (let t = 0; t < TICKS; t++) {
      const r = update(sp, spScript(sp, t), dt)
      sp = r.state
      spEvents.push(...r.events)
    }

    // multi run, one human — drive with the SAME logical script (derive from human)
    let mp = createMultiInitialState([{ sessionId: 'p1', charKey: 'werdum' }], SEED)
    const mpEvents: SimEvent[] = []
    for (let t = 0; t < TICKS; t++) {
      const human = mp.humans['p1']
      // reconstruct an equivalent GameState-like view for the script
      const view = { enemies: mp.enemies, player: human } as unknown as GameState
      const input = spScript(view, t)
      const r = updateMulti(mp, { p1: input }, dt)
      mp = r.state
      mpEvents.push(...r.events)
    }

    // human position/hp matches single-player player
    expect(mp.humans['p1'].x).toBe(sp.player.x)
    expect(mp.humans['p1'].y).toBe(sp.player.y)
    expect(mp.humans['p1'].hp).toBe(sp.player.hp)
    // allies match
    expect(mp.allies).toEqual(sp.allies)
    // enemies/wand/wave/score match
    expect(mp.enemies).toEqual(sp.enemies)
    expect(mp.wand).toEqual(sp.wand)
    expect(JSON.stringify(mp.wave)).toBe(JSON.stringify(sp.wave))
    expect(JSON.stringify(mp.score)).toBe(JSON.stringify(sp.score))
    expect(mp.rngState).toBe(sp.rngState)
    expect(mp.status).toBe(sp.status)

    // event stream identical (attribution sessionId is additive; strip it for compare)
    const strip = (e: SimEvent) => {
      const { sessionId, ...rest } = e as any
      return rest
    }
    expect(spEvents.map(strip)).toEqual(mpEvents.map(strip))
  })
})

// ── 2. Multiple humans each drive their own character ───────────────────────────

describe('multiple humans', () => {
  it('two humans: each input moves its own character with its own stats', () => {
    const mp = createMultiInitialState(
      [
        { sessionId: 'a', charKey: 'werdum' },
        { sessionId: 'b', charKey: 'dida' },
      ],
      1,
    )
    // 2 humans, 1 AI slot (thor)
    expect(Object.keys(mp.humans).sort()).toEqual(['a', 'b'])
    expect(mp.allies.map(a => a.charKey)).toEqual(['thor'])

    const ax0 = mp.humans['a'].x
    const bx0 = mp.humans['b'].x

    // 'a' moves right, 'b' stays put
    const inputs: MultiInput = {
      a: { ...NEUTRAL, right: true },
      b: { ...NEUTRAL },
    }
    const r = updateMulti(mp, inputs, 16.67)
    expect(r.state.humans['a'].x).toBeGreaterThan(ax0)
    expect(r.state.humans['b'].x).toBe(bx0)
    expect(r.state.humans['a'].facing).toBe(1)
  })

  it('human ally uses player combat reach/stats, NOT the 6dmg AI attack', () => {
    // human 'b' (dida) faces an enemy in punch range; punching deals dida punch dmg
    // (from COMBAT.punch, not the fixed 6). Place enemy in dida's hitbox.
    const base = createMultiInitialState(
      [
        { sessionId: 'a', charKey: 'werdum' },
        { sessionId: 'b', charKey: 'dida' },
      ],
      1,
    )
    const bx = base.humans['b'].x
    const by = base.humans['b'].groundY
    // dida punchReach = 140, facing default 1 → originX = bx + 140
    const enemy = mkEnemy(0, bx + 140, by, { hp: 999, maxHp: 999 })
    const s: MultiGameState = {
      ...base,
      enemies: [enemy],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }
    const inputs: MultiInput = {
      a: { ...NEUTRAL },
      b: { ...NEUTRAL, punch: true },
    }
    const r = updateMulti(s, inputs, 16.67)
    const hit = r.events.find(e => e.type === 'hit')
    expect(hit).toBeDefined()
    // The hit amount is the COMBAT punch damage (>6, definitely not the AI's fixed 6).
    if (hit && hit.type === 'hit') {
      expect(hit.amount).toBeGreaterThan(6)
      expect(hit.source).toBe('player')
    }
  })
})

// ── 3. Enemy targeting: nearest living human ────────────────────────────────────

describe('enemy chasePlayer targets nearest living human', () => {
  it('with 2 humans at different distances the enemy attacks the nearer one', () => {
    const base = createMultiInitialState(
      [
        { sessionId: 'a', charKey: 'werdum' },
        { sessionId: 'b', charKey: 'dida' },
      ],
      1,
    )
    // place humans far apart (in-ring: x∈[430,1376] at y=800); enemy next to 'b'
    const humans: Record<string, PlayerState> = {
      a: { ...base.humans['a'], x: 500, y: 800, groundY: 800 },
      b: { ...base.humans['b'], x: 1300, y: 800, groundY: 800 },
    }
    const enemy = mkEnemy(0, 1300 + 50, 800, {
      fsm: 'chasePlayer' as const, target: 'player' as const, attackCooldown: 0,
    })
    const s: MultiGameState = {
      ...base,
      humans,
      allies: [], // remove AI to isolate
      slots: base.slots.filter(sl => sl.controlledBy === 'human'),
      enemies: [enemy],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }
    const r = updateMulti(s, { a: NEUTRAL, b: NEUTRAL }, 16.67)
    // The nearer human 'b' was damaged, not 'a'.
    const dmg = r.events.find(e => e.type === 'playerDamaged') as any
    expect(dmg).toBeDefined()
    expect(dmg.sessionId).toBe('b')
    expect(r.state.humans['b'].hp).toBeLessThan(base.humans['b'].hp)
    expect(r.state.humans['a'].hp).toBe(base.humans['a'].hp)
  })
})

// ── 4. Down human is inert; all down → gameOver ─────────────────────────────────

describe('human knockout / down state', () => {
  it('human at 0 hp is down/inert: no movement or attacks accepted, game continues if another is alive', () => {
    const base = createMultiInitialState(
      [
        { sessionId: 'a', charKey: 'werdum' },
        { sessionId: 'b', charKey: 'dida' },
      ],
      1,
    )
    const humans: Record<string, PlayerState> = {
      a: { ...base.humans['a'], hp: 0, fsm: 'down' as any, x: 500, y: 800, groundY: 800 },
      b: { ...base.humans['b'], hp: 100, x: 1000, y: 800, groundY: 800 },
    }
    const s: MultiGameState = {
      ...base,
      humans,
      allies: [],
      slots: base.slots.filter(sl => sl.controlledBy === 'human'),
      enemies: [],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: ['weak'] },
    }
    const ax0 = s.humans['a'].x
    // 'a' (down) tries to move + punch — must be ignored
    const r = updateMulti(s, {
      a: { ...NEUTRAL, right: true, punch: true },
      b: { ...NEUTRAL },
    }, 16.67)
    expect(r.state.humans['a'].x).toBe(ax0)        // didn't move
    expect(r.state.humans['a'].hp).toBe(0)         // still down
    expect(r.events.some(e => e.type === 'attackSwung')).toBe(false) // no attack
    expect(r.state.status).toBe('playing')         // game continues, b alive
  })

  it('all humans down → gameOver', () => {
    const base = createMultiInitialState(
      [
        { sessionId: 'a', charKey: 'werdum' },
        { sessionId: 'b', charKey: 'dida' },
      ],
      1,
    )
    const humans: Record<string, PlayerState> = {
      a: { ...base.humans['a'], hp: 0, fsm: 'down' as any },
      b: { ...base.humans['b'], hp: 0, fsm: 'down' as any },
    }
    const s: MultiGameState = {
      ...base,
      humans,
      allies: [],
      slots: base.slots.filter(sl => sl.controlledBy === 'human'),
      enemies: [],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }
    const r = updateMulti(s, { a: NEUTRAL, b: NEUTRAL }, 16.67)
    expect(r.state.status).toBe('gameover')
    expect(r.events.some(e => e.type === 'gameOver')).toBe(true)
  })

  it('a lethal hit puts the human down (hp 0, fsm down) but the match continues', () => {
    const base = createMultiInitialState(
      [
        { sessionId: 'a', charKey: 'werdum' },
        { sessionId: 'b', charKey: 'dida' },
      ],
      1,
    )
    const humans: Record<string, PlayerState> = {
      a: { ...base.humans['a'], hp: 5, x: 1300, y: 800, groundY: 800 },
      b: { ...base.humans['b'], hp: 100, x: 500, y: 800, groundY: 800 },
    }
    const enemy = mkEnemy(0, 1300 + 50, 800, {
      enemyType: 'strong' as const, hp: 999, maxHp: 999,
      fsm: 'chasePlayer' as const, target: 'player' as const, attackCooldown: 0,
    })
    const s: MultiGameState = {
      ...base,
      humans,
      allies: [],
      slots: base.slots.filter(sl => sl.controlledBy === 'human'),
      enemies: [enemy],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }
    const r = updateMulti(s, { a: NEUTRAL, b: NEUTRAL }, 16.67)
    expect(r.state.humans['a'].hp).toBe(0)
    expect(r.state.humans['a'].fsm).toBe('down')
    expect(r.state.status).toBe('playing') // b still alive
  })
})

// ── 5. gameOver when wand dies (as today) ───────────────────────────────────────

describe('wand death → gameOver in multi', () => {
  it('wand hp ≤ 0 ends the game even if humans are alive', () => {
    const base = createMultiInitialState([{ sessionId: 'a', charKey: 'werdum' }], 7)
    const enemy = mkEnemy(0, base.wand.x + 5, base.wand.y, {
      enemyType: 'strong' as const, hp: 9999, maxHp: 9999,
      fsm: 'waitBeforeAttack' as const, target: 'wand' as const, waitTimer: 0,
    })
    const s: MultiGameState = {
      ...base,
      allies: [],
      slots: base.slots.filter(sl => sl.controlledBy === 'human'),
      wand: { ...base.wand, hp: 5 },
      enemies: [enemy],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }
    const r = updateMulti(s, { a: NEUTRAL }, 16.67)
    expect(r.state.wand.hp).toBe(0)
    expect(r.state.status).toBe('gameover')
    expect(r.events.some(e => e.type === 'gameOver')).toBe(true)
  })
})

// ── 6. Event attribution ────────────────────────────────────────────────────────

describe('event attribution', () => {
  it('playerDamaged carries the sessionId of the hit human', () => {
    const base = createMultiInitialState(
      [
        { sessionId: 'a', charKey: 'werdum' },
        { sessionId: 'b', charKey: 'dida' },
      ],
      1,
    )
    const humans: Record<string, PlayerState> = {
      a: { ...base.humans['a'], x: 1000, y: 800, groundY: 800 },
      b: { ...base.humans['b'], x: 500, y: 800, groundY: 800 },
    }
    const enemy = mkEnemy(0, 1000 + 50, 800, {
      fsm: 'chasePlayer' as const, target: 'player' as const, attackCooldown: 0,
    })
    const s: MultiGameState = {
      ...base,
      humans,
      allies: [],
      slots: base.slots.filter(sl => sl.controlledBy === 'human'),
      enemies: [enemy],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }
    const r = updateMulti(s, { a: NEUTRAL, b: NEUTRAL }, 16.67)
    const dmg = r.events.find(e => e.type === 'playerDamaged') as any
    expect(dmg).toBeDefined()
    expect(dmg.sessionId).toBe('a')
  })
})

// ── 7. Determinism ──────────────────────────────────────────────────────────────

describe('determinism (2 humans, 60s)', () => {
  it('same seed + same input script → identical JSON state + event log', () => {
    const SEED = 0x5EED
    const TICKS = 3600 // 60s
    const dt = 16.67

    const script = (state: MultiGameState, t: number): MultiInput => {
      const out: MultiInput = {}
      for (const slot of state.slots) {
        if (slot.controlledBy !== 'human') continue
        const me = state.humans[slot.sessionId]
        const live = state.enemies.filter(e => !e.isDead)
        if (live.length === 0) { out[slot.sessionId] = { ...NEUTRAL }; continue }
        let nearest = live[0]; let nd = Infinity
        for (const e of live) {
          const d = Math.hypot(e.x - me.x, e.y - me.groundY)
          if (d < nd) { nd = d; nearest = e }
        }
        const dx = nearest.x - me.x
        const dy = nearest.y - me.groundY
        const close = Math.abs(dx) < 75 && Math.abs(dy) < 35
        out[slot.sessionId] = {
          up: dy < -10, down: dy > 10, left: dx < -10, right: dx > 10,
          block: (t % 100) < 15, punch: close, kick: false,
        }
      }
      return out
    }

    const run = (): { state: MultiGameState; events: SimEvent[] } => {
      let s = createMultiInitialState(
        [
          { sessionId: 'a', charKey: 'werdum' },
          { sessionId: 'b', charKey: 'thor' },
        ],
        SEED,
      )
      const events: SimEvent[] = []
      for (let t = 0; t < TICKS; t++) {
        const r = updateMulti(s, script(s, t), dt)
        s = r.state
        events.push(...r.events)
      }
      return { state: s, events }
    }

    const a = run()
    const b = run()
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state))
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events))
  })
})

// ── 8. Immutability ─────────────────────────────────────────────────────────────

describe('updateMulti immutability', () => {
  it('does not mutate the input state', () => {
    const base = createMultiInitialState(
      [
        { sessionId: 'a', charKey: 'werdum' },
        { sessionId: 'b', charKey: 'dida' },
      ],
      7,
    )
    const s: MultiGameState = {
      ...base,
      enemies: [
        mkEnemy(0, base.humans['a'].x + 60, base.humans['a'].groundY, { fsm: 'chasePlayer', target: 'player', attackCooldown: 0 }),
      ],
      wave: { ...base.wave, currentWave: 3, waveActive: true, spawnQueue: ['weak', 'strong'] },
    }
    const snapshot = structuredClone(s)
    updateMulti(s, { a: { ...NEUTRAL, punch: true }, b: { ...NEUTRAL, right: true } }, 16.67)
    expect(s).toEqual(snapshot)
  })
})

// ── 9. freeze guard ─────────────────────────────────────────────────────────────

describe('updateMulti freeze guard', () => {
  it('once status !== playing, update is a no-op returning the same state', () => {
    const base = createMultiInitialState([{ sessionId: 'a', charKey: 'werdum' }], 1)
    const over: MultiGameState = { ...base, status: 'gameover' }
    const r = updateMulti(over, { a: NEUTRAL }, 16.67)
    expect(r.state).toBe(over)
    expect(r.events).toEqual([])
  })
})

void mkInputs
void ENEMY_STATS

// ── 10. Wave scaling wired into updateMulti ─────────────────────────────────────

import { WAVES } from '../../src/core/config/waves'

describe('wave scaling wired into updateMulti', () => {
  // Helper: run enough ticks to guarantee wave 1 has started and at least the
  // first spawn has been enqueued (boot tick fires startNextWave, spawnTimer=800
  // so we tick 1 more tick of deltaMs=1000 to drain it).
  function bootToWave1(humanSlots: Parameters<typeof createMultiInitialState>[0], seed: number): MultiGameState {
    let s = createMultiInitialState(humanSlots, seed)
    const inputs: MultiInput = Object.fromEntries(humanSlots.map(h => [h.sessionId, NEUTRAL]))
    // First tick: boots wave 1 (startNextWave fills spawnQueue)
    const r = updateMulti(s, inputs, 16.67)
    return r.state
  }

  it('2 humans → wave 1 spawnQueue scales non-boss count sub-linearly (×1.6 ceil) before any spawns', () => {
    // wave 1: weak × 3. With 2 players → ceil(3 × 1.6) = 5 (playtest sub-linear scaling)
    const wave1 = WAVES.find(w => w.id === 1)!
    const baseCount = wave1.enemies.reduce((sum, g) => sum + g.count, 0) // 3
    const expected = Math.ceil(baseCount * (1 + 0.6 * (2 - 1))) // 5

    const s = bootToWave1(
      [{ sessionId: 'a', charKey: 'werdum' }, { sessionId: 'b', charKey: 'dida' }],
      42,
    )
    // spawnQueue length = total enemy count at start of wave (before any spawns fire)
    // We need the raw queue right after wave start, before any enemy actually spawns.
    // On the first updateMulti tick: wave boots (fills queue), then spawnTimer starts
    // at 800ms; with dt=16.67ms no spawn fires yet. So spawnQueue.length === expected.
    expect(s.wave.spawnQueue.length).toBe(expected)
  })

  it('3 humans → wave 1 spawnQueue scales non-boss count sub-linearly (×2.2 ceil)', () => {
    const wave1 = WAVES.find(w => w.id === 1)!
    const baseCount = wave1.enemies.reduce((sum, g) => sum + g.count, 0) // 3
    const expected = Math.ceil(baseCount * (1 + 0.6 * (3 - 1))) // ceil(3*2.2)=7

    const s = bootToWave1(
      [
        { sessionId: 'a', charKey: 'werdum' },
        { sessionId: 'b', charKey: 'dida' },
        { sessionId: 'c', charKey: 'thor' },
      ],
      42,
    )
    expect(s.wave.spawnQueue.length).toBe(expected)
  })

  it('boss wave (wave 8): boss stays at count 1, escort scales, for 2 humans', () => {
    // Skip to state at end of wave 7 (currentWave=7, waveActive=false, waveEndTimer=0)
    // so the next startNextWaveMulti call will start wave 8.
    const base = createMultiInitialState(
      [{ sessionId: 'a', charKey: 'werdum' }, { sessionId: 'b', charKey: 'dida' }],
      7,
    )
    const atWave7End: MultiGameState = {
      ...base,
      enemies: [],
      wave: {
        ...base.wave,
        currentWave: 7,
        waveActive: false,
        waveEndTimer: 0,
        spawnQueue: [],
      },
    }
    // One tick with deltaMs=1 triggers checkWaveEndMulti → waveEndTimer > 0 (or
    // directly triggers startNextWave if timer already 0 and wave inactive). Since
    // currentWave > 0, we rely on the waveEndTimer=0 path inside checkWaveEnd which
    // calls startNextWave.
    // Actually, checkWaveEnd only starts next wave when waveEndTimer reaches 0
    // from a countdown. When waveEndTimer IS already 0 AND !waveActive, it's the
    // initial "never started" case — it won't auto-advance. The clean way is to set
    // waveEndTimer to a small value so it ticks down.
    const withTimer: MultiGameState = {
      ...atWave7End,
      wave: { ...atWave7End.wave, waveEndTimer: 1 },
    }
    const inputs: MultiInput = { a: NEUTRAL, b: NEUTRAL }
    const r = updateMulti(withTimer, inputs, 16.67) // drains the 1ms timer → starts wave 8
    const s = r.state

    // wave 8: boss_coach × 1 + weak × 3.  With 2 players: boss_coach × 1, weak × ceil(3*1.6)=5
    const wave8 = WAVES.find(w => w.id === 8)!
    const bossOrigCount = wave8.enemies.find(g => g.type === 'boss_coach')!.count // 1
    const escortOrigCount = wave8.enemies.find(g => g.type === 'weak')!.count     // 3
    const expectedBoss = bossOrigCount           // 1 (no scaling)
    const expectedEscort = Math.ceil(escortOrigCount * (1 + 0.6 * (2 - 1))) // 5

    expect(s.wave.currentWave).toBe(8)
    // spawnQueue contains the full unspawned list
    const queue = s.wave.spawnQueue
    const bossCount = queue.filter(t => t === 'boss_coach').length
    const weakCount = queue.filter(t => t === 'weak').length
    expect(bossCount).toBe(expectedBoss)
    expect(weakCount).toBe(expectedEscort)
  })

  it('1 human → wave 1 spawnQueue length identical to single-player (equivalence)', () => {
    // single-player createInitialState + first update tick
    const sp0 = createInitialState('werdum', 99)
    const sp1 = update(sp0, NEUTRAL, 16.67)

    // multi with 1 human
    const mp0 = createMultiInitialState([{ sessionId: 'p1', charKey: 'werdum' }], 99)
    const mp1 = updateMulti(mp0, { p1: NEUTRAL }, 16.67)

    expect(mp1.state.wave.spawnQueue.length).toBe(sp1.state.wave.spawnQueue.length)
    expect(mp1.state.wave.currentWave).toBe(sp1.state.wave.currentWave)
  })
})

// ── 11. Blocking path coverage in multi ─────────────────────────────────────────

describe('blocking path in multi', () => {
  // weak enemy stats: damageToPlayer=10 (< 25, no knockdown), damageToWand=12
  // blocking: deals 1 chip damage, stagger attacker, no waveDamageTaken

  function makeBlockingState(
    humanHp: number,
    twoHumans: boolean,
  ): { s: MultiGameState; attackerSid: string; otherSid?: string } {
    const slots: Parameters<typeof createMultiInitialState>[0] = twoHumans
      ? [{ sessionId: 'p1', charKey: 'werdum' }, { sessionId: 'p2', charKey: 'dida' }]
      : [{ sessionId: 'p1', charKey: 'werdum' }]

    const base = createMultiInitialState(slots, 1)
    // Place p1 at x=1000, enemy right next to them (attackCooldown=0, chasePlayer)
    const humans = {
      ...base.humans,
      p1: { ...base.humans['p1'], hp: humanHp, x: 1000, y: 800, groundY: 800, isBlocking: true },
      ...(twoHumans ? { p2: { ...base.humans['p2'], hp: 100, x: 200, y: 800, groundY: 800 } } : {}),
    }
    const enemy = mkEnemy(0, 1000 + 50, 800, {
      fsm: 'chasePlayer' as const, target: 'player' as const, attackCooldown: 0,
    })
    const s: MultiGameState = {
      ...base,
      humans,
      allies: [],
      slots: base.slots.filter(sl => sl.controlledBy === 'human'),
      enemies: [enemy],
      wave: { ...base.wave, currentWave: 1, waveActive: true, spawnQueue: [] },
    }
    return { s, attackerSid: 'p1', ...(twoHumans ? { otherSid: 'p2' } : {}) }
  }

  it('blocking human (slot 2 of 2) takes chip damage (~15%, min 2), no waveDamageTaken, attacker staggered', () => {
    const { s } = makeBlockingState(50, true)
    const inputs: MultiInput = { p1: { ...NEUTRAL, block: true }, p2: NEUTRAL }
    const r = updateMulti(s, inputs, 16.67)

    // p1 takes chip damage: weak enemy (10 dmg) → max(1, round(10*0.1)) = 1 (playtest #5)
    expect(r.state.humans['p1'].hp).toBe(49)
    // no waveDamageTaken
    expect(r.state.wave.waveDamageTaken).toBe(false)
    // attacker is staggered
    expect(r.state.enemies[0].fsm).toBe('staggered')
    // sessionId attribution: no playerDamaged event on blocking path
    const dmg = r.events.find(e => e.type === 'playerDamaged')
    expect(dmg).toBeUndefined()
    // stagger event emitted
    const stagger = r.events.find(e => e.type === 'enemyStaggered')
    expect(stagger).toBeDefined()
  })

  it('blocking human at hp=1 → chip (1) → hp=0 → goes down; other human still alive → game continues', () => {
    const { s } = makeBlockingState(1, true)
    const inputs: MultiInput = { p1: { ...NEUTRAL, block: true }, p2: NEUTRAL }
    const r = updateMulti(s, inputs, 16.67)

    // p1 goes to hp=0 and fsm=down
    expect(r.state.humans['p1'].hp).toBe(0)
    expect(r.state.humans['p1'].fsm).toBe('down')
    // playerDown event emitted for p1
    const down = r.events.find(e => e.type === 'playerDown') as any
    expect(down).toBeDefined()
    expect(down.sessionId).toBe('p1')
    // p2 still alive → game continues
    expect(r.state.humans['p2'].hp).toBeGreaterThan(0)
    expect(r.state.status).toBe('playing')
  })
})

