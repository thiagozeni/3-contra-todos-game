# Fatia 4 — Lançamento duplo: app grátis com ads + gate de host premium — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a **engenharia** do lançamento duplo descrito na spec §2 ("anfitrião premium"): um mesmo código vira **dois apps** — (a) o **premium** (listing atual, pago, zero ads, cria salas livremente) e (b) o **grátis NOVO** (com ads, entra em salas de graça, **não cria** salas — gate de host). Concretamente:

1. **Mecanismo de identidade/flavor** — uma flag de build `FREE_BUILD` que troca `appId`/`appName`/ícones (placeholder) e liga as code-paths de ads, **sem tocar na config nativa do app premium** (que está em revisão de loja).
2. **Serviço de ads atrás de interface** (`AdService`) — test IDs da Google em todo lugar, init + ATT, rewarded + interstitial; **implementação no-op** para builds premium/web. A lógica de gating é TDD pura.
3. **Rewarded-to-continue** no `GameOverContinueScene` (só no build grátis) + **interstitial entre partidas** com frequency-cap (lógica pura, testada).
4. **Gate de host premium no servidor** — `EntitlementVerifier` (interface) + claim nas create-options + UX no `LobbyScene` para usuários grátis ("Hostear é do app premium" + CTA; **entrar continua livre**) + env flag mantendo o beta web aberto.
5. **E2E:** build grátis-web mostra o gate + ads no-op na web; co-op join continua funcionando; smoke do app grátis iOS em simulador com test ads se viável (atenção ao prompt ATT).
6. **Encerramento:** suítes, spec, push, e um **CHECKLIST DO USUÁRIO** (criar listings, conta AdMob + IDs reais, assets de loja da Fatia V, receipts para entitlement real).

