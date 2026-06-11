# 3 Contra Todos — Game Server

Colyseus 0.17 authoritative game server for co-op mode. Handles room creation, player join/rejoin, fixed-step simulation at 20 Hz, and state broadcast.

## Quick start (local dev)

```bash
# From the workspace root (npm workspaces)
npm run dev -w server

# Or from this directory directly
npx ts-node-dev --respawn --transpile-only src/index.ts
```

Server listens on **http://localhost:2567** by default.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `2567`  | TCP port the server binds to |

> **Reserved ports — NEVER use 8080/8443/8843/8880 on this host.** Those are taken by a UniFi Network Controller. Port 2567 is Colyseus default and safe.

## Room protocol

### Room name
`arena`

### Exposed matchMaker methods
- `create` — host creates a room; receives a 4-letter room code as `roomId`
- `joinById` — guests join by room code (the 4 letters from the host)
- `reconnect` — SDK-level reconnect within the 60 s reconnection window

`join` and `joinOrCreate` are intentionally disabled (bypass code-based flow).

### Messages: client → server

| Message | Payload | When |
|---------|---------|------|
| `input` | `MoveInput` (up/down/left/right/block/punch/kick booleans) | Every client frame (pre-match: ignored) |
| `ready` | `{}` | Host signals start — triggers simulation loop |

### Broadcasts: server → client

| Message | Payload | When |
|---------|---------|------|
| `events` | `SimEvent[]` | After every 20 Hz tick; contains FX events (hit, enemyDied, waveStarted, etc.) |

State changes (hp, position, wave, enemies, players) are delivered automatically via Colyseus Schema delta-sync (no manual broadcast needed).

### State schema (ArenaState)

```
ArenaState {
  status: string          // 'lobby' | 'playing' | 'gameOver' | 'victory'
  wave: number
  score: number
  wandHp: number
  players: MapSchema<PlayerNet>
  enemies: ArraySchema<EnemyNet>
}

PlayerNet {
  sessionId, charKey, x, y, hp, maxHp, fsm, facing, connected
}

EnemyNet {
  id, enemyType, isBoss, x, y, hp, maxHp, fsm
}
```

### Simulation loop

- Fixed step: **50 ms / 20 Hz**
- Patch rate: **50 ms** (every tick; configurable via `PATCH_RATE`)
- Max clients: **3** (co-op up to 3 players)
- Room codes: **4 uppercase letters** (A–Z), collision-safe via Colyseus Presence
- Reconnection window: **60 s** (Colyseus SDK default)

## Tests

```bash
npm test -w server
# or
npx vitest run    # from this directory
```

Coverage (`npx vitest run --coverage --coverage.include='src/rooms/**' --coverage.include='src/util/**'`):
- `rooms/ArenaRoom.ts`: ~94% lines
- `util/roomCode.ts`: ~95% lines

## Hosting (PENDING — user decision)

The production hosting target has **not been decided** for this Fatia.

Options under consideration:
- **Colyseus Cloud** — managed, native deploy, auto-scaling, presence built-in, recurring cost
- **Small VPS** — full control, lower cost at low volume, you operate Node + TLS

This server runs against local/dev in co-op beta. The Fatia 3/4 work requires the hosting target to be defined first.

## Build

```bash
cd server && npm run build    # tsc → dist/
node dist/index.js             # run production build
```
