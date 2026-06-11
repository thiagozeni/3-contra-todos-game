/**
 * NoopAdService.ts — no-op implementation of AdService.
 *
 * Used in:
 *  - Premium builds (zero ads, no AdMob dependency)
 *  - Web / beta builds (ads are no-op; rewarded grants instantly so the
 *    continue flow in the web beta keeps working without a real ad)
 *
 * Contract:
 *  - showRewarded() always resolves {granted:true} — the premium/web continue
 *    flow must never be blocked by an ad gate.
 *  - showInterstitial() resolves void silently.
 *  - Nothing calls the AdMob plugin; this module has zero native dependencies.
 *  - Never throws.
 */

import type { AdService, RewardResult } from './AdService'

export class NoopAdService implements AdService {
  async init(): Promise<void> {
    // No-op — no SDK to initialize
  }

  async prepareRewarded(): Promise<void> {
    // No-op — no ad to load
  }

  async showRewarded(): Promise<RewardResult> {
    // Instantly grant: web beta and premium continue flow must work without ads
    return { granted: true }
  }

  async prepareInterstitial(): Promise<void> {
    // No-op — no ad to load
  }

  async showInterstitial(): Promise<void> {
    // No-op — no ad to show
  }
}
