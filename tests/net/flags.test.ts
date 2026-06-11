/**
 * flags.ts unit tests.
 *
 * Exercises the feature-flag module in a test environment where
 * import.meta.env is not set. The key contracts:
 *  - NET_ENABLED is false when VITE_NET_ENABLED is absent
 *  - SERVER_URL falls back to 'ws://localhost:2567' when VITE_SERVER_URL is absent
 *  - The module exports are the correct types
 */

import { describe, it, expect } from 'vitest'
import { NET_ENABLED, SERVER_URL } from '../../src/net/flags'

describe('flags.ts — feature flags', () => {
  it('NET_ENABLED is a boolean', () => {
    expect(typeof NET_ENABLED).toBe('boolean')
  })

  it('NET_ENABLED is false in the test environment (no VITE_NET_ENABLED set)', () => {
    // In vitest the import.meta.env.VITE_NET_ENABLED is not 'true',
    // so the guard should evaluate to false (safe single-player default).
    expect(NET_ENABLED).toBe(false)
  })

  it('SERVER_URL is a string', () => {
    expect(typeof SERVER_URL).toBe('string')
  })

  it('SERVER_URL defaults to the local development server', () => {
    // No VITE_SERVER_URL env var set in the test environment.
    expect(SERVER_URL).toBe('ws://localhost:2567')
  })
})
