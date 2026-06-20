/**
 * AdService.ts — interface + factory for the ad service.
 *
 * Two implementations exist:
 *  - NoopAdService  — premium builds and web (rewarded grants instantly, interstitial silent)
 *  - AdMobService   — free native app (wraps @capacitor-community/admob, test IDs)
 *
 * The factory (createAdService) chooses the implementation based on
 * ADS_ENABLED + isNativePlatform() from @capacitor/core.
 *
 * All code-paths that differ by flavor go through this interface;
 * scenes/systems only import AdService and call the interface methods.
 */

import { shouldUseRealAds } from './adGating'
import { NoopAdService } from './NoopAdService'
import { AdMobService } from './AdMobService'
import { WebAdService } from './WebAdService'
import { WebAdSenseService } from './WebAdSenseService'
import { adsenseClient, adsenseTest } from './adConfig'

/** Result returned by showRewarded */
export interface RewardResult {
  /** true if the user earned the reward (watched to completion on native) */
  granted: boolean
}

/** Public interface for the ad service — all platform differences live here */
export interface AdService {
  /**
   * Initialize the ad SDK (ATT request on iOS, AdMob.initialize).
   * Must be called once at boot on native free builds.
   * No-op on web/premium — always resolves, never throws.
   */
  init(): Promise<void>

  /**
   * Pre-load a rewarded ad for the continue flow.
   * No-op on web/premium. Never throws.
   */
  prepareRewarded(): Promise<void>

  /**
   * Show a rewarded ad and wait for the user to earn the reward.
   *
   * - Native free: resolves {granted:true} ONLY if the Rewarded event fired;
   *   {granted:false} on dismiss/error.
   * - Web / premium (Noop): resolves {granted:true} immediately so the
   *   continue flow in the beta keeps working without a real ad.
   *
   * Never throws.
   */
  showRewarded(): Promise<RewardResult>

  /**
   * Pre-load an interstitial ad for the end-of-game transition.
   * No-op on web/premium. Never throws.
   */
  prepareInterstitial(): Promise<void>

  /**
   * Show an interstitial ad (fire-and-forget).
   * Resolves void after the ad is dismissed or skipped.
   * No-op on web/premium. Never throws.
   */
  showInterstitial(): Promise<void>
}

/**
 * Factory options — injected so the factory is testable without mocking globals.
 */
export interface CreateAdServiceOptions {
  /** Whether ads are enabled in this build (ADS_ENABLED from buildFlavor) */
  adsEnabled: boolean
  /** Whether the app is running on a native platform */
  isNative: boolean
  /**
   * Whether the web build should serve REAL ads via AdSense H5 Games Ads
   * (WEB_ADSENSE). Web only; takes precedence over the simulator.
   */
  webAdSense?: boolean
  /**
   * Whether the web build should show the SIMULATED ad overlay (WEB_AD_SIM).
   * Only consulted on web (non-native); real AdMob always wins on native.
   * Defaults to false → web stays on NoopAdService.
   */
  webAdSim?: boolean
}

/**
 * Creates the appropriate AdService implementation for the current context.
 * Single source of truth for "which ad provider runs where" — scenes never know.
 *
 * - free NATIVE          → AdMobService   (real ads, iOS/Android)
 * - web + webAdSense flag → WebAdSenseService (real ads, AdSense H5 Games Ads)
 * - web + webAdSim flag   → WebAdService   (simulated overlay — QA/beta)
 * - web or premium        → NoopAdService  (granted:true, silent interstitial)
 */
export function createAdService(opts: CreateAdServiceOptions): AdService {
  if (shouldUseRealAds(opts.adsEnabled, opts.isNative)) {
    return new AdMobService()
  }
  if (!opts.isNative && opts.webAdSense) {
    return new WebAdSenseService(adsenseClient(), adsenseTest())
  }
  if (!opts.isNative && opts.webAdSim) {
    return new WebAdService()
  }
  return new NoopAdService()
}
