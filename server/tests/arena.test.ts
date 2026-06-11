import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { boot, ColyseusTestServer } from '@colyseus/testing'
import appConfig from '../src/app.config'
import type { ArenaState } from '../src/schema/ArenaState'
import { startMatch, pickAndConfirm, waitFor } from './helpers'

// Neutral input payload (all buttons released).
const NEUTRAL = {
  up: false, down: false, left: false, right: false,
  block: false, punch: false, kick: false,
}
const moving = (dir: 'left' | 'right') => ({ ...NEUTRAL, [dir]: true })

// FB3: characters are chosen IN THE LOBBY via the arcade selector (selectChar +
// confirmChar) — the join-time charKey is no longer used to take a character. A match
// auto-starts once every connected player has confirmed a pick. These tests drive that
// flow via the helpers in ./helpers.

describe('ArenaRoom (authoritative Colyseus room)', () => {
  let colyseus: ColyseusTestServer

  beforeAll(async () => { colyseus = await boot(appConfig) })
  afterAll(async () => { await colyseus.shutdown() })
  beforeEach(async () => { await colyseus.cleanup() })

  it('1 client joins → 1 player entry, no pick yet, status lobby', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    expect(room.clients.length).toBe(1)
    const state = room.state as ArenaState
    expect(state.players.size).toBe(1)
    const me = state.players.get(client.sessionId)
    expect(me).toBeDefined()
    expect(me!.selectedChar).toBe('')
    expect(state.status).toBe('lobby')
  })

  it('select + confirm starts the match → status playing, wave ≥ 1, charKey set', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    await startMatch(room, [{ client, charKey: 'werdum' }])

    const state = room.state as ArenaState
    expect(state.status).toBe('playing')
    expect(state.wave).toBeGreaterThanOrEqual(1)
    expect(state.wandHp).toBeGreaterThan(0)
    expect(state.players.get(client.sessionId)!.charKey).toBe('werdum')
  })

  it("'input' (right held) moves the player's PlayerNet.x to the right", async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()
    await startMatch(room, [{ client, charKey: 'werdum' }])

    const state = room.state as ArenaState
    const startX = state.players.get(client.sessionId)!.x

    client.send('input', moving('right'))
    for (let i = 0; i < 12; i++) await room.waitForNextPatch()

    const endX = state.players.get(client.sessionId)!.x
    expect(endX).toBeGreaterThan(startX)
  })

  it('3 clients pick distinct charKeys → 3 players', async () => {
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    const c2 = await colyseus.connectTo(room, {})
    const c3 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    c1.send('selectChar', { charKey: 'werdum' })
    c2.send('selectChar', { charKey: 'dida' })
    c3.send('selectChar', { charKey: 'thor' })
    await waitFor(room, s =>
      s.players.get(c1.sessionId)!.selectedChar === 'werdum' &&
      s.players.get(c2.sessionId)!.selectedChar === 'dida' &&
      s.players.get(c3.sessionId)!.selectedChar === 'thor')

    const state = room.state as ArenaState
    expect(state.players.size).toBe(3)
    const keys = [c1, c2, c3].map(c => state.players.get(c.sessionId)!.selectedChar).sort()
    expect(keys).toEqual(['dida', 'thor', 'werdum'])
  })

  it('a character taken by another player is locked (selectChar ignored)', async () => {
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    const c2 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    c1.send('selectChar', { charKey: 'werdum' })
    await waitFor(room, s => s.players.get(c1.sessionId)!.selectedChar === 'werdum')
    // c2 requests the same character → ignored (locked), stays empty.
    c2.send('selectChar', { charKey: 'werdum' })
    for (let i = 0; i < 4; i++) await room.waitForNextPatch()

    const state = room.state as ArenaState
    expect(state.players.get(c1.sessionId)!.selectedChar).toBe('werdum')
    expect(state.players.get(c2.sessionId)!.selectedChar).toBe('')
  })

  it('joining when the match is already playing and room is full is rejected', async () => {
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    const c2 = await colyseus.connectTo(room, {})
    const c3 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()
    await startMatch(room, [
      { client: c1, charKey: 'werdum' },
      { client: c2, charKey: 'dida' },
      { client: c3, charKey: 'thor' },
    ])

    // Room full (maxClients 3) → a 4th join must be rejected by the server.
    await expect(
      colyseus.connectTo(room, {}),
    ).rejects.toBeDefined()
  })

  it('server is authoritative: the message registry only accepts the lobby/play protocol', async () => {
    const room = await colyseus.createRoom('arena', {})
    // Introspect the live room: only the input/selector/ready handlers are registered.
    // There is NO 'sethp'/'setscore'/state-mutating message — clients are structurally
    // unable to forge hp/score/wave.
    const registered = Object.keys((room as any).onMessageEvents.events).sort()
    expect(registered).toEqual(['confirmChar', 'input', 'ready', 'selectChar', 'unconfirm'])
    // No catch-all '*' fallback either (unregistered types are rejected, not handled).
    expect(registered).not.toContain('*')
  })

  it('a bogus state-setting message does not change authoritative state', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()
    await startMatch(room, [{ client, charKey: 'werdum' }])

    const state = room.state as ArenaState
    const sid = client.sessionId
    const hpBefore = state.players.get(sid)!.hp
    const scoreBefore = state.score

    // Unregistered 'sethp' → server rejects it (kicks the sender); state untouched.
    client.send('sethp' as any, { hp: 999999, score: 999999 })
    await new Promise(r => setTimeout(r, 300))

    const me = state.players.get(sid)
    if (me) expect(me.hp).toBeLessThanOrEqual(hpBefore) // never increased by a client
    expect(state.score).toBe(scoreBefore) // client cannot set score
  })

  it('malformed input never crashes the room (state still patches)', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()
    await startMatch(room, [{ client, charKey: 'werdum' }])

    client.send('input' as any, null)
    client.send('input' as any, 'not-an-object')
    client.send('input' as any, { left: 'yes', punch: 1 })
    for (let i = 0; i < 4; i++) await room.waitForNextPatch()

    const state = room.state as ArenaState
    expect(state.status).toBe('playing') // room survived
    expect(state.players.size).toBe(1)
  })

  it('enemies spawn into the projected ArraySchema without crashing the tick', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()
    await startMatch(room, [{ client, charKey: 'werdum' }])

    let sawEnemies = false
    for (let i = 0; i < 120; i++) {
      await room.waitForNextPatch()
      if ((room.state as ArenaState).enemies.length > 0) { sawEnemies = true; break }
    }

    const state = room.state as ArenaState
    expect(state.status).toBe('playing') // room never crashed
    expect(sawEnemies).toBe(true)
    expect(state.enemies.length).toBeGreaterThan(0)
    expect(state.enemies[0].id).toBeGreaterThanOrEqual(0)
    expect(state.enemies[0].enemyType.length).toBeGreaterThan(0)
  })

  // ── FB2: AI allies must be projected so the client can render them ─────────────

  it('1 human → 2 AI allies are projected once the match starts', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()
    await startMatch(room, [{ client, charKey: 'werdum' }])

    const state = room.state as ArenaState
    expect(state.status).toBe('playing')
    // 3 character slots − 1 human = 2 AI allies.
    expect(state.allies.length).toBe(2)
    const allyChars = [...state.allies].map(a => a.charKey).sort()
    expect(allyChars).toEqual(['dida', 'thor'])
    for (const a of state.allies) {
      expect(a.charKey.length).toBeGreaterThan(0)
      expect(typeof a.x).toBe('number')
      expect(typeof a.y).toBe('number')
      expect(a.fsm.length).toBeGreaterThan(0)
    }
  })

  it('2 humans → exactly 1 AI ally is projected (the unpicked character)', async () => {
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    const c2 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()
    await startMatch(room, [
      { client: c1, charKey: 'werdum' },
      { client: c2, charKey: 'dida' },
    ])

    const state = room.state as ArenaState
    expect(state.status).toBe('playing')
    expect(state.players.size).toBe(2)
    // 3 − 2 humans = 1 AI ally — the previously-invisible third fighter.
    expect(state.allies.length).toBe(1)
    expect(state.allies[0].charKey).toBe('thor')
  })

  it('3 humans → no AI allies projected (all slots are human)', async () => {
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    const c2 = await colyseus.connectTo(room, {})
    const c3 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()
    await startMatch(room, [
      { client: c1, charKey: 'werdum' },
      { client: c2, charKey: 'dida' },
      { client: c3, charKey: 'thor' },
    ])

    const state = room.state as ArenaState
    expect(state.status).toBe('playing')
    expect(state.players.size).toBe(3)
    expect(state.allies.length).toBe(0)
  })

  it('projected ally positions advance across ticks (they are simulated, not frozen)', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()
    await startMatch(room, [{ client, charKey: 'werdum' }])

    // Let wave 1 spawn so the allies have enemies to seek (positions then change).
    let sawEnemies = false
    for (let i = 0; i < 120; i++) {
      await room.waitForNextPatch()
      if ((room.state as ArenaState).enemies.length > 0) { sawEnemies = true; break }
    }
    expect(sawEnemies).toBe(true)

    const state = room.state as ArenaState
    expect(state.allies.length).toBe(2)
    const before = [...state.allies].map(a => ({ x: a.x, y: a.y }))
    for (let i = 0; i < 40; i++) await room.waitForNextPatch()
    const after = [...state.allies].map(a => ({ x: a.x, y: a.y }))
    const moved = before.some((b, i) => b.x !== after[i].x || b.y !== after[i].y)
    expect(moved).toBe(true)
  })

  // Keep pickAndConfirm referenced for direct single-player select use in other suites.
  void pickAndConfirm
})