**Escopo explícito do que esta fatia NÃO faz (restrições do usuário — CRÍTICO):**
- ❌ **Nenhuma submissão de loja, nenhum bump de versão, nenhuma mudança em assinatura.** As builds V1 (iOS 1.0.11/15 e Android 1.0.3/4) estão **em revisão Apple/Google** — o app premium e sua config nativa (`appId: com.werdumfight.app`, schemes, keystore, versionamento) **permanecem intocados**. TODO o trabalho desta fatia é **engenharia de nova variante** + lógica de servidor/cliente nova, verificável em dev/simulador. Nenhuma listagem é criada pelo agente.
- ❌ **Nenhuma conta AdMob real, nenhum ad unit ID de produção.** O código usa **exclusivamente os test IDs oficiais da Google** (citados na pesquisa). Trocar pelos IDs reais é um passo manual do usuário (precisa da conta AdMob dele = fronteira de autonomia).
- ❌ **Nenhuma validação de receipt de loja (App Store Server API / Play Developer API).** Exige credenciais/chaves de loja do usuário (não autônomo). O gate de host usa **claim de build-time** agora (spoofável, aceitável para beta pré-lançamento — risco documentado), com a interface `EntitlementVerifier` estruturada para o receipt-validation plugar depois.
- ❌ **Nenhum deep-link nativo** (deferido da Fatia 3 — ver Questões abertas #1; ainda exige Portal/keystore do usuário).
- ❌ **Experimento "host via rewarded ad"** (spec §2, célula "avaliar depois") fica **deferido** — ver Questões abertas.

**Princípio de altitude:** o **servidor Colyseus** continua a fonte de verdade do gate de host (cliente nunca decide sozinho se pode criar). Ads são **100% cliente** e **100% nativo** (no-op na web e no build premium). O single-player offline **nunca quebra**; nenhum code-path de ads roda durante o gameplay nem dentro de salas co-op em partida.

---

## Estado verificado do código (auditado 2026-06-11, worktree `game-v2`)

- **`capacitor.config.ts`** — estático: `appId: 'com.werdumfight.app'`, `appName: '3 Contra Todos'`, `webDir: 'dist/demo'`. É **TS** (`CapacitorConfig`), então pode ler `process.env` em build-time. Hoje **não** lê env.
- **`package.json`** — `version: 0.1.0`; já existe `build:mobile-coop` (`VITE_NET_ENABLED=true VITE_SERVER_URL=wss://coop.werdumfight.com vite build`) e `build:beta`. `@capacitor/app@^8`, `@capacitor/share@^8`, `@capacitor/core@^8.3` instalados. **`@capacitor-community/admob` NÃO está instalado** (a instalar na Task 2). Workspace inclui `server/`.
- **`src/net/flags.ts`** — `NET_ENABLED` de `VITE_NET_ENABLED==='true'` (default false); `SERVER_URL` de `VITE_SERVER_URL` (default `ws://localhost:2567`). **Padrão a reusar** para `FREE_BUILD`/`ADS_ENABLED`.
- **`src/net/NetClient.ts`** — `createRoom(charKey)` chama `this.sdk.create<any>('arena', { charKey })`; `joinByCode(rawCode, charKey)` chama `sdk.joinById(code, { charKey })`. Ambos resolvem `null` (nunca throw) em erro/timeout; `classifyNetError` → `lastError` PT-BR. **É aqui que o claim de host entra nas create-options.**
- **`server/src/app.config.ts`** — `matchMaker.controller.exposedMethods = ['create', 'joinById', 'reconnect']`. Comentário já registra que "o gate de host premium fica para a Fatia 4". **`create` continua exposto** — o gate vai dentro do `onCreate`/factory do room, não removendo `create` (senão o beta web e o app premium não criariam).
- **`server/src/rooms/ArenaRoom.ts`** — `onCreate(_options: unknown)` gera o roomCode e seta state; `onJoin(client, options: { charKey? })` aloca char. **`onCreate` recebe as create-options** (hoje ignoradas) — é o ponto de verificação do entitlement.
- **`src/scenes/GameOverContinueScene.ts`** — fluxo CONTINUE? YES/NO. `confirmSelection()` no YES incrementa `continueCount` (registry), seta `continueFromWave` e `scene.start('GameScene')`. **É aqui que o rewarded-to-continue do app grátis substitui o continue livre.**
- **`src/scenes/LobbyScene.ts`** (594 linhas) — `buildMenuUI` tem `CRIAR SALA` → `doCreateRoom()` e `ENTRAR COM CÓDIGO` → `showJoinUI()`. `doCreateRoom()` chama `netClient.createRoom(charKey)`. **É aqui que o gate de host surfa na UI grátis** (CRIAR SALA desabilitado/upsell; ENTRAR intocado).
- **`src/main.ts`** — registra cenas (`GameOverContinueScene`, `LobbyScene`, etc.). Boot via `BootScene`.
- `android/` e `ios/` projetos Capacitor existem (do app premium). `xcrun` disponível; `adb`/`emulator` **NÃO** no PATH (Fatia 3, Task 4 — localizar SDK no script).
- `scripts/e2e-*.mjs` — harness Playwright existente (`window.__game`/`__coopTest`/`__netDebug`). **Reusar.**

## Pesquisa verificada (2026-06-11)

### 1. AdMob em Capacitor 8 — `@capacitor-community/admob`
- **Plugin mantido:** `@capacitor-community/admob`, **versão 8.0.0** (peer `@capacitor/core@^8.0.0` — casa com o Capacitor 8.3 do projeto). É o plugin community oficial referenciado pela própria doc da Capacitor (capacitorjs.com/docs/guides/ads). (Alternativa `admob-plus` existe, mas o community é o canônico para Capacitor.)
- **API (do README do repo):**
  - Init: `await AdMob.initialize(options?)`.
  - **ATT iOS (>14):** `await AdMob.requestTrackingAuthorization()` + `AdMob.trackingAuthorizationStatus()` — **deve** ser chamado antes de pedir ads no iOS; o prompt ATT aparece (atenção no simulador).
  - **Interstitial:** `await AdMob.prepareInterstitial(options: AdOptions)` → `await AdMob.showInterstitial()`. Eventos `InterstitialAdPluginEvents.Loaded/FailedToLoad/Dismissed/...`.
  - **Rewarded:** `await AdMob.prepareRewardVideoAd(options: RewardAdOptions)` → `const reward = await AdMob.showRewardVideoAd()` (resolve `AdMobRewardItem {type, amount}`); evento-chave **`RewardAdPluginEvents.Rewarded`** dispara quando o usuário ganhou a recompensa (e `Dismissed` quando fecha sem ganhar). **A recompensa só vale se `Rewarded` disparou** — não basta o show resolver.
  - `AdOptions` aceita `{ adId, isTesting }` — `isTesting: true` força ads de teste.
- **Setup nativo (manual, no projeto da VARIANTE grátis — nunca no premium em revisão):**
  - Android: `<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="<APP_ID_DE_TESTE>"/>` no `AndroidManifest`.
  - iOS `Info.plist`: `GADApplicationIdentifier` (= app ID de teste), `SKAdNetworkItems` (lista SKAdNetwork da Google), `NSUserTrackingUsageDescription` (texto do prompt ATT).
- **Comportamento na WEB (verificado no `src/web.ts` do plugin):** **no-op benigno** — `initialize`/`prepareInterstitial`/`showInterstitial` só logam; `prepareRewardVideoAd` loga; **`showRewardVideoAd` resolve `{type:'', amount:0}`** (recompensa vazia) e **nunca throw**. **Implicação para o design:** na web, o rewarded "concede" `amount:0` — se o continue dependesse do retorno do plugin, ele **não funcionaria** no beta web. Por isso o `AdService` tem uma **implementação no-op própria** (web/premium) que resolve `granted: true` instantaneamente (sem chamar o plugin), preservando o fluxo de continue no beta. Ver Task 2.

### 2. Identidade dual em Capacitor — mecanismo escolhido
- `capacitor.config.ts` é TS e pode trocar `appId`/`appName` lendo `process.env` em build-time. **MAS** (doc oficial "Environment Specific Configurations"): mudar `appId` no config **sozinho NÃO** reescreve o bundle id nativo de forma limpa para instalar lado-a-lado — o caminho "industrial" para duas lojas exige **Android product flavors** (`applicationIdSuffix`) + **iOS schemes/targets** com Bundle Identifiers distintos, configurados nativamente. `config.ios.scheme`/`config.android.flavor` apenas **apontam** para variantes nativas pré-existentes; não as criam.
- **CONFLITO com a restrição:** criar flavors/targets nativos **mexeria** nos projetos `android/`/`ios/` do app premium **que está em revisão** — proibido nesta fatia.
- **DECISÃO (mecanismo mais simples que não perturba o premium):** **dynamic `capacitor.config.ts` lendo `FREE_BUILD=1`** para trocar `appId` → `com.werdumfight.free`, `appName` → ver Questões abertas, e (placeholder) ícone. O fluxo grátis **regenera os projetos nativos numa árvore descartável** (ex.: `npx cap add` num diretório temporário ou `CAPACITOR_*`), **sem commitar** mudança nos `android/`/`ios/` versionados do premium. O premium continua buildando exatamente como hoje (sem env → config atual, byte-a-byte). A configuração **nativa definitiva** do app grátis (flavors/targets, ícones finais, Info.plist com ADMOB) é um **passo do usuário no lançamento** (Checklist), porque toca assinatura/loja. Esta fatia entrega o app grátis **rodável em simulador** via a config dinâmica + setup nativo aplicado **à árvore descartável**.
- `npx cap sync` com config dinâmica: copia web assets + plugins e aplica o `appId`/scheme/flavor **resolvidos naquele momento** ao projeto nativo alvo. Como rodamos o sync da variante grátis contra a árvore descartável, o projeto premium versionado não é tocado.

### 3. Gate de host premium server-side — opções de entitlement
- **(a) Claim de build-time (ESCOLHIDO AGORA):** o cliente envia `entitlement: 'premium' | 'free'` (derivado de `FREE_BUILD`) nas create-options; o servidor verifica via `EntitlementVerifier`. **Spoofável** (um cliente modificado manda `premium`) — **aceitável para beta pré-lançamento** e documentado como risco. Fecha o caso honesto (app grátis oficial não cria).
- **(b) Validação de receipt (FUTURO, plugável):** App Store Server API / Google Play Developer API validam uma compra real server-side. **Exige chaves/credenciais de loja do usuário = NÃO autônomo.** A interface `EntitlementVerifier` é desenhada para uma impl `ReceiptEntitlementVerifier` plugar aqui depois, sem mexer no `ArenaRoom`.
- **(c) Host-via-rewarded-ad token:** deferido (Questões abertas).
- **Beta web aberto:** o canal de teste premium-grátis é a web (spec §3). Um **env flag de servidor** `HOST_GATE_ENABLED` (default conforme ambiente) mantém `create` **aberto** no servidor de beta/dev (qualquer um cria), e **fechado** quando se quiser exercitar o gate. A impl default do verifier no beta é `AllowAllEntitlementVerifier`.

### 4. UX de ads por spec (§2, Marco 2) e onde ads NÃO aparecem
- **Rewarded para CONTINUE** após game over — substitui o continue livre **só no app grátis**; no premium o YES continua instantâneo.
- **Interstitial entre partidas** — frequency-capped (ex.: no máximo 1 a cada N game-overs e/ou cooldown de tempo). Lógica pura testável.
- **App premium = zero ads** (nenhum code-path de ads ativo).
- **Ads NUNCA durante gameplay**, **nunca dentro de salas co-op em partida** (intersticial só em transições de tela single-player: game over → menu). Interstitial em co-op = proibido (quebraria a sessão sincronizada de outros jogadores).

**Worktree:** /Users/pro15/Claude/3-contra-todos/game-v2 (branch `v2`)
**Plano vive em:** `docs/superpowers/plans/` (compartilhado pelo repo).

## Princípios obrigatórios (continuidade das Fatias 0–3)
- **Cada task termina verde + publicável:** `npx tsc --noEmit` (client e server), `npm test` (ambos pacotes), `npm run build` (loja default) verdes antes do commit; `werdumfight.com/v2` continua jogável a cada push.
- **Single-player jamais quebra:** todo ad/gate vive atrás de `FREE_BUILD`/`ADS_ENABLED` ou feature-detect; sem plugin/sem rede = no-op gracioso, nunca crash.
- **Build de loja PREMIUM = comportamento atual:** sem env → `FREE_BUILD=false`, `ADS_ENABLED=false`, config nativa intocada. **Esta é a regra de ouro: o premium em revisão não muda.**
- **TDD onde há lógica:** gating de ads (premium/web/free no-op), frequency-cap do interstitial, decisão rewarded-grant, `EntitlementVerifier`, parsing do claim de create-options — tudo TS puro testável sem browser/nativo. UI e plugin nativo são finos, cobertos por E2E/smoke.
- **Imutabilidade e arquivos pequenos** (regras globais): módulos próprios (`src/ads/AdService.ts`, `src/ads/adGating.ts`, `src/ads/interstitialCadence.ts`, `src/net/entitlement.ts`, `server/src/entitlement/EntitlementVerifier.ts`), não inchar cenas/`NetClient`/`ArenaRoom`.

---

### Task 1: Flag de flavor/identidade `FREE_BUILD` + scripts de build (sem tocar no premium nativo)

> A fundação: uma flag única que distingue grátis × premium em build-time, espelhando o padrão de `flags.ts`. **Zero mudança no comportamento default (premium).**

**Files:**
- Create: `src/ads/buildFlavor.ts` (`FREE_BUILD`, `ADS_ENABLED`, `PREMIUM_BUILD` derivados de `import.meta.env.VITE_FREE_BUILD`; puro)
- Modify: `capacitor.config.ts` (ler `process.env.FREE_BUILD` → trocar `appId`/`appName` quando setado; **default = config atual byte-a-byte**)
- Modify: `package.json` (scripts `build:free` e `build:free:coop`; `cap:free:*` apontando árvore descartável)
- Test: `tests/ads/buildFlavor.test.ts`

- [ ] **Step 1 (RED):** testes de `buildFlavor.ts`: sem env → `FREE_BUILD=false`, `PREMIUM_BUILD=true`, `ADS_ENABLED=false`; `VITE_FREE_BUILD==='true'` → `FREE_BUILD=true`, `ADS_ENABLED=true`, `PREMIUM_BUILD=false`. (Mesma técnica de `flags.ts`; valor lido de `import.meta.env`.)
- [ ] **Step 2 (GREEN):** implementar `buildFlavor.ts`.
- [ ] **Step 3 (GREEN — capacitor.config):** `capacitor.config.ts` lê `process.env.FREE_BUILD`; quando `=== '1'`/`'true'` → `appId: 'com.werdumfight.free'`, `appName` (ver Questões abertas #1), e (placeholder) ícone/cor. **Sem env → retorna exatamente a config de hoje** (testar visualmente que `npx cap sync` sem env não altera `android/`/`ios/`). Comentar claramente que a config nativa DEFINITIVA do grátis (flavors/targets) é passo de lançamento do usuário.
- [ ] **Step 4 (GREEN — scripts):** em `package.json`:
  - `build:free` → `VITE_FREE_BUILD=true vite build` (web/beta grátis, ads no-op na web).
  - `build:free:coop` → `VITE_FREE_BUILD=true VITE_NET_ENABLED=true VITE_SERVER_URL=wss://coop.werdumfight.com vite build` (app grátis com co-op join).
  - Documentar que o sync nativo do grátis roda contra **árvore descartável** (`FREE_BUILD=1 npx cap sync`/`cap run` apontando um `CAPACITOR_ANDROID_PATH`/diretório temporário) para **não** tocar os projetos do premium.
- [ ] **Step 5 (verde):** tsc + vitest + build (premium default) verdes; confirmar `git status` limpo em `android/`/`ios/` após um `npm run build` premium. Commit: `feat(v2): flag FREE_BUILD + scripts de build do app grátis (premium nativo intocado)`

### Task 2: `AdService` atrás de interface + test IDs + no-op para premium/web (TDD do gating)

> O coração dos ads: uma interface `AdService` com **duas** implementações — `AdMobService` (nativo, grátis) e `NoopAdService` (premium/web/sem-plugin). A escolha é por `ADS_ENABLED && isNativePlatform()`. Toda a decisão de gating é TDD pura; o wrapper do plugin é fino.

**Files:**
- Add dep: `@capacitor-community/admob@^8.0.0` (`npm i` — peer Capacitor 8 ok)
- Create: `src/ads/testAdUnits.ts` (constantes com os test IDs oficiais da Google, por plataforma)
- Create: `src/ads/AdService.ts` (interface `AdService` + `createAdService()` factory que escolhe impl)
- Create: `src/ads/NoopAdService.ts` (rewarded resolve `{granted:true}` na hora; interstitial no-op)
- Create: `src/ads/AdMobService.ts` (wrapper nativo: initialize+ATT, prepare/show rewarded e interstitial, escuta `RewardAdPluginEvents.Rewarded`)
- Create: `src/ads/adGating.ts` (puro: `shouldUseRealAds(adsEnabled, isNative)` etc.)
- Test: `tests/ads/adGating.test.ts`, `tests/ads/AdService.test.ts`, `tests/ads/NoopAdService.test.ts`

**Test IDs oficiais da Google (pesquisa 2026-06-11 — usar SEMPRE; usuário troca pelos reais no lançamento):**
- **App ID (sample):** Android `ca-app-pub-3940256099942544~3347511713`, iOS `ca-app-pub-3940256099942544~1458002511`.
- **Rewarded:** Android `ca-app-pub-3940256099942544/5224354917`, iOS `ca-app-pub-3940256099942544/1712485313`.
- **Interstitial:** Android `ca-app-pub-3940256099942544/1033173712`, iOS `ca-app-pub-3940256099942544/4411468910`.
- (Rewarded interstitial, se um dia: Android `/5354046379`, iOS `/6978759866` — não usado nesta fatia.)

- [ ] **Step 1 (RED):** `adGating.test.ts` — `shouldUseRealAds(adsEnabled, isNative)`: só `true` quando ambos `true`; `false` no premium (`adsEnabled=false`), na web (`isNative=false`), e sem ads. Puro.
- [ ] **Step 2 (RED):** `NoopAdService.test.ts` — `showRewardedForContinue()` resolve `{granted:true}` **sem** chamar nenhum plugin; `showInterstitial()` resolve `void` no-op; nunca throw. (Garante que o continue do beta web e do premium funcione.)
- [ ] **Step 3 (RED):** `AdService.test.ts` — `createAdService({adsEnabled, isNative})` retorna `NoopAdService` quando `!shouldUseRealAds`, `AdMobService` quando `true` (mockar o módulo `@capacitor-community/admob`). Para `AdMobService` mockado: `showRewardedForContinue` resolve `{granted:true}` **só** se o evento `Rewarded` disparou (simular evento) e `{granted:false}` se `Dismissed` sem reward; nunca throw (erro do plugin → `{granted:false}`, log).
- [ ] **Step 4 (GREEN):** instalar o plugin; implementar `testAdUnits.ts`, `adGating.ts`, `NoopAdService.ts`, `AdService.ts`, `AdMobService.ts`. `AdMobService.init()` chama `AdMob.initialize()`, e no iOS `requestTrackingAuthorization()` antes do primeiro ad; usa `isTesting:true` + test IDs por `Capacitor.getPlatform()`. Import dinâmico do plugin (não inflar bundle web). **Promise-wrap do rewarded:** registra listener `Rewarded`→resolve `granted:true`, `Dismissed`→`granted:false`, com timeout de segurança.
- [ ] **Step 5 (verde):** tsc + vitest + build (premium) verdes; `npx cap sync` (premium, sem env) não altera nativo. Commit: `feat(v2): AdService atrás de interface — AdMob nativo (test IDs) no app grátis, no-op no premium/web; gating TDD`

### Task 3: Rewarded-to-continue (app grátis) + interstitial entre partidas com frequency-cap

> Liga o `AdService` ao fluxo de jogo. No app grátis, o YES do CONTINUE? exibe um rewarded antes de reviver; o premium mantém o continue instantâneo. Interstitial só na transição game-over→menu (nunca em gameplay/co-op), com cadência testada.

**Files:**
- Create: `src/ads/interstitialCadence.ts` (puro: máquina de cadência — decide mostrar interstitial dado contador/cooldown; imutável)
- Modify: `src/scenes/GameOverContinueScene.ts` (YES no grátis → `adService.showRewardedForContinue()`; se `granted` → revive como hoje; se `!granted` → mensagem e volta a YES/NO ou trata como NO)
- Modify: `src/main.ts`/BootScene (instanciar `createAdService(...)` uma vez e disponibilizar via registry/singleton; init+ATT no boot do grátis)
- Test: `tests/ads/interstitialCadence.test.ts`

- [ ] **Step 1 (RED):** `interstitialCadence.test.ts` — `nextCadence(state, 'gameOver')`: mostra interstitial no máximo 1 a cada N game-overs **e** respeita cooldown de tempo; nunca mostra no primeiro game-over (UX); retorna novo estado imutável + `{show:boolean}`. Default N e cooldown vêm de constantes (ver Questões abertas #2).
- [ ] **Step 2 (RED):** teste do gate de continue (lógica extraída, ex. `resolveContinue(adsEnabled, adResult)`): premium/web (`NoopAdService`) → sempre `granted:true`; grátis com `Rewarded` → `true`; grátis com `Dismissed` → `false`. Puro.
- [ ] **Step 3 (GREEN):** implementar `interstitialCadence.ts`. No `GameOverContinueScene.confirmSelection()` YES: se `PREMIUM_BUILD` → comportamento atual (instantâneo); se grátis → `await adService.showRewardedForContinue()`; `granted` → fluxo atual (incrementa `continueCount`, `continueFromWave`, `GameScene`); `!granted` → toast "Anúncio não concluído" e permanece na tela. NO inalterado. Interstitial: ao ir para `TopTenScene`/`TitleScene` após game-over single-player, consultar `interstitialCadence` e, se `show`, `await adService.showInterstitial()` **antes** de trocar de cena. **Nunca** chamar interstitial em modo `net`/co-op.
- [ ] **Step 4 (GREEN — boot):** instanciar o `AdService` no boot (registry singleton); no grátis nativo, `await adService.init()` (initialize + ATT) cedo, tolerante a falha (no-op se plugin ausente). Expor `window.__adsTest` (stub controlável) para E2E.
- [ ] **Step 5 (verde):** tsc + vitest + build (premium e grátis-web) verdes; smoke single-player premium sem regressão (continue instantâneo intacto). Commit: `feat(v2): rewarded-to-continue no app grátis + interstitial entre partidas (frequency-capped); premium sem ads`

### Task 4: Gate de host premium — `EntitlementVerifier` no servidor + claim nas create-options + UX no LobbyScene

> O servidor decide quem pode criar sala. App grátis manda `entitlement:'free'`; o `EntitlementVerifier` rejeita create de `free` quando o gate está ligado. Entrar em sala **nunca** é afetado. No cliente grátis, CRIAR SALA vira upsell.

**Files:**
- Create: `server/src/entitlement/EntitlementVerifier.ts` (interface + `AllowAllEntitlementVerifier` + `PremiumOnlyEntitlementVerifier`; comentário-âncora para `ReceiptEntitlementVerifier` futuro)
- Create: `server/src/entitlement/config.ts` (lê `HOST_GATE_ENABLED` do env; escolhe o verifier)
- Modify: `server/src/rooms/ArenaRoom.ts` (`onCreate` valida `options.entitlement` via verifier; rejeita create não autorizado de forma limpa)
- Modify: `src/net/entitlement.ts` (NEW — deriva o claim do build: `getEntitlementClaim()` → `'premium'|'free'` de `buildFlavor`)
- Modify: `src/net/NetClient.ts` (`createRoom` envia `{ charKey, entitlement }`)
- Modify: `src/scenes/LobbyScene.ts` (no grátis: CRIAR SALA desabilitado + texto "Hostear é do app premium" + CTA "Conheça a edição premium"; ENTRAR intacto; tratar rejeição de create do servidor com a mesma mensagem/CTA)
- Test: `server/tests/entitlement.test.ts`, `tests/net/entitlement.test.ts`

- [ ] **Step 1 (RED — servidor):** `entitlement.test.ts` (server): `AllowAllEntitlementVerifier.canHost(opts)` → sempre `true`; `PremiumOnlyEntitlementVerifier.canHost({entitlement:'premium'})` → `true`, `{entitlement:'free'}`/ausente → `false`. `config` retorna `AllowAll` quando `HOST_GATE_ENABLED!=='true'` (beta/dev aberto), `PremiumOnly` quando `'true'`.
- [ ] **Step 2 (RED — servidor):** teste de integração de room (harness `@colyseus/testing`, padrão da Fatia 2): com gate ligado, `create` com `entitlement:'free'` é **rejeitado** (erro de matchmaking limpo, sem crashar o servidor); com `'premium'` cria normalmente; **joinById nunca é afetado** pelo gate.
- [ ] **Step 3 (RED — cliente):** `entitlement.test.ts` (client): `getEntitlementClaim()` → `'free'` quando `FREE_BUILD`, `'premium'` caso contrário.
- [ ] **Step 4 (GREEN):** implementar verifiers + `config`. No `ArenaRoom.onCreate`, validar `options.entitlement` via verifier injetado; se `!canHost` → `throw`/rejeição que o `matchMaker` traduz em erro de create (o `NetClient.createRoom` já resolve `null` + `lastError`). Manter `create` em `exposedMethods` (não remover — premium e beta web criam). `NetClient.createRoom` passa `{ charKey, entitlement: getEntitlementClaim() }`.
- [ ] **Step 5 (GREEN — UX):** no `LobbyScene.buildMenuUI`, se `FREE_BUILD`: CRIAR SALA estilizado como bloqueado (cadeado), tooltip/linha "Hostear é do app premium", botão CTA "Conheça a edição premium" (abre store URL — placeholder até listing existir). ENTRAR COM CÓDIGO **inalterado**. Se o servidor rejeitar um create (claim spoofado ou gate), mostrar a mesma mensagem PT-BR + CTA, voltar ao menu sem travar. Estender `window.__coopTest` com `getHostGateState()` para E2E.
- [ ] **Step 6 (verde):** tsc + vitest (client) + `npm test -w server` verdes; o beta web (gate desligado) continua criando salas. Commit: `feat(v2): gate de host premium — EntitlementVerifier no servidor + claim de build + UX de upsell no app grátis (entrar livre)`

### Task 5: E2E — gate + ads no-op na web, co-op join intacto; smoke do app grátis em simulador

> Verificação honesta. Na web: build grátis mostra o gate de host, ads são no-op (continue funciona via `NoopAdService`), e **entrar em sala continua funcionando**. No simulador iOS: app grátis sobe com test ads (ATENÇÃO ao prompt ATT) — build/install/launch/screenshot automatizados; toque de ad real e device físico = manual.

**Files:**
- Create: `scripts/e2e-free-gate.mjs` (build grátis-web: CRIAR SALA bloqueado + CTA; join por `?sala=` funciona; rewarded-continue resolve via no-op)
- Create: `scripts/verify-free-ios-sim.mjs` (build:free:coop → árvore descartável → cap sync ios → install → launch → screenshot; documentar ATT)
- Modify: README/CODEMAP (variante grátis, tabela honesta automatizado×manual)

- [ ] **Step 1 (E2E web):** `e2e-free-gate.mjs` (padrão dos scripts existentes): servir `build:free:coop`; assert `getHostGateState()` = bloqueado e CRIAR SALA não cria; navegar `?sala=CODE` (host criado por um contexto premium-flag ou pelo servidor dev) → guest grátis **entra** na sala (join livre); disparar continue no game-over → resolve sem ad real (no-op) e revive. Screenshot do menu grátis (gate visível).
- [ ] **Step 2 (E2E não-regressão):** rodar a bateria existente (`e2e-coop.mjs`, `e2e-invite-link.mjs`, `e2e-server-kill.mjs`, `e2e-local-smoke.mjs`) — co-op, convite, fallback gracioso e single-player intactos. Premium-web: nenhum gate, nenhum ad.
- [ ] **Step 3 (simulador iOS — honesto):** `verify-free-ios-sim.mjs`: `npm run build:free:coop` → `FREE_BUILD=1 npx cap sync ios` **na árvore descartável** → `xcrun simctl boot` → install/launch (`npx cap run ios --target` ou `xcodebuild`+`simctl install`) → `xcrun simctl io <udid> screenshot _e2e-shots/free-ios-boot.png`. **Documentar honestamente:** o prompt **ATT** aparece no primeiro ad (passo visual); test ads renderizam só em device/simulador real; dirigir o "assistir ad até o fim" e device físico = **checklist manual**. Confirmar que o `appId` no app instalado é `com.werdumfight.free` (lado-a-lado com o premium, se instalado).
- [ ] **Step 4 (doc + verde):** README com a tabela honesta (build/install/launch/screenshot/gate-web/ads-no-op-web = automatizado; assistir ad real, ATT real, cross-device, listings = manual). tsc + vitest + `npm test -w server` + build (premium) verdes. Commit: `test(v2): E2E gate de host + ads no-op na web + join livre; smoke do app grátis em simulador iOS (test ads/ATT)`

### Task 6: Encerramento — suítes, spec, push, CHECKLIST DO USUÁRIO

**Files:**
- Modify: spec `docs/superpowers/specs/2026-06-09-evolucao-v2-multiplayer-design.md` (§6: Fatia 4 ✅ + data; nota de que o relançamento/listings são passo manual)
- Modify: README/CODEMAP do `game-v2` (módulos `ads/*`, `net/entitlement`, `server/entitlement/*`; flag `FREE_BUILD`; scripts `build:free*`)
- Build/redeploy do beta web premium-flag (sem regressão) — o beta web continua o canal premium-grátis

- [ ] **Step 1:** `npx vitest run --coverage` (client) + `npm test -w server` — módulos novos (`buildFlavor`, `adGating`, `AdService`, `NoopAdService`, `interstitialCadence`, `entitlement` client/server) ≥80% lines; completar gaps. Rodar a bateria E2E + `e2e-free-gate.mjs`.
- [ ] **Step 2:** confirmar matriz de builds: **premium default** (`npm run build`) = `FREE_BUILD=false`, `ADS_ENABLED=false`, nativo `git`-limpo; **grátis-web** = gate visível + ads no-op; **grátis-coop** = join livre + gate de host. Smoke não-regressão premium.
- [ ] **Step 3 (critérios de aceite):**
  - app grátis (flag) mostra gate de host (CRIAR bloqueado + CTA) e **entra** em sala de graça (join intacto); E2E verde;
  - rewarded-to-continue só no grátis (no-op resolve no beta web; nativo escuta `Rewarded`); interstitial frequency-capped só em game-over single-player, **nunca** em gameplay/co-op; premium **zero ads**;
  - servidor: `EntitlementVerifier` rejeita create de `free` com gate ligado, `joinById` nunca afetado; beta web (gate off) cria normalmente;
  - identidade: build grátis gera `appId: com.werdumfight.free` numa **árvore descartável**, projetos `android/`/`ios/` do **premium em revisão permanecem intocados** (git limpo);
  - **nenhum bump de versão, nenhuma submissão, nenhum ID de ad real** — só test IDs da Google;
  - suíte client + server + E2E verdes.
- [ ] **Step 4:** atualizar spec §6 (Fatia 4 ✅ + data) e README/CODEMAP. `git push` da branch `v2`. Lembrar **hard-refresh** do beta. Commit: `chore(v2): Fatia 4 ✅ — engenharia do lançamento duplo (app grátis + ads + gate de host); spec/README atualizados`

---

## CHECKLIST DO USUÁRIO (fronteiras de autonomia — passos que o agente NÃO faz)

Estes itens exigem contas/credenciais/decisões de loja do usuário. A engenharia desta fatia os deixa **prontos para plugar**, mas eles são manuais:

1. **Criar os DOIS listings de loja** — App Store + Google Play: manter o **premium atual** (update da V2 quando sair de revisão) e **criar o listing GRÁTIS novo** (Google Play: app pago nunca volta a ser pago — por isso é listing novo, spec §2/§3). Definir nome final do app grátis (Questões abertas #1).
2. **Conta AdMob + ad units REAIS** — criar app no AdMob para o app grátis (Android e iOS separados), gerar os ad unit IDs de **rewarded** e **interstitial** reais, e **substituir os test IDs** em `src/ads/testAdUnits.ts` (trocar por um `adUnits.ts` de produção; manter test IDs em debug). Preencher `GADApplicationIdentifier` (iOS) e o `meta-data APPLICATION_ID` (Android) com o **app ID real** no projeto nativo do grátis.
3. **Config nativa DEFINITIVA do app grátis** — flavors Android (`applicationIdSuffix`) e/ou target/scheme iOS com Bundle Identifier `com.werdumfight.free`, ícones/splash finais, `Info.plist` com `NSUserTrackingUsageDescription` + `SKAdNetworkItems`. (Toca assinatura/loja → fora desta fatia.)
4. **Assets de loja (Fatia V)** — screenshots, feature graphic e ícones **distintos** para os dois listings + landing `3contratodos.com` (spec §7). Pré-requisito do relançamento.
5. **Entitlement real (futuro)** — quando quiser fechar a brecha do claim spoofável: fornecer chaves do App Store Server API / Play Developer API e implementar `ReceiptEntitlementVerifier` (a interface já está pronta). Setar `HOST_GATE_ENABLED=true` em produção.
6. **Deep-links nativos** (deferido da Fatia 3) — se quiser que o convite abra o app em vez do navegador: enrollment Apple + Associated Domains, e `assetlinks.json` com SHA256 do keystore Android.

---

## Questões abertas (DECISÃO DO USUÁRIO — com defaults)

1. **Nome do app grátis nas lojas** — *Default proposto:* manter **"3 Contra Todos"** (mesma marca, descoberta unificada; o "grátis vs premium" fica na descrição/preço, não no nome) e diferenciar só por **ícone** (badge) e listing. Alternativa: **"3 Contra Todos FREE"** (deixa explícito, mas fragmenta a marca e fica datado). *Recomendação: marca única + ícone distinto.* `appId` técnico fica `com.werdumfight.free` de qualquer forma.
2. **Cadência default do interstitial** — *Default proposto:* **nunca no 1º game-over**, depois **no máximo 1 a cada 3 game-overs** **E** cooldown mínimo de **90s** entre interstitials; **nunca** em co-op. Conservador para não queimar D1 (Marco 2 mede retenção). Ajustável por constante. Confirmar números.
3. **Experimento "host via rewarded ad" (spec §2)** — *Default: DEFERIR* para o Marco 2 (junto com analytics de retenção que dirão se vale). A engenharia já comporta: seria um terceiro caminho no gate (`free` + token de rewarded recente → `canHost=true` por uma sessão). Confirmar que fica fora desta fatia.
4. **`HOST_GATE_ENABLED` no beta** — *Default proposto:* **off no beta web** (canal de teste premium-grátis, spec §3 — qualquer um cria) e **on** só nos builds que exercitam o gate / em produção. Confirmar.
5. **CTA do upsell no app grátis** — para onde o botão "Conheça a edição premium" aponta antes do listing premium da V2 existir? *Default:* placeholder para a **landing `3contratodos.com`** (ou URL do app premium atual), trocado pelo deep-link da store no lançamento. Confirmar.
6. **Sandbox de receipt (futuro)** — quando implementar o entitlement real, validar em sandbox antes de ligar `HOST_GATE_ENABLED=true` em produção — para não bloquear compradores legítimos por erro de validação. (Anotado para o Marco 2.)
