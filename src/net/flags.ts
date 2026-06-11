/**
 * Feature flags for network/co-op mode.
 * Defaults to OFF so single-player (loja) is never affected.
 */

/**
 * Enable multiplayer co-op. Set VITE_NET_ENABLED=true in .env.local
 * or in the beta build environment to activate.
 */
export const NET_ENABLED: boolean =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: Record<string, string> }).env?.VITE_NET_ENABLED === 'true'

/**
 * WebSocket URL for the Colyseus server.
 * Override via VITE_SERVER_URL in env.
 */
export const SERVER_URL: string =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_SERVER_URL) ||
  'ws://localhost:2567'
