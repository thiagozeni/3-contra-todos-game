-- C2/H4 (revisão adversarial Codex): submissão de score CO-OP autenticada por
-- assinatura HMAC do SERVIDOR Colyseus (autoritativo). O cliente repassa a assinatura;
-- esta RPC recomputa o HMAC e rejeita forja. O nome do time é cosmético (do cliente).
--
-- O segredo NÃO fica nesta migration (não vai pro git). É guardado numa tabela travada
-- por RLS (`app_config`), populada por um INSERT separado:
--   insert into public.app_config(key,value) values ('coop_score_secret','<mesmo COOP_SCORE_SECRET do servidor>')
--   on conflict (key) do update set value = excluded.value;
-- O MESMO valor vai no env `COOP_SCORE_SECRET` do servidor Colyseus.

-- Config travada: RLS on + sem policies → inacessível via PostgREST; só funções
-- security-definer (que rodam como owner) conseguem ler.
create table if not exists public.app_config (
  key text primary key,
  value text not null
);
alter table public.app_config enable row level security;

-- Nonces de uso único (anti-replay).
create table if not exists public.coop_score_nonces (
  nonce uuid primary key,
  used_at timestamptz not null default now()
);
alter table public.coop_score_nonces enable row level security;

create or replace function public.submit_coop_score_signed(
  p_team_name text, p_character text, p_time_ms int, p_score int, p_wave int,
  p_nonce uuid, p_sig text
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_clean_name text; v_secret text; v_expect text; v_ip text;
begin
  select value into v_secret from public.app_config where key = 'coop_score_secret';
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

-- HARDENING FINAL (só depois que o servidor+cliente novos dominarem as instalações):
--   revoke execute on function public.submit_coop_score(text,text,int,int,uuid) from anon, authenticated;
