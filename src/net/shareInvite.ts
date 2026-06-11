/**
 * shareInvite — strategy for sharing an invite URL.
 *
 * Priority chain:
 *
 *  [Native Capacitor — when deps.isNative === true or Capacitor.isNativePlatform()]
 *  1. deps.capacitorShare / Share.share from @capacitor/share
 *     Any error → fall through to clipboard
 *
 *  [Web — when running in browser / non-native context]
 *  1. deps.webShare / navigator.share (Web Share API — mobile Safari/Chrome, HTTPS + user gesture)
 *     AbortError → 'cancelled' (user dismissed, silent)
 *     Other error → fall through to clipboard
 *  2. deps.clipboard / navigator.clipboard.writeText → 'copied'
 *  3. Both unavailable / both failed → 'failed' (caller shows URL as text)
 *
 * NEVER throws. Always resolves to a ShareResult.
 *
 * Injectable deps (ShareDeps) allow full testability without touching
 * navigator or the Capacitor bridge in unit tests. When called without deps,
 * the function reads the real environment:
 *   - Capacitor.isNativePlatform() (static import — web shim returns false in browser)
 *   - @capacitor/share Share plugin on native (dynamic import so unused in web bundle)
 *   - navigator.share + clipboard on web
 */

import { Capacitor } from '@capacitor/core'

export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'failed'

/**
 * Injectable dependencies for shareInvite.
 * All fields are optional — defaults read the real runtime environment.
 */
export interface ShareDeps {
  /** Whether running inside a Capacitor native app. Defaults to Capacitor.isNativePlatform(). */
  isNative?: boolean
  /**
   * Native share function (Share.share from @capacitor/share).
   * Only used when isNative is true. Defaults to the real plugin import.
   */
  capacitorShare?: (opts: {
    title: string
    text: string
    url: string
    dialogTitle?: string
  }) => Promise<unknown>
  /**
   * Web Share API function (navigator.share).
   * Only used when isNative is false. Defaults to navigator.share.
   */
  webShare?: (data: ShareData) => Promise<void>
  /**
   * Clipboard write function (navigator.clipboard.writeText).
   * Used as final fallback on both paths.
   */
  clipboard?: (text: string) => Promise<void>
}

const SHARE_TITLE = 'Bora jogar 3 Contra Todos!'
const shareText = (url: string) => `Bora jogar 3 Contra Todos! Entra na minha sala: ${url}`

/** Resolve the real-environment deps lazily (not at module load time). */
async function resolveNativeDeps(): Promise<{
  capacitorShare: ShareDeps['capacitorShare']
}> {
  try {
    const { Share } = await import('@capacitor/share')
    return {
      capacitorShare: (opts) => Share.share(opts),
    }
  } catch {
    return { capacitorShare: undefined }
  }
}

function resolveIsNative(): boolean {
  // Capacitor is statically imported above — its web shim returns false in browser.
  // This is the same pattern used by NativeBridge.ts in this codebase.
  return Capacitor.isNativePlatform()
}

function resolveWebShare(): ShareDeps['webShare'] {
  if (typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: unknown }).share === 'function') {
    return (data: ShareData) =>
      (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share(data)
  }
  return undefined
}

function resolveClipboard(): ShareDeps['clipboard'] {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    return (text: string) => navigator.clipboard.writeText(text)
  }
  return undefined
}

/**
 * Share an invite URL using the best available strategy.
 *
 * @param url  The full invite URL (e.g. 'https://werdumfight.com/v2/?sala=ABCD')
 * @param deps Optional injectable dependencies (for testing / overrides)
 * @returns    ShareResult — never throws
 */
export async function shareInvite(url: string, deps?: ShareDeps): Promise<ShareResult> {
  // ── Resolve effective values ─────────────────────────────────────────────
  const isNative = deps?.isNative !== undefined ? deps.isNative : resolveIsNative()

  const clipboard: ((text: string) => Promise<void>) | undefined =
    deps?.clipboard !== undefined ? deps.clipboard : resolveClipboard()

  // ── Native path (Capacitor) ──────────────────────────────────────────────
  if (isNative) {
    let nativeShare = deps?.capacitorShare
    if (!nativeShare) {
      const resolved = await resolveNativeDeps()
      nativeShare = resolved.capacitorShare
    }

    if (nativeShare) {
      try {
        await nativeShare({ title: SHARE_TITLE, text: shareText(url), url })
        return 'shared'
      } catch {
        // Native share failed/cancelled → fall through to clipboard
      }
    }

    // Clipboard fallback (native)
    if (clipboard) {
      try {
        await clipboard(url)
        return 'copied'
      } catch {
        // Clipboard also failed
      }
    }

    return 'failed'
  }

  // ── Web path ─────────────────────────────────────────────────────────────
  const webShare: ((data: ShareData) => Promise<void>) | undefined =
    deps?.webShare !== undefined ? deps.webShare : resolveWebShare()

  if (webShare) {
    try {
      await webShare({ title: SHARE_TITLE, text: shareText(url), url })
      return 'shared'
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled'
      }
      // Any other error: fall through to clipboard
    }
  }

  // Clipboard fallback (web)
  if (clipboard) {
    try {
      await clipboard(url)
      return 'copied'
    } catch {
      // Clipboard also failed
    }
  }

  return 'failed'
}
