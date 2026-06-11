/**
 * adGating.ts unit tests — Task 2, Step 1 (RED → GREEN)
 *
 * Contracts for shouldUseRealAds(adsEnabled, isNative):
 *  - true ONLY when both adsEnabled=true AND isNative=true
 *  - false when adsEnabled=false (premium build) — even if native
 *  - false when isNative=false (web/beta) — even if adsEnabled
 *  - false when both false
 *
 * Pure logic — no plugin imports, no browser APIs.
 */

import { describe, it, expect } from 'vitest'
import { shouldUseRealAds } from '../../src/ads/adGating'

describe('shouldUseRealAds(adsEnabled, isNative)', () => {
  it('returns true when adsEnabled=true AND isNative=true (free native app)', () => {
    expect(shouldUseRealAds(true, true)).toBe(true)
  })

  it('returns false when adsEnabled=false, isNative=true (premium native build)', () => {
    expect(shouldUseRealAds(false, true)).toBe(false)
  })

  it('returns false when adsEnabled=true, isNative=false (free web/beta)', () => {
    expect(shouldUseRealAds(true, false)).toBe(false)
  })

  it('returns false when both adsEnabled=false and isNative=false (premium web)', () => {
    expect(shouldUseRealAds(false, false)).toBe(false)
  })

  it('returns a boolean (not truthy/falsy object)', () => {
    expect(typeof shouldUseRealAds(true, true)).toBe('boolean')
    expect(typeof shouldUseRealAds(false, false)).toBe('boolean')
    expect(typeof shouldUseRealAds(true, false)).toBe('boolean')
    expect(typeof shouldUseRealAds(false, true)).toBe('boolean')
  })
})
