import { Room, type Client } from '@colyseus/core'
import { ArenaState, PlayerNet, EnemyNet } from '../schema/ArenaState'
import {
  createMultiInitialState,
  updateMulti,
  type MultiGameState,
  type MultiInput,
  type HumanSlotSpec,
  type CharKey,
} from '../../../src/core/multi'
import type { MoveInput } from '../../../src/core/types'
import { generateRoomCode, releaseRoomCode } from '../util/roomCode'

const ALL_CHARS: ReadonlyArray<CharKey> = ['werdum', 'dida', 'thor']
const MAX_CLIENTS = 3

/** Logical simulation step — 20 ticks/s (the core runs at a fixed 50ms dt). */
const FIXED_DT = 50
/** Patch broadcast rate — also 50ms (20fps), the Colyseus 0.17 default, fixed explicitly. */
const PATCH_RATE = 50

/** FX-relevant events forwarded to clients via broadcast('events', ...). */
const FX_EVENT_TYPES = new Set<string>([
  'hit', 'enemyDied', 'attackSwung', 'enemyAttacked', 'playerDamaged',
  'wandDamaged', 'waveStarted', 'waveCleared', 'bossPhase2', 'comboMilestone',
  'victory', 'gameOver', 'playerKnockdown', 'playerDown', 'enemyStaggered',
  'enemyKnockdown', 'enemySpawned',
])

/** Per-client join metadata tracked in the lobby (before the match starts). */
interface JoinedPlayer {
  sessionId: string
  charKey: CharKey
}

/**
 * Authoritative arena room. Runs the pure co-op core (src/core/multi.ts) at a fixed
 * 20Hz on the server and projects the resulting MultiGameState into the synced
 * ArenaState Schema. Clients only ever send 'input' and 'ready' — they can never
 * mutate hp/score/wave; the server is the single source of truth.
 */
export class ArenaRoom extends Room<{ state: ArenaState }> {
  maxClients = MAX_CLIENTS

  /** Per-match deterministic seed (stored so a match is reproducible from its inputs). */
  private seed = 0
  /** Joined players in lobby order; the basis for human slot allocation at start. */
  private joined: JoinedPlayer[] = []
  /** Latest input per human sessionId — latest-wins each tick. */
  private inputs: MultiInput = {}
  /** The full server-side simulation state (null until the match starts). */
  private gameState: MultiGameState | null = null
  /** Fixed-step accumulator for the simulation interval. */
  private accumulatorMs = 0

  async onCreate(_options: unknown): Promise<void> {
    // Custom roomId recipe: docs.colyseus.io/recipes/custom-room-id
    // Generate a 4-letter A-Z code via Presence (collision-safe) and assign it
    // to this.roomId BEFORE the room is registered by the matchMaker.
    this.roomId = await generateRoomCode(this.presence)

    this.seed = Date.now() & 0xffffffff
    this.setState(new ArenaState())
    this.setPatchRate(PATCH_RATE)
    this.setSimulationInterval(dt => this.tick(dt))
  }

  onDispose(): void {
    // Release the room code back to the pool so it can be reused.
    releaseRoomCode(this.presence, this.roomId)
  }

  // ── Message registry — the ONLY messages the server accepts ──────────────────
  // 'input': latest-wins per tick, shape-validated (booleans only).
  // 'ready': any lobby client starts the match.
  // No 'sethp'/'setscore'/etc exists → clients are structurally unable to forge state.
  messages = {
    input: (client: Client, payload: unknown) => {
      const parsed = parseMoveInput(payload)
      if (parsed) this.inputs[client.sessionId] = parsed
    },
    ready: (client: Client) => this.tryStart(client),
  }

  onJoin(client: Client, options: { charKey?: string } | undefined): void {
    // Reject late joins once a match is running (reconnection is Task 8).
    if (this.gameState !== null) {
      throw new Error('match already in progress')
    }
    const charKey = this.allocateChar(options?.charKey)
    this.joined.push({ sessionId: client.sessionId, charKey })

    const net = new PlayerNet()
    net.sessionId = client.sessionId
    net.charKey = charKey
    net.connected = true
    this.state.players.set(client.sessionId, net)
  }

  onLeave(client: Client): void {
    const sid = client.sessionId
    delete this.inputs[sid]
    this.joined = this.joined.filter(p => p.sessionId !== sid)

    if (this.gameState === null) {
      // Lobby phase: just drop the player entirely.
      this.state.players.delete(sid)
      return
    }
    // Mid-match (Task 8 will add reconnection). Simplest correct co-op behavior:
    // the human's slot stays in the simulation but receives no further input, so the
    // character goes inert (NEUTRAL_INPUT each tick) and enemies stop targeting it
    // once it is knocked down. We mark connected=false for the HUD; the slot human
    // is left in place so the wave/enemy bookkeeping is unchanged. The match ends
    // naturally if all remaining humans go down or the wand dies.
    const net = this.state.players.get(sid)
    if (net) net.connected = false
  }

