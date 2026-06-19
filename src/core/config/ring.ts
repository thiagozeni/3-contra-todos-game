// Pure TS — zero Phaser. Shared by server simulation and Phaser client.

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

/**
 * Multiplicador GLOBAL de tamanho dos personagens (players, aliados, inimigos e
 * bosses) sobre a escala de perspectiva. No cenário novo (arena dark) os lutadores
 * ficaram pequenos em relação ao ringue — começamos com +10% (pedido do Thiago).
 * Aplicado no dispH de Player/Ally/Enemy.
 */
export const CHAR_SCALE = 1.1

// Bounds recalibrados p/ a arena dark v2 — mais tapete (espaço lados/cima/baixo).
// Calibrado sobre o tapete via overlay de debug (scripts/_ring-debug.mjs).
// ACOPLAMENTO IMPORTANTE: `wandScale()` em systems/movement.ts deriva a ELIPSE de
// colisão do wand desta MESMA perspectiva (RING.top/bottom). Expandir os bounds
// aumenta a elipse e empurra os inimigos p/ fora da faixa de ataque do wand — por
// isso a faixa de ataque (`|dy|` em enemyAi.stepApproach) foi alargada JUNTO (30→48)
// p/ o wand continuar tomando dano. Ver [[reference-ring-wand-coupling]].
export const RING = {
  top: 588,
  bottom: 1035,
  leftTop: 590,
  leftBottom: 380,
  rightTop: 1350,
  rightBottom: 1560,
  // Lateral limits interpolated by depth (y)
  leftAt:  (y: number) => lerp(590, 380,  clamp((y - 588) / 447, 0, 1)),
  rightAt: (y: number) => lerp(1350, 1560, clamp((y - 588) / 447, 0, 1)),
  // Compat: extreme limits for legacy code
  left: 380,
  right: 1560,
}
