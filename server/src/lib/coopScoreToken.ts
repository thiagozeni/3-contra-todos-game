import { createHmac, randomUUID } from 'node:crypto'

/**
 * Prova assinada pelo SERVIDOR de que um resultado de co-op (score/wave/tempo) é
 * autoritativo. Emitida no momento da vitória pelo ArenaRoom e verificada pela RPC
 * Supabase `submit_coop_score_signed`, que recomputa o MESMO HMAC com o segredo
 * compartilhado `COOP_SCORE_SECRET`. O cliente não consegue forjar score/wave/tempo
 * porque não consegue produzir uma assinatura válida (não tem o segredo).
 *
 * Resolve a revisão adversarial Codex C2 (score co-op forjável) e H4 (perda de score
 * na saída do host): o servidor é a fonte do score; o nome do time é cosmético (vem do
 * cliente). Sem mudar o ciclo de vida da sala — o token viaja no evento de vitória e o
 * cliente o usa mesmo após sair da sala.
 */

const SECRET = process.env.COOP_SCORE_SECRET ?? ''

export interface SignedCoopResult {
  score: number
  wave: number
  timeMs: number
  nonce: string
  sig: string
}

/** Mensagem canônica — DEVE bater exatamente com a ordem recomputada pela RPC do DB. */
function canonical(score: number, wave: number, timeMs: number, nonce: string): string {
  return `${score}|${wave}|${timeMs}|${nonce}`
}

/** True se o segredo está configurado (assinatura habilitada). */
export function coopSigningEnabled(): boolean {
  return SECRET.length > 0
}

/** Assina um resultado de co-op. Retorna os valores + nonce de uso único + assinatura. */
export function signCoopResult(score: number, wave: number, timeMs: number): SignedCoopResult {
  const s = Math.max(0, Math.floor(score))
  const w = Math.max(0, Math.floor(wave))
  const t = Math.max(0, Math.floor(timeMs))
  const nonce = randomUUID()
  const sig = createHmac('sha256', SECRET).update(canonical(s, w, t, nonce)).digest('hex')
  return { score: s, wave: w, timeMs: t, nonce, sig }
}
