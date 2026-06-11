/**
 * interstitialCadence.ts — pure cadence machine for interstitial ads.
 *
 * Decides whether to show an interstitial ad on each game-over event.
 * Logic is entirely pure (no side-effects, no imports from framework/plugin).
 * State is immutable — every call to nextCadence returns a NEW CadenceState.
 *
 * Default cadence (from spec §Questões abertas #2):
 *   - NEVER on the first game-over (conservative D1 retention)
 *   - At most 1 per every MIN_INTERVAL_EVENTS game-overs (default 3)
 *   - At least COOLDOWN_MS milliseconds since the last interstitial (default 90 000)
 *   - NEVER in co-op / net mode (would break the synchronized session)
 *
 * Usage in GameOverContinueScene (and TopTenScene / TitleScene transitions):
 *   const cadence = registry.get('interstitialCadence') as CadenceState
 *   const { show, nextState } = nextCadence(cadence, 'gameOver', {
 *     nowMs: Date.now(),
 *     isNet: this.gameMode === 'net',
 *   })
 *   registry.set('interstitialCadence', nextState)
 *   if (show) await adService.showInterstitial()
 */

import type { RewardResult } from './AdService'

// ── Constants (adjust these to tune the cadence) ─────────────────────────────

/** Minimum number of game-overs between two interstitial shows. */
export const MIN_INTERVAL_EVENTS = 3

/** Minimum elapsed time (ms) between two interstitial shows. */
export const COOLDOWN_MS = 90_000

// ── Types ────────────────────────────────────────────────────────────────────

/** Immutable cadence state stored in the Phaser registry between sessions. */
export interface CadenceState {
  /** Total number of game-overs accumulated so far. */
  readonly gameOverCount: number
  /**
   * Date.now() timestamp of the last time an interstitial was shown.
   * -1 means the interstitial has never been shown (sentinel).
   */
  readonly lastShownMs: number
}

/** Supported events. Extensible for future triggers. */
export type CadenceEvent = 'gameOver'

/** Options that can be injected into nextCadence. */
export interface NextCadenceOptions {
  /** Current timestamp in milliseconds. Defaults to Date.now(). */
  nowMs?: number
  /** True when the current game session is a co-op / net game. Suppresses the ad. */
  isNet?: boolean
}

// ── Factory ───────────────────────────────────────────────────────────────────

/** Returns a fresh initial CadenceState (no game-overs, never shown). */
export function initialCadenceState(): CadenceState {
  return { gameOverCount: 0, lastShownMs: -1 }
}

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Advance the cadence machine by one event and decide whether to show an ad.
 *
 * @param state   - Current cadence state (immutable input).
 * @param event   - The event that triggered this call (currently only 'gameOver').
 * @param opts    - Injectable clock and co-op flag for testing.
 * @returns       - { show: boolean; nextState: CadenceState }
 *
 * The returned nextState must be persisted by the caller (e.g. via Phaser registry).
 */
export function nextCadence(
  state: CadenceState,
  _event: CadenceEvent,
  opts: NextCadenceOptions = {},
): { show: boolean; nextState: CadenceState } {
  const nowMs = opts.nowMs ?? Date.now()
  const isNet = opts.isNet ?? false

  // Increment the counter first (all paths need this)
  const newCount = state.gameOverCount + 1

  // Gate 1: Co-op / net mode — never show
  if (isNet) {
    return {
      show: false,
      nextState: { gameOverCount: newCount, lastShownMs: state.lastShownMs },
    }
  }

  // Gate 2: Interval — must have hit a multiple of MIN_INTERVAL_EVENTS
  // (The very first game-over has newCount=1, which is never a multiple of 3)
  const intervalMet = newCount % MIN_INTERVAL_EVENTS === 0

  // Gate 3: Cooldown — at least COOLDOWN_MS since the last show.
  // lastShownMs === -1 is the sentinel for "never shown"; in that case only
  // the interval gate applies (no prior show to measure against).
  const cooldownMet = state.lastShownMs === -1
    ? true // never shown before — cooldown not applicable
    : nowMs - state.lastShownMs >= COOLDOWN_MS

  const show = intervalMet && cooldownMet

  return {
    show,
    nextState: {
      gameOverCount: newCount,
      lastShownMs: show ? nowMs : state.lastShownMs,
    },
  }
}

// ── Continue resolution ───────────────────────────────────────────────────────

/**
 * Resolve whether the player may continue after the rewarded ad flow.
 *
 * Pure function — no side-effects, no imports.
 *
 * Rules:
 *  - Premium / web (freeBuild=false): always true — the Noop service grants
 *    instantly and the UI never shows ad-flavored copy, so this is a no-op.
 *  - Free build (freeBuild=true): mirrors the ad result (granted → true, dismissed → false).
 *
 * @param freeBuild  - True when this is a free build (ADS_ENABLED / FREE_BUILD).
 * @param adResult   - The result of the rewarded ad show call.
 */
export function resolveContinue(freeBuild: boolean, adResult: RewardResult): boolean {
  if (!freeBuild) return true
  return adResult.granted
}
