/**
 * AdMobService.ts — native implementation of AdService via @capacitor-community/admob.
 *
 * Only used in the free native app (ADS_ENABLED && isNativePlatform()).
 *
 * Design for testability: the plugin reference can be injected via the
 * constructor (for tests). In production it is resolved once at construction
 * time via a dynamic import so that the admob bundle stays out of the
 * premium/web build. The Capacitor platform helper is also injectable.
 *
 * Key invariants:
 *  - Rewarded: resolves {granted:true} ONLY if RewardAdPluginEvents.Rewarded
 *    fires before RewardAdPluginEvents.Dismissed. Once the promise settles,
 *    subsequent events are ignored (settled flag).
 *  - Interstitial: fire-and-forget, all errors are swallowed (void resolves).
 *  - init(): ATT on iOS, AdMob.initialize. Never throws.
 *  - test IDs + isTesting:true everywhere; swap at launch (CHECKLIST §2).
 */

import type { AdService, RewardResult } from './AdService'
import { getRewardedAdUnitId, getInterstitialAdUnitId } from './testAdUnits'

// Minimal typing for the plugin surface we use (mirrors @capacitor-community/admob API)
export interface AdMobPluginLike {
  initialize(opts?: Record<string, unknown>): Promise<void>
  requestTrackingAuthorization(): Promise<void>
  prepareRewardVideoAd(opts: { adId: string; isTesting?: boolean }): Promise<unknown>
  showRewardVideoAd(): Promise<unknown>
  prepareInterstitial(opts: { adId: string; isTesting?: boolean }): Promise<unknown>
  showInterstitial(): Promise<void>
  addListener(event: string, fn: (...args: unknown[]) => void): Promise<{ remove(): void }>
}

export interface RewardEventNames {
  Rewarded: string
  Dismissed: string
  FailedToShow: string
}

export interface CapacitorLike {
  getPlatform(): string
}

// Default loader — resolved lazily on first use (avoids bundling in premium/web)
async function loadPlugin(): Promise<{ admob: AdMobPluginLike; events: RewardEventNames }> {
  const mod = await import('@capacitor-community/admob')
  return {
    admob: mod.AdMob as unknown as AdMobPluginLike,
    events: {
      Rewarded: mod.RewardAdPluginEvents.Rewarded,
      Dismissed: mod.RewardAdPluginEvents.Dismissed,
      FailedToShow: mod.RewardAdPluginEvents.FailedToShow,
    },
  }
}

async function loadCapacitor(): Promise<CapacitorLike> {
  const { Capacitor } = await import('@capacitor/core')
  return Capacitor as unknown as CapacitorLike
}

export class AdMobService implements AdService {
  /**
   * Injectable plugin reference — set in tests to avoid dynamic imports.
   * In production (null) the plugin is loaded lazily.
   */
  private readonly _plugin: AdMobPluginLike | null
  private readonly _events: RewardEventNames | null
  private readonly _capacitor: CapacitorLike | null

  constructor(
    opts: {
      plugin?: AdMobPluginLike
      events?: RewardEventNames
      capacitor?: CapacitorLike
    } = {},
  ) {
    this._plugin = opts.plugin ?? null
    this._events = opts.events ?? null
    this._capacitor = opts.capacitor ?? null
  }

  private async resolve(): Promise<{
    admob: AdMobPluginLike
    events: RewardEventNames
    platform: string
  }> {
    if (this._plugin && this._events && this._capacitor) {
      return {
        admob: this._plugin,
        events: this._events,
        platform: this._capacitor.getPlatform(),
      }
    }
    const [{ admob, events }, cap] = await Promise.all([loadPlugin(), loadCapacitor()])
    return { admob, events, platform: cap.getPlatform() }
  }

  async init(): Promise<void> {
    try {
      const { admob, platform } = await this.resolve()

      if (platform === 'ios') {
        try {
          await admob.requestTrackingAuthorization()
        } catch {
          // ATT prompt failure is non-fatal
        }
      }

      await admob.initialize({ initializeForTesting: false })
    } catch (err) {
      console.warn('[AdMobService] init failed (non-fatal):', err)
    }
  }

  async prepareRewarded(): Promise<void> {
    try {
      const { admob, platform } = await this.resolve()
      const adId = getRewardedAdUnitId(platform)
      await admob.prepareRewardVideoAd({ adId, isTesting: true })
    } catch (err) {
      console.warn('[AdMobService] prepareRewarded failed (non-fatal):', err)
    }
  }

  async showRewarded(): Promise<RewardResult> {
    try {
      const { admob, events, platform } = await this.resolve()
      const adId = getRewardedAdUnitId(platform)

      // Prepare (idempotent if already loaded)
      await admob.prepareRewardVideoAd({ adId, isTesting: true })

      // Wrap show + event listeners in a single Promise that settles once.
      return await new Promise<RewardResult>((resolve) => {
        let settled = false

        function settle(result: RewardResult) {
          if (settled) return
          settled = true
          resolve(result)
        }

        // Register listeners BEFORE calling show to avoid race
        void admob.addListener(events.Rewarded, () => {
          settle({ granted: true })
        })

        void admob.addListener(events.Dismissed, () => {
          settle({ granted: false })
        })

        void admob.addListener(events.FailedToShow, () => {
          settle({ granted: false })
        })

        // Show the ad
        admob.showRewardVideoAd().catch(() => {
          settle({ granted: false })
        })
      })
    } catch (err) {
      console.warn('[AdMobService] showRewarded failed (non-fatal):', err)
      return { granted: false }
    }
  }

  async prepareInterstitial(): Promise<void> {
    try {
      const { admob, platform } = await this.resolve()
      const adId = getInterstitialAdUnitId(platform)
      await admob.prepareInterstitial({ adId, isTesting: true })
    } catch (err) {
      console.warn('[AdMobService] prepareInterstitial failed (non-fatal):', err)
    }
  }

  async showInterstitial(): Promise<void> {
    try {
      const { admob, platform } = await this.resolve()
      const adId = getInterstitialAdUnitId(platform)
      await admob.prepareInterstitial({ adId, isTesting: true })
      await admob.showInterstitial()
    } catch (err) {
      console.warn('[AdMobService] showInterstitial failed (non-fatal):', err)
    }
  }
}
