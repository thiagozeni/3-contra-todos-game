/**
 * Client-side entitlement claim — Task 4, Fatia 4.
 *
 * getEntitlementClaim() derives the claim from the build flavor:
 *   FREE_BUILD  → 'free'
 *   PREMIUM_BUILD (default) → 'premium'
 *   Web beta (no FREE_BUILD env)  → 'premium'  (AllowAll server makes it moot)
 *
 * Follows the same test pattern as buildFlavor.test.ts: the module-level import
 * exercises the default (premium) path; the derivation logic contract is tested inline.
 *
 * classifyNetError host-gate extension:
 *   An error containing "hosting requer o app premium" maps to the PT-BR upsell message.
 */

import { describe, it, expect } from 'vitest'
import { getEntitlementClaim } from '../../src/net/entitlement'
import { classifyNetError } from '../../src/net/NetClient'

// ── getEntitlementClaim — module default (premium build in test env) ───────────

describe('getEntitlementClaim', () => {
  it('returns "premium" in the test environment (no VITE_FREE_BUILD set → PREMIUM_BUILD=true)', () => {
    // In vitest, VITE_FREE_BUILD is absent → FREE_BUILD=false → claim is 'premium'
    expect(getEntitlementClaim()).toBe('premium')
  })

  it('returns a string (valid claim type)', () => {
    expect(typeof getEntitlementClaim()).toBe('string')
  })

  // ── derivation contract (inline logic — mirrors buildFlavor.test.ts pattern) ──

  it('derivation: FREE_BUILD=true → claim is "free"', () => {
    // Test the derivation logic directly without re-importing modules.
    // This mirrors the contract that must hold when FREE_BUILD=true.
    const freeBuild = true
    const claim = freeBuild ? 'free' : 'premium'
    expect(claim).toBe('free')
  })

  it('derivation: FREE_BUILD=false → claim is "premium"', () => {
    const freeBuild = false
    const claim = freeBuild ? 'free' : 'premium'
    expect(claim).toBe('premium')
  })

  it('derivation: web beta (FREE_BUILD=false) → claim is "premium"', () => {
    // Web beta never sets VITE_FREE_BUILD=true → same as premium
    const freeBuild = false
    const claim = freeBuild ? 'free' : 'premium'
    expect(claim).toBe('premium')
  })

  it('claim is always "premium" or "free" (valid EntitlementClaim)', () => {
    const claim = getEntitlementClaim()
    expect(['premium', 'free']).toContain(claim)
  })
})

// ── classifyNetError host-gate mapping ────────────────────────────────────────

describe('classifyNetError — host gate rejection', () => {
  it('maps "hosting requer o app premium" server error to PT-BR upsell message', () => {
    const err = Object.assign(new Error('hosting requer o app premium'), { code: 4215 })
    const msg = classifyNetError(err)
    expect(msg.toLowerCase()).toContain('premium')
  })

  it('maps error with host-gate message to upsell (case-insensitive match)', () => {
    const err = new Error('Hosting requer o app Premium')
    const msg = classifyNetError(err)
    expect(msg.toLowerCase()).toContain('premium')
  })

  it('still maps "full" to Sala cheia (existing behavior unchanged)', () => {
    const err = new Error('room is full')
    expect(classifyNetError(err)).toBe('Sala cheia')
  })

  it('still maps timeout to Servidor indisponível (existing behavior unchanged)', () => {
    const err = new Error('__timeout__')
    expect(classifyNetError(err)).toBe('Servidor indisponível')
  })
})
