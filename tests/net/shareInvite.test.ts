/**
 * shareInvite.ts — pure unit tests (RED first, TDD)
 *
 * Mocks navigator.share / navigator.clipboard to exercise the
 * Web Share API → clipboard fallback chain.
 * NEVER throws — always resolves to a ShareResult string.
 *
 * ShareResult: 'shared' | 'cancelled' | 'copied' | 'failed'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shareInvite } from '../../src/net/shareInvite'

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
