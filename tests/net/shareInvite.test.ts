/**
 * shareInvite.ts — pure unit tests (RED first, TDD)
 *
 * Mocks navigator.share / navigator.clipboard to exercise the
 * Web Share API → clipboard fallback chain.
 *
 * Task 2 adds: native Capacitor path via injectable deps.
 *
 * NEVER throws — always resolves to a ShareResult string.
 *
 * ShareResult: 'shared' | 'cancelled' | 'copied' | 'failed'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shareInvite, type ShareDeps } from '../../src/net/shareInvite'

const TEST_URL = 'https://werdumfight.com/v2/?sala=ABCD'

// ── helpers ──────────────────────────────────────────────────────────────────

function setShare(impl: (data: ShareData) => Promise<void>) {
  Object.defineProperty(globalThis.navigator, 'share', {
    value: impl, configurable: true, writable: true,
  })
}

function removeShare() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis.navigator as any).share
}

function setClipboard(impl: (text: string) => Promise<void>) {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText: impl }, configurable: true, writable: true,
  })
}

function removeClipboard() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis.navigator as any).clipboard
}

// ── tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  removeShare()
  removeClipboard()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shareInvite — Web Share API available', () => {
  it('resolves "shared" when navigator.share succeeds', async () => {
    setShare(vi.fn().mockResolvedValue(undefined))
    const result = await shareInvite(TEST_URL)
    expect(result).toBe('shared')
  })

  it('calls share() with the correct payload (title, text, url)', async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined)
    setShare(mockShare)
    await shareInvite(TEST_URL)
    expect(mockShare).toHaveBeenCalledOnce()
    const payload = mockShare.mock.calls[0][0] as ShareData
    expect(payload.url).toBe(TEST_URL)
    expect(typeof payload.title).toBe('string')
    expect(typeof payload.text).toBe('string')
  })

  it('includes PT-BR text in the share payload', async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined)
    setShare(mockShare)
    await shareInvite(TEST_URL)
    const payload = mockShare.mock.calls[0][0] as ShareData
    // Must contain the URL and some PT-BR message
    expect(payload.text).toContain(TEST_URL)
  })

  it('resolves "cancelled" silently when navigator.share throws AbortError', async () => {
    const abortError = new DOMException('User cancelled', 'AbortError')
    setShare(vi.fn().mockRejectedValue(abortError))
    const result = await shareInvite(TEST_URL)
    expect(result).toBe('cancelled')
  })

  it('falls back to clipboard when navigator.share throws a non-abort error', async () => {
    const networkError = new Error('Not supported')
    setShare(vi.fn().mockRejectedValue(networkError))
    setClipboard(vi.fn().mockResolvedValue(undefined))
    const result = await shareInvite(TEST_URL)
    expect(result).toBe('copied')
  })
})

describe('shareInvite — Web Share API absent', () => {
  it('resolves "copied" via clipboard fallback', async () => {
    // navigator.share not defined
    setClipboard(vi.fn().mockResolvedValue(undefined))
    const result = await shareInvite(TEST_URL)
    expect(result).toBe('copied')
  })

  it('writes the exact URL to the clipboard', async () => {
    const mockWrite = vi.fn().mockResolvedValue(undefined)
    setClipboard(mockWrite)
    await shareInvite(TEST_URL)
    expect(mockWrite).toHaveBeenCalledWith(TEST_URL)
  })
})

describe('shareInvite — both fail', () => {
  it('resolves "failed" when navigator.share throws and clipboard also fails', async () => {
    setShare(vi.fn().mockRejectedValue(new Error('share fail')))
    setClipboard(vi.fn().mockRejectedValue(new Error('clipboard fail')))
    const result = await shareInvite(TEST_URL)
    expect(result).toBe('failed')
  })

  it('resolves "failed" when no APIs are available at all', async () => {
    // no share, no clipboard
    const result = await shareInvite(TEST_URL)
    expect(result).toBe('failed')
  })

  it('never throws regardless of input', async () => {
    await expect(shareInvite('')).resolves.toBeDefined()
    await expect(shareInvite(TEST_URL)).resolves.toBeDefined()
  })
})

// ── Task 2: Native Capacitor path via injectable deps ───────────────────────

/**
 * Build injectable deps for native context.
 * capacitorShare is the Share.share() function from @capacitor/share.
 */
function makeNativeDeps(
  shareImpl: (opts: { title: string; text: string; url: string; dialogTitle?: string }) => Promise<unknown>,
  clipboardImpl?: (text: string) => Promise<void>,
): ShareDeps {
  return {
    isNative: true,
    capacitorShare: shareImpl,
    clipboard: clipboardImpl ?? (() => Promise.reject(new Error('no clipboard'))),
  }
}

