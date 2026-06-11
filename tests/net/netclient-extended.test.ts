/**
 * NetClient extended tests — covers room event listeners, reconnection state,
 * leave semantics, room accessor helpers, and unsubscribe cleanups.
 *
 * Covers the gaps from the baseline test (lines 92-113, 164-225, 237-325 in NetClient.ts):
 *  - onConnectionStateChange / onStateChange / onPlayersChange / onEvents return
 *    a working unsubscribe function
 *  - sendInput forwards when connected; no-ops otherwise
 *  - sendReady: forwards when connected, no-op otherwise
 *  - leave: consented close, no-op when room is null
 *  - getRoomState / getRoomCode / getSessionId / getRoom: return room values
 *  - wireRoomListeners callbacks: stateChange, events, error, leave (consented +
 *    non-consented), drop, reconnect
 *  - emitPlayersChange: projects players map; handles empty/missing state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Room mock factory (fresh per test) ──────────────────────────────────────

function makeMockRoom() {
  const handlers: Record<string, ((...args: any[]) => void)[]> = {}
  const room = {
    roomId: 'XYZW',
    sessionId: 'session-42',
    reconnectionToken: 'rtoken-42',
    state: { players: null as any },
    send: vi.fn(),
    leave: vi.fn().mockResolvedValue(undefined),
    onStateChange: vi.fn((cb: (...args: any[]) => void) => { (handlers.stateChange = handlers.stateChange ?? []).push(cb) }),
    onMessage: vi.fn((type: string, cb: (...args: any[]) => void) => { (handlers[type] = handlers[type] ?? []).push(cb) }),
    onLeave: vi.fn((cb: (...args: any[]) => void) => { (handlers.leave = handlers.leave ?? []).push(cb) }),
    onError: vi.fn((cb: (...args: any[]) => void) => { (handlers.error = handlers.error ?? []).push(cb) }),
    onDrop: vi.fn((cb: (...args: any[]) => void) => { (handlers.drop = handlers.drop ?? []).push(cb) }),
    onReconnect: vi.fn((cb: (...args: any[]) => void) => { (handlers.reconnect = handlers.reconnect ?? []).push(cb) }),
    // Test helpers to fire listeners
    _fire(event: string, ...args: any[]) {
      for (const cb of handlers[event] ?? []) cb(...args)
    },
  }
  return room
}

// ── SDK mock — no top-level variable references inside the factory ────────────

const mockCreate = vi.fn()
const mockJoinById = vi.fn()

vi.mock('@colyseus/sdk', () => {
  function MockClient(_url: string) {
    // Capture via module-scope mocks (hoisting safe because vi.mock factory
    // runs in the same hoisted context — we use the declared consts above,
    // but they are initialised before the factory runs thanks to vi.fn() being
    // pure. If vitest still complains, the pattern below avoids the reference:
    // we forward to a global that is always set.)
    return { create: mockCreate, joinById: mockJoinById }
  }
  MockClient.prototype = {}

  const CloseCodeEnum = {
    CONSENTED: 4000,
    FAILED_TO_RECONNECT: 4003,
    ABNORMAL_CLOSURE: 1006,
  }

  return {
    Client: MockClient,
    CloseCode: CloseCodeEnum,
    getStateCallbacks: vi.fn().mockReturnValue({
      players: {
        onAdd: vi.fn(),
        onRemove: vi.fn(),
      },
      listen: vi.fn(),
    }),
  }
})

import { NetClient } from '../../src/net/NetClient'

// Re-export CloseCode values from the module (the mock provides them)
const CLOSE_CONSENTED = 4000
const CLOSE_ABNORMAL = 1006
const CLOSE_FAILED_RECONNECT = 4003

// ── Helpers ──────────────────────────────────────────────────────────────────

async function makeConnectedClient() {
  const client = new NetClient('ws://localhost:2567')
  await client.createRoom('werdum')
  return client
}

// ── Unsubscribe helpers ───────────────────────────────────────────────────────

describe('NetClient callback unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue(makeMockRoom())
    mockJoinById.mockResolvedValue(makeMockRoom())
  })

  it('onConnectionStateChange returns an unsubscribe that removes the listener', async () => {
    const client = new NetClient('ws://localhost:2567')
    const states: string[] = []
    const unsub = client.onConnectionStateChange(s => states.push(s))
    // Before unsub: fire a createRoom (goes idle → connecting → connected)
    const newRoom = makeMockRoom()
    mockCreate.mockResolvedValueOnce(newRoom)
    await client.createRoom('werdum')
    const countBefore = states.length
    expect(countBefore).toBeGreaterThan(0)
    // Unsubscribe — subsequent transitions must NOT appear
    unsub()
    // Trigger another state change via leave
    await client.leave()
    expect(states.length).toBe(countBefore) // no new entries
  })

  it('onStateChange returns a working unsubscribe', async () => {
    const newRoom = makeMockRoom()
    mockCreate.mockResolvedValueOnce(newRoom)
    const client = new NetClient('ws://localhost:2567')
    const snapshots: any[] = []
    const unsub = client.onStateChange(s => snapshots.push(s))
    await client.createRoom('werdum')
    // Fire onStateChange via the mock room
    newRoom._fire('stateChange', { wave: 1 })
    expect(snapshots.length).toBe(1)
    unsub()
    newRoom._fire('stateChange', { wave: 2 })
    expect(snapshots.length).toBe(1) // no new entries after unsub
  })

  it('onPlayersChange returns a working unsubscribe', async () => {
    const newRoom = makeMockRoom()
    newRoom.state = {
      players: new Map([['sess-1', { charKey: 'werdum', connected: true }]]),
    }
    mockCreate.mockResolvedValueOnce(newRoom)
    const client = new NetClient('ws://localhost:2567')
    const batches: any[] = []
    const unsub = client.onPlayersChange(p => batches.push(p))
    await client.createRoom('werdum')
    // Emit state change to trigger emitPlayersChange
    newRoom._fire('stateChange', newRoom.state)
    expect(batches.length).toBeGreaterThan(0)
    unsub()
    newRoom._fire('stateChange', newRoom.state)
    expect(batches.length).toBe(1) // no new entries after unsub
  })

  it('onEvents returns a working unsubscribe', async () => {
    const newRoom = makeMockRoom()
    mockCreate.mockResolvedValueOnce(newRoom)
    const client = new NetClient('ws://localhost:2567')
    const batches: any[] = []
    const unsub = client.onEvents(e => batches.push(e))
    await client.createRoom('werdum')
    // Fire 'events' message
    newRoom._fire('events', [{ type: 'hit' }])
    expect(batches.length).toBe(1)
    unsub()
    newRoom._fire('events', [{ type: 'hit' }])
    expect(batches.length).toBe(1) // no new after unsub
  })
})

// ── sendInput / sendReady when connected ────────────────────────────────────

describe('NetClient send methods when connected', () => {
  let client: NetClient
  let room: ReturnType<typeof makeMockRoom>

  beforeEach(async () => {
    vi.clearAllMocks()
    room = makeMockRoom()
    mockCreate.mockResolvedValueOnce(room)
    client = new NetClient('ws://localhost:2567')
    await client.createRoom('werdum')
  })

  it('sendInput calls room.send("input", ...) when connected', () => {
    const input = { up: true, down: false, left: false, right: false, block: false, punch: true, kick: false }
    client.sendInput(input)
    expect(room.send).toHaveBeenCalledWith('input', input)
  })

  it('sendReady calls room.send("ready", {}) when connected', () => {
    client.sendReady()
    expect(room.send).toHaveBeenCalledWith('ready', {})
  })

  it('sendInput is a no-op after leave (connection idle)', async () => {
    await client.leave()
    expect(client.connectionState).toBe('idle')
    room.send.mockClear()
    client.sendInput({ up: false, down: false, left: false, right: false, block: false, punch: false, kick: false })
    expect(room.send).not.toHaveBeenCalled()
  })

  it('sendReady is a no-op when not connected (idle)', () => {
    const idleClient = new NetClient('ws://localhost:2567')
    expect(() => idleClient.sendReady()).not.toThrow()
    expect(room.send).not.toHaveBeenCalled()
  })
})

// ── Room accessor helpers ────────────────────────────────────────────────────

describe('NetClient room accessors', () => {
  let client: NetClient
  let room: ReturnType<typeof makeMockRoom>

  beforeEach(async () => {
    vi.clearAllMocks()
    room = makeMockRoom()
    mockCreate.mockResolvedValueOnce(room)
    client = new NetClient('ws://localhost:2567')
    await client.createRoom('werdum')
  })

  it('getRoomCode returns the room ID', () => {
    expect(client.getRoomCode()).toBe('XYZW')
  })

  it('getSessionId returns the session ID', () => {
    expect(client.getSessionId()).toBe('session-42')
  })

  it('getRoom returns the room handle', () => {
    expect(client.getRoom()).toBe(room)
  })

  it('getRoomState returns room.state', () => {
    room.state = { wave: 3, phase: 'playing' }
    expect(client.getRoomState()).toEqual({ wave: 3, phase: 'playing' })
  })

  it('accessors return null after leave', async () => {
    await client.leave()
    expect(client.getRoomCode()).toBeNull()
    expect(client.getSessionId()).toBeNull()
    expect(client.getRoom()).toBeNull()
    expect(client.getRoomState()).toBeNull()
  })

  it('leave is a no-op when not in a room', async () => {
    await client.leave()   // first leave clears the room
    await expect(client.leave()).resolves.not.toThrow()
  })
})

// ── wireRoomListeners — room event callbacks ─────────────────────────────────

describe('NetClient wireRoomListeners: state change fan-out', () => {
  let client: NetClient
  let room: ReturnType<typeof makeMockRoom>

  beforeEach(async () => {
    vi.clearAllMocks()
    room = makeMockRoom()
    mockCreate.mockResolvedValueOnce(room)
    client = new NetClient('ws://localhost:2567')
    await client.createRoom('werdum')
  })

  it('forwards server state to onStateChange subscribers', () => {
    const snapshots: any[] = []
    client.onStateChange(s => snapshots.push(s))
    room._fire('stateChange', { wave: 2 })
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toEqual({ wave: 2 })
  })

  it('forwards events batch to onEvents subscribers', () => {
    const batches: any[] = []
    client.onEvents(b => batches.push(b))
    room._fire('events', [{ type: 'die', id: 7 }])
    expect(batches).toHaveLength(1)
    expect(batches[0][0].type).toBe('die')
  })
})

describe('NetClient wireRoomListeners: error handling', () => {
  let client: NetClient
  let room: ReturnType<typeof makeMockRoom>

  beforeEach(async () => {
    vi.clearAllMocks()
    room = makeMockRoom()
    mockCreate.mockResolvedValueOnce(room)
    client = new NetClient('ws://localhost:2567')
    await client.createRoom('werdum')
  })

  it('room.onError → state becomes unavailable, room cleared', () => {
    const states: string[] = []
    client.onConnectionStateChange(s => states.push(s))
    room._fire('error', 1011, 'Internal Server Error')
    expect(states).toContain('unavailable')
    expect(client.connectionState).toBe('unavailable')
    expect(client.getRoom()).toBeNull()
  })
})

describe('NetClient wireRoomListeners: leave semantics', () => {
  let client: NetClient
  let room: ReturnType<typeof makeMockRoom>

  beforeEach(async () => {
    vi.clearAllMocks()
    room = makeMockRoom()
    mockCreate.mockResolvedValueOnce(room)
    client = new NetClient('ws://localhost:2567')
    await client.createRoom('werdum')
  })

  it('room.onLeave CONSENTED (4000) → state idle', () => {
    room._fire('leave', CLOSE_CONSENTED)
    expect(client.connectionState).toBe('idle')
    expect(client.getRoom()).toBeNull()
  })

  it('room.onLeave non-consented → state unavailable', () => {
    room._fire('leave', CLOSE_ABNORMAL) // ABNORMAL_CLOSURE
    expect(client.connectionState).toBe('unavailable')
    expect(client.getRoom()).toBeNull()
  })

  it('room.onLeave FAILED_TO_RECONNECT (4003) → state unavailable', () => {
    room._fire('leave', 4003)
    expect(client.connectionState).toBe('unavailable')
  })
})

describe('NetClient wireRoomListeners: drop + reconnect', () => {
  let client: NetClient
  let room: ReturnType<typeof makeMockRoom>

  beforeEach(async () => {
    vi.clearAllMocks()
    room = makeMockRoom()
    mockCreate.mockResolvedValueOnce(room)
    client = new NetClient('ws://localhost:2567')
    await client.createRoom('werdum')
  })

  it('room.onDrop → state reconnecting (SDK will retry)', () => {
    const states: string[] = []
    client.onConnectionStateChange(s => states.push(s))
    room._fire('drop', 1006, 'network hiccup')
    expect(client.connectionState).toBe('reconnecting')
    expect(states).toContain('reconnecting')
  })

  it('room.onReconnect → state connected again', () => {
    room._fire('drop', 1006)
    expect(client.connectionState).toBe('reconnecting')
    room._fire('reconnect')
    expect(client.connectionState).toBe('connected')
  })
})

// ── emitPlayersChange ────────────────────────────────────────────────────────

describe('NetClient emitPlayersChange', () => {
  let client: NetClient
  let room: ReturnType<typeof makeMockRoom>

  beforeEach(async () => {
    vi.clearAllMocks()
    room = makeMockRoom()
    mockCreate.mockResolvedValueOnce(room)
    client = new NetClient('ws://localhost:2567')
    await client.createRoom('werdum')
  })

  it('projects state.players map to PlayerInfo array', () => {
    const players: any[] = []
    client.onPlayersChange(p => players.push(...p))
    const state = {
      players: new Map([
        ['sess-a', { charKey: 'werdum', connected: true }],
        ['sess-b', { charKey: 'dida', connected: false }],
      ]),
    }
    room._fire('stateChange', state)
    expect(players).toHaveLength(2)
    const pa = players.find((p: any) => p.sessionId === 'sess-a')
    expect(pa?.charKey).toBe('werdum')
    expect(pa?.connected).toBe(true)
    const pb = players.find((p: any) => p.sessionId === 'sess-b')
    expect(pb?.connected).toBe(false)
  })

  it('no-ops when state has no players field', () => {
    const batches: any[] = []
    client.onPlayersChange(p => batches.push(p))
    room._fire('stateChange', { wave: 1 }) // no .players
    expect(batches).toHaveLength(0)
  })

  it('handles missing charKey/connected gracefully (fills defaults)', () => {
    const players: any[] = []
    client.onPlayersChange(p => players.push(...p))
    const state = {
      players: new Map([['sess-x', {}]]), // no charKey, no connected
    }
    room._fire('stateChange', state)
    expect(players[0].charKey).toBe('')
    expect(players[0].connected).toBe(true) // default
  })
})

// ── joinByCode extended ───────────────────────────────────────────────────────

describe('NetClient joinByCode extended', () => {
  let client: NetClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new NetClient('ws://localhost:2567')
  })

  it('joinByCode with invalid code → does not attempt join, ends unavailable', async () => {
    // The normalizeRoomCode throw is caught inside joinByCode
    const result = await client.joinByCode('AB', 'dida')
    expect(result).toBeNull()
    // connecting was set, then unavailable after error
    expect(client.connectionState).toBe('unavailable')
  })

  it('joinByCode failure returns null and state is unavailable', async () => {
    mockJoinById.mockRejectedValueOnce(new Error('Room not found'))
    const result = await client.joinByCode('ABCD', 'werdum')
    expect(result).toBeNull()
    expect(client.connectionState).toBe('unavailable')
  })
})
