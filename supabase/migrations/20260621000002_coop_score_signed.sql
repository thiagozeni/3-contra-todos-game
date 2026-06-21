-- C2/H4 (revisão adversarial Codex): submissão de score CO-OP autenticada por
-- assinatura do SERVIDOR. NÃO APLICAR ainda — depende de:
--   1. o segredo `app.coop_score_secret` estar configurado no banco (= COOP_SCORE_SECRET
--      do servidor Colyseus), e
--   2. o servidor já emitir o token assinado (ver server/src/lib/coopScoreToken.ts +
--      docs/security/coop-score-server-auth.md).
-- Aplicar ANTES disso não quebra nada (a RPC nova é aditiva), mas só passa a ser usada
-- quando o servidor e o cliente novos estiverem no ar.
--
-- Diferença para a submit_coop_score atual (20260620000001): aquela confia num token de
-- SESSÃO público (forjável: start_game → espera → submete score plausível). Esta exige a
-- ASSINATURA HMAC do servidor sobre os valores autoritativos — o cliente não pode forjar
-- score/wave/tempo. O nome do time continua vindo do cliente (cosmético).

-- Tabela de nonces de uso único (anti-replay).
create table if not exists public.coop_score_nonces (
  nonce uuid primary key,
  used_at timestamptz not null default now()
);
alter table public.coop_score_nonces enable row level security;
-- Sem policies → nenhum acesso direto via PostgREST; só a RPC (security definer) escreve.

create or replace function public.submit_coop_score_signed(
  p_team_name text, p_character text, p_time_ms int, p_score int, p_wave int,
  p_nonce uuid, p_sig text
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_clean_name text; v_secret text; v_expect text; v_ip text;
begin
  -- Segredo compartilhado com o servidor Colyseus. Configurar uma vez (NÃO commitar):
  --   alter database postgres set app.coop_score_secret = '<mesmo valor de COOP_SCORE_SECRET>';
  v_secret := current_setting('app.coop_score_secret', true);
  if v_secret is null or length(v_secret) = 0 then raise exception 'signing_not_configured'; end if;

  -- Recomputa o HMAC na MESMA ordem do servidor: score|wave|time_ms|nonce
  v_expect := encode(
    extensions.hmac(p_score::text || '|' || p_wave::text || '|' || p_time_ms::text || '|' || p_nonce::text, v_secret, 'sha256'),
    'hex');
  if p_sig is distinct from v_expect then raise exception 'bad_signature'; end if;

  -- Defesa em profundidade (ranges).
  if p_character not in ('werdum','dida','thor') then raise exception 'invalid_character'; end if;
  if p_time_ms is null or p_time_ms < 0 or p_time_ms > 3600000 then raise exception 'invalid_time'; end if;
  if p_score is null or p_score < 0 or p_score > 9999999 then raise exception 'invalid_score'; end if;

  -- Nonce de uso único — replay falha no unique violation.
  insert into public.coop_score_nonces(nonce) values (p_nonce);

  v_clean_name := trim(substring(regexp_replace(coalesce(p_team_name,''), '[[:cntrl:]]', '', 'g') from 1 for 20));
  if length(v_clean_name) = 0 then v_clean_name := 'TIME'; end if;
  v_ip := public.client_ip();

  insert into public.scores (player_name, "character", continues, time_ms, score, submit_ip, mode)
  values (v_clean_name, p_character, 0, p_time_ms, p_score, v_ip, 'coop')
  returning id into v_id;
  return v_id;
end; $$;

grant execute on function public.submit_coop_score_signed(text,text,int,int,int,uuid,text) to anon, authenticated;

-- HARDENING FINAL (rodar SÓ depois que o servidor+cliente novos dominarem as instalações):
--   revoke execute on function public.submit_coop_score(text,text,int,int,uuid) from anon, authenticated;
-- Isso fecha o caminho forjável antigo (token de sessão sem prova de sala).
