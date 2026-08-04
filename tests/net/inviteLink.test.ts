/**
 * inviteLink.ts — pure unit tests (RED first, TDD)
 *
 * Covers:
 *  - parseInviteCode: extract ?sala= param, normalize to uppercase, reject invalid
 *  - buildInviteUrl: build a shareable URL with the room code
 */

import { describe, it, expect } from 'vitest'
import { parseInviteCode, buildInviteUrl } from '../../src/net/inviteLink'

// ── parseInviteCode ──────────────────────────────────────────────────────────

describe('parseInviteCode', () => {
  // Happy-path: standard beta URL
  it('parses a valid code from a full beta URL', () => {
    expect(parseInviteCode('https://3contratodos.com/v2/?sala=ABCD')).toBe('ABCD')
  })

  // Migração de domínio (2026-08): convites gerados antes da troca apontam para
  // werdumfight.com e chegam aqui via 301. O parser é agnóstico de host — este
  // teste trava esse contrato para que links já compartilhados não quebrem.
  it('still parses legacy werdumfight.com invites', () => {
    expect(parseInviteCode('https://werdumfight.com/v2/?sala=ABCD')).toBe('ABCD')
  })

  it('normalises lowercase to uppercase', () => {
    expect(parseInviteCode('https://werdumfight.com/v2/?sala=abcd')).toBe('ABCD')
  })

  it('trims whitespace around the param value', () => {
    expect(parseInviteCode('https://werdumfight.com/v2/?sala=%20ABCD%20')).toBe('ABCD')
  })

  it('accepts mixed case', () => {
    expect(parseInviteCode('https://werdumfight.com/v2/?sala=AbCd')).toBe('ABCD')
  })

  // Localhost dev URL (used in E2E tests)
  it('parses from a localhost URL', () => {
    expect(parseInviteCode('http://localhost:3000/?sala=WXYZ')).toBe('WXYZ')
  })

  it('works when sala is not the first query param', () => {
    expect(parseInviteCode('https://werdumfight.com/v2/?foo=bar&sala=LMNO')).toBe('LMNO')
  })

  // Rejection cases
  it('returns null for a code shorter than 4 letters', () => {
    expect(parseInviteCode('https://werdumfight.com/v2/?sala=AB')).toBeNull()
  })

  it('returns null for a code longer than 4 letters', () => {
    expect(parseInviteCode('https://werdumfight.com/v2/?sala=ABCDE')).toBeNull()
  })

  it('returns null for a code containing digits', () => {
    expect(parseInviteCode('https://werdumfight.com/v2/?sala=12CD')).toBeNull()
  })

  it('returns null when ?sala param is absent', () => {
    expect(parseInviteCode('https://werdumfight.com/v2/')).toBeNull()
  })

  it('returns null for an empty ?sala param', () => {
    expect(parseInviteCode('https://werdumfight.com/v2/?sala=')).toBeNull()
  })

  it('returns null for a malformed URL (plain string, no scheme)', () => {
    expect(parseInviteCode('not-a-url')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseInviteCode('')).toBeNull()
  })

  it('never throws on any input', () => {
    const weird = ['???', '://bad', '\0\n', '  ', null as unknown as string]
    for (const v of weird) {
      expect(() => parseInviteCode(v)).not.toThrow()
    }
  })
})

// ── buildInviteUrl ───────────────────────────────────────────────────────────

describe('buildInviteUrl', () => {
  it('builds URL with the default beta base', () => {
    expect(buildInviteUrl('ABCD')).toBe('https://3contratodos.com/v2/?sala=ABCD')
  })

  it('accepts a custom base URL', () => {
    expect(buildInviteUrl('ZZZZ', 'http://localhost:3000/')).toBe('http://localhost:3000/?sala=ZZZZ')
  })

  it('accepts a custom base without trailing slash', () => {
    expect(buildInviteUrl('WXYZ', 'http://localhost:3000')).toBe('http://localhost:3000/?sala=WXYZ')
  })

  it('normalises the code to uppercase', () => {
    expect(buildInviteUrl('abcd')).toBe('https://3contratodos.com/v2/?sala=ABCD')
  })

  it('is idempotent: encoding and case are stable', () => {
    const first  = buildInviteUrl('ABCD')
    const second = buildInviteUrl('ABCD')
    expect(first).toBe(second)
  })

  it('preserves the beta path /v2/', () => {
    const url = buildInviteUrl('ABCD')
    expect(new URL(url).pathname).toBe('/v2/')
  })

  it('throws (or rejects gracefully) for an invalid code', () => {
    // normalizeRoomCode validates; we expect an Error for bad input.
    expect(() => buildInviteUrl('BAD_CODE')).toThrow()
  })
})