  // ── Lobby → match start ──────────────────────────────────────────────────────

  private tryStart(_client: Client): void {
    if (this.gameState !== null) return // already started
    if (this.joined.length === 0) return

    const humanSlots: HumanSlotSpec[] = this.joined.map(p => ({
      sessionId: p.sessionId,
      charKey: p.charKey,
    }))
    this.gameState = createMultiInitialState(humanSlots, this.seed)
    this.accumulatorMs = 0
    this.projectState()
    this.state.status = 'playing'
  }

  /** Pick the requested char if free, else the first free character (auto-assign). */
  private allocateChar(requested: string | undefined): CharKey {
    const taken = new Set(this.joined.map(p => p.charKey))
    if (isCharKey(requested) && !taken.has(requested)) return requested
    const free = ALL_CHARS.find(c => !taken.has(c))
    if (!free) throw new Error('no free character slot')
    return free
  }

  // ── Fixed-step simulation ────────────────────────────────────────────────────

  private tick(deltaMs: number): void {
    if (this.gameState === null) return
    this.accumulatorMs += deltaMs

    const batchedEvents: unknown[] = []
    // Guard against spiral-of-death on long stalls.
    let steps = 0
    while (this.accumulatorMs >= FIXED_DT && steps < 8) {
      this.accumulatorMs -= FIXED_DT
      steps++
      const { state, events } = updateMulti(this.gameState, this.inputs, FIXED_DT)
      this.gameState = state
      for (const ev of events) {
        if (FX_EVENT_TYPES.has((ev as { type: string }).type)) batchedEvents.push(ev)
      }
    }

    if (steps > 0) {
      this.projectState()
      if (batchedEvents.length > 0) this.broadcast('events', batchedEvents)
    }
  }

  // ── MultiGameState → ArenaState projection ───────────────────────────────────

  private projectState(): void {
    const g = this.gameState
    if (!g) return
    const st = this.state

    st.status = g.status
    st.wave = g.wave.currentWave
    st.spawnQueueLen = g.wave.spawnQueue.length
    st.wandHp = g.wand.hp
    st.wandMaxHp = g.wand.maxHp
    st.wandX = g.wand.x
    st.wandY = g.wand.y
    st.score = g.score.score
    st.comboCount = g.score.comboCount

    // Players (humans) — keyed map, update-in-place to minimise patch churn.
    for (const [sid, human] of Object.entries(g.humans)) {
      let net = st.players.get(sid)
      if (!net) {
        net = new PlayerNet()
        net.sessionId = sid
        net.charKey = human.charKey
        st.players.set(sid, net)
      }
      net.x = human.x
      net.y = human.y
      net.hp = human.hp
      net.maxHp = human.maxHp
      net.fsm = human.fsm
      net.facing = human.facing
    }

    // Enemies — array projection. The core enemy list churns (spawn/die) every tick;
    // we reconcile by id: keep existing EnemyNet entries (stable identity for client
    // interpolation), update them, append new ones, and drop the tail for despawns.
    const live = g.enemies.filter(e => !e.isDead)
    const byId = new Map<number, EnemyNet>()
    for (const e of st.enemies) byId.set(e.id, e)

    const next: EnemyNet[] = []
    for (const e of live) {
      let net = byId.get(e.id)
      if (!net) {
        net = new EnemyNet()
        net.id = e.id
        net.enemyType = e.enemyType
        net.isBoss = e.isBoss
        net.maxHp = e.maxHp
      }
      net.x = e.x
      net.y = e.y
      net.hp = e.hp
      net.fsm = e.fsm
      next.push(net)
    }
    // Replace the ArraySchema contents in-place.
    st.enemies.splice(0, st.enemies.length, ...next)
  }
}

// ── Input parsing / validation (manual guard — no zod dependency) ──────────────

/** Coerce an unknown payload into a MoveInput, or null if structurally invalid. */
function parseMoveInput(payload: unknown): MoveInput | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  const keys: (keyof MoveInput)[] = ['up', 'down', 'left', 'right', 'block', 'punch', 'kick']
  const out = {} as MoveInput
  for (const k of keys) {
    const v = p[k]
    if (v !== undefined && typeof v !== 'boolean') return null // reject non-boolean fields
    out[k] = v === true
  }
  return out
}

function isCharKey(v: unknown): v is CharKey {
  return v === 'werdum' || v === 'dida' || v === 'thor'
}
