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

// Design System (Fatia V) — fundação canônica. Após a migração da Fase 3, todas
// as telas consomem os tokens do ds/ diretamente. theme.ts é só um barrel fino:
// re-exporta a fundação do ds/ (tokens, dsText, componentes — inclui SKEW).
export * from './ds'
