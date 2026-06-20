/**
 * Build-flavor flags — distinguishes premium × free builds.
 *
 * Pattern mirrors src/net/flags.ts:
 *   Set VITE_FREE_BUILD=true in the build environment to activate the free-app variant.
 *   Without this env var (the default), the build is the PREMIUM app — zero ads, full host.
 *
 * These flags are evaluated at build-time (Vite replaces import.meta.env.*).
 *
 * IMPORTANT: The premium build (default, no env var) must never activate any ads code-path.
 * The android/ and ios/ native projects remain byte-identical for the premium app in review.
 * The free variant's native sync runs against a throwaway tree (see scripts/cap-free-sync.sh).
 */

/**
 * True when this is a free-tier build (ads enabled, host gate active).
 * Set VITE_FREE_BUILD=true in the build command to activate.
 *
 * Default: false (premium build — the app currently in App Store / Google Play review).
 */
export const FREE_BUILD: boolean =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: Record<string, string> }).env?.VITE_FREE_BUILD === 'true'

/**
 * True when this is the premium build (default).
 * Derived from FREE_BUILD — always the complement, never both true or both false.
 */
export const PREMIUM_BUILD: boolean = !FREE_BUILD

/**
 * True when ads should be active.
 * Currently equals FREE_BUILD — only the free app shows ads.
 * In the premium app this is always false, so no ad code-path is ever reached.
 */
export const ADS_ENABLED: boolean = FREE_BUILD

/**
 * True when the WEB build should show the SIMULATED ad overlay (WebAdService)
 * instead of the silent NoopAdService. QA / beta tool — set VITE_WEB_AD_SIM=true.
 *
 * Independent of FREE_BUILD: only affects the web (non-native) surface so the
 * team can experience the real continue / host-unlock UX on werdumfight.com.
 * Production web (flag unset) stays on Noop → zero ad friction for web players.
 * On native, real AdMob always wins regardless of this flag.
 */
export const WEB_AD_SIM: boolean =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: Record<string, string> }).env?.VITE_WEB_AD_SIM === 'true'
