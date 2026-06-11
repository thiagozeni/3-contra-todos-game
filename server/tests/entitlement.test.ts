/**
 * EntitlementVerifier — server-side host gate.
 *
 * TDD (Task 4, Fatia 4):
 *   AllowAllEntitlementVerifier: any claim passes (beta/dev, HOST_GATE_ENABLED !== 'true').
 *   PremiumOnlyEntitlementVerifier: only 'premium' passes; 'free'/absent → false.
 *   getVerifier(): reads HOST_GATE_ENABLED from env; returns AllowAll or PremiumOnly.
 *   ArenaRoom integration: with gate on, free create is rejected cleanly; join is never gated.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AllowAllEntitlementVerifier, PremiumOnlyEntitlementVerifier, getVerifier } from '../src/entitlement/EntitlementVerifier'
import { boot, ColyseusTestServer } from '@colyseus/testing'

// ── Unit: verifier classes ────────────────────────────────────────────────────

describe('AllowAllEntitlementVerifier', () => {
  const verifier = new AllowAllEntitlementVerifier()

  it('allows claim "premium"', () => {
    expect(verifier.canHost({ entitlement: 'premium' })).toBe(true)
  })

  it('allows claim "free"', () => {
    expect(verifier.canHost({ entitlement: 'free' })).toBe(true)
  })

  it('allows absent entitlement (undefined)', () => {
    expect(verifier.canHost({})).toBe(true)
  })

  it('allows null/unknown claim', () => {
    expect(verifier.canHost({ entitlement: 'unknown' as any })).toBe(true)
  })
})

describe('PremiumOnlyEntitlementVerifier', () => {
  const verifier = new PremiumOnlyEntitlementVerifier()

  it('allows claim "premium"', () => {
    expect(verifier.canHost({ entitlement: 'premium' })).toBe(true)
  })

  it('rejects claim "free"', () => {
    expect(verifier.canHost({ entitlement: 'free' })).toBe(false)
  })

  it('rejects absent entitlement', () => {
    expect(verifier.canHost({})).toBe(false)
  })

  it('rejects null claim', () => {
    expect(verifier.canHost({ entitlement: null as any })).toBe(false)
  })

  it('rejects unknown/spoofed claim', () => {
    expect(verifier.canHost({ entitlement: 'hacked' as any })).toBe(false)
  })
})

describe('getVerifier (env-driven factory)', () => {
  const OLD_ENV = process.env['HOST_GATE_ENABLED']

  afterAll(() => {
    if (OLD_ENV === undefined) delete process.env['HOST_GATE_ENABLED']
    else process.env['HOST_GATE_ENABLED'] = OLD_ENV
  })

  it('returns AllowAll when HOST_GATE_ENABLED is absent', () => {
    delete process.env['HOST_GATE_ENABLED']
    expect(getVerifier()).toBeInstanceOf(AllowAllEntitlementVerifier)
  })

  it('returns AllowAll when HOST_GATE_ENABLED = "false"', () => {
    process.env['HOST_GATE_ENABLED'] = 'false'
    expect(getVerifier()).toBeInstanceOf(AllowAllEntitlementVerifier)
  })

  it('returns PremiumOnly when HOST_GATE_ENABLED = "true"', () => {
    process.env['HOST_GATE_ENABLED'] = 'true'
    expect(getVerifier()).toBeInstanceOf(PremiumOnlyEntitlementVerifier)
  })
})

// ── Integration: ArenaRoom with host gate ─────────────────────────────────────

describe('ArenaRoom + entitlement gate (integration)', () => {
  let colyseus: ColyseusTestServer
  const OLD_ENV = process.env['HOST_GATE_ENABLED']

  // Build a gated appConfig dynamically for integration tests.
  // We import the gated config factory used in ArenaRoom.
  beforeAll(async () => {
    process.env['HOST_GATE_ENABLED'] = 'true'
    const appConfig = (await import('../src/app.config')).default
    colyseus = await boot(appConfig)
  })

  afterAll(async () => {
    await colyseus.shutdown()
    if (OLD_ENV === undefined) delete process.env['HOST_GATE_ENABLED']
    else process.env['HOST_GATE_ENABLED'] = OLD_ENV
  })

  beforeEach(async () => {
    await colyseus.cleanup()
  })

  it('with gate ON: create with entitlement="premium" succeeds', async () => {
    const room = await colyseus.createRoom('arena', { entitlement: 'premium' })
    expect(room).toBeDefined()
    expect(room.roomId).toBeTruthy()
  })

  it('with gate ON: create with entitlement="free" is rejected (throws)', async () => {
    await expect(
      colyseus.createRoom('arena', { entitlement: 'free' })
    ).rejects.toThrow()
  })

  it('with gate ON: create with absent entitlement is rejected (throws)', async () => {
    await expect(
      colyseus.createRoom('arena', {})
    ).rejects.toThrow()
  })

  it('with gate ON: joinById is never gated (free client can join a premium room)', async () => {
    // Create a room as premium host
    const room = await colyseus.createRoom('arena', { entitlement: 'premium' })
    // A "free" client can join by code — joinById never checks entitlement
    const client = await colyseus.connectTo(room, { charKey: 'werdum' })
    await room.waitForNextPatch()
    expect(client).toBeDefined()
    expect(room.clients.length).toBe(1)
  })
})
