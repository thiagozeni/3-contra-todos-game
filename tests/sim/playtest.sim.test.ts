// ─────────────────────────────────────────────────────────────────────────────
// HEADLESS PLAYTEST HARNESS (Codex-style simulated players)
//
// Drives the REAL game core (src/core — the same sim the co-op server runs) with
// scripted "player personas" to play full matches start→finish, single-player and
// co-op (2p / 3p), then dumps telemetry to _work/playtest/ for analysis agents.
//
// NOT real user testing — these are heuristic input policies (my model of player
// archetypes), so reports must frame findings as "simulated-player telemetry".
//
// Run explicitly:  PLAYTEST=1 npx vitest run tests/sim/playtest.sim.test.ts
// Skipped by the normal suite (env guard) so it never slows `npx vitest run`.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import {
  createMultiInitialState,
  updateMulti,
  type MultiGameState,
  type MultiInput,
  type HumanSlotSpec,
  type CharKey,
} from '../../src/core/multi'
import type { MoveInput, EnemyState, PlayerState, SimEvent } from '../../src/core/types'
import { PLAYER_STATS } from '../../src/core/config/stats'

const FIXED_DT = 50 // ms — matches the server's fixed timestep (20 ticks/s)
const MAX_TICKS = 24000 // ~20 min of game time — safety cap so a stuck match can't hang
const NEUTRAL: MoveInput = { up: false, down: false, left: false, right: false, block: false, punch: false, kick: false }

// ── Deterministic per-run RNG (so personas vary but runs are reproducible) ──────
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// ── Persona model ───────────────────────────────────────────────────────────────
// A persona maps (state, my sessionId, rng) → MoveInput each tick.
interface Persona {
  key: string
  label: string
  // 0..1 — chance per tick of doing the "smart" thing; lower = sloppier human.
  skill: number
  // 0..1 — tendency to block when an enemy is winding up an attack nearby.
  block: number
  // 0..1 — tendency to guard the wand (stay between enemies and the protected char).
  guardWand: number
  // 'kick'|'punch'|'mix' — preferred attack.
  attack: 'kick' | 'punch' | 'mix'
  // true = mashes attacks even out of range (unskilled).
  mash: boolean
}

const PERSONAS: Persona[] = [
  { key: 'aggressive', label: 'Agressivo (rush)',        skill: 0.92, block: 0.05, guardWand: 0.1, attack: 'mix',   mash: false },
  { key: 'defensive',  label: 'Defensivo (turtle)',       skill: 0.88, block: 0.7,  guardWand: 0.6, attack: 'punch', mash: false },
  { key: 'masher',     label: 'Button-masher (novato)',   skill: 0.45, block: 0.15, guardWand: 0.0, attack: 'mix',   mash: true  },
  { key: 'kiter',      label: 'Cauteloso (kiter)',        skill: 0.85, block: 0.45, guardWand: 0.3, attack: 'kick',  mash: false },
  { key: 'guardian',   label: 'Guardião do wand',         skill: 0.8,  block: 0.4,  guardWand: 0.9, attack: 'mix',   mash: false },
]

function isEnemyAlive(e: EnemyState): boolean {
  return !e.isDead && e.fsm !== 'dead'
}
function isPlayerActable(p: PlayerState): boolean {
  return p.fsm === 'normal' || p.fsm === 'blocking'
}

// Pick a target to ATTACK: prefer staggered enemies (free damage, no counter),
// skip knocked-down ones (immune in V1), then nearest live enemy. Guardians bias
// toward enemies heading for the wand.
function pickTarget(me: PlayerState, enemies: EnemyState[], preferWand: boolean, wand: { x: number; y: number }): EnemyState | null {
  let best: EnemyState | null = null
  let bestScore = Infinity
  for (const e of enemies) {
    if (!isEnemyAlive(e)) continue
    if (e.fsm === 'knockdown') continue // immune to damage — don't waste swings on it
    const refX = preferWand && e.target === 'wand' ? wand.x : me.x
    const refY = preferWand && e.target === 'wand' ? wand.y : me.y
    let d = Math.hypot(e.x - refX, e.y - refY)
    if (e.fsm === 'staggered') d -= 400 // strongly prefer free-hit windows
    if (d < bestScore) { bestScore = d; best = e }
  }
  return best
}

// Is some enemy about to hit ME this/next tick? (block window)
function imminentThreat(me: PlayerState, enemies: EnemyState[]): boolean {
  for (const e of enemies) {
    if (!isEnemyAlive(e)) continue
    if (e.target !== 'player') continue
    const adx = Math.abs(e.x - me.x)
    const ady = Math.abs(e.y - me.y)
    if (adx <= 150 && ady <= 70 && (e.fsm === 'chasePlayer' || e.fsm === 'approach')) return true
  }
  return false
}

