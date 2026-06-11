/**
 * NetClient unit tests — pure logic only, SDK mocked via vi.mock.
 *
 * Covers:
 *  - normalizeRoomCode: uppercase trimming, validation
 *  - connection state machine: idle → connecting → connected / error
 *  - graceful fallback: connect rejection → state 'unavailable', no throw
 *  - sendInput is a no-op (not a crash) when not connected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock the SDK module BEFORE importing NetClient ──────────────────────────
const mockRoom = {
  roomId: 'ABCD',
  sessionId: 'sess-1',
  reconnectionToken: 'rtoken-1',
  onStateChange: vi.fn(),
  onMessage: vi.fn(),
  onLeave: vi.fn(),
  onError: vi.fn(),
  onDrop: vi.fn(),
  onReconnect: vi.fn(),
  send: vi.fn(),
  leave: vi.fn(),
  state: {},
}

const mockCreate  = vi.fn().mockResolvedValue(mockRoom)
const mockJoinById = vi.fn().mockResolvedValue(mockRoom)

vi.mock('@colyseus/sdk', () => {
  function MockClient(_url: string) {
    return { create: mockCreate, joinById: mockJoinById }
  }
  MockClient.prototype = {}

  return {
    Client: MockClient,
    getStateCallbacks: vi.fn().mockReturnValue({
      players: { onAdd: vi.fn(), onRemove: vi.fn() },
      listen: vi.fn(),
    }),
  }
})

// ── Import AFTER mock ────────────────────────────────────────────────────────
import { NetClient, normalizeRoomCode } from '../../src/net/NetClient'

// ── normalizeRoomCode ────────────────────────────────────────────────────────
describe('normalizeRoomCode', () => {
  it('uppercases a 4-letter code and trims spaces', () => {
    expect(normalizeRoomCode('abcd ')).toBe('ABCD')
    expect(normalizeRoomCode(' XYZW')).toBe('XYZW')
    expect(normalizeRoomCode('  abCd  ')).toBe('ABCD')
  })

  it('accepts exactly 4 uppercase letters', () => {
    expect(normalizeRoomCode('ABCD')).toBe('ABCD')
    expect(normalizeRoomCode('ZZZZ')).toBe('ZZZZ')
  })

  it('rejects codes shorter than 4 chars', () => {
    expect(() => normalizeRoomCode('AB')).toThrow()
    expect(() => normalizeRoomCode('ABC')).toThrow()
    expect(() => normalizeRoomCode('')).toThrow()
  })

  it('rejects codes longer than 4 chars', () => {
    expect(() => normalizeRoomCode('ABCDE')).toThrow()
    expect(() => normalizeRoomCode('ABCDE12')).toThrow()
  })

  it('rejects codes with emojis', () => {
    expect(() => normalizeRoomCode('AB😀D')).toThrow()
  })

  it('rejects codes with non-letter characters', () => {
    expect(() => normalizeRoomCode('AB1D')).toThrow()
    expect(() => normalizeRoomCode('AB-D')).toThrow()
  })
})

// ── Connection state machine ─────────────────────────────────────────────────
describe('NetClient state machine', () => {
  let client: NetClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue(mockRoom)
    mockJoinById.mockResolvedValue(mockRoom)
    client = new NetClient('ws://localhost:2567')
  })

  it('starts in idle state', () => {
    expect(client.connectionState).toBe('idle')
  })

  it('transitions idle → connecting → connected on successful createRoom', async () => {
    const states: string[] = []
    client.onConnectionStateChange(s => states.push(s))
    await client.createRoom('werdum')
    expect(states).toContain('connecting')
    expect(states).toContain('connected')
    expect(client.connectionState).toBe('connected')
  })

  it('transitions idle → connecting → connected on successful joinByCode', async () => {
    const states: string[] = []
    client.onConnectionStateChange(s => states.push(s))
    await client.joinByCode('ABCD', 'dida')
    expect(states).toContain('connecting')
    expect(states).toContain('connected')
    expect(client.connectionState).toBe('connected')
  })

  it('transitions to error state on create rejection', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Server down'))
    const states: string[] = []
    client.onConnectionStateChange(s => states.push(s))
    await client.createRoom('werdum')
    expect(states).toContain('connecting')
    // ends in error or unavailable — not connected
    const finalState = client.connectionState
    expect(['error', 'unavailable']).toContain(finalState)
  })
})

// ── Graceful fallback ────────────────────────────────────────────────────────
describe('NetClient graceful fallback', () => {
  let client: NetClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new NetClient('ws://localhost:2567')
  })

  it('emits unavailable and does NOT throw when connect fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    let unavailableEmitted = false
    client.onConnectionStateChange(s => {
      if (s === 'unavailable' || s === 'error') unavailableEmitted = true
    })
    // Must NOT throw
    await expect(client.createRoom('werdum')).resolves.not.toThrow()
    expect(unavailableEmitted).toBe(true)
  })

  it('joinByCode does NOT throw when server is down', async () => {
    mockJoinById.mockRejectedValueOnce(new Error('Room not found'))
    await expect(client.joinByCode('ABCD', 'werdum')).resolves.not.toThrow()
  })
})

// ── sendInput no-op when not connected ───────────────────────────────────────
describe('NetClient sendInput safety', () => {
  let client: NetClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new NetClient('ws://localhost:2567')
  })

  it('sendInput is a no-op (not a crash) when not connected', () => {
    expect(client.connectionState).toBe('idle')
    // Must NOT throw
    expect(() => client.sendInput({
      up: false, down: false, left: false, right: false,
      block: false, punch: false, kick: false,
    })).not.toThrow()
  })

  it('sendInput does not call room.send when not connected', async () => {
    // Still not connected
    client.sendInput({
      up: true, down: false, left: false, right: false,
      block: false, punch: false, kick: false,
    })
    expect(mockRoom.send).not.toHaveBeenCalled()
  })
})
