/**
 * Pure pose-decision helpers for the Player view (FB5).
 *
 * Extracted from Player.syncFromState so the FSM → pose rules are headless-testable
 * (the Phaser sprite is not). The view applies these decisions to the sprite.
 *
 * FB5 background: a co-op player who runs out of HP enters fsm:'down' and must LIE on
 * the ground (knockdown anim, frozen on its last frame) for the rest of the match. The
 * per-frame view sync used to fall back to idle/run once the knockdown anim completed,
 * standing the corpse back up. These helpers make the "is this a fallen pose?" and
 * "may the view switch to idle/run?" rules explicit and tested.
 */

import type { PlayerFsm } from '../core/types'

/**
 * True when the player must HOLD the fallen knockdown pose and must never animate to
 * idle/run. Today that is exactly the terminal co-op 'down' state.
 */
export function isFallenPose(fsm: PlayerFsm): boolean {
  return fsm === 'down'
}

/**
 * True when the view is allowed to switch the sprite to idle/run this frame.
 *
 * Blocked while:
 *  - down-held (FB5): the fallen pose must persist;
 *  - blocking: the block anim is managed by start/releaseBlockAnim;
 *  - a combat anim is locked (animLocked);
 *  - a block anim is mid-play (blockAnimStarted).
 */
export function mayPlayIdleOrRun(args: {
  fsm: PlayerFsm
  holdingDown: boolean
  animLocked: boolean
  blockAnimStarted: boolean
}): boolean {
  const { fsm, holdingDown, animLocked, blockAnimStarted } = args
  if (holdingDown) return false
  if (isFallenPose(fsm)) return false
  if (fsm === 'blocking') return false
  if (animLocked) return false
  if (blockAnimStarted) return false
  return true
}
