import { Room, type Client } from '@colyseus/core'
import { ArenaState, PlayerNet, EnemyNet, AllyNet } from '../schema/ArenaState'
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
import { getVerifier, type EntitlementVerifier, type CreateOptions } from '../entitlement/EntitlementVerifier'

const MAX_CLIENTS = 3

/** Logical simulation step — 20 ticks/s (the core runs at a fixed 50ms dt). */
const FIXED_DT = 50
/** Patch broadcast rate — also 50ms (20fps), the Colyseus 0.17 default, fixed explicitly. */
const PATCH_RATE = 50

/**
 * Arcade beat: once ALL players are confirmed, wait this long before auto-starting so
 * everyone sees the "all locked in" state for a moment (classic arcade feel). A player
 * may still 'unconfirm' within this window to cancel the start.
 */
const AUTO_START_DELAY_MS = 1000

/** FX-relevant events forwarded to clients via broadcast('events', ...). */
const FX_EVENT_TYPES = new Set<string>([
  'hit', 'enemyDied', 'attackSwung', 'enemyAttacked', 'playerDamaged',
  'wandDamaged', 'waveStarted', 'waveCleared', 'bossPhase2', 'comboMilestone',
  'victory', 'gameOver', 'playerKnockdown', 'playerDown', 'enemyStaggered',
  'enemyKnockdown', 'enemySpawned',
])

/** Per-client join metadata tracked in the lobby (preserves join order for slot allocation). */
interface JoinedPlayer {
  sessionId: string
  /** Slot index assigned at join time — stable for the lifetime of the session. */
  slotIndex: number
}

/**
 * Authoritative arena room. Runs the pure co-op core (src/core/multi.ts) at a fixed
 * 20Hz on the server and projects the resulting MultiGameState into the synced
 * ArenaState Schema. Clients only ever send 'input' and 'ready' — they can never
 * mutate hp/score/wave; the server is the single source of truth.
 */
export class ArenaRoom extends Room<{ state: ArenaState }> {
  maxClients = MAX_CLIENTS

  /**
   * Entitlement verifier — determines if a client may create (host) a room.
   * Defaults to getVerifier() (env-driven). Can be injected in tests.
   * JOIN (joinById) is NEVER gated — only onCreate checks this.
   */
  entitlementVerifier: EntitlementVerifier = getVerifier()

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
  /** Pending auto-start timer (set when all confirmed; cleared on unconfirm/leave). */
  private autoStartTimer: ReturnType<typeof setTimeout> | null = null

  async onCreate(options: unknown): Promise<void> {
    // ── Host gate (Fatia 4: premium/free dual-app) ────────────────────────────
    // The entitlement claim is sent by the client in create-options.
    // AllowAllEntitlementVerifier (default when HOST_GATE_ENABLED !== 'true') passes
    // every claim — keeps beta web and dev open.
    // PremiumOnlyEntitlementVerifier (HOST_GATE_ENABLED=true) rejects 'free'/absent.
    // JOIN (joinById) never reaches onCreate — it is never gated.
    const opts = (options ?? {}) as CreateOptions
    if (!this.entitlementVerifier.canHost(opts)) {
      throw new Error('hosting requer o app premium')
    }

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
    // Cancel any pending auto-start beat.
    this.cancelAutoStart()
    // Release the room code back to the pool so it can be reused.
    releaseRoomCode(this.presence, this.roomId)
  }

  // ── Message registry — the ONLY messages the server accepts ──────────────────
  // 'input':       latest-wins per tick, shape-validated (booleans only).
  // 'selectChar':  arcade selector — set this player's cursor pick (validated + lock).
  // 'confirmChar': arcade selector — lock in the current pick.
  // 'unconfirm':   arcade selector — release the lock (allow changing before start).
  // 'ready':       legacy manual start — only fires once all players confirmed.
  // No 'sethp'/'setscore'/etc exists → clients are structurally unable to forge state.
  messages = {
    input: (client: Client, payload: unknown) => {
      const parsed = parseMoveInput(payload)
      if (parsed) this.inputs[client.sessionId] = parsed
    },
    selectChar: (client: Client, payload: unknown) => this.handleSelectChar(client, payload),
    confirmChar: (client: Client) => this.handleConfirmChar(client),
    unconfirm: (client: Client) => this.handleUnconfirm(client),
    ready: (client: Client) => this.tryStart(client),
  }

