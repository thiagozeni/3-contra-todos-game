/** Nomes de exibição dos personagens (key interna → nome mostrado na UI).
 *  Fonte única dos nomes exibidos. (O boss 'coco-*' é OUTRO personagem, não o
 *  jogável 'thor'.) Phaser-free — pode ser usado por qualquer cena/HUD. */
export const CHAR_DISPLAY: Record<string, string> = {
  werdum: 'WERDUM',
  dida: 'DIDA',
  thor: 'THOR',
}

/** key → nome de exibição (fallback: a própria key em maiúsculas). */
export function charDisplay(key: string): string {
  return CHAR_DISPLAY[key] ?? key.toUpperCase()
}
