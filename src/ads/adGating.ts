/**
 * adGating.ts — pure decision logic for ad gating.
 *
 * No browser/plugin/framework imports — fully testable in Node/vitest.
 *
 * The single rule: ads run only when the build has ads enabled (FREE_BUILD)
 * AND the platform is native (iOS/Android). On web or in the premium build,
 * ads are never shown — the NoopAdService handles those paths.
 */

/**
 * Returns true if real ads should be used for this session.
 *
 * @param adsEnabled - true when ADS_ENABLED flag is set (free build only)
 * @param isNative   - true when running on a native platform (iOS / Android)
 */
export function shouldUseRealAds(adsEnabled: boolean, isNative: boolean): boolean {
  return adsEnabled && isNative
}