  onJoin(client: Client, options: { charKey?: string } | undefined): void {
    // Reject late joins once a match is running (reconnection uses allowReconnection
    // path via reconnectionToken, not a fresh onJoin).
    if (this.gameState !== null) {
      throw new Error('match already in progress')
    }

    // FB4: assign a stable slotIndex at join time — lowest free index so P-numbers never
    // reshuffle when a player leaves. The index is 0-based and is the single source of
    // truth for P1/P2/P3 in both the lobby selector and the in-game indicator.
    const usedIndices = new Set(this.joined.map(p => p.slotIndex))
    let slotIndex = 0
    while (usedIndices.has(slotIndex)) slotIndex++

    // FB3: the arcade selector handles character assignment IN THE LOBBY. The join-time
    // charKey option is now only an initial CURSOR HINT — it does NOT take the character
    // (a real pick requires an explicit 'selectChar' message). selectedChar starts empty.
    this.joined.push({ sessionId: client.sessionId, slotIndex })

    const net = new PlayerNet()
    net.sessionId = client.sessionId
    net.charKey = ''
    net.selectedChar = ''
    net.confirmed = false
    net.connected = true
    net.slotIndex = slotIndex
    this.state.players.set(client.sessionId, net)

    // A new (unconfirmed) player just arrived — they now count toward the all-confirmed
    // gate, so cancel any pending auto-start that was armed for the previous roster.
    // Without this, a player joining inside the 1s beat would be excluded from the match.
    this.evaluateAutoStart()
  }

  /**
   * onDrop — fires on non-consented connection loss (abnormal close / network drop).
   * Opens a 60-second reconnection window: the player slot is kept in the simulation
   * but receives no inputs (character goes inert / NEUTRAL each tick). Stale held-key
   * inputs are cleared immediately to prevent the character from drifting.
   */
  onDrop(client: Client): void {
    const sid = client.sessionId

    // Open the reconnection window (60s).
    this.allowReconnection(client, 60)

    // Clear stale inputs immediately — held keys must not keep the character moving.
    delete this.inputs[sid]

    // Mark disconnected in the synced state (HUD shows 'offline' indicator).
    const net = this.state.players.get(sid)
    if (net) net.connected = false

    // Lobby phase: a dropped player no longer counts toward the all-confirmed gate.
    // Re-evaluate so the remaining confirmed players can still auto-start.
    if (this.gameState === null) this.evaluateAutoStart()

    // The core slot stays in the simulation; the character goes inert because
    // inputs[sid] is absent and updateMulti falls back to NEUTRAL_INPUT.
    // No wave rescaling here — the slot count is unchanged until the window expires.
  }

  /**
   * onReconnect — fires when the client successfully reconnects within the window.
   * Restores connected=true so the HUD is updated; the core simulation is already
   * ticking with the slot in place, so no further work is needed.
   */
  onReconnect(client: Client): void {
    const net = this.state.players.get(client.sessionId)
    if (net) net.connected = true
  }

