/**
 * adConfig.ts — single source of AdMob configuration, resolved from BUILD-TIME
 * env vars with safe TEST defaults.
 *
 * Why: previously the ad unit IDs and `isTesting:true` lived hardcoded in source
 * (testAdUnits.ts + AdMobService.ts), so the launch checklist required editing
 * code in several places (error-prone). This module turns that into a single
 * ENV change — set the real IDs and flip VITE_ADMOB_TESTING=false at build time,
 * no code edits.
 *
 * Defaults preserve the previous behavior EXACTLY (Google official test IDs +
 * isTesting=true + cadence 3/90000), so with no env vars set everything is
 * byte-for-byte identical to before — the existing test suite stays green.
 *
 * Env vars (set in the free build command / CI secret):
 *   VITE_ADMOB_REWARDED_ANDROID       VITE_ADMOB_REWARDED_IOS
 *   VITE_ADMOB_INTERSTITIAL_ANDROID   VITE_ADMOB_INTERSTITIAL_IOS
 *   VITE_ADMOB_TESTING=false          (production: real IDs, testing OFF)
 *   VITE_AD_INTERVAL=3                (game-overs between interstitials)
 *   VITE_AD_COOLDOWN_MS=90000         (ms between interstitials)
 *
 * NOTE (Vite): import.meta.env.* is inlined at build time, so these are
 * build-time knobs, not runtime — consistent with FREE_BUILD / NET_ENABLED.
 *
 * Testability: the pure `*From(env, …)` resolvers take an explicit env record so
 * they can be unit-tested deterministically (without mutating import.meta.env).
 * The exported public functions feed them the live build env.
 */

import { TEST_AD_UNITS } from './testAdUnits'

export type EnvRecord = Record<string, string | undefined>

/** The live build-time env (import.meta.env), defensively narrowed. */
function liveEnv(): EnvRecord {
  if (typeof import.meta === 'undefined') return {}
  return ((import.meta as { env?: EnvRecord }).env ?? {}) as EnvRecord
}

function pick(env: EnvRecord, key: string): string | undefined {
  const v = env[key]
  return v && v.length > 0 ? v : undefined
}

function positiveInt(env: EnvRecord, key: string, fallback: number): number {
  const raw = pick(env, key)
  if (raw == null) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// ── Pure resolvers (env injected) ─────────────────────────────────────────────

/** Pure: AdMob test-mode flag from an explicit env. Default TRUE. */
export function isTestingAdsFrom(env: EnvRecord): boolean {
  // Default true unless explicitly disabled — protects against accidentally
  // serving live ads with test IDs (policy violation) if the env is forgotten.
  return pick(env, 'VITE_ADMOB_TESTING') !== 'false'
}

/** Pure: rewarded ad unit ID for the platform — env override, else test ID. */
export function resolveRewardedAdUnitIdFrom(env: EnvRecord, platform: string): string {
  if (platform === 'ios') {
    return pick(env, 'VITE_ADMOB_REWARDED_IOS') ?? TEST_AD_UNITS.ios.rewarded
  }
  return pick(env, 'VITE_ADMOB_REWARDED_ANDROID') ?? TEST_AD_UNITS.android.rewarded
}

/** Pure: interstitial ad unit ID for the platform — env override, else test ID. */
export function resolveInterstitialAdUnitIdFrom(env: EnvRecord, platform: string): string {
  if (platform === 'ios') {
    return pick(env, 'VITE_ADMOB_INTERSTITIAL_IOS') ?? TEST_AD_UNITS.ios.interstitial
  }
  return pick(env, 'VITE_ADMOB_INTERSTITIAL_ANDROID') ?? TEST_AD_UNITS.android.interstitial
}

/** Pure: interval-events gate from an explicit env. Default 3. */
export function adIntervalEventsFrom(env: EnvRecord): number {
  return positiveInt(env, 'VITE_AD_INTERVAL', 3)
}

/** Pure: cooldown-ms gate from an explicit env. Default 90 000. */
export function adCooldownMsFrom(env: EnvRecord): number {
  return positiveInt(env, 'VITE_AD_COOLDOWN_MS', 90_000)
}

// ── Public API (live env) ─────────────────────────────────────────────────────

/**
 * Whether AdMob runs in TEST mode (isTesting flag + initializeForTesting).
 * Defaults to TRUE; set VITE_ADMOB_TESTING=false in the production free build.
 */
export function isTestingAds(): boolean {
  return isTestingAdsFrom(liveEnv())
}

/** Rewarded ad unit ID for the platform — env override, else Google test ID. */
export function resolveRewardedAdUnitId(platform: string): string {
  return resolveRewardedAdUnitIdFrom(liveEnv(), platform)
}

/** Interstitial ad unit ID for the platform — env override, else Google test ID. */
export function resolveInterstitialAdUnitId(platform: string): string {
  return resolveInterstitialAdUnitIdFrom(liveEnv(), platform)
}

/** Game-overs required between two interstitials (interval gate). Default 3. */
export const AD_INTERVAL_EVENTS: number = adIntervalEventsFrom(liveEnv())

/** Minimum ms between two interstitials (cooldown gate). Default 90 000. */
export const AD_COOLDOWN_MS: number = adCooldownMsFrom(liveEnv())
