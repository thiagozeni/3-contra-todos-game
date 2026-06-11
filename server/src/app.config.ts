import config from '@colyseus/tools'
import { defineRoom, matchMaker } from '@colyseus/core'
import { ArenaRoom } from './rooms/ArenaRoom'

// ── Matchmaking restriction ───────────────────────────────────────────────────
// Clients must join by explicit room code (joinById) or create their own room as
// host (create). Open matchmaking (joinOrCreate / join) is intentionally disabled:
//  - joinOrCreate: would silently reuse any available room, bypassing code flow.
//  - join: routes by room-name to any available room without knowing the code —
//    same bypass risk.
// The co-op flow always starts with a room code shared out-of-band.
//
// 'create' stays exposed in all environments. The premium host gate is enforced
// inside ArenaRoom.onCreate via EntitlementVerifier (Fatia 4). When HOST_GATE_ENABLED
// is not 'true' (default), AllowAllEntitlementVerifier keeps beta/dev fully open.
matchMaker.controller.exposedMethods = ['create', 'joinById', 'reconnect']

// Single Colyseus app config consumed by both the live server (index.ts) and the
// @colyseus/testing harness (tests/arena.test.ts) — one source of truth.
export default config({
  rooms: {
    arena: defineRoom(ArenaRoom),
  },
})
