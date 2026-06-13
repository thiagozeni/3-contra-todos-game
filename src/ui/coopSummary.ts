/**
 * Co-op defeat summary — FB12
 *
 * Pure builder for the text shown on the co-op "GAME OVER" overlay. The match
 * ends (server status 'gameover') when no human is left standing and the wand
 * has fallen; this surfaces that as a clear, shared end screen before returning
 * to the title — instead of an abrupt fade to black.
 *
 * Kept Phaser-free so the wording is unit-testable.
 */

export interface CoopDefeatSummary {
  /** Big arcade headline — matches the single-player wording. */
  title: string
  /** Co-op context line: the team wiped. */
  subtitle: string
  /** "WAVE <reached>/<total>". */
  waveLine: string
  /** "<score> PTS". */
  scoreLine: string
}

/** Floor + clamp to a non-negative integer (defensive against interpolated/NaN inputs). */
function intClamp(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

export function coopDefeatSummary(
  score: number,
  wave: number,
  totalWaves: number,
): CoopDefeatSummary {
  return {
    title: 'GAME OVER',
    subtitle: 'TODOS CAÍRAM',
    waveLine: `WAVE ${intClamp(wave)}/${intClamp(totalWaves)}`,
    scoreLine: `${intClamp(score)} PTS`,
  }
}
