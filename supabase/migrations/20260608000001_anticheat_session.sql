-- Anti-cheat: sessão de partida + validação de tempo no servidor + plausibilidade + auditoria + soft-delete
--
-- Contexto: antes desta migration, submit_score validava apenas RANGES de valores.
-- O score é calculado 100% no cliente. Qualquer pessoa com a publishable key (pública
-- por design, embarcada no bundle) podia fazer POST /rest/v1/rpc/submit_score com um
-- payload forjado dentro dos ranges (ex.: 0 continues, 60000 ms, 999999 pts) e assumir
-- o 1º lugar SEM JOGAR. PoC confirmado em 2026-06-08 (HTTP 200, foi para o topo).
--
-- Esta migration eleva a barra de "abrir o console" para "ter uma sessão válida E
-- esperar o tempo real da partida E ficar dentro do envelope de pontuação plausível":
--   1. start_game() emite um token de sessão com started_at gravado NO SERVIDOR (rate-limited por IP)
--   2. submit_score passa a exigir esse token e a validar que o tempo REAL decorrido no
--      servidor (now() - started_at) >= tempo declarado  ->  mata a submissão instantânea
--   3. envelope de plausibilidade: score <= 150 pts/seg (max real observado = 95.8; p99 = 76)
--   4. floor de tempo 150s (menor partida legítima observada = 167s; era 60s)
--   5. token de uso único (anti-replay) + auditoria (ip, session_id) + soft-delete

-- ========== 1. Tabela de sessões de partida ==========
create table if not exists public.game_sessions (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  used        boolean     not null default false,
  used_at     timestamptz,
  "character" text,
  ip          text
);

alter table public.game_sessions enable row level security;
-- Sem políticas = sem acesso direto via anon/authenticated. Só via RPCs SECURITY DEFINER.
revoke all on public.game_sessions from anon, authenticated;

-- Índice para o rate limit por IP
create index if not exists idx_game_sessions_ip_started on public.game_sessions (ip, started_at desc);

-- ========== 2. Colunas de auditoria e soft-delete em scores ==========
alter table public.scores add column if not exists session_id uuid references public.game_sessions(id);
alter table public.scores add column if not exists submit_ip  text;
alter table public.scores add column if not exists deleted_at timestamptz;

create index if not exists idx_scores_deleted_at on public.scores (deleted_at);

-- ========== 3. Política de leitura: oculta linhas soft-deleted (server-side, sem mudar o cliente) ==========
drop policy if exists "scores_public_read" on public.scores;
create policy "scores_public_read"
  on public.scores
  for select
  to anon, authenticated
  using (deleted_at is null);

-- ========== 4. Helper: extrai o IP do cliente dos headers da request (PostgREST) ==========
create or replace function public.client_ip()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_headers json;
  v_xff     text;
begin
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    return null;
  end;
  if v_headers is null then return null; end if;
  v_xff := coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip');
  if v_xff is null then return null; end if;
  -- x-forwarded-for pode ser "ip1, ip2, ..."; pega o primeiro e faz trim
  return trim(split_part(v_xff, ',', 1));
end;
$$;

-- ========== 5. start_game: emite token de sessão (rate-limited por IP) ==========
create or replace function public.start_game(p_character text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip     text;
  v_recent int;
  v_char   text;
  v_id     uuid;
begin
  v_ip := public.client_ip();

  -- Rate limit: máx. 10 sessões por IP por minuto (defensivo; ignora se IP desconhecido)
  if v_ip is not null then
    select count(*) into v_recent
    from public.game_sessions
    where ip = v_ip and started_at > now() - interval '1 minute';
    if v_recent >= 10 then
      raise exception 'rate_limited';
    end if;
  end if;

  -- Personagem: whitelist (null se inválido — campo é só informativo/auditoria)
  if p_character in ('werdum','dida','thor') then
    v_char := p_character;
  else
    v_char := null;
  end if;

  insert into public.game_sessions ("character", ip)
  values (v_char, v_ip)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.start_game(text) to anon, authenticated;

-- ========== 6. submit_score v2: exige token + valida tempo real no servidor + plausibilidade ==========
-- Constantes:
--   MIN_TIME_MS     = 150000  (floor; era 60000)
--   MAX_TIME_MS     = 3600000 (1h)
--   MAX_PTS_PER_SEC = 150     (envelope de plausibilidade)
--   TIME_GRACE_MS   = 10000   (folga a favor do jogador na validação de tempo)
create or replace function public.submit_score(
  p_player_name   text,
  p_character     text,
  p_continues     int,
  p_time_ms       int,
  p_score         int,
  p_session_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id         uuid;
  v_clean_name text;
  v_session    public.game_sessions%rowtype;
  v_elapsed_ms bigint;
  v_ip         text;
begin
  -- Nome: remove control chars, trim, limita a 20
  v_clean_name := substring(regexp_replace(coalesce(p_player_name,''), '[[:cntrl:]]', '', 'g') from 1 for 20);
  v_clean_name := trim(v_clean_name);
  if length(v_clean_name) = 0 then raise exception 'invalid_name'; end if;

  -- Personagem: whitelist
  if p_character not in ('werdum','dida','thor') then raise exception 'invalid_character'; end if;

  -- Continues: 0..99
  if p_continues is null or p_continues < 0 or p_continues > 99 then raise exception 'invalid_continues'; end if;

  -- Tempo: floor 150s, teto 1h
  if p_time_ms is null or p_time_ms < 150000 or p_time_ms > 3600000 then raise exception 'invalid_time'; end if;

  -- Score: range + envelope de plausibilidade (pts/seg)
  if p_score is null or p_score < 0 or p_score > 999999 then raise exception 'invalid_score'; end if;
  if p_score > 150 * (p_time_ms / 1000) then raise exception 'implausible_score'; end if;

  -- Token de sessão: obrigatório, existente, não usado
  if p_session_token is null then raise exception 'missing_session'; end if;
  select * into v_session from public.game_sessions where id = p_session_token for update;
  if not found then raise exception 'invalid_session'; end if;
  if v_session.used then raise exception 'session_already_used'; end if;

  -- Tempo REAL decorrido no servidor >= tempo declarado (com folga). Mata a submissão instantânea.
  v_elapsed_ms := floor(extract(epoch from (now() - v_session.started_at)) * 1000);
  if v_elapsed_ms < (p_time_ms - 10000) then raise exception 'time_mismatch'; end if;

  -- Consome a sessão (uso único / anti-replay)
  update public.game_sessions set used = true, used_at = now() where id = p_session_token;

  v_ip := public.client_ip();

  insert into public.scores (player_name, "character", continues, time_ms, score, session_id, submit_ip)
  values (v_clean_name, p_character, p_continues, p_time_ms, p_score, p_session_token, v_ip)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_score(text, text, int, int, int, uuid) to anon, authenticated;

-- ========== 7. Remove a função antiga (assinatura sem token) — FECHA A BRECHA ==========
drop function if exists public.submit_score(text, text, int, int, int);

-- ========== 8. Menor privilégio: revoga grants residuais em scores ==========
revoke truncate, references, trigger on public.scores from anon, authenticated;
