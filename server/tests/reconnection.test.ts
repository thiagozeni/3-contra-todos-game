/**
 * Task 8: Reconnection (~60s window) + drop robustness — server-side tests.
 *
 * API findings (installed types, @colyseus/core 0.17.43 / @colyseus/sdk 0.17.42):
 *
 * SERVER (core):
 *   onDrop(client, code?) — fires on non-consented close (abnormal / MAY_TRY_RECONNECT)
 *   onReconnect(client) — fires when the client successfully reconnects
 *   onLeave(client, code?) — fires on: consented leave, or after reconnection window expires
 *   allowReconnection(client, seconds) — call inside onDrop to hold the slot
 *
 * CLIENT (sdk):
 *   room.onDrop((code, reason?) => ...) — fires on unexpected drop + starts auto-retry
 *   room.onReconnect(() => ...) — fires on successful reconnect
 *   room.onLeave((code, reason?) => ...) — fires on final departure
 *   room.leave(consented = true) — consented=false closes the WebSocket without consent signal
 *
 * CloseCode values (from @colyseus/shared-types):
 *   CONSENTED = 4000, SERVER_SHUTDOWN = 4001, WITH_ERROR = 4002,
 *   FAILED_TO_RECONNECT = 4003, MAY_TRY_RECONNECT = 4010
 *
 * @colyseus/testing helpers available:
 *   colyseus.createRoom / colyseus.connectTo / room.waitForNextPatch /
 *   room.waitForNextSimulationTick / room.waitForMessage
 *
 * DROP SIMULATION GAP:
 *   The @colyseus/testing SDK exposes `client.leave(consented?: boolean)` on the
 *   SDK Room handle. Calling `client.leave(false)` closes the WS without the
 *   LEAVE_ROOM protocol message — the server receives an abnormal close and fires
 *   onDrop. This IS testable (verified below).
 *
 *   However, the clock-driven "reconnection expired" path (allowReconnection timeout)
 *   requires either (a) waiting 60 real seconds, or (b) using the colyseus Clock to
 *   fast-forward. In the test environment we cannot fast-forward the Room's internal
 *   clock easily; instead we test the *consented* leave path for immediate removal,
 *   which exercises the same onLeave code path that expiry calls. The timer-expiry
 *   path is documented as a known gap — covered by manual/E2E testing.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { boot, type ColyseusTestServer } from '@colyseus/testing'
import appConfig from '../src/app.config'
import type { ArenaState } from '../src/schema/ArenaState'
import { startMatch } from './helpers'

const NEUTRAL = {
  up: false, down: false, left: false, right: false,
  block: false, punch: false, kick: false,
}

describe('Reconnection + drop robustness (Task 8)', () => {
  let colyseus: ColyseusTestServer

  beforeAll(async () => { colyseus = await boot(appConfig) })
  afterAll(async () => { await colyseus.shutdown() })
  beforeEach(async () => { await colyseus.cleanup() })

  // ── Test 1: non-consented drop → connected=false, slot retained ────────────────

  it('non-consented drop: connected=false within window, slot retained in state', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client = await colyseus.connectTo(room, { charKey: 'werdum' })
    await room.waitForNextPatch()

    const sid = client.sessionId

    // Confirm the player is connected before dropping.
    const before = (room.state as ArenaState).players.get(sid)
    expect(before).toBeDefined()
    expect(before!.connected).toBe(true)

    // Non-consented close: server fires onDrop → allowReconnection → connected=false.
    // leave(false) closes the WS non-consensually (no LEAVE_ROOM protocol message).
    await client.leave(false)
    await room.waitForNextPatch()

    const after = (room.state as ArenaState).players.get(sid)
    // Slot must still exist (not removed) and connected=false.
    expect(after).toBeDefined()
    expect(after!.connected).toBe(false)
    // Room must still have the player in state (window not expired).
    expect((room.state as ArenaState).players.size).toBe(1)
  })

  // ── Test 2: reconnect within window → connected=true, same sessionId ──────────
  //
  // Gap documentation:
  //   The @colyseus/sdk client-side auto-reconnect requires the room to be alive
  //   for at least 5s before it attempts reconnection (Room.reconnection.minUptime).
  //   In short-lived test rooms the auto-retry never fires.
  //
  //   Instead we test the server-side reconnection path directly via
  //   colyseus.sdk.reconnect(token), which bypasses the client uptime check and
  //   exercises the server's allowReconnection / onReconnect lifecycle.

  it('reconnect within window: connected=true, same sessionId accepted again', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client1 = await colyseus.connectTo(room, { charKey: 'werdum' })
    await room.waitForNextPatch()
    const sid = client1.sessionId
    const token = client1.reconnectionToken

    // Drop non-consensually.
    await client1.leave(false)
    await room.waitForNextPatch()

    // Verify slot is held and disconnected.
    expect((room.state as ArenaState).players.get(sid)?.connected).toBe(false)
    expect((room.state as ArenaState).players.size).toBe(1)

    // Reconnect using the SDK Client.reconnect(token) — bypasses the 5s uptime check.
    // This exercises the server's allowReconnection seat + onReconnect lifecycle.
    const client2 = await colyseus.sdk.reconnect(token)
    await room.waitForNextPatch()

    // After reconnect: connected=true, same sessionId.
    const reconnected = (room.state as ArenaState).players.get(sid)
    expect(reconnected).toBeDefined()
    expect(reconnected!.connected).toBe(true)
    // Still only 1 player entry (not a duplicate).
    expect((room.state as ArenaState).players.size).toBe(1)

    void client2
  })

  // ── Test 3: consented leave → immediate removal ────────────────────────────────

  it('consented leave: player removed from state.players immediately', async () => {
    // Use 2 clients so the room is not disposed when one leaves (autoDispose fires
    // only when ALL clients leave; with 2 clients the room stays alive after client1 leaves).
    const room = await colyseus.createRoom('arena', {})
    const client1 = await colyseus.connectTo(room, { charKey: 'werdum' })
    const client2 = await colyseus.connectTo(room, { charKey: 'dida' })
    await room.waitForNextPatch()

    const sid = client1.sessionId
    expect((room.state as ArenaState).players.has(sid)).toBe(true)

    // Consented leave (default leave(true)) → no reconnection window → onLeave fires.
    await client1.leave(true)
    await room.waitForNextPatch()

    // Player must be removed from state.
    expect((room.state as ArenaState).players.has(sid)).toBe(false)
    // client2 still there.
    expect((room.state as ArenaState).players.size).toBe(1)

    void client2
  })

  // ── Test 4: match continues after one player drops ────────────────────────────

  it('match continues after one player drops mid-game (status stays playing)', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client1 = await colyseus.connectTo(room, {})
    const client2 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    // Start the match via the arcade selector (both pick + confirm).
    await startMatch(room, [
      { client: client1, charKey: 'werdum' },
      { client: client2, charKey: 'dida' },
    ])
    expect((room.state as ArenaState).status).toBe('playing')

    // Drop one player non-consensually.
    await client1.leave(false)
    await room.waitForNextPatch()

    // Match must still be running.
    expect((room.state as ArenaState).status).toBe('playing')
    // The dropped player's slot is still in state (within reconnection window).
    expect((room.state as ArenaState).players.has(client1.sessionId)).toBe(true)
    expect((room.state as ArenaState).players.get(client1.sessionId)?.connected).toBe(false)

    // The remaining connected player can still send input without errors.
    client2.send('input', NEUTRAL)
    await room.waitForNextPatch()
    // Still playing.
    expect((room.state as ArenaState).status).toBe('playing')
  })

  // ── Test 5: consented leave mid-match → player removed, match continues ───────

  it('consented leave mid-match: player removed, match continues with remaining players', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client1 = await colyseus.connectTo(room, {})
    const client2 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    await startMatch(room, [
      { client: client1, charKey: 'werdum' },
      { client: client2, charKey: 'dida' },
    ])
    expect((room.state as ArenaState).status).toBe('playing')

    const sid1 = client1.sessionId
    // Consented leave → removed immediately, no reconnection window.
    // First wait for the server's leave to process (waitForNextSimulationTick
    // gives the server event loop a chance to run the async _onLeave handler).
    await client1.leave(true)
    await room.waitForNextSimulationTick()
    for (let i = 0; i < 4; i++) await room.waitForNextPatch()

    expect((room.state as ArenaState).players.has(sid1)).toBe(false)
    // The remaining player's slot is still there.
    expect((room.state as ArenaState).players.size).toBe(1)
    // Match is still playing.
    expect((room.state as ArenaState).status).toBe('playing')

    void client2
  })

  // ── Test 6: inputs from dropped player are purged ─────────────────────────────

  it('after drop, stale inputs for the dropped client are cleared (no ghost movement)', async () => {
    const room = await colyseus.createRoom('arena', {})
    const client1 = await colyseus.connectTo(room, {})
    await room.waitForNextPatch()

    await startMatch(room, [{ client: client1, charKey: 'werdum' }])

    // Hold down a movement key.
    client1.send('input', { ...NEUTRAL, right: true })
    await room.waitForNextPatch()

    // Record position before drop.
    const stateBefore = room.state as ArenaState
    const xBefore = stateBefore.players.get(client1.sessionId)?.x ?? 0

    // Drop non-consensually → inputs should be cleared on the server.
    await client1.leave(false)
    for (let i = 0; i < 6; i++) await room.waitForNextPatch()

    // Position must NOT have moved further right (stale input was cleared).
    const stateAfter = room.state as ArenaState
    const xAfter = stateAfter.players.get(client1.sessionId)?.x ?? xBefore
    // Allow ≤1 tick of movement (the drop may arrive mid-tick), but not unbounded.
    // The player should be inert (fsm='down') so no further movement occurs.
    expect(xAfter).toBeLessThanOrEqual(xBefore + 50)
  })
})