interface Mem { retreatTicks: number }

// Build one tick of input for a persona controlling `me`.
// Core skilled loop discovered in the engine: BLOCK an incoming hit (1 dmg instead
// of 10–35, and it STAGGERS the attacker), then punish the staggered enemy.
function decide(p: Persona, me: PlayerState, enemies: EnemyState[], wand: { x: number; y: number }, rng: () => number, mem: Mem): MoveInput {
  if (!isPlayerActable(me)) return NEUTRAL

  const stats = PLAYER_STATS[me.charKey] ?? PLAYER_STATS.werdum
  const reachH = p.attack === 'kick' ? stats.kickReach : stats.punchReach
  const rangeV = 44

  // ── 1. Reactive block: skilled players block imminent hits almost always. ──
  // Masher rarely blocks; others block with prob ≈ skill when a hit is incoming.
  if (!p.mash && imminentThreat(me, enemies)) {
    const blockProb = Math.max(p.block, p.skill * 0.9)
    if (rng() < blockProb) return { ...NEUTRAL, block: true }
  }

  const target = pickTarget(me, enemies, p.guardWand > 0.5, wand)
  if (!target) {
    // Between waves: reposition toward the wand if guarding, else idle.
    if (p.guardWand > 0.4) {
      return { ...NEUTRAL, left: wand.x < me.x - 10, right: wand.x > me.x + 10, up: wand.y < me.y - 10, down: wand.y > me.y + 10 }
    }
    return NEUTRAL
  }

  const dx = target.x - me.x
  const dy = target.y - me.y
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  const smart = rng() < p.skill
  const inRange = adx <= reachH && ady <= rangeV
  const move: MoveInput = { ...NEUTRAL }

  // ── 2. Spacing: hit-and-retreat. After an attack, kiter/defensive back off a
  // few ticks so they don't eat the enemy's recovery counter. ──
  if (mem.retreatTicks > 0) {
    mem.retreatTicks--
    // Move away from the target while staying roughly aligned (face it).
    if (dx < 0) move.right = true; else move.left = true
    return move
  }

  // ── 3. Approach + face the target (facing must point at it for hits to land). ──
  if (adx > reachH * 0.75) {
    if (dx < 0) move.left = true; else move.right = true
  } else {
    if (dx < 0) move.left = true; else if (dx > 0) move.right = true
  }
  if (ady > rangeV) {
    if (dy < 0) move.up = true; else move.down = true
  }

  // Sloppy movement: masher/low-skill sometimes jitters the wrong way.
  if (!smart && p.mash) {
    move.left = rng() < 0.5; move.right = !move.left && rng() < 0.5
    move.up = rng() < 0.3; move.down = !move.up && rng() < 0.3
  }

  // ── 4. Attack. Staggered target = free hit; otherwise commit when in range. ──
  const free = target.fsm === 'staggered'
  const wantAttack = p.mash ? rng() < 0.8 : ((inRange || free) && (smart || free))
  if (wantAttack && me.attackCooldown <= 0 && (inRange || free || p.mash)) {
    const useKick = p.attack === 'kick' ? true : p.attack === 'punch' ? false : rng() < 0.4
    if (useKick) move.kick = true; else move.punch = true
    // Defensive/kiter personas peel off after committing (hit-and-run).
    if (!free && (p.key === 'kiter' || p.key === 'defensive')) mem.retreatTicks = 3
  }
  return move
}

// ── Telemetry ────────────────────────────────────────────────────────────────
interface MatchResult {
  scenario: string
  mode: 'single' | 'coop2' | 'coop3'
  seed: number
  slots: { sessionId: string; charKey: CharKey; persona: string }[]
  result: 'victory' | 'gameover' | 'timeout'
  waveReached: number
  durationMs: number
  score: number
  enemiesDefeated: number
  maxCombo: number
  wandHpStart: number
  wandHpEnd: number
  wandDamageTaken: number
  // per-human aggregates
  perPlayer: Record<string, {
    charKey: string; persona: string
    damageDealt: number; damageTaken: number
    punches: number; kicks: number; hitsLanded: number; whiffs: number
    knockdowns: number; downs: number; died: boolean
  }>
  allyHits: number
  // per-wave: ms spent and damage the wand+players took
  waves: { wave: number; durationMs: number; flawless: boolean }[]
  gameOverWave: number | null
}

