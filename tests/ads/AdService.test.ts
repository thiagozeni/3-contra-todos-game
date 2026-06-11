/**
 * AdService.ts unit tests — Task 2, Step 3 (RED → GREEN)
 *
 * Tests the factory (createAdService) and the AdMobService behavior.
 *
 * Contracts:
 *  FACTORY:
 *   - createAdService({adsEnabled:false, isNative:any}) → NoopAdService
 *   - createAdService({adsEnabled:true, isNative:false}) → NoopAdService
 *   - createAdService({adsEnabled:true, isNative:true}) → AdMobService
 *
 *  AdMobService (plugin injected via constructor for testability):
 *   - showRewarded() resolves {granted:true} ONLY if Rewarded event fired
 *   - showRewarded() resolves {granted:false} if Dismissed without Rewarded
 *   - showRewarded() resolves {granted:false} on plugin error (never throws)
 *   - showInterstitial() resolves void (no throw on success or on error)
 *
 * AdMobService accepts an injected plugin (via constructor opts) to avoid
 * dynamic-import timing issues in tests. Production uses the default lazy
 * dynamic import.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock @capacitor/core (used by factory via Capacitor.isNativePlatform) ────
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'android'),
  },
}))

// ── Also mock admob so the module can be imported (though we inject it) ──────
vi.mock('@capacitor-community/admob', () => ({
  AdMob: {},
  RewardAdPluginEvents: {
    Rewarded: 'onRewardedVideoAdReward',
    Dismissed: 'onRewardedVideoAdDismissed',
    FailedToLoad: 'onRewardedVideoAdFailedToLoad',
    FailedToShow: 'onRewardedVideoAdFailedToShow',
    Loaded: 'onRewardedVideoAdLoaded',
    Showed: 'onRewardedVideoAdShowed',
  },
  InterstitialAdPluginEvents: {
    Loaded: 'interstitialAdLoaded',
    FailedToLoad: 'interstitialAdFailedToLoad',
    Dismissed: 'interstitialAdDismissed',
    FailedToShow: 'interstitialAdFailedToShow',
    Showed: 'interstitialAdShowed',
  },
}))

import { createAdService } from '../../src/ads/AdService'
import { NoopAdService } from '../../src/ads/NoopAdService'
import {
  AdMobService,
  type AdMobPluginLike,
  type RewardEventNames,
  type CapacitorLike,
} from '../../src/ads/AdMobService'

// ── Event names used by the AdMobService ─────────────────────────────────────
const REWARD_EVENTS: RewardEventNames = {
  Rewarded: 'onRewardedVideoAdReward',
  Dismissed: 'onRewardedVideoAdDismissed',
  FailedToShow: 'onRewardedVideoAdFailedToShow',
}

// ── Fake plugin builder ───────────────────────────────────────────────────────
type ListenerFunc = (...args: unknown[]) => void

function buildFakePlugin(overrides: Partial<AdMobPluginLike> = {}): {
  plugin: AdMobPluginLike
  listeners: Record<string, ListenerFunc[]>
  fireEvent(event: string, payload?: unknown): void
} {
  const listeners: Record<string, ListenerFunc[]> = {}

  function fireEvent(event: string, payload?: unknown) {
    ;(listeners[event] ?? []).forEach((fn) => fn(payload as never))
  }

  const plugin: AdMobPluginLike = {
    initialize: vi.fn().mockResolvedValue(undefined),
    requestTrackingAuthorization: vi.fn().mockResolvedValue(undefined),
    prepareRewardVideoAd: vi.fn().mockResolvedValue({ adUnitId: 'test' }),
    showRewardVideoAd: vi.fn().mockResolvedValue({ type: 'coins', amount: 1 }),
    prepareInterstitial: vi.fn().mockResolvedValue({ adUnitId: 'test' }),
    showInterstitial: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn((event: string, fn: ListenerFunc) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(fn)
      return Promise.resolve({ remove: vi.fn() })
    }),
    ...overrides,
  }

  return { plugin, listeners, fireEvent }
}

const fakeCapacitor: CapacitorLike = { getPlatform: () => 'android' }
const fakeCapacitorIos: CapacitorLike = { getPlatform: () => 'ios' }

// ── Factory tests ────────────────────────────────────────────────────────────
describe('createAdService — factory selection', () => {
  it('returns NoopAdService when adsEnabled=false, isNative=false (premium web)', () => {
    const svc = createAdService({ adsEnabled: false, isNative: false })
    expect(svc).toBeInstanceOf(NoopAdService)
  })

  it('returns NoopAdService when adsEnabled=false, isNative=true (premium native)', () => {
    const svc = createAdService({ adsEnabled: false, isNative: true })
    expect(svc).toBeInstanceOf(NoopAdService)
  })

  it('returns NoopAdService when adsEnabled=true, isNative=false (free web/beta)', () => {
    const svc = createAdService({ adsEnabled: true, isNative: false })
    expect(svc).toBeInstanceOf(NoopAdService)
  })

  it('returns AdMobService when adsEnabled=true, isNative=true (free native app)', () => {
    const svc = createAdService({ adsEnabled: true, isNative: true })
    expect(svc).toBeInstanceOf(AdMobService)
  })
})

// ── AdMobService — showRewarded ───────────────────────────────────────────────
describe('AdMobService — showRewarded behavior', () => {
  it('resolves {granted:true} when Rewarded event fires', async () => {
    const { plugin, fireEvent } = buildFakePlugin()
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })

    // showRewardVideoAd resolves after the event fires — simulate via mock
    ;(plugin.showRewardVideoAd as ReturnType<typeof vi.fn>).mockImplementation(() => {
      fireEvent(REWARD_EVENTS.Rewarded, { type: 'coins', amount: 1 })
      return Promise.resolve({ type: 'coins', amount: 1 })
    })

    const result = await svc.showRewarded()
    expect(result.granted).toBe(true)
  })

  it('resolves {granted:false} when Dismissed fires without prior Rewarded', async () => {
    const { plugin, fireEvent } = buildFakePlugin()
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })

    ;(plugin.showRewardVideoAd as ReturnType<typeof vi.fn>).mockImplementation(() => {
      fireEvent(REWARD_EVENTS.Dismissed)
      return Promise.resolve({ type: '', amount: 0 })
    })

    const result = await svc.showRewarded()
    expect(result.granted).toBe(false)
  })

  it('resolves {granted:false} on FailedToShow — never throws', async () => {
    const { plugin, fireEvent } = buildFakePlugin()
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })

    ;(plugin.showRewardVideoAd as ReturnType<typeof vi.fn>).mockImplementation(() => {
      fireEvent(REWARD_EVENTS.FailedToShow)
      return Promise.resolve({})
    })

    const result = await svc.showRewarded()
    expect(result.granted).toBe(false)
  })

  it('resolves {granted:false} when prepareRewardVideoAd rejects — never throws', async () => {
    const { plugin } = buildFakePlugin({
      prepareRewardVideoAd: vi.fn().mockRejectedValue(new Error('network error')),
    })
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })

    const result = await svc.showRewarded()
    expect(result.granted).toBe(false)
  })

  it('resolves {granted:false} when showRewardVideoAd rejects — never throws', async () => {
    const { plugin } = buildFakePlugin({
      showRewardVideoAd: vi.fn().mockRejectedValue(new Error('show failed')),
    })
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })

    const result = await svc.showRewarded()
    expect(result.granted).toBe(false)
  })

  it('settled:false prevents double-resolution (Dismissed after Rewarded = still granted:true)', async () => {
    const { plugin, fireEvent } = buildFakePlugin()
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })

    ;(plugin.showRewardVideoAd as ReturnType<typeof vi.fn>).mockImplementation(() => {
      // Fire Rewarded first, then Dismissed (real plugin behavior after full watch)
      fireEvent(REWARD_EVENTS.Rewarded, { type: 'coins', amount: 1 })
      fireEvent(REWARD_EVENTS.Dismissed)
      return Promise.resolve({ type: 'coins', amount: 1 })
    })

    const result = await svc.showRewarded()
    expect(result.granted).toBe(true)
  })
})

// ── AdMobService — showInterstitial ───────────────────────────────────────────
describe('AdMobService — showInterstitial behavior', () => {
  it('resolves void without throwing on success', async () => {
    const { plugin } = buildFakePlugin()
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })
    await expect(svc.showInterstitial()).resolves.toBeUndefined()
  })

  it('resolves void without throwing when prepareInterstitial rejects', async () => {
    const { plugin } = buildFakePlugin({
      prepareInterstitial: vi.fn().mockRejectedValue(new Error('no fill')),
    })
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })
    await expect(svc.showInterstitial()).resolves.toBeUndefined()
  })

  it('resolves void without throwing when showInterstitial plugin rejects', async () => {
    const { plugin } = buildFakePlugin({
      showInterstitial: vi.fn().mockRejectedValue(new Error('show failed')),
    })
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })
    await expect(svc.showInterstitial()).resolves.toBeUndefined()
  })

  it('never throws even on complete failure', async () => {
    const { plugin } = buildFakePlugin({
      prepareInterstitial: vi.fn().mockRejectedValue(new Error('crash')),
      showInterstitial: vi.fn().mockRejectedValue(new Error('crash')),
    })
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })
    await expect(svc.showInterstitial()).resolves.toBeUndefined()
  })
})

// ── AdMobService — prepareRewarded ────────────────────────────────────────────
describe('AdMobService — prepareRewarded()', () => {
  it('resolves void without throwing on success (Android)', async () => {
    const { plugin } = buildFakePlugin()
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })
    await expect(svc.prepareRewarded()).resolves.toBeUndefined()
    expect(plugin.prepareRewardVideoAd).toHaveBeenCalledWith(
      expect.objectContaining({ isTesting: true }),
    )
  })

  it('resolves void without throwing on success (iOS)', async () => {
    const { plugin } = buildFakePlugin()
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitorIos })
    await expect(svc.prepareRewarded()).resolves.toBeUndefined()
    // iOS ad unit ID differs from Android
    expect(plugin.prepareRewardVideoAd).toHaveBeenCalledWith(
      expect.objectContaining({
        adId: 'ca-app-pub-3940256099942544/1712485313',
        isTesting: true,
      }),
    )
  })

  it('resolves void without throwing when prepareRewardVideoAd rejects', async () => {
    const { plugin } = buildFakePlugin({
      prepareRewardVideoAd: vi.fn().mockRejectedValue(new Error('no fill')),
    })
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })
    await expect(svc.prepareRewarded()).resolves.toBeUndefined()
  })
})

// ── AdMobService — prepareInterstitial ───────────────────────────────────────
describe('AdMobService — prepareInterstitial()', () => {
  it('resolves void without throwing on success (Android)', async () => {
    const { plugin } = buildFakePlugin()
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })
    await expect(svc.prepareInterstitial()).resolves.toBeUndefined()
    expect(plugin.prepareInterstitial).toHaveBeenCalledWith(
      expect.objectContaining({ isTesting: true }),
    )
  })

  it('resolves void without throwing on success (iOS)', async () => {
    const { plugin } = buildFakePlugin()
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitorIos })
    await expect(svc.prepareInterstitial()).resolves.toBeUndefined()
    expect(plugin.prepareInterstitial).toHaveBeenCalledWith(
      expect.objectContaining({
        adId: 'ca-app-pub-3940256099942544/4411468910',
        isTesting: true,
      }),
    )
  })

  it('resolves void without throwing when prepareInterstitial rejects', async () => {
    const { plugin } = buildFakePlugin({
      prepareInterstitial: vi.fn().mockRejectedValue(new Error('no fill')),
    })
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })
    await expect(svc.prepareInterstitial()).resolves.toBeUndefined()
  })
})

// ── AdMobService — init ────────────────────────────────────────────────────────
describe('AdMobService — init()', () => {
  it('resolves without throwing', async () => {
    const { plugin } = buildFakePlugin()
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })
    await expect(svc.init()).resolves.toBeUndefined()
  })

  it('calls AdMob.initialize', async () => {
    const { plugin } = buildFakePlugin()
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })
    await svc.init()
    expect(plugin.initialize).toHaveBeenCalledOnce()
  })

  it('resolves without throwing even if initialize rejects', async () => {
    const { plugin } = buildFakePlugin({
      initialize: vi.fn().mockRejectedValue(new Error('init failed')),
    })
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })
    await expect(svc.init()).resolves.toBeUndefined()
  })

  it('calls requestTrackingAuthorization on iOS', async () => {
    const { plugin } = buildFakePlugin()
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitorIos })
    await svc.init()
    expect(plugin.requestTrackingAuthorization).toHaveBeenCalledOnce()
  })

  it('does NOT call requestTrackingAuthorization on Android', async () => {
    const { plugin } = buildFakePlugin()
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitor })
    await svc.init()
    expect(plugin.requestTrackingAuthorization).not.toHaveBeenCalled()
  })

  it('resolves without throwing even if requestTrackingAuthorization rejects', async () => {
    const { plugin } = buildFakePlugin({
      requestTrackingAuthorization: vi.fn().mockRejectedValue(new Error('denied')),
    })
    const svc = new AdMobService({ plugin, events: REWARD_EVENTS, capacitor: fakeCapacitorIos })
    await expect(svc.init()).resolves.toBeUndefined()
  })
})
