-- SHIM TEMPORÁRIO — restaura submit_score(5 args) para os apps NATIVOS LEGADOS.
--
-- Por quê: a migration 20260608000001 dropou a submit_score(5 args). A web foi
-- redeployada com o cliente novo (6 args + token), mas os apps iOS 1.0.10 e
-- Android 1.0.2 já publicados embarcam o bundle antigo, que chama 5 args — e
-- pararam de salvar score. Este shim os mantém funcionando até as versões novas
-- (com token de sessão) dominarem as lojas.
--
-- Defesas aplicadas mesmo no shim: floor de tempo 150s, plausibilidade <=150 pts/s,
-- range de score/continues, rate limit 5/IP/min. NÃO valida tempo de sessão (apps
-- legados não enviam token) -> brecha PARCIAL aceita conscientemente: dá para forjar
-- um score *plausível*, mas não mais 999999 instantâneo.
--
-- >>> REMOVER quando os apps novos (1.0.11 / 1.0.3) dominarem as instalações:
--        drop function public.submit_score(text, text, int, int, int);
--     A web e os apps novos usam a assinatura de 6 args (com token), que permanece.

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
  insert into public.scores (player_name, "character", continues, time_ms, score, submit_ip)
  values (v_clean_name, p_character, p_continues, p_time_ms, p_score, v_ip)
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.submit_score(text, text, int, int, int) to anon, authenticated;