function simulateMatch(scenario: string, mode: MatchResult['mode'], slots: { sessionId: string; charKey: CharKey; persona: Persona }[], seed: number): MatchResult {
  const humanSlots: HumanSlotSpec[] = slots.map(s => ({ sessionId: s.sessionId, charKey: s.charKey }))
  let state: MultiGameState = createMultiInitialState(humanSlots, seed)
  const rng = makeRng(seed * 7919 + 13)

  const per: MatchResult['perPlayer'] = {}
  for (const s of slots) {
    per[s.sessionId] = {
      charKey: s.charKey, persona: s.persona.key,
      damageDealt: 0, damageTaken: 0, punches: 0, kicks: 0, hitsLanded: 0, whiffs: 0,
      knockdowns: 0, downs: 0, died: false,
    }
  }
  let allyHits = 0
  let wandDamageTaken = 0
  const wandHpStart = state.wand.hp
  const waves: MatchResult['waves'] = []
  let curWaveStart = 0
  let curWave = 0
  let gameOverWave: number | null = null

  const mem: Record<string, Mem> = {}
  for (const s of slots) mem[s.sessionId] = { retreatTicks: 0 }

  let ticks = 0
  while (state.status === 'playing' && ticks < MAX_TICKS) {
    const inputs: MultiInput = {}
    for (const s of slots) {
      inputs[s.sessionId] = decide(s.persona, state.humans[s.sessionId], state.enemies, state.wand, rng, mem[s.sessionId])
    }
    const { state: next, events } = updateMulti(state, inputs, FIXED_DT)
    state = next
    ticks++

    for (const ev of events as SimEvent[]) {
      switch (ev.type) {
        case 'attackSwung': {
          const pp = ev.sessionId ? per[ev.sessionId] : null
          if (pp) {
            if (ev.kind === 'punch') pp.punches++; else pp.kicks++
            if (!ev.hit) pp.whiffs++
          }
          break
        }
        case 'hit': {
          if (ev.source === 'ally') { allyHits++; break }
          const pp = ev.sessionId ? per[ev.sessionId] : null
          if (pp) { pp.damageDealt += ev.amount; pp.hitsLanded++ }
          break
        }
        case 'playerDamaged': {
          const pp = ev.sessionId ? per[ev.sessionId] : null
          if (pp) pp.damageTaken += ev.amount
          break
        }
        case 'playerKnockdown': { const pp = ev.sessionId ? per[ev.sessionId] : null; if (pp) pp.knockdowns++; break }
        case 'playerDown': { const pp = per[ev.sessionId]; if (pp) pp.downs++; break }
        case 'wandDamaged': { wandDamageTaken += ev.amount; break }
        case 'waveStarted': { curWave = ev.wave; curWaveStart = state.gameTimerMs; break }
        case 'waveCleared': {
          waves.push({ wave: ev.wave, durationMs: state.gameTimerMs - curWaveStart, flawless: ev.flawless })
          break
        }
        case 'gameOver': { gameOverWave = curWave; break }
        default: break
      }
    }
  }

  for (const s of slots) {
    per[s.sessionId].died = !(state.humans[s.sessionId].hp > 0)
  }

  const result: MatchResult['result'] =
    state.status === 'victory' ? 'victory' : state.status === 'gameover' ? 'gameover' : 'timeout'

  return {
    scenario, mode, seed,
    slots: slots.map(s => ({ sessionId: s.sessionId, charKey: s.charKey, persona: s.persona.key })),
    result,
    waveReached: state.wave.currentWave,
    durationMs: state.gameTimerMs,
    score: state.score.score,
    enemiesDefeated: state.score.enemiesDefeated,
    maxCombo: state.score.maxComboReached,
    wandHpStart, wandHpEnd: state.wand.hp, wandDamageTaken,
    perPlayer: per,
    allyHits,
    waves,
    gameOverWave,
  }
}

// ── Batch plan ───────────────────────────────────────────────────────────────
const CHARS: CharKey[] = ['werdum', 'dida', 'thor']
const SEEDS = [101, 202, 303, 404, 505, 606, 707, 808, 909, 111]
const personaByKey = (k: string) => PERSONAS.find(p => p.key === k)!

