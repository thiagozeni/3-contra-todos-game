/**
 * NetClient — thin wrapper around @colyseus/sdk for the 3 Contra Todos client.
 *
 * Design principles:
 * - All public methods are try/catch; never throw to caller.
 * - Connection state machine: idle → connecting → connected | reconnecting | error | unavailable
 * - sendInput is always safe to call; silently no-ops when not connected.
 * - All state updates are emitted through typed events; caller registers callbacks.
 *
 * SDK version: @colyseus/sdk 0.17.x
 * Callbacks pattern: getStateCallbacks(room) returns SchemaCallbackProxy — use
 *   room.onStateChange(cb) for full-state snapshots and getStateCallbacks for
 *   fine-grained field / collection listeners.
 *
 * Reconnection (Task 8):
 * - room.onDrop → connectionState = 'reconnecting'; SDK auto-retries (maxRetries 15, exponential backoff)
 * - room.onReconnect → connectionState = 'connected'
 * - room.onLeave with code FAILED_TO_RECONNECT (4003) or ABNORMAL_CLOSURE (1006) → 'unavailable'
 * - room.onLeave with code CONSENTED (4000) → 'idle' (normal leave)
 * - Server fully down → onError / onDrop → 'unavailable' → graceful TitleScene fallback
 */

import { Client, getStateCallbacks, CloseCode } from '@colyseus/sdk'
import type { Room } from '@colyseus/sdk'
import type { MoveInput } from '../core/types'
import { getEntitlementClaim } from './entitlement'

// ── Exported types ───────────────────────────────────────────────────────────

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'unavailable'

export interface PlayerInfo {
  sessionId: string
  charKey: string
  connected: boolean
  /** Arcade selector pick ('' = none yet). */
  selectedChar: string
  /** Arcade selector: true once this player locked in. */
  confirmed: boolean
  /**
   * Authoritative P-number slot (0 = P1, 1 = P2, 2 = P3). Assigned by the server at
   * join time and stable for the session. -1 means unset / not yet received from server.
   * This is the single source of truth for both lobby cursor colors and in-game indicators.
   */
  slotIndex: number
}

export interface RoomInfo {
  code: string
  room: Room<any, any>
}

export type ConnectionStateCallback = (state: ConnectionState) => void
export type StateChangeCallback = (state: any) => void
export type PlayersChangeCallback = (players: PlayerInfo[]) => void
export type EventsCallback = (events: any[]) => void

// ── normalizeRoomCode ────────────────────────────────────────────────────────

const ROOM_CODE_RE = /^[A-Z]{4}$/

/**
 * Normalise a room code: trim whitespace, uppercase.
 * Throws with a friendly message if the code is invalid.
 */
export function normalizeRoomCode(raw: string): string {
  const trimmed = raw.trim().toUpperCase()
  if (!ROOM_CODE_RE.test(trimmed)) {
    throw new Error(
      `Código inválido: "${raw}". Use exatamente 4 letras (A–Z).`
    )
  }
  return trimmed
}

// ── Colyseus error codes (from @colyseus/shared-types ErrorCode) ──────────────

const MATCHMAKE_NO_HANDLER = 520
const MATCHMAKE_INVALID_ROOM_ID = 522
// 523 = MATCHMAKE_UNHANDLED — used for both "room full" and generic server errors

/**
 * Classify a Colyseus connection error into a friendly PT-BR message.
 *
 * Error shapes encountered from the SDK:
 *  - MatchMakeError: { code: number, message: string } — thrown by Client.joinById / create
 *  - ServerError:    { code: number, message: string } — rare, usually wrapped
 *  - Generic Error:  ECONNREFUSED, "Failed to fetch", network down
 *  - Timeout sentinel: Error('__timeout__')
 */
