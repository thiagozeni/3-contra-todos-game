// Pure TypeScript — ZERO Phaser. The keystone of the V2 refactor.
//
// Simulation.ts is the deterministic, headless game-loop orchestrator for the
// SINGLE-PLAYER path ("1 human + 2 AI allies"). As of the F2.2 follow-up it is a
// THIN ADAPTER over `updateMulti` (src/core/multi.ts): the co-op core is now the
// single source of truth for the game loop, and single-player is the special case
// of "exactly one human slot". This removes the ~70 lines of enemy-intent/damage
// logic that used to be duplicated between the two files.
//
// The same loop runs identically on a server (for anti-cheat replay / authoritative
// scoring) and behind the Phaser renderer.
//
// Why an adapter and not a straight re-export: single-player carries V1 semantics
// that differ from co-op ONLY at the terminal (gameOver) tick:
//   - the dying player ends with fsm:'knockdown' (V1), whereas multi sets the lethal
//     human to fsm:'down';
//   - multi emits an extra `playerDown` event (and tags per-human events with a
//     `sessionId`), neither of which exist on the V1 single-player path.
// The adapter translates the dying human's 'down' → 'knockdown', drops `playerDown`
// events, and strips `sessionId` attributions, so the single-player event/state
// shapes are byte-identical to the pre-refactor behaviour. The non-terminal path is
// already byte-equivalent (proven by the equivalence test in tests/core/multi.test.ts).

import { createMultiInitialState, updateMulti } from './multi'
import type { MultiGameState, CharKey } from './multi'
import type {
  GameState, PlayerState, SimEvent, MoveInput,
} from './types'

// ── Input ─────────────────────────────────────────────────────────────────────

/**
 * The full per-tick input: movement + block + the two attack buttons.
 * MoveInput already carries up/down/left/right/block/punch/kick, so SimInput is
 * an alias today; it stays a named type so the renderer/server can target it.
 */
export type SimInput = MoveInput

// ── Constants ────────────────────────────────────────────────────────────────

// The fixed sessionId for the lone human slot in the single-player adapter.
const SOLO_SID = 'p1'

// V1 knockdown timer (Player.knockdown). On a lethal knockdown hit the V1
// single-player player was left in fsm:'knockdown' with this timer set; updateMulti
// instead overrides the dying human to fsm:'down'/knockdownTimer:0, so the adapter
// restores the V1 values when reconstructing the dead player below.
const PLAYER_KNOCKDOWN_MS = 2000

// ── createInitialState ───────────────────────────────────────────────────────

/**
 * Build the initial GameState for a new match.
 *
 * Delegates to createMultiInitialState with a single human slot (`p1`) and
 * collapses the result to the single-player GameState shape. The two-AI-ally fill,
 * spawn positions, wand HP and seeding all live in the co-op core now — keeping the
 * initial shape a single source of truth. (tests/core/multi.test.ts asserts that
 * humans['p1'] === this player, and allies === this allies.)
 */
export function createInitialState(character: CharKey, seed: number): GameState {
  const multi = createMultiInitialState([{ sessionId: SOLO_SID, charKey: character }], seed)
  return fromMultiState(multi, multi.humans[SOLO_SID])
}

// ── update ──────────────────────────────────────────────────────────────────────

export interface UpdateResult {
  state: GameState
  events: SimEvent[]
}

/**
 * Advance the simulation by one tick of `deltaMs`.
 *
 * Thin adapter over updateMulti with a single human slot. Returns a NEW GameState
 * (never mutates `state`) plus the SimEvents produced this tick.
 *
 * Once status !== 'playing', update is a no-op that returns `state` unchanged
 * (same reference) and an empty event list.
 */
export function update(state: GameState, input: SimInput, deltaMs: number): UpdateResult {
  // ── Freeze guard ──────────────────────────────────────────────────────────
  // Short-circuit BEFORE bridging so the frozen-state caller gets the exact same
  // reference back (the immutability test relies on `r.state === state`).
  if (state.status !== 'playing') {
    return { state, events: [] }
  }

  const multiIn = toMultiState(state)
  const { state: multiOut, events } = updateMulti(multiIn, { [SOLO_SID]: input }, deltaMs)

  return {
    state: fromMultiState(multiOut, restoreDeadPlayer(multiOut.humans[SOLO_SID], events)),
    events: adaptEvents(events),
  }
}

