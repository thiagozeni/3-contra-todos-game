/**
 * EntitlementVerifier — server-side host gate for the premium/free dual-app model.
 *
 * Interface contract:
 *   canHost(opts): synchronous. opts contains the `entitlement` claim sent by the
 *   client in create-options. Returns true if this client is allowed to create a room.
 *
 * Implementations shipped:
 *   AllowAllEntitlementVerifier  — always allows (beta/dev; HOST_GATE_ENABLED !== 'true').
 *   PremiumOnlyEntitlementVerifier — allows only claim 'premium'; rejects 'free'/absent.
 *
 * Future plug-in (Checklist item 5 — no changes to ArenaRoom needed):
 *   ReceiptEntitlementVerifier — validates an App Store / Google Play receipt server-side.
 *   Implement the same `canHost` signature (may be async — adjust ArenaRoom.onCreate to await).
 *
 * The gate is configured via HOST_GATE_ENABLED env var (see getVerifier()).
 * JOIN (joinById) is NEVER gated — only create is checked.
 */

/** Options passed in create-options from the client. */
export interface CreateOptions {
  entitlement?: 'premium' | 'free' | null | string
}

/**
 * Interface that all entitlement verifiers must satisfy.
 *
 * canHost is synchronous in the current build-time claim implementation.
 * When ReceiptEntitlementVerifier is implemented, make it `async canHost(...)` and
 * update ArenaRoom.onCreate to `await verifier.canHost(options)`.
 */
export interface EntitlementVerifier {
  /**
   * Returns true if the given create-options allow hosting a room.
   * Called in ArenaRoom.onCreate — throw or return false to reject.
   */
  canHost(opts: CreateOptions): boolean
}

// ── Implementations ───────────────────────────────────────────────────────────

/**
 * AllowAllEntitlementVerifier — used when HOST_GATE_ENABLED !== 'true' (default).
 * Keeps the beta web and dev environment fully open: any client can create a room.
 */
export class AllowAllEntitlementVerifier implements EntitlementVerifier {
  canHost(_opts: CreateOptions): boolean {
    return true
  }
}

/**
 * PremiumOnlyEntitlementVerifier — used when HOST_GATE_ENABLED === 'true'.
 * Only allows create when the client sends entitlement === 'premium'.
 * Free builds send 'free' → rejected.
 * Absent/unknown entitlement → rejected (fail-closed, safe default).
 *
 * Security note: the claim is build-time only (spoofable by a modified client).
 * This is acceptable for the beta pre-launch phase. For a tamper-proof gate,
 * implement ReceiptEntitlementVerifier using App Store Server API / Play Developer API
 * and pass the verifier via the factory below.
 */
export class PremiumOnlyEntitlementVerifier implements EntitlementVerifier {
  canHost(opts: CreateOptions): boolean {
    return opts.entitlement === 'premium'
  }
}

// ── Factory (env-driven) ──────────────────────────────────────────────────────

/**
 * Returns the correct EntitlementVerifier based on the HOST_GATE_ENABLED env var.
 *
 *   HOST_GATE_ENABLED=true  → PremiumOnlyEntitlementVerifier (gate is active)
 *   anything else / absent  → AllowAllEntitlementVerifier    (open beta / dev)
 *
 * This is the single configuration point. No other code needs to know about the env var.
 *
 * To plug in ReceiptEntitlementVerifier in the future:
 *   1. Implement the interface with async canHost (if needed).
 *   2. Return it here (optionally behind its own env flag, e.g. ENTITLEMENT_MODE=receipt).
 *   3. ArenaRoom.onCreate is the only consumer — update it to await if needed.
 */
export function getVerifier(): EntitlementVerifier {
  if (process.env['HOST_GATE_ENABLED'] === 'true') {
    return new PremiumOnlyEntitlementVerifier()
  }
  return new AllowAllEntitlementVerifier()
}
