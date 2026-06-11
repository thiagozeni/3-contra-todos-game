// Pure TS — zero Phaser, zero network. Client-side prediction of the LOCAL
// character's MOVEMENT only (co-op PvE is latency-tolerant; spec §5). We run the
// SAME pure `movePlayer` the server runs, each client frame, for responsiveness —
// zero duplication of movement rules. When the authoritative snapshot arrives we
// reconcile: large divergence → hard snap; small divergence → smooth correction.
// hp/maxHp/fsm/facing are ALWAYS taken from the server (combat is server-only).

import { movePlayer } from '../core/systems/movement'
import type { PlayerState, MoveInput } from '../core/types'

/** Above this positional error we hard-snap to the server instead of smoothing. // TUNING */
export const SNAP_THRESHOLD_PX = 48

/** Fraction of the remaining error closed per reconcile call below the threshold. // TUNING */
export const SMOOTH_FACTOR = 0.25

/**
 * Predict one frame of the local character's movement by delegating to the core
 * `movePlayer` — the exact function the server simulation runs. No movement math
 * lives here, so the client can never drift from the server's rules. The input
 * PlayerState is never mutated (movePlayer returns a new object).
 */
export function predictStep(predicted: PlayerState, input: MoveInput, deltaMs: number): PlayerState {
  return movePlayer(predicted, input, deltaMs)
}

export interface ReconcileOptions {
  /** Override the hard-snap threshold (px). */
  snapThreshold?: number
  /** Override the smooth-correction factor (0..1). */
  smoothFactor?: number
}

export interface ReconcileResult {
  state: PlayerState
  /** True when a hard snap was applied (divergence exceeded the threshold). */
  corrected: boolean
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f
}

/**
 * Reconcile the locally-predicted state against the authoritative server state.
 *
 * Position:
 * - |server - predicted| > snapThreshold → hard snap to the server position.
 * - otherwise → move a `smoothFactor` fraction toward the server position (soft
 *   correction spread across frames, no visible teleport).
 *
 * Everything else (hp, maxHp, fsm, facing, and all combat-driven fields) ALWAYS
 * comes from the authoritative state — prediction governs position only. A server
 * knockdown therefore propagates immediately, and the next `predictStep` will
 * refuse to move (movePlayer respects the knockdown fsm).
 *
 * Pure: neither input is mutated; a new state object is returned.
 */
export function reconcile(
  predicted: PlayerState,
  authoritative: PlayerState,
  opts: ReconcileOptions = {},
): ReconcileResult {
  const snapThreshold = opts.snapThreshold ?? SNAP_THRESHOLD_PX
  const smoothFactor = opts.smoothFactor ?? SMOOTH_FACTOR

  const dx = authoritative.x - predicted.x
  const dy = authoritative.y - predicted.y
  const dist = Math.hypot(dx, dy)

  let x: number
  let y: number
  let corrected: boolean

  if (dist > snapThreshold) {
    x = authoritative.x
    y = authoritative.y
    corrected = true
  } else {
    x = lerp(predicted.x, authoritative.x, smoothFactor)
    y = lerp(predicted.y, authoritative.y, smoothFactor)
    corrected = false
  }

  // Position comes from prediction(+correction); EVERYTHING else is authoritative.
  return {
    state: {
      ...authoritative,
      x,
      y,
      groundY: y,
    },
    corrected,
  }
}
