// Authoritative network state — a minimal projection of the pure-core MultiGameState
// (src/core/multi.ts) into a @colyseus/schema v4 Schema. Only the fields the client
// needs to RENDER are synced; the full simulation lives server-side in gameState.
//
// Projection mapping (core -> net):
//   MultiGameState.humans[sid]  -> players[sid]  (PlayerNet)
//   MultiGameState.enemies[i]   -> enemies[i]    (EnemyNet)
//   MultiGameState.wand         -> wandHp/wandMaxHp/wandX/wandY
//   MultiGameState.wave         -> wave + spawnQueueLen (for the HUD enemy counter)
//   MultiGameState.score        -> score + comboCount   (for the HUD combo meter)
//   MultiGameState.status       -> status (+ "lobby" before the match starts)
//
// AI ally slots (the characters not chosen by a human in a < 3-human co-op match) ARE
// projected as AllyNet so the client can render them — without this projection the AI
// allies fight INVISIBLY (the server simulates them and enemies even take hits from
// them, but no sprite exists client-side). They are AI-driven, so an order-stable array
// (matching the core `allies` order) is enough; no per-entry identity key is needed.

import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema'

/** One human-controlled fighter, keyed by Colyseus sessionId in ArenaState.players. */
export class PlayerNet extends Schema {
  @type('string') sessionId = ''
  /**
   * Authoritative character of this player. During the lobby selection phase this
   * MIRRORS `selectedChar` (so late joiners / GameScene reconciliation see a value);
   * at match start it is locked to the confirmed `selectedChar`. The single-player
   * GameScene reconcile path (commit 3adbda8) reads this field.
   */
  @type('string') charKey = ''
  /**
   * Arcade character selector (FB3): the character this player's cursor is currently
   * on, or '' if none picked yet. A character that is the `selectedChar` of ANOTHER
   * player is LOCKED and cannot be picked. Mirrors into charKey.
   */
  @type('string') selectedChar = ''
  /** Arcade selector: true once this player locked in their pick (confirmChar). */
  @type('boolean') confirmed = false
  @type('number') x = 0
  @type('number') y = 0
  @type('number') hp = 0
  @type('number') maxHp = 0
  /** Player FSM: 'normal' | 'knockdown' | 'recovering' | 'blocking' | 'down'. */
  @type('string') fsm = 'normal'
  /** Horizontal facing: 1 = right, -1 = left. */
  @type('int8') facing: number = 1
  /** False once the underlying client has left (Task 8 reconnection refines this). */
  @type('boolean') connected = true
  /**
   * Player slot index in join order (0 = P1, 1 = P2, 2 = P3). Set at match start and
   * used by the client to assign the correct P1/P2/P3 color indicator (FB4).
   * -1 means unset (lobby phase, before the match starts).
   */
  @type('int8') slotIndex: number = -1
}

/** One enemy, identity-stable across patches via its core `id`. */
export class EnemyNet extends Schema {
  @type('number') id = 0
  @type('string') enemyType = ''
  @type('boolean') isBoss = false
  @type('number') x = 0
  @type('number') y = 0
  @type('number') hp = 0
  @type('number') maxHp = 0
  /** Enemy FSM (approach | chasePlayer | knockdown | staggered | ...). */
  @type('string') fsm = 'approach'
}

/**
 * One AI-controlled ally (a character slot not taken by a human). Position + fsm +
 * charKey are all the client needs to render and animate it; combat is server-owned
 * and ally FX already travel as 'hit' events carrying source:'ally'.
 */
export class AllyNet extends Schema {
  @type('string') charKey = ''
  @type('number') x = 0
  @type('number') y = 0
  /** Ally FSM: 'idle' | 'moveToEnemy' | 'attack' | 'knockdown' | 'recover'. */
  @type('string') fsm = 'idle'
}

/** Root authoritative state broadcast to all clients in an ArenaRoom. */
export class ArenaState extends Schema {
  /** 'lobby' (pre-match) | 'playing' | 'gameover' | 'victory'. */
  @type('string') status = 'lobby'
  @type('number') wave = 0
  /** Enemies still queued to spawn — lets the client show a live "enemies left" count. */
  @type('number') spawnQueueLen = 0
  @type('number') wandHp = 0
  @type('number') wandMaxHp = 0
  @type('number') wandX = 0
  @type('number') wandY = 0
  @type('number') score = 0
  @type('number') comboCount = 0
  @type({ map: PlayerNet }) players = new MapSchema<PlayerNet>()
  @type([EnemyNet]) enemies = new ArraySchema<EnemyNet>()
  /** AI ally slots — order matches the core `allies` array. Empty in a 3-human match. */
  @type([AllyNet]) allies = new ArraySchema<AllyNet>()
}
