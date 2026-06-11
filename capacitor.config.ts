import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Dynamic Capacitor config — reads process.env.FREE_BUILD at build-time.
 *
 * FREE_BUILD unset / falsy → premium config (byte-identical to today; the app currently
 *   in App Store / Google Play review). android/ and ios/ native projects are untouched.
 *
 * FREE_BUILD=1 or FREE_BUILD=true → free-variant config (appId: com.werdumfight.free).
 *   IMPORTANT: native sync for the free variant MUST target a throwaway tree, not the
 *   committed android/ and ios/ directories. Use scripts/cap-free-sync.sh or the
 *   `cap:free:*` npm scripts which set CAPACITOR_ANDROID_PATH / CAPACITOR_IOS_PATH to
 *   a temp directory — never commit changes to android/ or ios/ from a free-variant sync.
 *
 * NOTE: The definitive native configuration for the free app (Android product flavors,
 *   iOS scheme/target with Bundle ID com.werdumfight.free, AdMob APPLICATION_ID in
 *   Info.plist/AndroidManifest, SKAdNetworkItems, NSUserTrackingUsageDescription) is a
 *   USER CHECKLIST item at launch time — it touches code-signing / store setup and is
 *   outside the scope of automated engineering.
 */

const isFree =
  process.env.FREE_BUILD === '1' || process.env.FREE_BUILD === 'true';

const config: CapacitorConfig = isFree
  ? {
      // ── FREE VARIANT (throwaway tree only — never commit native changes from this) ──
      appId: 'com.werdumfight.free',
      appName: '3 Contra Todos', // see plan Questões abertas #1 for final name decision
      webDir: 'dist/demo',
      ios: {
        contentInset: 'never',
      },
      android: {
        backgroundColor: '#000000',
      },
      plugins: {
        SplashScreen: {
          launchShowDuration: 0,
        },
      },
    }
  : {
      // ── PREMIUM (default — app in store review, native projects untouched) ──
      appId: 'com.werdumfight.app',
      appName: '3 Contra Todos',
      webDir: 'dist/demo',
      ios: {
        contentInset: 'never',
      },
      android: {
        backgroundColor: '#000000',
      },
      plugins: {
        SplashScreen: {
          launchShowDuration: 0,
        },
      },
    };

export default config;
