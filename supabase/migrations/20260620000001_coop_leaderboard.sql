-- Co-op leaderboard: coluna `mode` na tabela scores + RPC dedicada submit_coop_score.
-- Aditivo e retrocompatível: registros e inserts existentes (submit_score, sem a
-- coluna mode na lista) recebem o DEFAULT 'solo'. Aplicado em produção via MCP em
-- 2026-06-20 (projeto hdoqkfoyqcdjicfbsftu); versionado aqui para reprodutibilidade.

-- 1) Coluna `mode` (default 'solo' → registros existentes ficam 'solo').
alter table public.scores add column if not exists mode text not null default 'solo';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'scores_mode_chk') then
    alter table public.scores add constraint scores_mode_chk check (mode in ('solo','coop'));
  end if;
end $$;

-- 2) RPC dedicada para score de CO-OP (time). Reusa o anti-cheat de sessão/tempo
--    (game_sessions): o HOST abre a sessão via start_game no início da partida e
--    submete aqui com o token (uso único). Sem continues; teto e plausibilidade
--    maiores (score de time soma 2-3 jogadores).
create or replace function public.submit_coop_score(
  p_team_name text, p_character text, p_time_ms int, p_score int, p_session_token uuid
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare v_id uuid; v_clean_name text; v_session public.game_sessions%rowtype; v_elapsed_ms bigint; v_ip text;
begin
  v_clean_name := trim(substring(regexp_replace(coalesce(p_team_name,''), '[[:cntrl:]]', '', 'g') from 1 for 20));
  if length(v_clean_name) = 0 then raise exception 'invalid_name'; end if;
  if p_character not in ('werdum','dida','thor') then raise exception 'invalid_character'; end if;
  if p_time_ms is null or p_time_ms < 60000 or p_time_ms > 3600000 then raise exception 'invalid_time'; end if;
  if p_score is null or p_score < 0 or p_score > 1999999 then raise exception 'invalid_score'; end if;
  if p_score > 450 * (p_time_ms / 1000) then raise exception 'implausible_score'; end if;
  if p_session_token is null then raise exception 'missing_session'; end if;
  select * into v_session from public.game_sessions where id = p_session_token for update;
  if not found then raise exception 'invalid_session'; end if;
  if v_session.used then raise exception 'session_already_used'; end if;
  v_elapsed_ms := floor(extract(epoch from (now() - v_session.started_at)) * 1000);
  if v_elapsed_ms < (p_time_ms - 10000) then raise exception 'time_mismatch'; end if;
  update public.game_sessions set used = true, used_at = now() where id = p_session_token;
  v_ip := public.client_ip();
  insert into public.scores (player_name, "character", continues, time_ms, score, session_id, submit_ip, mode)
  values (v_clean_name, p_character, 0, p_time_ms, p_score, p_session_token, v_ip, 'coop')
  returning id into v_id;
  return v_id;
end; $function$;

grant execute on function public.submit_coop_score(text,text,int,int,uuid) to anon, authenticated;
