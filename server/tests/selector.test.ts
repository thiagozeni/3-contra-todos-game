// FB3: Arcade character selector protocol — server is the source of truth.
//
// Protocol under test:
//   - On join, a player gets selectedChar = '' (no pick) and confirmed = false.
//     The join-time charKey option is only an initial CURSOR hint (or empty).
//   - 'selectChar' {charKey}: validates charKey ∈ {werdum,dida,thor} AND is not the
//     selectedChar of ANOTHER player → sets selectedChar (and mirrors charKey). A taken
//     character is IGNORED (the client shows the lock visually).
//   - 'confirmChar' {}: only valid when selectedChar is set → sets confirmed = true.
//   - 'unconfirm' {}: clears confirmed (allow changing the pick before start).
//   - When ALL connected players are confirmed, the match auto-starts after a ~1s beat
//     → status 'playing', and humanSlots are built from selectedChar.
//   - A late joiner sees the current picks (others' selectedChar already in state).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { boot, ColyseusTestServer } from '@colyseus/testing'
import appConfig from '../src/app.config'
import type { ArenaState } from '../src/schema/ArenaState'

/** Wait until `predicate(state)` is true or `maxPatches` elapse. */
async function waitFor(room: any, predicate: (s: ArenaState) => boolean, maxPatches = 60): Promise<boolean> {
  for (let i = 0; i < maxPatches; i++) {
    if (predicate(room.state as ArenaState)) return true
    await room.waitForNextPatch()
  }
  return predicate(room.state as ArenaState)
}