export function classifyNetError(err: unknown): string {
  if (!err) return 'Servidor indisponível'
  if (err instanceof Error) {
    const msg = err.message ?? ''
    // Timeout sentinel injected by our race
    if (msg === '__timeout__') return 'Servidor indisponível'
    // Host gate rejection — server throws "hosting requer o app premium"
    if (msg.toLowerCase().includes('hosting requer o app premium')) {
      return 'Hostear requer o app premium'
    }
    // Room full — server throws with message containing "full"
    if (msg.toLowerCase().includes('full')) return 'Sala cheia'
    // Specific Colyseus ErrorCode on the thrown error object
    const code = (err as unknown as Record<string, unknown>).code
    if (code === MATCHMAKE_INVALID_ROOM_ID || code === MATCHMAKE_NO_HANDLER) {
      return 'Sala não encontrada'
    }
  }
  return 'Servidor indisponível'
}

// ── Connect timeout ───────────────────────────────────────────────────────────

const DEFAULT_CONNECT_TIMEOUT_MS = 8_000

/** Returns a promise that rejects after `ms` with a timeout sentinel error. */
function connectTimeout(ms: number, setTimerRef: (t: ReturnType<typeof setTimeout>) => void): Promise<never> {
  return new Promise<never>((_, reject) => {
    const t = setTimeout(() => reject(new Error('__timeout__')), ms)
    setTimerRef(t)
  })
}

// ── NetClient ────────────────────────────────────────────────────────────────

export class NetClient {
  private sdk: Client
  private room: Room<any, any> | null = null

  private _connectionState: ConnectionState = 'idle'
  private stateChangeCallbacks: ConnectionStateCallback[] = []
  private stateCallbacks: StateChangeCallback[] = []
  private playersCallbacks: PlayersChangeCallback[] = []
  private eventsCallbacks: EventsCallback[] = []

  /**
   * When true, sendInput is a no-op even if connected (app in background).
   * Reset by resumeSending().
   */
  private _sendingPaused = false

  /**
   * Friendly PT-BR message of the last connection failure, or null if the last
   * operation succeeded. Useful for LobbyScene to show specific error messages.
   */
  private _lastError: string | null = null

  private readonly _connectTimeoutMs: number

  constructor(serverUrl: string, connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS) {
    this.sdk = new Client(serverUrl)
    this._connectTimeoutMs = connectTimeoutMs
  }

  // ── Public: state ──────────────────────────────────────────────────────────

  get connectionState(): ConnectionState {
    return this._connectionState
  }

  /** True when input sending has been paused (app is in background). */
  get sendingPaused(): boolean {
    return this._sendingPaused
  }

  /**
   * Friendly PT-BR error message from the last failed createRoom / joinByCode,
   * or null if the last operation succeeded.
   */
  get lastError(): string | null {
    return this._lastError
  }

  /**
   * Stop sending inputs — called when the app goes to background.
   * sendInput will be a no-op until resumeSending() is called.
   */
  pauseSending(): void {
    this._sendingPaused = true
  }

  /**
   * Resume sending inputs — called when the app returns to foreground.
   */
  resumeSending(): void {
    this._sendingPaused = false
  }

  // ── Public: callbacks ──────────────────────────────────────────────────────

  onConnectionStateChange(cb: ConnectionStateCallback): () => void {
    this.stateChangeCallbacks.push(cb)
    return () => {
      this.stateChangeCallbacks = this.stateChangeCallbacks.filter(x => x !== cb)
    }
  }

  onStateChange(cb: StateChangeCallback): () => void {
    this.stateCallbacks.push(cb)
    return () => {
      this.stateCallbacks = this.stateCallbacks.filter(x => x !== cb)
    }
  }

  onPlayersChange(cb: PlayersChangeCallback): () => void {
    this.playersCallbacks.push(cb)
    return () => {
      this.playersCallbacks = this.playersCallbacks.filter(x => x !== cb)
    }
  }

  onEvents(cb: EventsCallback): () => void {
    this.eventsCallbacks.push(cb)
    return () => {
      this.eventsCallbacks = this.eventsCallbacks.filter(x => x !== cb)
    }
  }

  // ── Public: actions ────────────────────────────────────────────────────────

