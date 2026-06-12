/**
 * domCodeInput.ts — unit tests for pure helpers (FB7)
 *
 * Tests filterChar, buildFilter, isValidCode without requiring a DOM environment.
 * The DOM overlay itself is covered by the E2E script.
 */

import { describe, it, expect } from 'vitest'
import { filterChar, buildFilter, isValidCode } from '../../src/utils/domCodeInput'

// ── filterChar ────────────────────────────────────────────────────────────────

describe('filterChar', () => {
  it('passes lowercase letters as uppercase', () => {
    expect(filterChar('a')).toBe('A')
    expect(filterChar('z')).toBe('Z')
    expect(filterChar('m')).toBe('M')
  })

  it('passes uppercase letters unchanged', () => {
    expect(filterChar('A')).toBe('A')
    expect(filterChar('Z')).toBe('Z')
  })

  it('returns null for digits', () => {
    expect(filterChar('0')).toBeNull()
    expect(filterChar('9')).toBeNull()
  })

  it('returns null for space', () => {
    expect(filterChar(' ')).toBeNull()
  })

  it('returns null for punctuation', () => {
    expect(filterChar('!')).toBeNull()
    expect(filterChar('-')).toBeNull()
    expect(filterChar('_')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(filterChar('')).toBeNull()
  })

  it('returns null for multi-char string (not a single char)', () => {
    // filterChar is defined for a single char but multi-char fails the regex
    expect(filterChar('ab')).toBeNull()
  })
})

// ── buildFilter ───────────────────────────────────────────────────────────────

describe('buildFilter', () => {
  it('uppercases all letters', () => {
    expect(buildFilter('abcd')).toBe('ABCD')
  })

  it('strips non-letter characters', () => {
    expect(buildFilter('A1B2')).toBe('AB')
    expect(buildFilter('A B C D')).toBe('ABCD')
  })

  it('truncates at 4 characters', () => {
    expect(buildFilter('abcdef')).toBe('ABCD')
  })

  it('returns empty string for all-non-letter input', () => {
    expect(buildFilter('1234')).toBe('')
    expect(buildFilter('    ')).toBe('')
    expect(buildFilter('')).toBe('')
  })

  it('passes through a valid 4-letter code unchanged', () => {
    expect(buildFilter('WXYZ')).toBe('WXYZ')
  })

  it('handles mixed case + digits, keeps letters only up to 4', () => {
    expect(buildFilter('a1B2c3D4')).toBe('ABCD')
  })

  it('keeps partial input (fewer than 4 letters)', () => {
    expect(buildFilter('AB')).toBe('AB')
    expect(buildFilter('A')).toBe('A')
  })
})

// ── isValidCode ───────────────────────────────────────────────────────────────

describe('isValidCode', () => {
  it('returns true for exactly 4 uppercase letters', () => {
    expect(isValidCode('ABCD')).toBe(true)
    expect(isValidCode('WXYZ')).toBe(true)
    expect(isValidCode('AAAA')).toBe(true)
  })

  it('returns false for fewer than 4 chars', () => {
    expect(isValidCode('ABC')).toBe(false)
    expect(isValidCode('AB')).toBe(false)
    expect(isValidCode('A')).toBe(false)
    expect(isValidCode('')).toBe(false)
  })

  it('returns false for more than 4 chars', () => {
    expect(isValidCode('ABCDE')).toBe(false)
  })

  it('returns false for lowercase letters', () => {
    expect(isValidCode('abcd')).toBe(false)
  })

  it('returns false for digits mixed in', () => {
    expect(isValidCode('AB1D')).toBe(false)
  })

  it('returns false for codes with spaces', () => {
    expect(isValidCode('AB D')).toBe(false)
  })

  // ── auto-submit edge cases ───────────────────────────────────────────────

  it('a code produced by buildFilter(4 letters) is always valid', () => {
    expect(isValidCode(buildFilter('abcd'))).toBe(true)
    expect(isValidCode(buildFilter('WXYZ'))).toBe(true)
  })

  it('a code produced by buildFilter of fewer than 4 letters is never valid', () => {
    expect(isValidCode(buildFilter('abc'))).toBe(false)
    expect(isValidCode(buildFilter(''))).toBe(false)
  })
})