describe('ArenaRoom — arcade character selector (FB3)', () => {
  let colyseus: ColyseusTestServer

  beforeAll(async () => { colyseus = await boot(appConfig) })
  afterAll(async () => { await colyseus.shutdown() })
  beforeEach(async () => { await colyseus.cleanup() })

  it('on join, the player has no pick and is not confirmed (status stays lobby)', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    const state = room.state as ArenaState
    const me = state.players.get(client.sessionId)!
    expect(me).toBeDefined()
    expect(me.selectedChar).toBe('')
    expect(me.confirmed).toBe(false)
    expect(state.status).toBe('lobby')
  })

  it("'selectChar' sets selectedChar (and mirrors charKey)", async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    client.send('selectChar', { charKey: 'dida' })
    await waitFor(room, s => s.players.get(client.sessionId)!.selectedChar === 'dida')

    const me = (room.state as ArenaState).players.get(client.sessionId)!
    expect(me.selectedChar).toBe('dida')
    expect(me.charKey).toBe('dida')
  })

  it("'selectChar' with an invalid charKey is ignored", async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    client.send('selectChar', { charKey: 'godzilla' })
    client.send('selectChar', { charKey: 42 as any })
    client.send('selectChar', null as any)
    for (let i = 0; i < 4; i++) await room.waitForNextPatch()

    expect((room.state as ArenaState).players.get(client.sessionId)!.selectedChar).toBe('')
  })

  it('a character taken by another player is LOCKED — selectChar on it is ignored', async () => {
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    const c2 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    c1.send('selectChar', { charKey: 'werdum' })
    await waitFor(room, s => s.players.get(c1.sessionId)!.selectedChar === 'werdum')

    // c2 tries to take werdum (already c1's) → ignored, stays empty.
    c2.send('selectChar', { charKey: 'werdum' })
    for (let i = 0; i < 4; i++) await room.waitForNextPatch()
    expect((room.state as ArenaState).players.get(c2.sessionId)!.selectedChar).toBe('')

    // c2 can take a free one.
    c2.send('selectChar', { charKey: 'dida' })
    await waitFor(room, s => s.players.get(c2.sessionId)!.selectedChar === 'dida')
    expect((room.state as ArenaState).players.get(c2.sessionId)!.selectedChar).toBe('dida')
  })

  it('a player may change their own pick to another free character before confirming', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    client.send('selectChar', { charKey: 'werdum' })
    await waitFor(room, s => s.players.get(client.sessionId)!.selectedChar === 'werdum')
    client.send('selectChar', { charKey: 'thor' })
    await waitFor(room, s => s.players.get(client.sessionId)!.selectedChar === 'thor')

    expect((room.state as ArenaState).players.get(client.sessionId)!.selectedChar).toBe('thor')
  })

  it("'confirmChar' requires a pick — ignored when selectedChar is empty", async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    client.send('confirmChar', {})
    for (let i = 0; i < 4; i++) await room.waitForNextPatch()
    expect((room.state as ArenaState).players.get(client.sessionId)!.confirmed).toBe(false)
  })

  it("'confirmChar' after a pick sets confirmed = true", async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    client.send('selectChar', { charKey: 'thor' })
    await waitFor(room, s => s.players.get(client.sessionId)!.selectedChar === 'thor')
    client.send('confirmChar', {})
    await waitFor(room, s => s.players.get(client.sessionId)!.confirmed === true)

    expect((room.state as ArenaState).players.get(client.sessionId)!.confirmed).toBe(true)
  })

  it("'unconfirm' lets a player un-lock and change before start", async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    client.send('selectChar', { charKey: 'thor' })
    await waitFor(room, s => s.players.get(client.sessionId)!.selectedChar === 'thor')
    client.send('confirmChar', {})
    await waitFor(room, s => s.players.get(client.sessionId)!.confirmed === true)

    client.send('unconfirm', {})
    await waitFor(room, s => s.players.get(client.sessionId)!.confirmed === false)
    client.send('selectChar', { charKey: 'werdum' })
    await waitFor(room, s => s.players.get(client.sessionId)!.selectedChar === 'werdum')
    expect((room.state as ArenaState).players.get(client.sessionId)!.selectedChar).toBe('werdum')
  })

  it('a single player who picks + confirms auto-starts the match', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    client.send('selectChar', { charKey: 'werdum' })
    await waitFor(room, s => s.players.get(client.sessionId)!.selectedChar === 'werdum')
    client.send('confirmChar', {})

    const started = await waitFor(room, s => s.status === 'playing', 80)
    expect(started).toBe(true)
    // Let the simulation tick so wave 1 is projected.
    await waitFor(room, s => s.wave >= 1, 10)
    const state = room.state as ArenaState
    expect(state.wave).toBeGreaterThanOrEqual(1)
    // The player's character carries their confirmed pick into the match.
    expect(state.players.get(client.sessionId)!.charKey).toBe('werdum')
  })

  it('the match starts ONLY when ALL connected players have confirmed', async () => {
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    const c2 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    c1.send('selectChar', { charKey: 'werdum' })
    c2.send('selectChar', { charKey: 'dida' })
    await waitFor(room, s => s.players.get(c1.sessionId)!.selectedChar === 'werdum' &&
                             s.players.get(c2.sessionId)!.selectedChar === 'dida')

    // Only c1 confirms → must NOT start.
    c1.send('confirmChar', {})
    await waitFor(room, s => s.players.get(c1.sessionId)!.confirmed === true)
    for (let i = 0; i < 30; i++) await room.waitForNextPatch()
    expect((room.state as ArenaState).status).toBe('lobby')

    // c2 confirms → now all confirmed → starts.
    c2.send('confirmChar', {})
    const started = await waitFor(room, s => s.status === 'playing', 80)
    expect(started).toBe(true)
  })

  it('humanSlots at start use each player\'s confirmed selectedChar (2 humans → 1 AI ally = thor)', async () => {
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    const c2 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    c1.send('selectChar', { charKey: 'werdum' })
    c2.send('selectChar', { charKey: 'dida' })
    await waitFor(room, s => s.players.get(c1.sessionId)!.selectedChar === 'werdum' &&
                             s.players.get(c2.sessionId)!.selectedChar === 'dida')
    c1.send('confirmChar', {})
    c2.send('confirmChar', {})

    const started = await waitFor(room, s => s.status === 'playing', 80)
    expect(started).toBe(true)
    const state = room.state as ArenaState
    const humanChars = [c1, c2].map(c => state.players.get(c.sessionId)!.charKey).sort()
    expect(humanChars).toEqual(['dida', 'werdum'])
    // The unpicked character (thor) becomes the AI ally.
    for (let i = 0; i < 6; i++) await room.waitForNextPatch()
    expect(state.allies.length).toBe(1)
    expect(state.allies[0].charKey).toBe('thor')
  })

  it('a late joiner sees the current picks of players already in the room', async () => {
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()
    c1.send('selectChar', { charKey: 'werdum' })
    await waitFor(room, s => s.players.get(c1.sessionId)!.selectedChar === 'werdum')

    const c2 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()
    // c2's view of the room state already contains c1's pick.
    const seen = (room.state as ArenaState).players.get(c1.sessionId)!.selectedChar
    expect(seen).toBe('werdum')
    // And c2 cannot pick the locked werdum.
    c2.send('selectChar', { charKey: 'werdum' })
    for (let i = 0; i < 4; i++) await room.waitForNextPatch()
    expect((room.state as ArenaState).players.get(c2.sessionId)!.selectedChar).toBe('')
  })

  it('a player joining during the auto-start beat cancels the start (not excluded)', async () => {
    // Race regression: c1 picks + confirms → the 1s auto-start beat is armed. If c2
    // joins inside that window, the match must NOT start without c2 (the all-confirmed
    // gate now includes c2). The start is cancelled until c2 also confirms.
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()
    c1.send('selectChar', { charKey: 'werdum' })
    await waitFor(room, s => s.players.get(c1.sessionId)!.selectedChar === 'werdum')
    c1.send('confirmChar', {})
    await waitFor(room, s => s.players.get(c1.sessionId)!.confirmed === true)

    // Join c2 immediately (well within the 1s beat).
    const c2 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    // Wait past the beat — must still be in lobby because c2 is unconfirmed.
    for (let i = 0; i < 30; i++) await room.waitForNextPatch()
    expect((room.state as ArenaState).status).toBe('lobby')

    // Now c2 picks + confirms → all confirmed → starts, and c2 is in the match.
    c2.send('selectChar', { charKey: 'dida' })
    await waitFor(room, s => s.players.get(c2.sessionId)!.selectedChar === 'dida')
    c2.send('confirmChar', {})
    const started = await waitFor(room, s => s.status === 'playing', 80)
    expect(started).toBe(true)
    expect((room.state as ArenaState).players.size).toBe(2)
  })

  it("legacy 'ready' still starts when at least one player has confirmed a pick", async () => {
    // Backward-compat: the old host 'ready' trigger remains as a manual fallback,
    // but only fires when picks are confirmable (a confirmed selection exists).
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    client.send('selectChar', { charKey: 'dida' })
    await waitFor(room, s => s.players.get(client.sessionId)!.selectedChar === 'dida')
    client.send('confirmChar', {})
    await waitFor(room, s => s.players.get(client.sessionId)!.confirmed === true)
    client.send('ready', {})

    const started = await waitFor(room, s => s.status === 'playing', 80)
    expect(started).toBe(true)
    expect((room.state as ArenaState).players.get(client.sessionId)!.charKey).toBe('dida')
  })

  // ── FB4: slotIndex assignment ─────────────────────────────────────────────────

  it('FB4: single player who starts is assigned slotIndex 0 (P1)', async () => {
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    c1.send('selectChar', { charKey: 'werdum' })
    await waitFor(room, s => s.players.get(c1.sessionId)!.selectedChar === 'werdum')
    c1.send('confirmChar', {})

    const started = await waitFor(room, s => s.status === 'playing', 80)
    expect(started).toBe(true)
    expect((room.state as ArenaState).players.get(c1.sessionId)!.slotIndex).toBe(0)
  })

  it('FB4: two players — first joiner is slot 0 (P1), second joiner is slot 1 (P2)', async () => {
    const room = await colyseus.createRoom('arena', {})
    // c1 joins first → must be slot 0; c2 joins second → must be slot 1
    const c1 = await colyseus.connectTo(room, {})
    const c2 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    c1.send('selectChar', { charKey: 'werdum' })
    c2.send('selectChar', { charKey: 'dida' })
    await waitFor(room, s => s.players.get(c1.sessionId)!.selectedChar === 'werdum' &&
                             s.players.get(c2.sessionId)!.selectedChar === 'dida')
    c1.send('confirmChar', {})
    c2.send('confirmChar', {})

    const started = await waitFor(room, s => s.status === 'playing', 80)
    expect(started).toBe(true)

    const state = room.state as ArenaState
    expect(state.players.get(c1.sessionId)!.slotIndex).toBe(0)
    expect(state.players.get(c2.sessionId)!.slotIndex).toBe(1)
  })

  it('FB4: slotIndex is assigned at join time — lobby players already have valid slot indices', async () => {
    // FB4 fix: slotIndex is now the single source of truth from the moment of JOIN,
    // so both lobby selector and in-game indicator always agree on P-numbers.
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    const c2 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    // Lobby phase — slotIndex is already assigned (not -1) so the selector can use it.
    const state = room.state as ArenaState
    expect(state.players.get(c1.sessionId)!.slotIndex).toBe(0) // first joiner = P1
    expect(state.players.get(c2.sessionId)!.slotIndex).toBe(1) // second joiner = P2
  })

  it('FB4: three players — slot indices match join order 0/1/2 (P1/P2/P3)', async () => {
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
      s.players.get(c3.sessionId)!.selectedChar === 'thor',
    )
    c1.send('confirmChar', {})
    c2.send('confirmChar', {})
    c3.send('confirmChar', {})

    const started = await waitFor(room, s => s.status === 'playing', 80)
    expect(started).toBe(true)

    const state = room.state as ArenaState
    expect(state.players.get(c1.sessionId)!.slotIndex).toBe(0)
    expect(state.players.get(c2.sessionId)!.slotIndex).toBe(1)
    expect(state.players.get(c3.sessionId)!.slotIndex).toBe(2)
  })

  it('FB4: P2 leaves lobby → new joiner takes index 1 (lowest free), P1/P3 unchanged', async () => {
    // Allocation rule: indices are assigned once at join and never reshuffled.
    // If P2 (index 1) leaves, the next joiner takes the lowest free index (1 again).
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    const c2 = await colyseus.connectTo(room, {})
    const c3 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    const state = room.state as ArenaState
    expect(state.players.get(c1.sessionId)!.slotIndex).toBe(0)
    expect(state.players.get(c2.sessionId)!.slotIndex).toBe(1)
    expect(state.players.get(c3.sessionId)!.slotIndex).toBe(2)

    // P2 (c2) leaves
    await c2.leave()
    await waitFor(room, s => !s.players.has(c2.sessionId))

    // P1 and P3 keep their indices
    expect(state.players.get(c1.sessionId)!.slotIndex).toBe(0)
    expect(state.players.get(c3.sessionId)!.slotIndex).toBe(2)

    // New joiner takes index 1 (the lowest free index)
    const c4 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()
    expect(state.players.get(c4.sessionId)!.slotIndex).toBe(1)
  })

  it('FB4: slotIndex stable in lobby through match start — same values before and after startMatch', async () => {
    // Verify startMatch does not reassign slotIndex values that were set at join.
    const room = await colyseus.createRoom('arena', {})
    const c1 = await colyseus.connectTo(room, {})
    const c2 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    const state = room.state as ArenaState
    // Record slot indices from lobby phase
    const lobbySlot1 = state.players.get(c1.sessionId)!.slotIndex
    const lobbySlot2 = state.players.get(c2.sessionId)!.slotIndex
    expect(lobbySlot1).toBe(0)
    expect(lobbySlot2).toBe(1)

    c1.send('selectChar', { charKey: 'werdum' })
    c2.send('selectChar', { charKey: 'dida' })
    await waitFor(room, s => s.players.get(c1.sessionId)!.selectedChar === 'werdum' &&
                             s.players.get(c2.sessionId)!.selectedChar === 'dida')
    c1.send('confirmChar', {})
    c2.send('confirmChar', {})

    const started = await waitFor(room, s => s.status === 'playing', 80)
    expect(started).toBe(true)

    // Post-start slot indices must equal lobby slot indices
    expect(state.players.get(c1.sessionId)!.slotIndex).toBe(lobbySlot1)
    expect(state.players.get(c2.sessionId)!.slotIndex).toBe(lobbySlot2)
  })
})
