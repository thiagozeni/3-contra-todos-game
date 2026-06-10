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
// AI ally slots are NOT projected here in Task 3 (they are server-side AllyState and
// the client renders them as remote characters later); this keeps the wire minimal.

import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema'

/** One human-controlled fighter, keyed by Colyseus sessionId in ArenaState.players. */
export class PlayerNet extends Schema {
  @type('string') sessionId = ''
  @type('string') charKey = ''
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
}
