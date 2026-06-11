/**
 * inviteLink — pure helpers for share-link invite URLs.
 *
 * Design:
 *  - parseInviteCode: extract ?sala= from any URL, normalise, validate.
 *    Never throws; returns null on any invalid input.
 *  - buildInviteUrl: build the canonical invite URL for a given room code.
 *    Delegates validation to normalizeRoomCode (throws on bad code — caller guards).
 *
 * No window/DOM access — purely string manipulation so it is tree-shakable
 * and fully testable in Node/vitest.
 */

import { normalizeRoomCode } from './NetClient'

/** Default base URL for the beta web build. */
export const DEFAULT_INVITE_BASE = 'https://werdumfight.com/v2/'

/**
 * Extract and validate the room code from any invite URL.
 *
 * Accepts any valid URL that contains a `?sala=` query parameter.
 * The code is trimmed and uppercased before validation.
 *
 * @returns The normalised room code (4 uppercase letters) or null.
 */
export function parseInviteCode(url: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const raw = parsed.searchParams.get('sala')
    if (!raw) return null
    const trimmed = raw.trim().toUpperCase()
    // Reuse normalizeRoomCode validation (throws on invalid)
    return normalizeRoomCode(trimmed)
  } catch {
    return null
  }
}

/**
 * Build a shareable invite URL for the given room code.
 *
 * @param code  - Room code (case-insensitive; normalised internally).
 * @param base  - Base URL including path. Defaults to the beta werdumfight URL.
 *               Must end with `/` or a path that can receive `?sala=`.
 * @returns     The full invite URL string.
 * @throws      If `code` is not a valid 4-letter room code.
 */
export function buildInviteUrl(code: string, base?: string): string {
  const normalised = normalizeRoomCode(code) // throws on invalid
  const baseUrl = base ?? DEFAULT_INVITE_BASE

  // Parse base to set the search param cleanly (handles trailing slash or not).
  const url = new URL(baseUrl.endsWith('/') ? baseUrl : baseUrl + '/')
  // Ensure path ends with / so ?sala= is not appended to a bare filename
  if (!url.pathname.endsWith('/')) {
    url.pathname = url.pathname + '/'
  }
  url.searchParams.set('sala', normalised)
  return url.toString()
}
