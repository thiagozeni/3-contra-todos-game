// Shared helpers for the ArenaRoom test suites (FB3 arcade selector flow).
//
// The character selector replaced the old join-time charKey + 'ready' start: a match
// now starts only after every connected player has selected AND confirmed a character.
// These helpers drive that flow so the existing arena/reconnection tests can start a
// match the new way without repeating the protocol everywhere.

import type { ArenaState } from '../src/schema/ArenaState'

/** Wait until `predicate(state)` is true or `maxPatches` elapse; returns the final result. */
export async function waitFor(
  room: any,
  predicate: (s: ArenaState) => boolean,
  maxPatches = 60,
): Promise<boolean> {
  for (let i = 0; i < maxPatches; i++) {
    if (predicate(room.state as ArenaState)) return true
    await room.waitForNextPatch()
  }
  return predicate(room.state as ArenaState)
}

/** Have one client select + confirm a character (does not wait for the match to start). */
export async function pickAndConfirm(room: any, client: any, charKey: string): Promise<void> {
  client.send('selectChar', { charKey })
  await waitFor(room, s => s.players.get(client.sessionId)?.selectedChar === charKey)
  client.send('confirmChar', {})
  await waitFor(room, s => s.players.get(client.sessionId)?.confirmed === true)
}

/**
 * Drive the full selector flow for a set of clients (each with a distinct charKey) and
 * wait until the match auto-starts (status 'playing' + wave projected). Returns once the
 * simulation has produced wave 1.
 */
export async function startMatch(
  room: any,
  picks: Array<{ client: any; charKey: string }>,
): Promise<void> {
  for (const { client, charKey } of picks) {
    await pickAndConfirm(room, client, charKey)
  }
  await waitFor(room, s => s.status === 'playing', 80)
  await waitFor(room, s => s.wave >= 1, 12)
}
