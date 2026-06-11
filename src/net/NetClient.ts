/**
 * NetClient — thin wrapper around @colyseus/sdk for the 3 Contra Todos client.
 *
 * Design principles:
 * - All public methods are try/catch; never throw to caller.
 * - Connection state machine: idle → connecting → connected | error | unavailable
 * - sendInput is always safe to call; silently no-ops when not connected.
 * - All state updates are emitted through typed events; caller registers callbacks.
 *
 * SDK version: @colyseus/sdk 0.17.x
 * Callbacks pattern: getStateCallbacks(room) returns SchemaCallbackProxy — use
 *   room.onStateChange(cb) for full-state snapshots and getStateCallbacks for
 *   fine-grained field / collection listeners.
 */

import { Client, getStateCallbacks } from '@colyseus/sdk'
import type { Room } from '@colyseus/sdk'
import type { MoveInput } from '../core/types'

// ── Exported types ───────────────────────────────────────────────────────────

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'unavailable'

export interface PlayerInfo {
  sessionId: string
  charKey: string
  connected: boolean
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

// ── NetClient ────────────────────────────────────────────────────────────────

export class NetClient {
  private sdk: Client
  private room: Room<any, any> | null = null

  private _connectionState: ConnectionState = 'idle'
  private stateChangeCallbacks: ConnectionStateCallback[] = []
  private stateCallbacks: StateChangeCallback[] = []
  private playersCallbacks: PlayersChangeCallback[] = []
  private eventsCallbacks: EventsCallback[] = []

  constructor(serverUrl: string) {
    this.sdk = new Client(serverUrl)
  }

  // ── Public: state ──────────────────────────────────────────────────────────

  get connectionState(): ConnectionState {
    return this._connectionState
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
   */
  async createRoom(charKey: string): Promise<RoomInfo | null> {
    this.setConnectionState('connecting')
    try {
      const room = await this.sdk.create<any>('arena', { charKey })
      this.room = room
      this.setConnectionState('connected')
      this.wireRoomListeners(room)
      return { code: room.roomId, room }
    } catch (err) {
      console.warn('[NetClient] createRoom failed:', err)
      this.setConnectionState('unavailable')
      return null
    }
  }

  /**
   * Join an existing room by code (4-letter roomId).
   * Returns room info or null on failure.
   */
  async joinByCode(rawCode: string, charKey: string): Promise<RoomInfo | null> {
    this.setConnectionState('connecting')
    try {
      const code = normalizeRoomCode(rawCode)
      const room = await this.sdk.joinById<any>(code, { charKey })
      this.room = room
      this.setConnectionState('connected')
      this.wireRoomListeners(room)
      return { code: room.roomId, room }
    } catch (err) {
      console.warn('[NetClient] joinByCode failed:', err)
      this.setConnectionState('unavailable')
      return null
    }
  }

  /**
   * Send player input to the server.
   * Safe to call when not connected — silently ignored.
   */
  sendInput(input: MoveInput): void {
    if (!this.room || this._connectionState !== 'connected') return
    try {
      this.room.send('input', input)
    } catch (err) {
      console.warn('[NetClient] sendInput failed:', err)
    }
  }

  /**
   * Send 'ready' signal (lobby host starts the game).
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

    // Error handling
    room.onError((code: number, msg?: string) => {
      console.warn('[NetClient] room error:', code, msg)
      this.setConnectionState('error')
    })

    // Leave handling
    room.onLeave((code: number) => {
      console.log('[NetClient] left room, code:', code)
      this.room = null
      this.setConnectionState('idle')
    })

    // Drop (connection lost, will attempt reconnect)
    room.onDrop(() => {
      console.warn('[NetClient] connection dropped, reconnecting...')
    })

    // Reconnect
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
