# Co-op score server-authenticated (C2 + H4) — status & passo final

Fecha **C2** (score co-op forjável) e **H4** (perda de score na saída do host) da revisão
adversarial Codex. O servidor Colyseus (autoritativo) **assina** `score|wave|tempo` com HMAC
na vitória; o cliente repassa a assinatura ao Supabase, que recomputa e **rejeita forja**.
O nome do time é cosmético (do cliente). Não muda o ciclo de vida da sala.

## ✅ Já feito e verificado (por mim)
- **Servidor** (`server/src/rooms/ArenaRoom.ts` + `server/src/lib/coopScoreToken.ts`):
  assina e dá `broadcast('coopResult', token)` na transição para vitória. tsc 0, 64 testes verdes.
- **Cliente** (`NetClient` capta o token e zera por-sala; `GameScene.netVictory` guarda em
  `registry.coopResult`; `YouWinScene` usa o caminho assinado com **fallback**; `leaderboard.ts`
  ganha `saveCoopScoreSigned`). tsc 0. **H4 resolvido:** o guest também submete (best-effort,
  com atraso; nonce dedupe) — se o host sai, o score não se perde.
- **Banco (produção, ref `hdoqkfoyqcdjicfbsftu`):** migration `20260621000002` aplicada
  (RPC `submit_coop_score_signed` + tabela `coop_score_nonces` anti-replay + tabela travada
  `app_config`). Segredo gravado em `app_config`. **Cripto validada ponta a ponta:** sig
  válida insere, score adulterado → `bad_signature`, replay do nonce → rejeitado.
- **Quality-gate adversarial** pegou 2 bugs no meio do caminho (token estável entre partidas
  + guest não submetia) — ambos corrigidos antes de seguir.
- Segredo em `.secrets/coop-score-secret.txt` (gitignored). O MESMO valor vai no servidor.

## 🔴 ÚNICO passo que falta (precisa de você — infra do servidor)
O servidor Colyseus em `coop.werdumfight.com` é hospedado fora do repo (sem config de deploy
aqui), então **não consigo deployar daqui**. Faça:

1. No host do servidor, setar a variável de ambiente:
   `COOP_SCORE_SECRET=<valor de .secrets/coop-score-secret.txt>`  (o MESMO que está no `app_config`).
2. **Redeployar o servidor** (o código novo do ArenaRoom já está commitado na branch `v2`).
3. Testar 1 partida co-op até a vitória → confirmar uma entrada `mode='coop'` nova no
   leaderboard (deve vir pelo caminho assinado, sem erro).

Enquanto o servidor não for redeployado: o cliente novo (no /v2) **não recebe token**, cai no
**fallback** (`saveCoopScore` legado) e o co-op continua salvando normalmente — nada quebra.

## 🔒 Hardening final (rodar só depois que o servidor novo dominar as instalações)
Fecha o caminho legado forjável:
```sql
revoke execute on function public.submit_coop_score(text,text,int,int,uuid) from anon, authenticated;
```
(Me peça que eu rodo via Supabase quando você confirmar que o servidor novo está no ar e estável.)
