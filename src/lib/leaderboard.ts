import { supabase } from './supabase'

export type LeaderboardMode = 'solo' | 'coop'

export interface ScoreEntry {
  id?: string
  player_name: string
  character: string
  continues: number
  time_ms: number
  score: number
  created_at?: string
  mode?: LeaderboardMode
}

/**
 * Inicia uma sessão de partida no servidor e retorna o token (uuid).
 * O token é exigido por saveScore e amarra a submissão a uma partida real:
 * o servidor grava o started_at e, no submit, valida que o tempo decorrido
 * de verdade >= o tempo declarado. Retorna null em caso de falha de rede
 * (offline / rate limit) — nesse caso o score simplesmente não poderá ser salvo.
 */
export async function startGame(character: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('start_game', { p_character: character })
  if (error) {
    console.error('[Leaderboard] start_game falhou:', error.message)
    return null
  }
  return (data as string) ?? null
}

export async function saveScore(entry: ScoreEntry, sessionToken: string): Promise<void> {
  const { error } = await supabase.rpc('submit_score', {
    p_player_name:   entry.player_name,
    p_character:     entry.character,
    p_continues:     entry.continues,
    p_time_ms:       entry.time_ms,
    p_score:         entry.score,
    p_session_token: sessionToken,
  })
  if (error) throw new Error(error.message)
}

/**
 * Submete a pontuação de uma partida CO-OP (uma entrada por partida, nome de
 * TIME). O score é o do time (autoritativo do servidor Colyseus). Reusa o
 * anti-cheat de sessão/tempo: o HOST abre a sessão (startGame) no início da
 * partida e submete aqui com o token (uso único). Sem continues.
 */
export async function saveCoopScore(
  entry: { team_name: string; character: string; time_ms: number; score: number },
  sessionToken: string,
): Promise<void> {
  const { error } = await supabase.rpc('submit_coop_score', {
    p_team_name:     entry.team_name,
    p_character:     entry.character,
    p_time_ms:       entry.time_ms,
    p_score:         entry.score,
    p_session_token: sessionToken,
  })
  if (error) throw new Error(error.message)
}

/**
 * Top 10 do leaderboard, por modo. SOLO ordena por menos-continues → menor-tempo
 * → maior-score (ranking de quem zerou "limpo"); CO-OP ordena por maior-score do
 * time → menor-tempo (continues não se aplica).
 */
export async function getTopTen(mode: LeaderboardMode = 'solo'): Promise<ScoreEntry[]> {
  let q = supabase.from('scores').select('*').eq('mode', mode)
  q = mode === 'coop'
    ? q.order('score', { ascending: false }).order('time_ms', { ascending: true })
    : q.order('continues', { ascending: true }).order('time_ms', { ascending: true }).order('score', { ascending: false })
  const { data } = await q.limit(10)
  return (data ?? []) as ScoreEntry[]
}
