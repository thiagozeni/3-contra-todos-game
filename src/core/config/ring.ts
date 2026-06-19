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

// NOTA (recalibração de bounds — PENDENTE de playtest): a arena dark nova tem mais
// tapete (cabe mais espaço lados/cima/baixo). Porém expandir o RING acopla com a
// ELIPSE de colisão do wand: `wandScale()` em systems/movement.ts deriva o tamanho do
// wand de (RING.top/bottom) pela mesma perspectiva. Aumentar os bounds aumenta a
// elipse do wand e empurra os inimigos ~3px p/ fora da faixa de ataque (|dy|<30 em
// enemyAi.stepApproach), fazendo o wand parar de tomar dano (quebra o game-over).
// Recalibrar exige afinar JUNTO: bounds + faixa de ataque do wand + escala da elipse —
// validar em playtest. Ferramenta de calibração visual: scripts/_ring-debug.mjs.
export const RING = {
  top: 650,
  bottom: 1000,
  leftTop: 670,
  leftBottom: 430,
  rightTop: 1260,
  rightBottom: 1530,
  // Lateral limits interpolated by depth (y)
  leftAt:  (y: number) => lerp(670, 430,  clamp((y - 650) / 350, 0, 1)),
  rightAt: (y: number) => lerp(1260, 1530, clamp((y - 650) / 350, 0, 1)),
  // Compat: extreme limits for legacy code
  left: 430,
  right: 1530,
}
