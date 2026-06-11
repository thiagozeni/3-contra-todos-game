/**
 * testAdUnits.ts unit tests — covers platform-specific ad unit ID helpers.
 *
 * Ensures both iOS and Android branches are exercised so coverage stays ≥80%.
 */

import { describe, it, expect } from 'vitest'
import {
  getRewardedAdUnitId,
  getInterstitialAdUnitId,
  TEST_AD_UNITS,
} from '../../src/ads/testAdUnits'

describe('getRewardedAdUnitId', () => {
  it('returns Android rewarded ID for "android" platform', () => {
    expect(getRewardedAdUnitId('android')).toBe(TEST_AD_UNITS.android.rewarded)
  })

  it('returns iOS rewarded ID for "ios" platform', () => {
    expect(getRewardedAdUnitId('ios')).toBe(TEST_AD_UNITS.ios.rewarded)
  })

  it('falls back to Android rewarded ID for unknown platform', () => {
    expect(getRewardedAdUnitId('web')).toBe(TEST_AD_UNITS.android.rewarded)
    expect(getRewardedAdUnitId('')).toBe(TEST_AD_UNITS.android.rewarded)
  })
})

describe('getInterstitialAdUnitId', () => {
  it('returns Android interstitial ID for "android" platform', () => {
    expect(getInterstitialAdUnitId('android')).toBe(TEST_AD_UNITS.android.interstitial)
  })

  it('returns iOS interstitial ID for "ios" platform', () => {
    expect(getInterstitialAdUnitId('ios')).toBe(TEST_AD_UNITS.ios.interstitial)
  })

  it('falls back to Android interstitial ID for unknown platform', () => {
    expect(getInterstitialAdUnitId('web')).toBe(TEST_AD_UNITS.android.interstitial)
    expect(getInterstitialAdUnitId('')).toBe(TEST_AD_UNITS.android.interstitial)
  })
})

describe('TEST_AD_UNITS constants', () => {
  it('Android rewarded ID matches Google test format', () => {
    expect(TEST_AD_UNITS.android.rewarded).toMatch(/^ca-app-pub-/)
  })

  it('iOS rewarded ID matches Google test format', () => {
    expect(TEST_AD_UNITS.ios.rewarded).toMatch(/^ca-app-pub-/)
  })

  it('Android interstitial ID matches Google test format', () => {
    expect(TEST_AD_UNITS.android.interstitial).toMatch(/^ca-app-pub-/)
  })

  it('iOS interstitial ID matches Google test format', () => {
    expect(TEST_AD_UNITS.ios.interstitial).toMatch(/^ca-app-pub-/)
  })
})
