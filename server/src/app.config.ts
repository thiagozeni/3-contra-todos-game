import config from '@colyseus/tools'
import { defineRoom } from '@colyseus/core'
import { ArenaRoom } from './rooms/ArenaRoom'

// Single Colyseus app config consumed by both the live server (index.ts) and the
// @colyseus/testing harness (tests/arena.test.ts) — one source of truth.
export default config({
  rooms: {
    arena: defineRoom(ArenaRoom),
  },
})
