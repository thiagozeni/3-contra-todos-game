/**
 * Pure helpers for resolving "my" selector state from the authoritative player list
 * (FB6). Extracted so the identity mapping is headless-testable.
 *
 * FB6 background: the lobby is reused across matches (Phaser pools scene instances). If
 * `mySessionId` carries over from the PREVIOUS match, the lookup below resolves "me" to a
 * player that no longer exists in the new room → my pick resolves to '' and selection
 * silently does nothing ("stuck with the previous character"). The fix is to reset
 * `mySessionId` on every lobby entry; this helper pins the correct mapping.
 */

import type { PlayerInfo } from './NetClient'

export interface MySelection {
  /** My current cursor pick ('' when I have no pick or my session is not in the room). */
  selectedChar: string
  /** Whether I have locked in my pick. */
  confirmed: boolean
  /** True when my session id maps to a real player in the room. */
  present: boolean
}

/**
 * Resolve my selector state from the room's player list and my session id.
 *
 * A null/absent/stale session id (not found in `players`) yields an empty, unconfirmed
 * selection — never a leftover pick from another player.
 */
export function resolveMySelection(players: PlayerInfo[], mySessionId: string | null): MySelection {
  const me = mySessionId ? players.find(p => p.sessionId === mySessionId) : undefined
  return {
    selectedChar: me?.selectedChar ?? '',
    confirmed: me?.confirmed ?? false,
    present: !!me,
  }
}
