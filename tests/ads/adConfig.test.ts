/**
 * adConfig.test.ts — env-driven AdMob config resolution.
 *
 * Override behavior is tested via the pure `*From(env, …)` resolvers (explicit
 * env records — deterministic). Default behavior is tested via the public
 * functions reading the live (empty) build env, guaranteeing that with NO env
 * set the config is identical to the previous hardcoded test IDs + isTesting.
 */

import { describe, it, expect } from 'vitest'
import {
  isTestingAds,
  resolveRewardedAdUnitId,
  resolveInterstitialAdUnitId,
  isTestingAdsFrom,
  resolveRewardedAdUnitIdFrom,
  resolveInterstitialAdUnitIdFrom,
  adIntervalEventsFrom,
  adCooldownMsFrom,
  AD_INTERVAL_EVENTS,
  AD_COOLDOWN_MS,
} from '../../src/ads/adConfig'
import { TEST_AD_UNITS } from '../../src/ads/testAdUnits'

describe('defaults (live env, nothing set) preserve prior behavior', () => {
  it('isTestingAds() defaults true; ad unit IDs default to Google test IDs', () => {
    expect(isTestingAds()).toBe(true)
    expect(resolveRewardedAdUnitId('android')).toBe(TEST_AD_UNITS.android.rewarded)
    expect(resolveRewardedAdUnitId('ios')).toBe(TEST_AD_UNITS.ios.rewarded)
    expect(resolveInterstitialAdUnitId('android')).toBe(TEST_AD_UNITS.android.interstitial)
    expect(resolveInterstitialAdUnitId('ios')).toBe(TEST_AD_UNITS.ios.interstitial)
  })

  it('cadence consts default to 3 / 90 000', () => {
    expect(AD_INTERVAL_EVENTS).toBe(3)
    expect(AD_COOLDOWN_MS).toBe(90_000)
  })
})

describe('isTestingAdsFrom()', () => {
  it('true when unset', () => {
    expect(isTestingAdsFrom({})).toBe(true)
  })
  it('false only when explicitly "false"', () => {
    expect(isTestingAdsFrom({ VITE_ADMOB_TESTING: 'false' })).toBe(false)
  })
  it('true for any non-"false" value', () => {
    expect(isTestingAdsFrom({ VITE_ADMOB_TESTING: 'true' })).toBe(true)
    expect(isTestingAdsFrom({ VITE_ADMOB_TESTING: '' })).toBe(true)
  })
})

describe('resolveRewardedAdUnitIdFrom()', () => {
  it('defaults to Google test IDs per platform', () => {
    expect(resolveRewardedAdUnitIdFrom({}, 'android')).toBe(TEST_AD_UNITS.android.rewarded)
    expect(resolveRewardedAdUnitIdFrom({}, 'ios')).toBe(TEST_AD_UNITS.ios.rewarded)
  })
  it('falls back to Android for unknown platforms', () => {
    expect(resolveRewardedAdUnitIdFrom({}, 'web')).toBe(TEST_AD_UNITS.android.rewarded)
    expect(resolveRewardedAdUnitIdFrom({}, '')).toBe(TEST_AD_UNITS.android.rewarded)
  })
  it('honors env overrides per platform', () => {
    const env = {
      VITE_ADMOB_REWARDED_IOS: 'ca-app-pub-REAL/ios-rewarded',
      VITE_ADMOB_REWARDED_ANDROID: 'ca-app-pub-REAL/android-rewarded',
    }
    expect(resolveRewardedAdUnitIdFrom(env, 'ios')).toBe('ca-app-pub-REAL/ios-rewarded')
    expect(resolveRewardedAdUnitIdFrom(env, 'android')).toBe('ca-app-pub-REAL/android-rewarded')
  })
  it('ignores empty-string overrides (falls back to test ID)', () => {
    expect(resolveRewardedAdUnitIdFrom({ VITE_ADMOB_REWARDED_IOS: '' }, 'ios')).toBe(
      TEST_AD_UNITS.ios.rewarded,
    )
  })
})

describe('resolveInterstitialAdUnitIdFrom()', () => {
  it('defaults to Google test IDs per platform', () => {
    expect(resolveInterstitialAdUnitIdFrom({}, 'android')).toBe(TEST_AD_UNITS.android.interstitial)
    expect(resolveInterstitialAdUnitIdFrom({}, 'ios')).toBe(TEST_AD_UNITS.ios.interstitial)
  })
  it('honors env overrides per platform', () => {
    const env = {
      VITE_ADMOB_INTERSTITIAL_IOS: 'ca-app-pub-REAL/ios-int',
      VITE_ADMOB_INTERSTITIAL_ANDROID: 'ca-app-pub-REAL/android-int',
    }
    expect(resolveInterstitialAdUnitIdFrom(env, 'ios')).toBe('ca-app-pub-REAL/ios-int')
    expect(resolveInterstitialAdUnitIdFrom(env, 'android')).toBe('ca-app-pub-REAL/android-int')
  })
})

describe('cadence resolvers', () => {
  it('default to 3 / 90 000 when unset', () => {
    expect(adIntervalEventsFrom({})).toBe(3)
    expect(adCooldownMsFrom({})).toBe(90_000)
  })
  it('honor positive-integer overrides', () => {
    expect(adIntervalEventsFrom({ VITE_AD_INTERVAL: '5' })).toBe(5)
    expect(adCooldownMsFrom({ VITE_AD_COOLDOWN_MS: '120000' })).toBe(120_000)
  })
  it('reject non-positive / non-numeric overrides (keep default)', () => {
    expect(adIntervalEventsFrom({ VITE_AD_INTERVAL: '0' })).toBe(3)
    expect(adIntervalEventsFrom({ VITE_AD_INTERVAL: '-2' })).toBe(3)
    expect(adCooldownMsFrom({ VITE_AD_COOLDOWN_MS: 'abc' })).toBe(90_000)
  })
})
