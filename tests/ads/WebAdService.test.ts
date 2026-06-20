/**
 * WebAdService.test.ts — contract for the web simulated-ad service and the
 * factory branch that selects it (createAdService with webAdSim).
 *
 * The overlay is injected as a mock so these are pure unit tests (no DOM).
 */

import { describe, it, expect, vi } from 'vitest'
import { WebAdService } from '../../src/ads/WebAdService'
import { NoopAdService } from '../../src/ads/NoopAdService'
import { AdMobService } from '../../src/ads/AdMobService'
import { createAdService } from '../../src/ads/AdService'
import type { WebAdOverlayLike } from '../../src/ads/web/WebAdOverlay'

function mockOverlay(over: Partial<WebAdOverlayLike> = {}): WebAdOverlayLike {
  return {
    showRewarded: over.showRewarded ?? vi.fn().mockResolvedValue(true),
    showInterstitial: over.showInterstitial ?? vi.fn().mockResolvedValue(undefined),
  }
}

describe('WebAdService — showRewarded()', () => {
  it('resolves {granted:true} when the overlay reports a full watch', async () => {
    const svc = new WebAdService(mockOverlay({ showRewarded: vi.fn().mockResolvedValue(true) }))
    await expect(svc.showRewarded()).resolves.toEqual({ granted: true })
  })

  it('resolves {granted:false} when the overlay reports an early dismiss', async () => {
    const svc = new WebAdService(mockOverlay({ showRewarded: vi.fn().mockResolvedValue(false) }))
    await expect(svc.showRewarded()).resolves.toEqual({ granted: false })
  })

  it('resolves {granted:false} (never throws) when the overlay rejects', async () => {
    const svc = new WebAdService(mockOverlay({ showRewarded: vi.fn().mockRejectedValue(new Error('boom')) }))
    await expect(svc.showRewarded()).resolves.toEqual({ granted: false })
  })

  it('drives the injected overlay exactly once', async () => {
    const showRewarded = vi.fn().mockResolvedValue(true)
    const svc = new WebAdService(mockOverlay({ showRewarded }))
    await svc.showRewarded()
    expect(showRewarded).toHaveBeenCalledTimes(1)
  })
})

describe('WebAdService — showInterstitial()', () => {
  it('resolves void after the overlay closes', async () => {
    const svc = new WebAdService(mockOverlay())
    await expect(svc.showInterstitial()).resolves.toBeUndefined()
  })

  it('swallows overlay errors (fire-and-forget)', async () => {
    const svc = new WebAdService(mockOverlay({ showInterstitial: vi.fn().mockRejectedValue(new Error('x')) }))
    await expect(svc.showInterstitial()).resolves.toBeUndefined()
  })
})

describe('WebAdService — init/prepare are no-ops', () => {
  it('init/prepareRewarded/prepareInterstitial resolve undefined without touching the overlay', async () => {
    const overlay = mockOverlay()
    const svc = new WebAdService(overlay)
    await expect(svc.init()).resolves.toBeUndefined()
    await expect(svc.prepareRewarded()).resolves.toBeUndefined()
    await expect(svc.prepareInterstitial()).resolves.toBeUndefined()
    expect(overlay.showRewarded).not.toHaveBeenCalled()
    expect(overlay.showInterstitial).not.toHaveBeenCalled()
  })
})

describe('createAdService — webAdSim branch', () => {
  it('web + webAdSim=true → WebAdService', () => {
    const svc = createAdService({ adsEnabled: false, isNative: false, webAdSim: true })
    expect(svc).toBeInstanceOf(WebAdService)
  })

  it('web + webAdSim=false → NoopAdService (default web, zero friction)', () => {
    const svc = createAdService({ adsEnabled: false, isNative: false, webAdSim: false })
    expect(svc).toBeInstanceOf(NoopAdService)
  })

  it('web + webAdSim omitted → NoopAdService (back-compat default)', () => {
    const svc = createAdService({ adsEnabled: false, isNative: false })
    expect(svc).toBeInstanceOf(NoopAdService)
  })

  it('free native + webAdSim=true → AdMobService (real ads always win on native)', () => {
    const svc = createAdService({ adsEnabled: true, isNative: true, webAdSim: true })
    expect(svc).toBeInstanceOf(AdMobService)
  })

  it('non-free native + webAdSim=true → NoopAdService (sim never runs on native)', () => {
    const svc = createAdService({ adsEnabled: false, isNative: true, webAdSim: true })
    expect(svc).toBeInstanceOf(NoopAdService)
  })
})