/**
 * Reconstruct the lone human as the V1 single-player loop would have left it on the
 * terminal (death) tick. updateMulti collapses a dying human to a uniform
 * `fsm:'down', isBlocking:false, knockdownTimer:0`, but V1 single-player kept two
 * distinct shapes depending on HOW the player died:
 *   - knockdown-hit death (any non-block lethal hit — hp<=0 forces a knockdown hit):
 *     fsm:'knockdown', isBlocking:false, knockdownTimer:2000. Discriminated by the
 *     `playerKnockdown` event emitted this tick.
 *   - blocking chip death (lethal damage while blocking): the player kept its
 *     movePlayer-derived blocking state — fsm:'blocking', isBlocking:true,
 *     knockdownTimer:0 (a blocking player is never mid-knockdown).
 * Non-dying humans (fsm !== 'down') are returned unchanged.
 */
function restoreDeadPlayer(human: PlayerState, events: SimEvent[]): PlayerState {
  if (human.fsm !== 'down') return human

  const knockedDown = events.some(e => e.type === 'playerKnockdown')
  return knockedDown
    ? { ...human, fsm: 'knockdown', isBlocking: false, knockdownTimer: PLAYER_KNOCKDOWN_MS }
    : { ...human, fsm: 'blocking', isBlocking: true, knockdownTimer: 0 }
}

// ── State bridge: GameState ⇄ MultiGameState (one human slot) ─────────────────────

/**
 * Build a MultiGameState view around the single-player GameState, with the lone
 * human in slot `p1` and the AI allies as the remaining slots. The slot order
 * (human first, then AI) and AI sessionId scheme (`ai:<char>`) mirror
 * createMultiInitialState so updateMulti's slot bookkeeping is identical.
 */
function toMultiState(state: GameState): MultiGameState {
  const slots = [
    { sessionId: SOLO_SID, charKey: state.player.charKey as CharKey, controlledBy: 'human' as const },
    ...state.allies.map(a => ({
      sessionId: `ai:${a.charKey}`,
      charKey: a.charKey as CharKey,
      controlledBy: 'ai' as const,
    })),
  ]

  return {
    status: state.status,
    slots,
    humans: { [SOLO_SID]: state.player },
    enemies: state.enemies,
    allies: state.allies,
    wand: state.wand,
    wave: state.wave,
    score: state.score,
    gameTimerMs: state.gameTimerMs,
    rngState: state.rngState,
    cheatUsed: state.cheatUsed,
  }
}

/**
 * Collapse a MultiGameState (one human) back to a single-player GameState, using
 * `player` as the lone human's PlayerState (already adapted to V1 semantics by the
 * caller via restoreDeadPlayer; for the non-terminal path it is humans[SOLO_SID]
 * unchanged).
 */
function fromMultiState(state: MultiGameState, player: PlayerState): GameState {
  return {
    status: state.status,
    player,
    enemies: state.enemies,
    allies: state.allies,
    wand: state.wand,
    wave: state.wave,
    score: state.score,
    gameTimerMs: state.gameTimerMs,
    rngState: state.rngState,
    cheatUsed: state.cheatUsed,
  }
}

// ── Event adaptation ──────────────────────────────────────────────────────────────

/**
 * Adapt the co-op event stream to V1 single-player shape:
 *   - drop `playerDown` events (no V1 equivalent — the dying player is knocked down);
 *   - strip the optional `sessionId` attribution from every other event, so the
 *     emitted shapes are byte-identical to the pre-refactor single-player events.
 */
function adaptEvents(events: SimEvent[]): SimEvent[] {
  const out: SimEvent[] = []
  for (const e of events) {
    if (e.type === 'playerDown') continue
    if ('sessionId' in e && e.sessionId !== undefined) {
      const { sessionId: _drop, ...rest } = e as SimEvent & { sessionId?: string }
      out.push(rest as SimEvent)
    } else {
      out.push(e)
    }
  }
  return out
}