  /**
   * Create a new room (host flow).
   * Returns the room info or null on failure.
   * Resolves null (never throws) on error or timeout (spec §8).
   */
  async createRoom(charKey: string): Promise<RoomInfo | null> {
    this.setConnectionState('connecting')
    this._lastError = null
    let timerRef: ReturnType<typeof setTimeout> | undefined
    try {
      const room = await Promise.race([
        this.sdk.create<any>('arena', { charKey, entitlement: getEntitlementClaim() }),
        connectTimeout(this._connectTimeoutMs, t => { timerRef = t }),
      ])
      clearTimeout(timerRef)
      this.room = room
      this.setConnectionState('connected')
      this.wireRoomListeners(room)
      return { code: room.roomId, room }
    } catch (err) {
      clearTimeout(timerRef)
      console.warn('[NetClient] createRoom failed:', err)
      this._lastError = classifyNetError(err)
      this.setConnectionState('unavailable')
      return null
    }
  }

  /**
   * Join an existing room by code (4-letter roomId).
   * Returns room info or null on failure.
   * Resolves null (never throws) on error or timeout (spec §8).
   */
  async joinByCode(rawCode: string, charKey: string): Promise<RoomInfo | null> {
    this.setConnectionState('connecting')
    this._lastError = null
    let timerRef: ReturnType<typeof setTimeout> | undefined
    try {
      const code = normalizeRoomCode(rawCode)
      const room = await Promise.race([
        this.sdk.joinById<any>(code, { charKey }),
        connectTimeout(this._connectTimeoutMs, t => { timerRef = t }),
      ])
      clearTimeout(timerRef)
      this.room = room
      this.setConnectionState('connected')
      this.wireRoomListeners(room)
      return { code: room.roomId, room }
    } catch (err) {
      clearTimeout(timerRef)
      console.warn('[NetClient] joinByCode failed:', err)
      this._lastError = classifyNetError(err)
      this.setConnectionState('unavailable')
      return null
    }
  }

  /**
   * Send player input to the server.
   * Safe to call when not connected — silently ignored.
   * Also a no-op when sendingPaused is true (app in background).
   */
  sendInput(input: MoveInput): void {
    if (this._sendingPaused) return
    if (!this.room || this._connectionState !== 'connected') return
    try {
      this.room.send('input', input)
    } catch (err) {
      console.warn('[NetClient] sendInput failed:', err)
    }
  }

  /**
   * Send 'ready' signal (legacy manual start — only honoured server-side once all
   * players have confirmed their pick).
   */
  sendReady(): void {
    if (!this.room || this._connectionState !== 'connected') return
    try {
      this.room.send('ready', {})
    } catch (err) {
      console.warn('[NetClient] sendReady failed:', err)
    }
  }

  /**
   * Arcade selector (FB3): move this player's cursor pick to `charKey`. The server
   * validates and ignores invalid/locked picks (the client still shows the lock).
   */
  sendSelectChar(charKey: string): void {
    if (!this.room || this._connectionState !== 'connected') return
    try {
      this.room.send('selectChar', { charKey })
    } catch (err) {
      console.warn('[NetClient] sendSelectChar failed:', err)
    }
  }

  /** Arcade selector: lock in the current pick. */
  sendConfirmChar(): void {
    if (!this.room || this._connectionState !== 'connected') return
    try {
      this.room.send('confirmChar', {})
    } catch (err) {
      console.warn('[NetClient] sendConfirmChar failed:', err)
    }
  }

  /** Arcade selector: release a confirmed pick so it can be changed before start. */
  sendUnconfirm(): void {
    if (!this.room || this._connectionState !== 'connected') return
    try {
      this.room.send('unconfirm', {})
    } catch (err) {
      console.warn('[NetClient] sendUnconfirm failed:', err)
    }
  }

  /**
   * Leave the current room gracefully.
   */
  async leave(): Promise<void> {
    if (!this.room) return
    try {
      await this.room.leave(true)
    } catch (err) {
      console.warn('[NetClient] leave failed:', err)
    } finally {
      this.room = null
      this.setConnectionState('idle')
    }
  }

  /**
   * Get the current room state snapshot (null if not connected).
   */
  getRoomState(): any {
    return this.room?.state ?? null
  }

