import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { boot, ColyseusTestServer } from '@colyseus/testing'
import appConfig from '../src/app.config'
import type { ArenaState } from '../src/schema/ArenaState'

// Neutral input payload (all buttons released).
const NEUTRAL = {
  up: false, down: false, left: false, right: false,
  block: false, punch: false, kick: false,
}
const moving = (dir: 'left' | 'right') => ({ ...NEUTRAL, [dir]: true })

describe('ArenaRoom (authoritative Colyseus room)', () => {
  let colyseus: ColyseusTestServer

  beforeAll(async () => { colyseus = await boot(appConfig) })
  afterAll(async () => { await colyseus.shutdown() })
  beforeEach(async () => { await colyseus.cleanup() })

  it('1 client joins → 1 player entry with the chosen charKey, status lobby', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, { charKey: 'werdum' })
    await room.waitForNextPatch()

    expect(room.clients.length).toBe(1)
    const state = room.state as ArenaState
    expect(state.players.size).toBe(1)
    const me = state.players.get(client.sessionId)
    expect(me).toBeDefined()
    expect(me!.charKey).toBe('werdum')
    expect(state.status).toBe('lobby')
  })

  it("'ready' starts the match → status playing, wave ≥ 1", async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, { charKey: 'werdum' })
    await room.waitForNextPatch()

    client.send('ready', {})
    // Allow the start + at least one simulation tick to project wave 1.
    for (let i = 0; i < 6; i++) await room.waitForNextPatch()

    const state = room.state as ArenaState
    expect(state.status).toBe('playing')
    expect(state.wave).toBeGreaterThanOrEqual(1)
    expect(state.wandHp).toBeGreaterThan(0)
  })

  it("'input' (right held) moves the player's PlayerNet.x to the right", async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, { charKey: 'werdum' })
    await room.waitForNextPatch()
    client.send('ready', {})
    for (let i = 0; i < 4; i++) await room.waitForNextPatch()

    const state = room.state as ArenaState
    const startX = state.players.get(client.sessionId)!.x

    client.send('input', moving('right'))
    for (let i = 0; i < 12; i++) await room.waitForNextPatch()

    const endX = state.players.get(client.sessionId)!.x
    expect(endX).toBeGreaterThan(startX)
  })

  it('3 clients with distinct charKeys → 3 players', async () => {
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, { charKey: 'werdum' })
    const c2 = await colyseus.connectTo(room, { charKey: 'dida' })
    const c3 = await colyseus.connectTo(room, { charKey: 'thor' })
    await room.waitForNextPatch()

    const state = room.state as ArenaState
    expect(state.players.size).toBe(3)
    const keys = [c1, c2, c3].map(c => state.players.get(c.sessionId)!.charKey).sort()
    expect(keys).toEqual(['dida', 'thor', 'werdum'])
  })

  it('duplicate charKey is auto-assigned to the first free character', async () => {
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, { charKey: 'werdum' })
    const c2 = await colyseus.connectTo(room, { charKey: 'werdum' }) // requests same
    await room.waitForNextPatch()

    const state = room.state as ArenaState
    expect(state.players.size).toBe(2)
    const k1 = state.players.get(c1.sessionId)!.charKey
    const k2 = state.players.get(c2.sessionId)!.charKey
    expect(k1).toBe('werdum')
    expect(k2).not.toBe('werdum') // auto-assigned a free char
    expect(['dida', 'thor']).toContain(k2)
  })

  it('joining when the match is already playing and room is full is rejected', async () => {
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, { charKey: 'werdum' })
    const c2 = await colyseus.connectTo(room, { charKey: 'dida' })
    const c3 = await colyseus.connectTo(room, { charKey: 'thor' })
    await room.waitForNextPatch()
    c1.send('ready', {})
    for (let i = 0; i < 4; i++) await room.waitForNextPatch()

    // Room full (maxClients 3) → a 4th join must be rejected by the server.
    await expect(
      colyseus.connectTo(room, { charKey: 'werdum' }),
    ).rejects.toBeDefined()
  })

  it('server is authoritative: the message registry only accepts input/ready', async () => {
    const room = await colyseus.createRoom('arena', {})
    // Introspect the live room: only 'input' and 'ready' handlers are registered.
    // There is NO 'sethp'/'setscore'/state-mutating message — clients are
    // structurally unable to forge hp/score/wave.
    const registered = Object.keys((room as any).onMessageEvents.events).sort()
    expect(registered).toEqual(['input', 'ready'])
    // No catch-all '*' fallback either (unregistered types are rejected, not handled).
    expect(registered).not.toContain('*')
  })

  it('a bogus state-setting message does not change authoritative state', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, { charKey: 'werdum' })
    await room.waitForNextPatch()
    client.send('ready', {})
    for (let i = 0; i < 4; i++) await room.waitForNextPatch()

    const state = room.state as ArenaState
    const sid = client.sessionId
    const hpBefore = state.players.get(sid)!.hp
    const scoreBefore = state.score

    // Unregistered 'sethp' → server rejects it (kicks the sender); state untouched.
    // The kick may tear down the SDK connection, so we DON'T wait on the client's
    // patches afterward — we assert against the AUTHORITATIVE room state directly
    // after a short settle delay.
    client.send('sethp' as any, { hp: 999999, score: 999999 })
    await new Promise(r => setTimeout(r, 300))

    const me = state.players.get(sid)
    if (me) expect(me.hp).toBeLessThanOrEqual(hpBefore) // never increased by a client
    expect(state.score).toBe(scoreBefore) // client cannot set score
  })

  it('malformed input never crashes the room (state still patches)', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, { charKey: 'werdum' })
    await room.waitForNextPatch()
    client.send('ready', {})
    for (let i = 0; i < 4; i++) await room.waitForNextPatch()

    client.send('input' as any, null)
    client.send('input' as any, 'not-an-object')
    client.send('input' as any, { left: 'yes', punch: 1 })
    for (let i = 0; i < 4; i++) await room.waitForNextPatch()

    const state = room.state as ArenaState
    expect(state.status).toBe('playing') // room survived
    expect(state.players.size).toBe(1)
  })
})