  /**
   * onLeave — fires in two situations:
   *   1. Consented leave (room.leave(true) from the client).
   *   2. Reconnection window expired (CloseCode.FAILED_TO_RECONNECT).
   *
   * In both cases the player is permanently removed. Their core slot is updated
   * so future wave scaling uses the correct human count.
   */
  onLeave(client: Client): void {
    const sid = client.sessionId
    delete this.inputs[sid]
    this.joined = this.joined.filter(p => p.sessionId !== sid)

    // Remove from synced state unconditionally.
    this.state.players.delete(sid)

    if (this.gameState === null) {
      // Lobby phase: the leaver no longer counts toward the all-confirmed gate, and
      // their character is freed. Re-evaluate so the rest can still auto-start.
      this.evaluateAutoStart()
      return
    }

    // Mid-match: remove the human from the simulation entirely.
    //   - Remove from `slots` so future wave scaling uses the correct human count.
    //   - Remove from `humans` so projectState() does not re-add them to state.players
    //     on the next simulation tick (projectState iterates g.humans to keep the map
    //     in sync; failing to remove here would cause the entry to reappear after onLeave).
    // The match continues as long as any other human is alive or the wand survives.
    const { [sid]: _removed, ...remainingHumans } = this.gameState.humans
    void _removed
    this.gameState = {
      ...this.gameState,
      slots: this.gameState.slots.filter(sl => sl.sessionId !== sid),
      humans: remainingHumans,
    }
    // Wave rescaling: future waves (those not yet started) will be scaled to the
    // new human count automatically because startNextWaveMulti reads slots at
    // wave-start time. The current wave's spawn queue is not modified.
  }

  // ── Arcade character selector (FB3) ──────────────────────────────────────────

  /**
   * Set this player's cursor pick. Validates the charKey is a real character AND is
   * not the selectedChar of ANOTHER player (the lock). A taken character is IGNORED
   * (the client renders the lock state itself). A confirmed player must unconfirm
   * before changing — but selecting the SAME char they already hold is harmless.
   */
  private handleSelectChar(client: Client, payload: unknown): void {
    if (this.gameState !== null) return // selection is closed once the match starts
    const charKey = readCharKey(payload)
    if (!charKey) return // invalid → ignored

    const me = this.state.players.get(client.sessionId)
    if (!me) return
    if (me.confirmed) return // locked in — must unconfirm first

    // Lock check: is this character the selectedChar of any OTHER player?
    if (this.isTakenByOther(client.sessionId, charKey)) return // ignored → client shows lock

    me.selectedChar = charKey
    me.charKey = charKey // mirror so late joiners / GameScene reconcile see the pick
    // Selecting cancels any pending auto-start (someone is still choosing).
    this.evaluateAutoStart()
  }

  /** Lock in the current pick. Only valid when a character is selected. */
  private handleConfirmChar(client: Client): void {
    if (this.gameState !== null) return
    const me = this.state.players.get(client.sessionId)
    if (!me) return
    if (!me.selectedChar) return // no pick → cannot confirm
    me.confirmed = true
    this.evaluateAutoStart()
  }

  /** Release the lock so the player may change their pick before the match starts. */
  private handleUnconfirm(client: Client): void {
    if (this.gameState !== null) return
    const me = this.state.players.get(client.sessionId)
    if (!me) return
    me.confirmed = false
    this.evaluateAutoStart()
  }

  /** True if `charKey` is the selectedChar of a player OTHER than `sessionId`. */
  private isTakenByOther(sessionId: string, charKey: CharKey): boolean {
    for (const [sid, p] of this.state.players) {
      if (sid !== sessionId && p.selectedChar === charKey) return true
    }
    return false
  }

  /**
   * Re-evaluate the auto-start condition: ALL connected players present and each has
   * a confirmed pick → schedule the start after a 1s arcade beat. Any change before
   * the beat elapses (a new pick, an unconfirm, a leave) cancels and reschedules.
   */
  private evaluateAutoStart(): void {
    if (this.gameState !== null) { this.cancelAutoStart(); return }

    const connected = [...this.state.players.values()].filter(p => p.connected)
    const allConfirmed = connected.length > 0 && connected.every(p => p.confirmed && p.selectedChar)

    if (allConfirmed) {
      if (this.autoStartTimer === null) {
        this.autoStartTimer = setTimeout(() => {
          this.autoStartTimer = null
          this.startMatch()
        }, AUTO_START_DELAY_MS)
      }
    } else {
      this.cancelAutoStart()
    }
  }

