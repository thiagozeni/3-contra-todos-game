/**
 * shareInvite — strategy for sharing an invite URL.
 *
 * Priority chain (web build):
 *  1. navigator.share (Web Share API — mobile Safari/Chrome, HTTPS + user gesture)
 *     AbortError → 'cancelled' (user dismissed, silent)
 *     Other error → fall through to clipboard
 *  2. navigator.clipboard.writeText → 'copied'
 *  3. Both unavailable / both failed → 'failed' (caller shows URL as text)
 *
 * NEVER throws. Always resolves to a ShareResult.
 *
 * Note: The native Capacitor @capacitor/share path is added in Task 2.
 * This module is web-only; Capacitor.isNativePlatform() is not checked here yet.
 */

export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'failed'

const SHARE_TITLE = 'Bora jogar 3 Contra Todos!'
const shareText = (url: string) => `Bora jogar 3 Contra Todos! Entra na minha sala: ${url}`

/**
 * Share an invite URL using the best available strategy.
 *
 * @param url The full invite URL (e.g. 'https://werdumfight.com/v2/?sala=ABCD')
 * @returns   ShareResult — never throws
 */
export async function shareInvite(url: string): Promise<ShareResult> {
  // ── Strategy 1: Web Share API ──────────────────────────────────────────────
  if (typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share === 'function') {
    try {
      await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
        title: SHARE_TITLE,
        text: shareText(url),
        url,
      })
      return 'shared'
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled the share sheet — silent
        return 'cancelled'
      }
      // Any other error: fall through to clipboard
    }
  }

  // ── Strategy 2: Clipboard ──────────────────────────────────────────────────
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(url)
      return 'copied'
    } catch {
      // Clipboard also failed — fall through
    }
  }

  // ── Strategy 3: Nothing worked ─────────────────────────────────────────────
  return 'failed'
}