function buildBatches() {
  const matches: { scenario: string; mode: MatchResult['mode']; slots: { sessionId: string; charKey: CharKey; persona: Persona }[]; seed: number }[] = []

  // Single-player: every char × every persona × every seed.
  for (const c of CHARS) for (const p of PERSONAS) for (const seed of SEEDS) {
    matches.push({ scenario: `single-${c}-${p.key}`, mode: 'single', seed, slots: [{ sessionId: 'p1', charKey: c, persona: p }] })
  }

  // Co-op 2p: a representative spread of char pairs × persona mixes × seeds.
  const pairs: [CharKey, CharKey][] = [['werdum', 'dida'], ['werdum', 'thor'], ['dida', 'thor']]
  const mix2: [string, string][] = [['aggressive', 'guardian'], ['aggressive', 'aggressive'], ['masher', 'masher'], ['defensive', 'kiter']]
  for (const [a, b] of pairs) for (const [pa, pb] of mix2) for (const seed of SEEDS) {
    matches.push({
      scenario: `coop2-${a}+${b}-${pa}+${pb}`, mode: 'coop2', seed,
      slots: [{ sessionId: 'p1', charKey: a, persona: personaByKey(pa) }, { sessionId: 'p2', charKey: b, persona: personaByKey(pb) }],
    })
  }

  // Co-op 3p: all three chars × persona mixes × seeds.
  const mix3: [string, string, string][] = [
    ['aggressive', 'guardian', 'aggressive'],
    ['aggressive', 'aggressive', 'aggressive'],
    ['masher', 'masher', 'masher'],
    ['defensive', 'guardian', 'kiter'],
  ]
  for (const [pa, pb, pc] of mix3) for (const seed of SEEDS) {
    matches.push({
      scenario: `coop3-${pa}+${pb}+${pc}`, mode: 'coop3', seed,
      slots: [
        { sessionId: 'p1', charKey: 'werdum', persona: personaByKey(pa) },
        { sessionId: 'p2', charKey: 'dida', persona: personaByKey(pb) },
        { sessionId: 'p3', charKey: 'thor', persona: personaByKey(pc) },
      ],
    })
  }
  return matches
}

