import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Colyseus boots real ws transports + simulation intervals; give room to settle.
    testTimeout: 15000,
    hookTimeout: 15000,
    // Each test boots/​shuts a server with timers — run files sequentially to avoid
    // port/timer contention.
    fileParallelism: false,
  },
})
