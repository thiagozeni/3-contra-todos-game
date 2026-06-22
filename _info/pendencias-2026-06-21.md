# Pendências — handoff 2026-06-21 (game-v2)

Estado para retomar. Tudo commitado na branch **`v2`**; `/v2` no ar em
https://werdumfight.com/v2/ (bundle atual `index-CNBeP7fd.js`). `main` intacta.

---

## 🔴 Pendências que dependem de VOCÊ (ordenadas por prioridade)

### 1. C2/H4 — score co-op server-authenticated — ✅ DEPLOYADO (servidor permanente na nuvem)
Fechado. Implementado, banco aplicado/verificado, cliente no /v2 **e servidor permanente no ar**.
- **Feito:** servidor (assina+designa submitter+broadcast), cliente (token+fallback,
  submitter único = sem corrida), migration `20260621000002` **aplicada em prod**, segredo
  gravado no `app_config`, cripto **validada e2e** (válido insere / tamper=bad_signature /
  replay rejeitado). tsc 0 (cliente+servidor), 730+64 testes. O gate adversarial pegou 3 bugs
  no caminho — todos corrigidos.
- **Servidor permanente:** o Colyseus roda numa VM cloud free com `COOP_SCORE_SECRET` setado
  (C2/H4 ATIVO). Detalhes operacionais (host, túnel, chave) ficam FORA do repo — ver runbook
  privado e `docs/security/coop-score-server-auth.md`.
- Cliente que não enviar token assinado cai no **fallback** legado (nada quebra).
- **Depois** (me peça): hardening final — `revoke` da `submit_coop_score` antiga forjável,
  quando o build novo do app dominar a base instalada.

#### Infra do servidor co-op — migração concluída (detalhes sensíveis fora do repo)
- O servidor de produção do co-op roda num **host cloud permanente** (free tier), exposto por
  Cloudflare Tunnel para `coop.werdumfight.com`, gerenciado por pm2 (server + túnel), com
  `pm2 startup` (sobrevive reboot) e `COOP_SCORE_SECRET` no ambiente do processo.
- O antigo stopgap **no Mac foi aposentado** após o cutover (túnel + server parados localmente).
- **Provisionamento:** via `bootstrap.sh` idempotente (swap, Node 22, pm2, cloudflared,
  `npm install --omit=dev`, sobe server+túnel, smoke test). O bundle de deploy e o runbook com
  host/IP/ID-de-túnel/caminhos de credencial **não vivem no repo** (vazariam topologia) — ficam
  em local privado fora do versionamento.
- **Nota operacional:** ssh/scp partem da máquina do usuário (deny-list do agente proíbe ssh/scp);
  redeploys futuros = rebuild do `server/dist` → novo bundle → `scp` + `bash bootstrap.sh` na VM.

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
