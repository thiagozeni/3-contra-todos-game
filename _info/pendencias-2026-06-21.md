# Pendências — handoff 2026-06-21 (game-v2)

Estado para retomar. Tudo commitado na branch **`v2`**; `/v2` no ar em
https://werdumfight.com/v2/ (bundle atual `index-CNBeP7fd.js`). `main` intacta.

---

## 🔴 Pendências que dependem de VOCÊ (ordenadas por prioridade)

### 1. Deploy do pacote C2/H4 — score co-op server-authenticated (CRÍTICO+ALTO)
Fecha a forja de score co-op (C2) e a perda de score na saída do host (H4). **Tudo escrito,
nada aplicado/deployado** (precisa de segredo + redeploy do servidor + teste e2e).
- **Runbook completo:** `docs/security/coop-score-server-auth.md`
- Artefatos prontos: `server/src/lib/coopScoreToken.ts`, migration
  `supabase/migrations/20260621000002_coop_score_signed.sql` (NÃO aplicada).
- Passos: gerar `COOP_SCORE_SECRET` → configurar no banco (`alter database ... set
  app.coop_score_secret`) + aplicar a migration → setar o env no Colyseus + implementar os
  diffs do ArenaRoom/NetClient/YouWinScene → redeploy do servidor → testar 1 partida co-op →
  hardening final (`revoke` da `submit_coop_score` antiga).
- O cliente tem **fallback**, então o co-op não quebra durante o rollout.
- Me chama que eu te acompanho passo a passo quando o servidor estiver rodável.

### 2. Publicar fichas + screenshots nas lojas (vendas EN/ES)
- Copy pronta: `_info/store-listings-en-es.md` (App Store + Play, EN+ES).
- Screenshots localizados gerados: `scripts/_shots/store/` (gameplay/title/howtoplay/select/
  lobby em EN e ES, 3840×2160). **Prontos pra Google Play.**
- **Decisão sua:** título do Google Play (único) — manter `3 Contra Todos` ou `Werdum Fight`.
- **Falta (eu posso fazer):** enquadrar os screenshots nos tamanhos exatos do App Store
  (6.9"/6.5"/iPad). É só pedir.

### 3. H3 — entitlement premium spoofable (ALTO, adiar)
Fix real = verificação de **receipt** (App Store/Play) server-side. O código já marca como
risco aceito de beta. Fazer quando sair do beta. Eu implemento quando decidir.

---

## 🟡 Findings MEDIUM/LOW da revisão Codex ainda abertos (opcionais, eu posso atacar)
- **#8** `ProtectedChar` — objetos/timer auxiliares sem `destroy()` próprio (vazamento só se
  recriado mid-match; baixo risco). NÃO mexi por ser entidade sensível do wand sem você.
- **#9** room code de 4 letras sem rate-limit → enumeração/grief (servidor).
- **#10** alocações por frame no render co-op (perf mobile; hot path, quero testar co-op).
- **#11** boot carrega quase todos os assets + bundle ~2.2MB → code-split/lazy-load.
- **#13** `innerHTML` no boot/ad overlay (seguro hoje; trocar por textContent).
- **#14** `vite.config.ts` `allowedHosts: true` (só dev).

---

## ✅ O que ficou pronto e no ar nesta sessão (contexto)
- **i18n completo EN/ES** + pt-BR default + seletor de idioma (3 botões [EN][ES][PT] no Options).
- **Ajustes de UI da intro:** botões pretos @0.88, ícones +4px (CO-OP sobe 4px), hover do
  JOGAR sem retângulo.
- **Gameplay:** wand +7% (sprite+elipse em sync); pause icon -4px.
- **Telas de fim co-op** no mesmo padrão do single (game over + vitória, painel SCORE/TEMPO/WAVE).
- **Segurança (Codex):** C1 RPC legado **aplicado em produção** (quarentena `mode='legacy'`);
  H5 vazamento de listeners **no /v2**; #12 notificações 1×/sessão.

Commits-chave: i18n `ef1b401` · fichas `2a915bd` · wand `40fbd5b`/`53283e4` · intro
`7b61a52`/`41e3330`/`41ab0d9`/`0a364f7` · co-op screens `dfcf816` · segurança `0883409`
(H5+C1) · pacote C2/H4 `bb7252b` · #12 `10137c6`.
