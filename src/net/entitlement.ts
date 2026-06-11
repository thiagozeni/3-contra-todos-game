/**
 * Client-side entitlement claim derivation (Task 4, Fatia 4).
 *
 * The entitlement claim is sent in create-options to the Colyseus server so it can
 * enforce the host gate via EntitlementVerifier.
 *
 * Claim values:
 *   'premium' — sent by premium builds and web beta (AllowAll server accepts all claims
 *               when HOST_GATE_ENABLED !== 'true', so the web beta stays open).
 *   'free'    — sent by free builds (FREE_BUILD=true); rejected by PremiumOnlyVerifier.
 *
 * Note: the claim is build-time only and spoofable by a modified client. This is an
 * accepted risk for the beta pre-launch phase. When ReceiptEntitlementVerifier is
 * implemented server-side, the server will independently verify the purchase receipt
 * and the claim becomes a routing hint only.
 */

import { FREE_BUILD } from '../ads/buildFlavor'

/** The entitlement claim type sent in Colyseus create-options. */
export type EntitlementClaim = 'premium' | 'free'

/**
 * Derives the entitlement claim from the current build flavor.
 *
 * FREE_BUILD=true  → 'free'  (free app; gate rejects this when HOST_GATE_ENABLED=true)
 * default          → 'premium' (premium app and web beta; always allowed)
 */
export function getEntitlementClaim(): EntitlementClaim {
  return FREE_BUILD ? 'free' : 'premium'
}
