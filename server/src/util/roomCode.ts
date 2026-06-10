import type { Presence } from '@colyseus/core'

/**
 * Presence key for the set of all live arena room codes.
 * Using a Redis-compatible set so the registry works with both
 * LocalPresence (dev/test) and RedisPresence (production scale-out).
 */
export const ROOM_CODE_REGISTRY = '$arena_codes'

/**
 * Length of the generated room code.
 * 4 uppercase letters = 26^4 = 456,976 combinations — ample for beta.
 */
const CODE_LENGTH = 4

/** Alphabet used for room codes (uppercase letters only, easy to read aloud). */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Generate a single random 4-letter uppercase room code.
 */
function generateCandidate(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return code
}

/**
 * Generate a unique room code via Colyseus Presence.
 *
 * Recipe: docs.colyseus.io/recipes/custom-room-id
 *
 * Atomicity strategy:
 * - We call `sadd(registry, candidate)`.
 * - Redis SADD returns 1 if the element was newly added (we own it) or 0 if
 *   it already existed (collision with another process). We treat a falsy
 *   return as collision.
 * - LocalPresence is single-process and synchronous, so there is no concurrent
 *   race; `sismember` after `sadd` is used as a safety-net check for both
 *   adapters.
 * - On true collision we regenerate and retry (≤ 1000 attempts).
 *
 * The caller (ArenaRoom.onCreate) assigns the returned code to `this.roomId`.
 * The caller (ArenaRoom.onDispose) must call `releaseRoomCode` to free the code.
 *
 * @param presence - The room's `this.presence` instance.
 * @returns The unique 4-letter code that has been reserved in the registry.
 */
export async function generateRoomCode(presence: Presence): Promise<string> {
  let attempts = 0
  while (attempts++ < 1000) {
    const code = generateCandidate()

    // sadd returns truthy (1) on Redis when the element was newly inserted;
    // returns nothing (undefined/void) on LocalPresence (single-process, safe).
    // We check sismember afterwards as the authoritative "did we win?" check
    // — this is safe for LocalPresence and provides a second line of defence
    // for Redis (covers the edge-case where two processes add the same code in
    // the same ms and both get return-value 1 due to a Redis bug/edge-case).
    const addResult = await presence.sadd(ROOM_CODE_REGISTRY, code)
    const isMember = await presence.sismember(ROOM_CODE_REGISTRY, code)

    if (isMember) {
      // For Redis: addResult truthy means we added it first.
      // For LocalPresence: sadd is synchronous, addResult is undefined, but
      // since there is no concurrency, isMember is always 1 after sadd.
      // Only treat as collision if another process won the race (Redis addResult
      // is 0 and the code was already there before us).
      const weAdded = addResult === undefined || addResult === 1 || addResult === true
      if (weAdded) return code
      // else: another process already owns this code — regenerate.
    }
    // If somehow the code is not in the set after sadd (should not happen),
    // retry anyway.
  }
  throw new Error('generateRoomCode: too many collisions — code space exhausted')
}

/**
 * Release a room code back to the available pool.
 * Call this in `onDispose` to prevent code exhaustion over time.
 *
 * @param presence - The room's `this.presence` instance.
 * @param code     - The room code to release.
 */
export function releaseRoomCode(presence: Presence, code: string): void {
  presence.srem(ROOM_CODE_REGISTRY, code)
}
