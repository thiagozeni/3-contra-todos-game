import { supabase } from './supabase'

export interface ScoreEntry {
  id?: string
  player_name: string
  character: string
  continues: number
  time_ms: number
  score: number
  created_at?: string
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

export async function getTopTen(): Promise<ScoreEntry[]> {
  const { data } = await supabase
    .from('scores')
    .select('*')
    .order('continues', { ascending: true })
    .order('time_ms',   { ascending: true })
    .order('score',     { ascending: false })
    .limit(10)
  return (data ?? []) as ScoreEntry[]
}
