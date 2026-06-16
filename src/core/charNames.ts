/** Nomes de exibição dos personagens (key interna → nome mostrado na UI).
 *  Fonte única para o rename: a chave 'thor' é exibida como "COCO" (conceito GPT v2).
 *  Phaser-free — pode ser usado por qualquer cena/HUD. */
export const CHAR_DISPLAY: Record<string, string> = {
  werdum: 'WERDUM',
  dida: 'DIDA',
  thor: 'COCO',
}

/** key → nome de exibição (fallback: a própria key em maiúsculas). */
export function charDisplay(key: string): string {
  return CHAR_DISPLAY[key] ?? key.toUpperCase()
}