  /**
   * Get current room ID (null if not connected).
   */
  getRoomCode(): string | null {
    return this.room?.roomId ?? null
  }

  /**
   * Get my own Colyseus sessionId (null if not connected).
   * Used by GameScene (net mode) to identify which PlayerNet is the local player.
   */
  getSessionId(): string | null {
    return this.room?.sessionId ?? null
  }

  /**
   * Get the live Room handle (null if not connected).
   * Exposed so GameScene can read room.sessionId / room.state directly.
   */
  getRoom(): Room<any, any> | null {
    return this.room
  }

  // ── Private: helpers ───────────────────────────────────────────────────────

  private setConnectionState(state: ConnectionState): void {
    this._connectionState = state
    for (const cb of this.stateChangeCallbacks) {
      try { cb(state) } catch { /* guard */ }
    }
  }

  private wireRoomListeners(room: Room<any, any>): void {
    // Full state snapshots — for HUD/sync consumers
    room.onStateChange((state: any) => {
      for (const cb of this.stateCallbacks) {
        try { cb(state) } catch { /* guard */ }
      }
      // Extract players list for lobby consumer
      this.emitPlayersChange(state)
    })

    // Fine-grained callbacks via getStateCallbacks (0.17 pattern)
    try {
      const $ = getStateCallbacks(room)
      if ($ && typeof ($ as any).players?.onAdd === 'function') {
        // Players join/leave notifications for lobby list updates
        ;($ as any).players.onAdd((_player: any, _key: string) => {
          this.emitPlayersChange(room.state)
        })
        ;($ as any).players.onRemove((_player: any, _key: string) => {
          this.emitPlayersChange(room.state)
        })
      }
    } catch (err) {
      // getStateCallbacks may not work until state is decoded — non-critical
      console.warn('[NetClient] getStateCallbacks partial setup:', err)
    }

    // Server → client events batch (for FX/sounds)
    room.onMessage('events', (batch: any) => {
      for (const cb of this.eventsCallbacks) {
        try { cb(batch) } catch { /* guard */ }
      }
    })

    // Error handling — server fully down (protocol error, not a drop).
    room.onError((code: number, msg?: string) => {
      console.warn('[NetClient] room error:', code, msg)
      this.room = null
      this.setConnectionState('unavailable')
    })

    // Leave handling — fires on: consented leave, OR reconnection expiry
    // (CloseCode.FAILED_TO_RECONNECT = 4003), OR abnormal close without reconnect window.
    room.onLeave((code: number) => {
      console.log('[NetClient] left room, code:', code)
      this.room = null
      if (code === CloseCode.CONSENTED) {
        // Normal, intentional leave.
        this.setConnectionState('idle')
      } else {
        // Reconnection failed / window expired / server shutdown → signal unavailable
        // so GameScene can show the graceful fallback and return to TitleScene.
        this.setConnectionState('unavailable')
      }
    })

    // Drop — connection lost unexpectedly; SDK auto-retry has started.
    // While reconnecting: inputs stop (sendInput checks connectionState !== 'connected').
    room.onDrop((code: number, reason?: string) => {
      console.warn('[NetClient] connection dropped, reconnecting... code:', code, reason)
      this.setConnectionState('reconnecting')
    })

    // Reconnect — SDK successfully re-established the connection.
    room.onReconnect(() => {
      console.log('[NetClient] reconnected')
      this.setConnectionState('connected')
    })
  }

  private emitPlayersChange(state: any): void {
    if (!state?.players) return
    try {
      const players: PlayerInfo[] = []
      state.players.forEach((p: any, sessionId: string) => {
        players.push({
          sessionId,
          charKey: p.charKey ?? '',
          connected: p.connected ?? true,
          selectedChar: p.selectedChar ?? '',
          confirmed: p.confirmed ?? false,
          slotIndex: typeof p.slotIndex === 'number' ? p.slotIndex : -1,
        })
      })
      for (const cb of this.playersCallbacks) {
        try { cb(players) } catch { /* guard */ }
      }
    } catch (err) {
      console.warn('[NetClient] emitPlayersChange error:', err)
    }
  }
}
