/**
 * UI Theme — Fatia V, Trilha 1 · direção "pixel retro + Tekken life bars".
 *
 * Single source of truth for the consolidated palette + Phaser helpers that draw
 * the angled (parallelogram) HP bars and the angled portrait frames, both pixel
 * retro. Replaces the 40+ ad-hoc hexes audited across the scenes with tokens.
 *
 * Phaser 4. Bars are drawn with Graphics so they redraw on HP change (the fill
 * shrinks correctly — no fixed-width sliver left behind).
 */

// Design System (Fatia V) — fundação canônica. theme.ts mantém os símbolos
// legados (COLORS/CSS/FONT/AngledBar/...) e re-exporta os tokens novos do ds/.
// A migração das telas (COLORS→semantic, add.text→dsText) acontece na Fase 3.
export * from './ds'

/** Numeric tokens (shapes/Graphics). */
export const COLORS = {
  gold: 0xffd23f,
  goldHi: 0xfff3b0,
  goldMid: 0xf3c204,
  goldLo: 0x9c6b00,
  cyan: 0x2a93e6,
  cyanHi: 0xbfefff,
  danger: 0xff4d4d,
  warn: 0xffaa22,
  ok: 0x22cc44,
  p1: 0x3b9eff,
  p2: 0xff4fd8,
  p3: 0x52e85c,
  night: 0x0d0d1a,
  trough: 0x0a0e1c,
  troughEdge: 0x2a3566,
  steel: 0x8a8a9a,
  ink: 0x000000,
} as const

/** CSS-hex tokens (Phaser Text). */
export const CSS = {
  gold: '#ffd23f',
  goldMid: '#f3c204',
  cyan: '#bfe6ff',
  danger: '#ff4d4d',
  warn: '#ffaa22',
  ok: '#22cc44',
  textHi: '#ffffff',
  textMid: '#cccccc',
  ink: '#000000',
} as const

export const FONT = {
  hud: '"Press Start 2P", monospace',     // numeric/labels — arcade icon
  display: '"Pixelify Sans", monospace',  // chunky timer/combo
} as const

/** Default slant: horizontal shift between the top and bottom edges (≈ tan16·h). */
export const SKEW = 0.287
