/**
 * Ally HUD status — FB10
 *
 * Pure derivation of an ally row's display status from the authoritative
 * per-player fields (fsm + connected). Kept Phaser-free so it is unit-testable
 * and reusable by both the HUD render and the E2E debug snapshot.
 *
 *   'ok'   → player is active; no badge, full opacity
 *   'down' → player is at 0 HP and inert (fsm 'down'); "DOWN" badge
 *   'off'  → player's socket dropped; inside the 60s reconnection window the
 *            server keeps them in state with connected=false; "OFF" badge
 *
 * Precedence: 'off' wins over 'down'. A dropped session is the more actionable
 * state to surface (the player cannot act at all until they reconnect), even if
 * they happened to be down when the socket closed.
 */

export type AllyStatus = 'ok' | 'down' | 'off'

/**
 * Derive the ally status. `connected` defaults to "connected" when undefined so
 * a missing field never spuriously shows OFF (defensive — projected state always
 * carries connected, but ally snapshots may be partial early in a join).
 */
export function allyStatus(
  fsm: string | undefined,
  connected: boolean | undefined,
): AllyStatus {
  if (connected === false) return 'off'
  if (fsm === 'down') return 'down'
  return 'ok'
}

/** Badge text for a status. 'ok' has no badge (empty string). */
export function allyStatusLabel(status: AllyStatus): string {
  switch (status) {
    case 'down':
      return 'DOWN'
    case 'off':
      return 'OFF'
    default:
      return ''
  }
}
