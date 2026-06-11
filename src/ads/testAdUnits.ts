/**
 * Google AdMob TEST unit IDs (official test IDs — NEVER production IDs).
 *
 * These are Google's official test ad unit IDs from:
 * https://developers.google.com/admob/android/test-ads
 * https://developers.google.com/admob/ios/test-ads
 *
 * IMPORTANT (CHECKLIST ITEM FOR USER AT LAUNCH):
 * Replace these with the real ad unit IDs from your AdMob account before
 * submitting the free app to the stores. See plan CHECKLIST DO USUÁRIO §2.
 *
 * App IDs (for AndroidManifest / Info.plist — also test values):
 *   Android: ca-app-pub-3940256099942544~3347511713
 *   iOS:     ca-app-pub-3940256099942544~1458002511
 */

export const TEST_AD_UNITS = {
  android: {
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
  },
  ios: {
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
  },
} as const

/**
 * Returns the rewarded ad unit ID for the current platform.
 * Falls back to Android IDs for unknown platforms (safe for testing).
 */
export function getRewardedAdUnitId(platform: string): string {
  if (platform === 'ios') return TEST_AD_UNITS.ios.rewarded
  return TEST_AD_UNITS.android.rewarded
}

/**
 * Returns the interstitial ad unit ID for the current platform.
 * Falls back to Android IDs for unknown platforms (safe for testing).
 */
export function getInterstitialAdUnitId(platform: string): string {
  if (platform === 'ios') return TEST_AD_UNITS.ios.interstitial
  return TEST_AD_UNITS.android.interstitial
}
