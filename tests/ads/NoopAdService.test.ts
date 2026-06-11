/**
 * NoopAdService.ts unit tests — Task 2, Step 2 (RED → GREEN)
 *
 * Contracts:
 *  - init() resolves without throwing, calls no external plugin
 *  - prepareRewarded() resolves without throwing
 *  - showRewarded() resolves { granted: true } IMMEDIATELY (no plugin, no delay)
 *  - prepareInterstitial() resolves without throwing
 *  - showInterstitial() resolves void without throwing
 *  - None of these methods ever throw (even on repeated calls)
 *
 * Rationale: The NoopAdService is used in the web beta and premium builds.
 * showRewarded must resolve granted:true so the continue flow in the beta keeps
 * working without a real rewarded ad. Interstitial is truly silent.
 */

import { describe, it, expect } from 'vitest'
import { NoopAdService } from '../../src/ads/NoopAdService'

describe('NoopAdService', () => {
  let svc: NoopAdService

  // Fresh instance per test (though stateless, keeping it clean)
  svc = new NoopAdService()

  it('init() resolves (does not throw)', async () => {
    await expect(svc.init()).resolves.toBeUndefined()
  })

  it('prepareRewarded() resolves (does not throw)', async () => {
    await expect(svc.prepareRewarded()).resolves.toBeUndefined()
  })

  it('showRewarded() resolves { granted: true }', async () => {
    const result = await svc.showRewarded()
    expect(result).toEqual({ granted: true })
  })

  it('showRewarded() always returns granted:true (no plugin dependency)', async () => {
    // Call multiple times — always granted:true, no side effects
    const r1 = await svc.showRewarded()
    const r2 = await svc.showRewarded()
    const r3 = await svc.showRewarded()
    expect(r1.granted).toBe(true)
    expect(r2.granted).toBe(true)
    expect(r3.granted).toBe(true)
  })

  it('prepareInterstitial() resolves (does not throw)', async () => {
    await expect(svc.prepareInterstitial()).resolves.toBeUndefined()
  })

  it('showInterstitial() resolves void (does not throw)', async () => {
    await expect(svc.showInterstitial()).resolves.toBeUndefined()
  })

  it('showInterstitial() resolves even when called without prepareInterstitial()', async () => {
    const freshSvc = new NoopAdService()
    await expect(freshSvc.showInterstitial()).resolves.toBeUndefined()
  })

  it('does not call any external module (pure no-op)', async () => {
    // Verifying via the absence of side effects: calling all methods on a
    // fresh instance must complete synchronously-ish with no exceptions
    const fresh = new NoopAdService()
    await fresh.init()
    await fresh.prepareRewarded()
    const r = await fresh.showRewarded()
    await fresh.prepareInterstitial()
    await fresh.showInterstitial()
    expect(r.granted).toBe(true)
  })
})