const RUN = !!process.env.PLAYTEST
;(RUN ? describe : describe.skip)('headless playtest batches', () => {
  it('runs all matches and dumps telemetry', () => {
    const batches = buildBatches()
    const runs: MatchResult[] = []
    for (const b of batches) {
      runs.push(simulateMatch(b.scenario, b.mode, b.slots, b.seed))
    }

    // ── Aggregates ──
    const byMode: Record<string, { n: number; victories: number; gameovers: number; timeouts: number; avgWave: number; avgDurationS: number; avgScore: number; wandSurvivalRate: number }> = {}
    for (const m of ['single', 'coop2', 'coop3']) {
      const g = runs.filter(r => r.mode === m)
      byMode[m] = {
        n: g.length,
        victories: g.filter(r => r.result === 'victory').length,
        gameovers: g.filter(r => r.result === 'gameover').length,
        timeouts: g.filter(r => r.result === 'timeout').length,
        avgWave: +(g.reduce((s, r) => s + r.waveReached, 0) / g.length).toFixed(2),
        avgDurationS: +(g.reduce((s, r) => s + r.durationMs, 0) / g.length / 1000).toFixed(1),
        avgScore: Math.round(g.reduce((s, r) => s + r.score, 0) / g.length),
        wandSurvivalRate: +(g.filter(r => r.wandHpEnd > 0).length / g.length).toFixed(2),
      }
    }

    // Where do runs die? (gameover wave histogram)
    const deathWaves: Record<number, number> = {}
    for (const r of runs) if (r.gameOverWave != null) deathWaves[r.gameOverWave] = (deathWaves[r.gameOverWave] ?? 0) + 1

    // Per-persona win rate (single-player only, cleanest signal).
    const perPersona: Record<string, { runs: number; winRate: number; avgWave: number }> = {}
    for (const p of PERSONAS) {
      const g = runs.filter(r => r.mode === 'single' && r.slots[0].persona === p.key)
      if (g.length) perPersona[p.key] = {
        runs: g.length,
        winRate: +(g.filter(r => r.result === 'victory').length / g.length).toFixed(2),
        avgWave: +(g.reduce((s, r) => s + r.waveReached, 0) / g.length).toFixed(2),
      }
    }

    // Per-char win rate (single-player).
    const perChar: Record<string, { winRate: number; avgWave: number; avgDmgDealt: number; avgDmgTaken: number }> = {}
    for (const c of CHARS) {
      const g = runs.filter(r => r.mode === 'single' && r.slots[0].charKey === c)
      const dd = g.map(r => r.perPlayer['p1'].damageDealt)
      const dt = g.map(r => r.perPlayer['p1'].damageTaken)
      perChar[c] = {
        winRate: +(g.filter(r => r.result === 'victory').length / g.length).toFixed(2),
        avgWave: +(g.reduce((s, r) => s + r.waveReached, 0) / g.length).toFixed(2),
        avgDmgDealt: Math.round(dd.reduce((a, b) => a + b, 0) / dd.length),
        avgDmgTaken: Math.round(dt.reduce((a, b) => a + b, 0) / dt.length),
      }
    }

    // Avg per-wave clear time across all runs that reached each wave.
    const waveTimes: Record<number, { samples: number; avgClearS: number; flawlessRate: number }> = {}
    const waveAgg: Record<number, { total: number; n: number; flawless: number }> = {}
    for (const r of runs) for (const w of r.waves) {
      waveAgg[w.wave] ??= { total: 0, n: 0, flawless: 0 }
      waveAgg[w.wave].total += w.durationMs
      waveAgg[w.wave].n++
      if (w.flawless) waveAgg[w.wave].flawless++
    }
    for (const k of Object.keys(waveAgg)) {
      const a = waveAgg[+k]
      waveTimes[+k] = { samples: a.n, avgClearS: +(a.total / a.n / 1000).toFixed(1), flawlessRate: +(a.flawless / a.n).toFixed(2) }
    }

    const summary = {
      generatedTicksDt: FIXED_DT,
      totalMatches: runs.length,
      byMode,
      deathWaves,
      perPersonaSingle: perPersona,
      perCharSingle: perChar,
      waveTimes,
      personas: PERSONAS,
    }

    mkdirSync('_work/playtest', { recursive: true })
    writeFileSync('_work/playtest/runs.json', JSON.stringify(runs, null, 2))
    writeFileSync('_work/playtest/summary.json', JSON.stringify(summary, null, 2))

    // Human-readable digest for quick eyeballing + the analysis agents.
    const lines: string[] = []
    lines.push('# Playtest telemetry — digest\n')
    lines.push(`Total de partidas simuladas: **${runs.length}** (dt=${FIXED_DT}ms / 20 tps; core real do jogo).\n`)
    lines.push('## Por modo')
    lines.push('| modo | n | vitórias | game-overs | timeouts | wave média | duração média (s) | score médio | wand sobrevive |')
    lines.push('|---|---|---|---|---|---|---|---|---|')
    for (const m of ['single', 'coop2', 'coop3']) {
      const x = byMode[m]
      lines.push(`| ${m} | ${x.n} | ${x.victories} | ${x.gameovers} | ${x.timeouts} | ${x.avgWave} | ${x.avgDurationS} | ${x.avgScore} | ${(x.wandSurvivalRate * 100).toFixed(0)}% |`)
    }
    lines.push('\n## Single-player — por personagem')
    lines.push('| char | win rate | wave média | dano dado (méd) | dano tomado (méd) |')
    lines.push('|---|---|---|---|---|')
    for (const c of CHARS) { const x = perChar[c]; lines.push(`| ${c} | ${(x.winRate * 100).toFixed(0)}% | ${x.avgWave} | ${x.avgDmgDealt} | ${x.avgDmgTaken} |`) }
    lines.push('\n## Single-player — por persona')
    lines.push('| persona | win rate | wave média |')
    lines.push('|---|---|---|')
    for (const p of PERSONAS) { const x = perPersona[p.key]; if (x) lines.push(`| ${p.label} | ${(x.winRate * 100).toFixed(0)}% | ${x.avgWave} |`) }
    lines.push('\n## Tempo de clear por wave (todas as partidas)')
    lines.push('| wave | amostras | clear médio (s) | flawless % |')
    lines.push('|---|---|---|---|')
    for (const k of Object.keys(waveTimes).map(Number).sort((a, b) => a - b)) {
      const x = waveTimes[k]; lines.push(`| ${k} | ${x.samples} | ${x.avgClearS} | ${(x.flawlessRate * 100).toFixed(0)}% |`)
    }
    lines.push('\n## Onde as partidas morrem (histograma de wave do game-over)')
    lines.push('| wave | game-overs |')
    lines.push('|---|---|')
    for (const k of Object.keys(deathWaves).map(Number).sort((a, b) => a - b)) lines.push(`| ${k} | ${deathWaves[k]} |`)
    writeFileSync('_work/playtest/telemetry-summary.md', lines.join('\n') + '\n')

    expect(runs.length).toBeGreaterThan(0)
    // Sanity: at least SOME damage was dealt and SOME wave cleared across the batch,
    // otherwise the personas aren't actually playing and telemetry is garbage.
    const totalHits = runs.reduce((s, r) => s + Object.values(r.perPlayer).reduce((a, p) => a + p.hitsLanded, 0), 0)
    const totalWaves = runs.reduce((s, r) => s + r.waves.length, 0)
    expect(totalHits).toBeGreaterThan(0)
    expect(totalWaves).toBeGreaterThan(0)
  }, 600000)
})
