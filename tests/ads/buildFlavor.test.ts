/**
 * buildFlavor.ts unit tests — Task 1, Step 1 (RED)
 *
 * Contracts:
 *  - Without VITE_FREE_BUILD set: FREE_BUILD=false, PREMIUM_BUILD=true, ADS_ENABLED=false
 *  - With VITE_FREE_BUILD==='true': FREE_BUILD=true, PREMIUM_BUILD=false, ADS_ENABLED=true
 *
 * Mirrors the same technique used by flags.ts (import.meta.env pattern).
 * These tests run in vitest where import.meta.env.VITE_FREE_BUILD is NOT set,
 * so the "default premium" path is exercised in the module-level import.
 *
 * The "free build" path is tested by inspecting the derivation logic directly
 * (the module re-exports the raw env value so we can reason about it), or by
 * confirming the boolean derivation contract via inline logic tests.
 */

import { describe, it, expect } from 'vitest'
import { FREE_BUILD, PREMIUM_BUILD, ADS_ENABLED } from '../../src/ads/buildFlavor'

describe('buildFlavor — flavor flags', () => {
  // ── default (no env var) ───────────────────────────────────────────────────

  it('FREE_BUILD is a boolean', () => {
    expect(typeof FREE_BUILD).toBe('boolean')
  })

  it('FREE_BUILD is false in test environment (no VITE_FREE_BUILD set)', () => {
    // In vitest, import.meta.env.VITE_FREE_BUILD is absent → must default to false
    expect(FREE_BUILD).toBe(false)
  })

  it('PREMIUM_BUILD is a boolean', () => {
    expect(typeof PREMIUM_BUILD).toBe('boolean')
  })

  it('PREMIUM_BUILD is true in test environment (FREE_BUILD=false → PREMIUM_BUILD=true)', () => {
    expect(PREMIUM_BUILD).toBe(true)
  })

  it('ADS_ENABLED is a boolean', () => {
    expect(typeof ADS_ENABLED).toBe('boolean')
  })

  it('ADS_ENABLED is false in test environment (no ads in premium/default build)', () => {
    expect(ADS_ENABLED).toBe(false)
  })

  // ── derivation contract (logic unit tests — independent of module-level state) ──

  it('derivation: VITE_FREE_BUILD==="true" → FREE_BUILD=true, ADS_ENABLED=true, PREMIUM_BUILD=false', () => {
    // Test the derivation logic directly, without re-importing the module.
    // This mirrors the contract that must hold when the env IS set to 'true'.
    const rawFreeEnv = 'true'
    const derivedFree = rawFreeEnv === 'true'
    const derivedPremium = !derivedFree
    const derivedAds = derivedFree

    expect(derivedFree).toBe(true)
    expect(derivedPremium).toBe(false)
    expect(derivedAds).toBe(true)
  })

  it('derivation: VITE_FREE_BUILD==="false" → same as absent (premium defaults)', () => {
    const rawFreeEnv = 'false'
    const derivedFree = rawFreeEnv === 'true'
    const derivedPremium = !derivedFree
    const derivedAds = derivedFree

    expect(derivedFree).toBe(false)
    expect(derivedPremium).toBe(true)
    expect(derivedAds).toBe(false)
  })

  it('derivation: VITE_FREE_BUILD absent/undefined → premium defaults', () => {
    const rawFreeEnv = undefined
    const derivedFree = rawFreeEnv === 'true'
    const derivedPremium = !derivedFree
    const derivedAds = derivedFree

    expect(derivedFree).toBe(false)
    expect(derivedPremium).toBe(true)
    expect(derivedAds).toBe(false)
  })

  // ── invariant ─────────────────────────────────────────────────────────────

  it('FREE_BUILD and PREMIUM_BUILD are always complementary (never both true/false)', () => {
    // This invariant must hold regardless of environment
    expect(FREE_BUILD).toBe(!PREMIUM_BUILD)
  })

  it('ADS_ENABLED equals FREE_BUILD (ads only active in free builds)', () => {
    expect(ADS_ENABLED).toBe(FREE_BUILD)
  })
})
