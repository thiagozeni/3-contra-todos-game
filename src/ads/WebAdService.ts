/**
 * WebAdService.ts — AdService implementation for the WEB build that drives a
 * simulated ad overlay (WebAdOverlay) instead of a real ad network.
 *
 * Web is not the monetized surface (that's the native AdMob app), so this is a
 * QA / beta tool, wired in only when VITE_WEB_AD_SIM=true. It lets the team see
 * and feel the actual rewarded-continue and host-unlock flows on werdumfight.com
 * rather than the silent instant-grant NoopAdService.
 *
 * Contract parity with AdService:
 *  - showRewarded resolves {granted:true} if the user watched to the reward,
 *    {granted:false} if they dismissed early — mirroring AdMobService semantics.
 *  - showInterstitial resolves void after the overlay closes.
 *  - init/prepare* are no-ops. Never throws.
 *
 * The overlay is injectable (constructor) so this is unit-testable without DOM;
 * in production it is created lazily on first show.
 */

import type { AdService, RewardResult } from './AdService'
import { createWebAdOverlay, type WebAdOverlayLike } from './web/WebAdOverlay'

export class WebAdService implements AdService {
  private overlay: WebAdOverlayLike | null

  constructor(overlay?: WebAdOverlayLike) {
    this.overlay = overlay ?? null
  }

  private getOverlay(): WebAdOverlayLike {
    if (!this.overlay) this.overlay = createWebAdOverlay()
    return this.overlay
  }

  async init(): Promise<void> {
    // No SDK to initialize.
  }

  async prepareRewarded(): Promise<void> {
    // Nothing to preload — the overlay renders on demand.
  }

  async showRewarded(): Promise<RewardResult> {
    try {
      const granted = await this.getOverlay().showRewarded()
      return { granted }
    } catch {
      // Overlay failure must never block the flow harder than a real ad would.
      return { granted: false }
    }
  }

  async prepareInterstitial(): Promise<void> {
    // Nothing to preload.
  }

  async showInterstitial(): Promise<void> {
    try {
      await this.getOverlay().showInterstitial()
    } catch {
      // Interstitial is fire-and-forget; swallow.
    }
  }
}
