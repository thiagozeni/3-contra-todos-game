/**
 * allyStatus unit tests — FB10
 *
 * Pure mapping from (fsm, connected) → ally HUD status + badge label.
 * No Phaser, no SDK — fully headless.
 *
 * Status drives the ally HUD row badge added in FB10:
 *   'ok'   → no badge, full opacity
 *   'down' → "DOWN" badge (player at 0 HP, inert; no respawn this match)
 *   'off'  → "OFF" badge (disconnected; inside the 60s reconnection window)
 *
 * Precedence: 'off' wins over 'down' — a dropped session is the more actionable
 * state to surface (the player can't act at all until they reconnect), even if
 * they happened to be down when the socket closed.
 */

import { describe, it, expect } from 'vitest'
import { allyStatus, allyStatusLabel } from '../../src/net/allyStatus'

describe('allyStatus (fsm, connected) → status', () => {
  it("is 'ok' for a normal connected player", () => {
    expect(allyStatus('normal', true)).toBe('ok')
  })

  it("is 'ok' while connected and merely knocked down / recovering (not dead)", () => {
    expect(allyStatus('knockdown', true)).toBe('ok')
    expect(allyStatus('recovering', true)).toBe('ok')
    expect(allyStatus('blocking', true)).toBe('ok')
  })

  it("is 'down' when fsm is 'down' and still connected", () => {
    expect(allyStatus('down', true)).toBe('down')
  })

  it("is 'off' when disconnected, regardless of fsm", () => {
    expect(allyStatus('normal', false)).toBe('off')
    expect(allyStatus('knockdown', false)).toBe('off')
  })

  it("prefers 'off' over 'down' when a downed player also disconnects", () => {
    expect(allyStatus('down', false)).toBe('off')
  })

  it('treats undefined fsm/connected defensively (connected assumed true)', () => {
    expect(allyStatus(undefined, undefined)).toBe('ok')
    expect(allyStatus(undefined, true)).toBe('ok')
    expect(allyStatus('down', undefined)).toBe('down')
  })
})

describe('allyStatusLabel (status) → badge text', () => {
  it("maps 'ok' to an empty string (no badge)", () => {
    expect(allyStatusLabel('ok')).toBe('')
  })

  it("maps 'down' to 'DOWN'", () => {
    expect(allyStatusLabel('down')).toBe('DOWN')
  })

  it("maps 'off' to 'OFF'", () => {
    expect(allyStatusLabel('off')).toBe('OFF')
  })
})