/** Build injectable deps for web context (no Capacitor, explicit web share). */
function makeWebDeps(
  shareImpl?: (data: ShareData) => Promise<void>,
  clipboardImpl?: (text: string) => Promise<void>,
): ShareDeps {
  return {
    isNative: false,
    webShare: shareImpl,
    clipboard: clipboardImpl,
  }
}

describe('shareInvite (injectable deps) — native path', () => {
  it('calls capacitorShare with correct PT-BR payload when native + success', async () => {
    const mockNativeShare = vi.fn().mockResolvedValue({ activityType: 'com.apple.UIKit.activity.CopyToPasteboard' })
    const deps = makeNativeDeps(mockNativeShare)
    const result = await shareInvite(TEST_URL, deps)
    expect(result).toBe('shared')
    expect(mockNativeShare).toHaveBeenCalledOnce()
    const call = mockNativeShare.mock.calls[0][0] as { title: string; text: string; url: string }
    expect(call.url).toBe(TEST_URL)
    expect(typeof call.title).toBe('string')
    expect(call.text).toContain(TEST_URL)
  })

  it('passes PT-BR title in capacitorShare call', async () => {
    const mockNativeShare = vi.fn().mockResolvedValue({})
    const deps = makeNativeDeps(mockNativeShare)
    await shareInvite(TEST_URL, deps)
    const call = mockNativeShare.mock.calls[0][0] as { title: string }
    expect(call.title.length).toBeGreaterThan(0)
  })

  it('falls back to clipboard when capacitorShare throws', async () => {
    const mockNativeShare = vi.fn().mockRejectedValue(new Error('share cancelled'))
    const mockClipboard = vi.fn().mockResolvedValue(undefined)
    const deps = makeNativeDeps(mockNativeShare, mockClipboard)
    const result = await shareInvite(TEST_URL, deps)
    expect(result).toBe('copied')
    expect(mockClipboard).toHaveBeenCalledWith(TEST_URL)
  })

  it('returns "failed" when both capacitorShare and clipboard fail', async () => {
    const deps = makeNativeDeps(
      vi.fn().mockRejectedValue(new Error('share fail')),
      vi.fn().mockRejectedValue(new Error('clipboard fail')),
    )
    const result = await shareInvite(TEST_URL, deps)
    expect(result).toBe('failed')
  })

  it('never throws on the native path', async () => {
    const deps = makeNativeDeps(vi.fn().mockRejectedValue(new Error('boom')))
    await expect(shareInvite(TEST_URL, deps)).resolves.toBeDefined()
  })
})

describe('shareInvite (injectable deps) — web path (unchanged)', () => {
  it('uses webShare when provided and native is false', async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined)
    const deps = makeWebDeps(mockShare)
    const result = await shareInvite(TEST_URL, deps)
    expect(result).toBe('shared')
    expect(mockShare).toHaveBeenCalledOnce()
  })

  it('falls back to clipboard when webShare throws (non-native)', async () => {
    const deps = makeWebDeps(
      vi.fn().mockRejectedValue(new Error('no support')),
      vi.fn().mockResolvedValue(undefined),
    )
    const result = await shareInvite(TEST_URL, deps)
    expect(result).toBe('copied')
  })

  it('uses clipboard when no webShare provided (non-native)', async () => {
    const mockClipboard = vi.fn().mockResolvedValue(undefined)
    const deps = makeWebDeps(undefined, mockClipboard)
    const result = await shareInvite(TEST_URL, deps)
    expect(result).toBe('copied')
    expect(mockClipboard).toHaveBeenCalledWith(TEST_URL)
  })

  it('returns "failed" when both webShare and clipboard fail (non-native)', async () => {
    const deps = makeWebDeps(
      vi.fn().mockRejectedValue(new Error('share fail')),
      vi.fn().mockRejectedValue(new Error('clipboard fail')),
    )
    const result = await shareInvite(TEST_URL, deps)
    expect(result).toBe('failed')
  })
})

describe('shareInvite (injectable deps) — native does NOT call navigator.share', () => {
  it('ignores navigator.share when native deps are provided', async () => {
    const navShare = vi.fn().mockResolvedValue(undefined)
    setShare(navShare)
    const nativeShare = vi.fn().mockResolvedValue({})
    const deps = makeNativeDeps(nativeShare)
    await shareInvite(TEST_URL, deps)
    // Native path should be used; navigator.share should NOT be called
    expect(navShare).not.toHaveBeenCalled()
    expect(nativeShare).toHaveBeenCalledOnce()
  })
})
