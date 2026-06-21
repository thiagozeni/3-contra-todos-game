-- QUARENTENA do submit_score(5 args) legado — fecha a poluição do ranking SOLO.
--
-- Contexto (revisão adversarial Codex, 2026-06-21): o shim 20260608000002 mantém o
-- submit_score(5 args) sem token de sessão para os apps V1 (iOS 1.0.10 / Android 1.0.2).
-- Mesmo com as defesas (tempo >=150s, <=150 pts/s, rate limit 5/IP/min, cap 999999), um
-- script pode forjar um score *plausível* e, como o INSERT não definia `mode`, ele caía
-- como 'solo' e PoLUÍA o ranking ranqueado.
--
-- Correção: os scores vindos do caminho legado (sem token) entram como mode='legacy' —
-- o app V1 continua salvando sem erro, MAS esses scores NÃO aparecem no ranking (a UI lê
-- mode in ('solo') / ('coop')). Trade-off consciente: scores legítimos dos apps V1 deixam
-- de ranquear; em troca, o ranking SOLO deixa de ser forjável por esse caminho.
--
-- A assinatura de 6 args (com token de sessão anti-cheat) é a única que grava mode='solo'.
-- Quando os apps V1 sumirem das instalações, dropar a função de 5 args por completo.

create or replace function public.submit_score(
  p_player_name text, p_character text, p_continues int, p_time_ms int, p_score int
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_clean_name text; v_ip text; v_recent int;
begin
  v_clean_name := trim(substring(regexp_replace(coalesce(p_player_name,''), '[[:cntrl:]]', '', 'g') from 1 for 20));
  if length(v_clean_name) = 0 then raise exception 'invalid_name'; end if;
  if p_character not in ('werdum','dida','thor') then raise exception 'invalid_character'; end if;
  if p_continues is null or p_continues < 0 or p_continues > 99 then raise exception 'invalid_continues'; end if;
  if p_time_ms is null or p_time_ms < 150000 or p_time_ms > 3600000 then raise exception 'invalid_time'; end if;
  if p_score is null or p_score < 0 or p_score > 999999 then raise exception 'invalid_score'; end if;
  if p_score > 150 * (p_time_ms / 1000) then raise exception 'implausible_score'; end if;
  v_ip := public.client_ip();
  if v_ip is not null then
    select count(*) into v_recent from public.scores
    where submit_ip = v_ip and created_at > now() - interval '1 minute';
    if v_recent >= 5 then raise exception 'rate_limited'; end if;
  end if;
  -- mode='legacy': fora do ranking ranqueado (a UI só lê 'solo'/'coop').
  insert into public.scores (player_name, "character", continues, time_ms, score, submit_ip, mode)
  values (v_clean_name, p_character, p_continues, p_time_ms, p_score, v_ip, 'legacy')
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.submit_score(text, text, int, int, int) to anon, authenticated;
