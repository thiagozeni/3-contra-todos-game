-- KEEP-ALIVE — escrita leve diária para o plano free não pausar o projeto.
--
-- Por quê: o projeto pausou em 30/09 e 09/10/2026 mesmo com o GitHub Action lendo
-- /rest/v1/scores a cada 3 dias (última leitura OK em 07/10). Leitura via REST não
-- bastou como "atividade"; agora o cron grava uma linha todo dia.
--
-- Superfície exposta ao anon: só a RPC keepalive(), que sobrescreve um timestamp
-- numa tabela de uma linha. A tabela fica com RLS ligado e sem policies (nada de
-- leitura/escrita direta). Chamar a RPC em excesso só atualiza a mesma linha.

create table if not exists public.heartbeat (
  id      int primary key default 1 check (id = 1),
  beat_at timestamptz not null default now()
);

alter table public.heartbeat enable row level security;
revoke all on public.heartbeat from anon, authenticated;

create or replace function public.keepalive()
returns timestamptz language sql security definer set search_path = public as $$
  insert into public.heartbeat (id, beat_at) values (1, now())
  on conflict (id) do update set beat_at = excluded.beat_at
  returning beat_at;
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon;