  private cancelAutoStart(): void {
    if (this.autoStartTimer !== null) {
      clearTimeout(this.autoStartTimer)
      this.autoStartTimer = null
    }
  }

  // ── Lobby → match start ──────────────────────────────────────────────────────

  /**
   * Legacy manual start trigger ('ready'). Kept as a fallback, but only fires when the
   * normal arcade gate is satisfied (all connected players confirmed). This prevents a
   * single client from starting a match before everyone has locked in.
   */
  private tryStart(_client: Client): void {
    if (this.gameState !== null) return // already started
    const connected = [...this.state.players.values()].filter(p => p.connected)
    if (connected.length === 0) return
    if (!connected.every(p => p.confirmed && p.selectedChar)) return
    this.startMatch()
  }

  /** Build the simulation from confirmed picks and flip to 'playing'. */
  private startMatch(): void {
    if (this.gameState !== null) return
    this.cancelAutoStart()

    // Human slots come from each connected player's confirmed selectedChar, ordered by
    // the authoritative slotIndex assigned at join time. This ensures the core slot[i]
    // ordering matches the P1/P2/P3 assignment already visible in the lobby selector.
    const humanSlots: HumanSlotSpec[] = this.joined
      .filter(p => {
        const net = this.state.players.get(p.sessionId)
        return !!net && net.connected && isCharKey(net.selectedChar)
      })
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map(p => {
        const net = this.state.players.get(p.sessionId)!
        return { sessionId: p.sessionId, charKey: net.selectedChar as CharKey }
      })

    if (humanSlots.length === 0) return

    // slotIndex is already set on each PlayerNet at join time — no reassignment needed.
    // Verify the values are in place (defensive; they should always be ≥ 0 here).
    for (const h of humanSlots) {
      const net = this.state.players.get(h.sessionId)
      if (net && net.slotIndex < 0) net.slotIndex = this.joined.find(p => p.sessionId === h.sessionId)?.slotIndex ?? 0
    }

    this.gameState = createMultiInitialState(humanSlots, this.seed)
    this.accumulatorMs = 0
    this.projectState()
    this.state.status = 'playing'
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
        // Defensive: recreate entry if missing. Restore slotIndex from humanSlots order.
        net = new PlayerNet()
        net.sessionId = sid
        net.charKey = human.charKey
        const slotIdx = g.slots.findIndex(sl => sl.sessionId === sid)
        net.slotIndex = slotIdx >= 0 ? slotIdx : -1
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
    // Replace the ArraySchema contents in-place. NOTE: a single
    // splice(0, len, ...next) throws in @colyseus/schema when next.length > len
    // ("insertCount must be equal or lower than deleteCount"), which happens on the
    // very first enemy spawn. Clear first, then append — both ops stay within the
    // splice invariant and the net result is identical.
    if (st.enemies.length > 0) st.enemies.splice(0, st.enemies.length)
    if (next.length > 0) st.enemies.push(...next)

    // Allies (AI slots) — order-stable: the count (3 - humanCount) is fixed at match
    // start and never changes, so each core ally maps 1:1 to st.allies[i]. Create the
    // AllyNet entries lazily on the first projection, then update them in place. Without
    // this the AI allies fight invisibly client-side (the FB2 ghost-combat bug).
    for (let i = 0; i < g.allies.length; i++) {
      const a = g.allies[i]
      let net = st.allies[i]
      if (!net) {
        net = new AllyNet()
        net.charKey = a.charKey
        st.allies.push(net)
      }
      net.x = a.x
      net.y = a.y
      net.fsm = a.fsm
    }
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

/** Extract a valid CharKey from a 'selectChar' payload {charKey}, or null if invalid. */
function readCharKey(payload: unknown): CharKey | null {
  if (typeof payload !== 'object' || payload === null) return null
  const v = (payload as Record<string, unknown>).charKey
  return isCharKey(v) ? v : null
}
