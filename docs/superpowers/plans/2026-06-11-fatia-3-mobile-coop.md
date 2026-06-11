# Fatia 3 — Mobile co-op + convite por share-link + robustez de rede — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o co-op da Fatia 2 **acessível e robusto fora do desktop dev**: (a) convite por **share-link** que abre a sala automaticamente (`werdumfight.com/v2?sala=CODE` → auto-join no `LobbyScene`), com botão de compartilhar nativo (Web Share API na web, plugin `@capacitor/share` no app); (b) **co-op rodando em devices reais** — um build variant nativo (iOS/Android, debug/internal) com `NET_ENABLED=true` apontando para `wss://coop.werdumfight.com`; (c) **lifecycle de app** — desconexão graciosa ao ir para background, re-join via token de reconexão ao voltar; (d) **polish de robustez de rede** (timeouts de lobby, mensagens de erro) encontrado pelo caminho. O single-player offline **nunca quebra** e o build de loja (default) **continua `NET_ENABLED=false`**.

**Escopo explícito do que esta fatia NÃO faz (restrições do usuário):**
- ❌ **Nenhuma submissão de loja**, nenhum bump de versão. As builds V1 (iOS 1.0.11/15 e Android 1.0.3/4) estão em revisão Apple/Google — não tocar versionamento. Os builds desta fatia são **debug/internal-only** (rodados em simulador/emulador e, no máximo, distribuição interna manual pelo usuário).
- ❌ **Nenhum app deep-link nativo** (universal links iOS / app links Android) — ver "Questões abertas" #1. Eles exigem acesso ao Apple Developer Portal / Play Console do usuário (fronteira de autonomia). O convite desta fatia é **web-only**: o link abre no navegador (`werdumfight.com/v2?sala=CODE`). Decisão justificada na pesquisa abaixo.
- ❌ Nenhum gate de host premium (continua na Fatia 4), nenhum AdMob, nenhuma escolha de provedor de hospedagem do servidor (já está em `wss://coop.werdumfight.com` via PM2 + Cloudflare Tunnel nesta Mac — infra existente, não decisão desta fatia).

**Princípio de altitude (continuidade da Fatia 2):** o servidor Colyseus em `wss://coop.werdumfight.com` é a única fonte de verdade. Esta fatia é **majoritariamente cliente** (UI de convite, lifecycle, build variant). A única mudança de servidor possível é confirmar que a janela de reconexão de 60s (já implementada na Fatia 2, Task 8) cobre o cenário "app em background no celular" — nenhuma nova lógica de simulação.

**Estado verificado do código (auditado 2026-06-11, worktree `game-v2`):**
- `src/net/NetClient.ts`: wrapper completo de `@colyseus/sdk` 0.17.x. **Já tem** reconexão (`onDrop`→`reconnecting`, `onReconnect`→`connected`, `onLeave`/`CloseCode.FAILED_TO_RECONNECT`→`unavailable`), fallback gracioso (nunca throw), `normalizeRoomCode` (regex `^[A-Z]{4}$`), `createRoom`/`joinByCode`/`getRoomCode`/`getSessionId`. **Não tem** hook de lifecycle de app.
- `src/net/flags.ts`: `NET_ENABLED` de `VITE_NET_ENABLED==='true'` (default false); `SERVER_URL` de `VITE_SERVER_URL` (default `ws://localhost:2567`).
- `src/scenes/LobbyScene.ts`: fluxos criar/entrar por código completos, com harness E2E `window.__coopTest` (`host`/`join`/`start`/`mode`). **Não tem** auto-join por query param nem botão de compartilhar.
- `index.html`: PWA meta + splash. **Não tem** parsing de `?sala=`.
- `package.json`: `@capacitor/share@^8.0.0` e `@capacitor/app@^8.0.0` **já instalados**; `@colyseus/sdk@^0.17.42` no client. `webDir: dist/demo`; build do client em `dist/demo` (vite), `build:beta` em `dist-beta`.
- `capacitor.config.ts`: `appId: com.werdumfight.app`, sem config de rede (não precisa — ver pesquisa).
- `scripts/e2e-*.mjs`: **harness Playwright existente** (`e2e-coop.mjs`, `e2e-3player.mjs`, `e2e-reconnect.mjs`, `e2e-server-kill.mjs`, `e2e-local-smoke.mjs`, `e2e-coop-smoothness.mjs`) dirige o jogo via `window.__game` + `window.__coopTest` + `window.__netDebug`, salvando screenshots em `_e2e-shots/`. **Reusar este padrão.**
- `android/` e `ios/` projetos Capacitor existem. `xcrun` disponível; `adb`/`emulator` **NÃO** no PATH (Android SDK platform-tools precisa ser localizado/instalado — ver Task 4).

**Pesquisa verificada (2026-06-11 — Capacitor 8 docs + MDN):**

1. **`@capacitor/share` (Capacitor 8):** `share(options: ShareOptions) => Promise<ShareResult>`. `ShareOptions = { title?, text?, url?, files?, dialogTitle? }` (`dialogTitle` Android-only; `files` iOS/Android-only). Existe `canShare() => Promise<{ value: boolean }>`. Funciona em iOS/Android/web; **na web usa a Web Share API por baixo e o suporte é "spotty"** — por isso o caminho web tem fallback de clipboard próprio. (capacitorjs.com/docs/apis/share)
2. **Web Share API (`navigator.share`):** aceita `{ title?, text?, url? }`; **exige HTTPS + user gesture (transient activation)**; bom suporte em **mobile Safari e Chrome Android**, fraco/ausente em desktop e Firefox. Feature-detect com `if (navigator.share)` / `navigator.canShare`. Fallback: `navigator.clipboard.writeText(url)`. Erros a tratar: `AbortError` (usuário cancelou — silencioso), demais → fallback. (MDN Navigator.share)
3. **`@capacitor/app` (Capacitor 8):** evento **`appStateChange`** → payload `{ isActive: boolean }` ("iOS: UIApplication events; Android: Activity onResume/onStop"); eventos `pause`/`resume`; evento **`appUrlOpen`** → `{ url }` (para deep links — **não usado nesta fatia**); `getLaunchUrl()`. Adicionar listeners via `App.addListener('appStateChange', cb)`. (capacitorjs.com/docs/apis/app)
4. **WebSocket `wss` em WKWebView (iOS) / Android WebView:** **nenhuma config de Capacitor é necessária** para `wss` de saída a um host público. `server.allowNavigation` é só para navegação in-app (não afeta WebSocket/fetch); `server.cleartext`/`usesCleartextTraffic` só importam para HTTP em claro — `wss` é TLS, irrelevante. Conclusão: `capacitor.config.ts` **não muda** para conectar a `wss://coop.werdumfight.com`. (capacitorjs.com/docs/config)
5. **App deep-links nativos (DECISÃO: DEFER):** universal links iOS exigem **enrollment no Apple Developer Program + Team ID/Bundle ID + capability "Associated Domains" no Portal** (precisa da conta Apple do usuário); app links Android precisam de `assetlinks.json` com **SHA256 do certificado de assinatura** + intent-filter (`autoVerify`) — não exige conta de loja, mas exige o keystore de produção e edição de `AndroidManifest`. Ambos os lados publicam arquivos em `/.well-known/` no domínio. **Como esta fatia proíbe tocar em versionamento/assinatura e o convite web-only já entrega o valor (abre a sala no navegador, onde o co-op web da Fatia 2 já roda), os deep-links nativos ficam DEFERIDOS para a Fatia 4** (junto com a configuração de loja). Justificativa registrada nas Questões abertas.
6. **iOS suspende WebSocket em background:** o WKWebView é congelado quando o app vai para background; o WebSocket cai. **Mitigação:** ouvir `appStateChange`; ao `isActive=false`, parar de enviar input e mostrar overlay "Pausado"; ao `isActive=true`, deixar o auto-reconnect do SDK (maxRetries 15) reusar o token de reconexão dentro da janela de 60s do servidor (Fatia 2). Se a janela expirou → fallback gracioso ao lobby (já implementado). Nenhuma nova lógica de servidor.
7. **E2E em simulador/emulador via CLI (limite honesto):** dá para `xcrun simctl boot/install/launch` + `xcrun simctl io <udid> screenshot` (iOS) e, com Android SDK no PATH, `emulator` + `adb install`/`adb shell am start`/`adb exec-out screencap` (Android). **Dirigir toque é inviável de forma confiável por CLI** — `simctl` não tem API de toque estável e `adb shell input tap` depende de coordenadas frágeis. **Verificação honesta:** build + install + launch + screenshot do app subindo e (via o `__coopTest` harness exposto pelo WebView quando `NET_ENABLED`) **dirigir o join programaticamente** e tirar screenshot do lobby/partida — o mesmo truque dos `scripts/e2e-*.mjs`, mas dentro do WebView nativo. O que **não** automatizamos: gestos de combate manuais e teste cross-device físico (checklist manual do usuário).

**Worktree:** /Users/pro15/Claude/3-contra-todos/game-v2 (branch `v2`)

**Princípios obrigatórios (continuidade):**
- **Cada task termina verde + publicável:** `npx tsc --noEmit` (client e server), `npm test` (ambos pacotes), `npm run build` (client) verdes antes do commit; `werdumfight.com/v2` continua jogável a cada push (a Task 1 já é publicável e melhora o beta web vivo HOJE).
- **Single-player jamais quebra:** todo código novo (share, lifecycle, auto-join) vive atrás de `NET_ENABLED` ou de feature-detect; sem servidor/sem internet = botão "indisponível", nunca crash (spec §8).
- **Build de loja default = `NET_ENABLED=false`.** O co-op só liga no build variant interno/beta via env.
- **TDD onde há lógica:** parsing de URL (`?sala=`), normalização/validação de código, máquina de estados de lifecycle (background↔foreground) — tudo em TS puro, testável sem browser. UI e plugins nativos são finos e cobertos por E2E/smoke.
- **Imutabilidade e arquivos pequenos** (regras globais): helpers novos em módulos próprios (`src/net/inviteLink.ts`, `src/net/shareInvite.ts`, `src/net/appLifecycle.ts`), não inchar `LobbyScene`/`NetClient`.

---

### Task 1: Convite por share-link na WEB (auto-join `?sala=CODE` + botão compartilhar) — entrega no beta vivo

> A task de maior valor: melhora o **beta web vivo hoje** sem tocar em nada nativo. Um host cria a sala, copia/compartilha o link; quem abre `werdumfight.com/v2?sala=ABCD` cai direto na sala. Web Share API com fallback de clipboard.

**Files:**
- Create: `src/net/inviteLink.ts` (parse/build do query param `?sala=`, puro)
- Create: `src/net/shareInvite.ts` (estratégia de compartilhamento: Web Share API → clipboard fallback; native path fica vazio/stub até Task 2)
- Modify: `src/scenes/LobbyScene.ts` (botão "COMPARTILHAR" no lobby de host; auto-join ao detectar `?sala=`)
- Modify: `src/main.ts` (ou BootScene) — ler `?sala=` no boot e rotear para `LobbyScene` em modo auto-join quando `NET_ENABLED`
- Test: `tests/net/inviteLink.test.ts`, `tests/net/shareInvite.test.ts`

- [ ] **Step 1 (RED):** testes puros de `inviteLink.ts`:
  - `parseInviteCode('https://werdumfight.com/v2/?sala=ABCD')` → `'ABCD'`; aceita lowercase (`?sala=abcd` → `'ABCD'`), trim; rejeita inválido (`?sala=AB`, `?sala=12CD`, ausente) → `null`.
  - `buildInviteUrl('ABCD', baseUrl)` → `'<baseUrl>?sala=ABCD'`, idempotente, preserva o path do beta (`/v2/`); usa `normalizeRoomCode` por baixo (reuso, zero duplicação de regra).
- [ ] **Step 2 (RED):** testes puros de `shareInvite.ts` com `navigator` mockado:
  - quando `navigator.share` existe → chama `share({ title, text, url })` e resolve `'shared'`;
  - quando lança `AbortError` → resolve `'cancelled'` (silencioso, sem erro de UI);
  - quando `navigator.share` ausente → cai para `navigator.clipboard.writeText(url)` e resolve `'copied'`;
  - quando ambos falham → resolve `'failed'` (UI mostra o link em texto para copiar manual). NUNCA throw.
- [ ] **Step 3 (GREEN):** implementar `inviteLink.ts` e `shareInvite.ts`. `shareInvite(url)` detecta `navigator.share`/`canShare`; mensagem PT-BR ("Bora jogar 3 Contra Todos! Entra na minha sala: <url>").
- [ ] **Step 4 (GREEN — auto-join):** no boot (`main.ts`/BootScene), se `NET_ENABLED` e `parseInviteCode(location.href)` retorna um código, pular o menu e `scene.start('LobbyScene', { autoJoinCode })`. No `LobbyScene.create`, se `autoJoinCode` presente: pré-preencher e disparar `doJoinByCode` (reusar o fluxo existente; seletor de personagem default ou um quick-pick). Se `NET_ENABLED=false` (build de loja) → ignorar o param e ir ao single-player normal.
- [ ] **Step 5 (GREEN — UI):** adicionar botão "COMPARTILHAR" no lobby de host (`buildLobbyUI`), ao lado do código, chamando `shareInvite(buildInviteUrl(code, location.origin+location.pathname))`. Feedback visual: "Link copiado!" / abre o share sheet. Estender `window.__coopTest` com `share()` e `getInviteUrl()` para E2E.
- [ ] **Step 6 (E2E + verde):** novo `scripts/e2e-invite-link.mjs` (padrão dos scripts existentes): host cria sala, lê `getInviteUrl()`; segundo contexto navega ao URL com `?sala=`; assert que o guest cai direto no lobby da mesma sala. tsc + vitest + build verdes; smoke single-player (`e2e-local-smoke.mjs`) sem regressão. Commit: `feat(v2): convite por share-link na web — auto-join ?sala=CODE + Web Share API com fallback de clipboard`

### Task 2: Caminho nativo do botão compartilhar (`@capacitor/share`)

> O mesmo botão da Task 1, mas quando rodando dentro do app: usa o plugin nativo `@capacitor/share` (share sheet do SO) em vez da Web Share API. Detecção via `Capacitor.isNativePlatform()`.

**Files:**
- Modify: `src/net/shareInvite.ts` (branch native: usa `@capacitor/share` quando `Capacitor.isNativePlatform()`)
- Test: `tests/net/shareInvite.test.ts` (estender com branch native mockado)

- [ ] **Step 1 (RED):** estender os testes de `shareInvite.ts` mockando `Capacitor.isNativePlatform() === true` e o módulo `@capacitor/share`:
  - native + `canShare().value === true` → chama `Share.share({ title, text, url })` → resolve `'shared'`;
  - native + plugin lança → fallback de clipboard → `'copied'`;
  - web continua exatamente como na Task 1 (sem regressão).
- [ ] **Step 2 (GREEN):** import dinâmico/condicional de `@capacitor/share` e `@capacitor/core` para não inflar o bundle web nem quebrar SSR-less builds; `shareInvite` escolhe a estratégia: native → `Share.share`; web → `navigator.share`; fallback comum → clipboard → texto. Mensagem PT-BR idêntica.
- [ ] **Step 3 (verde):** `npx cap sync` (não muda config — só copia web assets/plugins); tsc + vitest + build verdes. Verificação nativa real fica na Task 4 (simulador). Commit: `feat(v2): botão compartilhar usa @capacitor/share no app nativo (mantém Web Share na web)`

### Task 3: Lifecycle de app — background→desconexão graciosa→resume→re-join (máquina de estados)

> iOS congela o WebSocket em background (pesquisa #6). Ouvir `appStateChange`; pausar input/mostrar overlay no background; no foreground, deixar o auto-reconnect do SDK reusar o token dentro da janela de 60s. Toda a **lógica** é uma máquina de estados em TS puro, testada; o wiring ao plugin é fino.

**Files:**
- Create: `src/net/appLifecycle.ts` (máquina de estados pura: `active ↔ backgrounded`, decide ações `pauseInput`/`resumeInput`/`expectReconnect`; e um wrapper que liga `@capacitor/app` à máquina)
- Modify: `src/net/NetClient.ts` (métodos `pauseSending()`/`resumeSending()` — gate de `sendInput` quando pausado; expor o `connectionState` para a UI de overlay)
- Modify: `src/scenes/GameScene.ts` (overlay "Pausado / Reconectando…" dirigido pela máquina + connectionState)
- Test: `tests/net/appLifecycle.test.ts` (máquina de estados pura)

- [ ] **Step 1 (RED):** testes da máquina pura `createLifecycleMachine()`:
  - estado inicial `active`; evento `background` → `backgrounded`, emite ação `pauseInput` (e, se conectado, `expectDrop`);
  - evento `foreground` a partir de `backgrounded` → `active`, emite `resumeInput` + `expectReconnect`;
  - eventos repetidos idempotentes (dois `background` seguidos não re-emitem); transições inválidas são no-op.
  - **Imutável:** cada transição retorna um novo estado (regra global), sem mutar.
- [ ] **Step 2 (RED):** testes do gate de envio no `NetClient`: após `pauseSending()`, `sendInput` vira no-op mesmo conectado; após `resumeSending()`, volta a enviar. (Não quebra o gate existente de `connectionState !== 'connected'`.)
- [ ] **Step 3 (GREEN):** implementar a máquina + `bindAppLifecycle(machine, netClient, handlers)` que registra `App.addListener('appStateChange', ({isActive}) => machine.send(isActive ? 'foreground' : 'background'))` e aplica as ações (`netClient.pauseSending()` etc.). Import condicional de `@capacitor/app`; na web (sem Capacitor), opcionalmente espelhar via `document.visibilitychange` (mesma máquina) — bônus de robustez, atrás de feature-detect.
- [ ] **Step 4 (GREEN — UI):** `GameScene` em modo `net` mostra overlay "Pausado" no `backgrounded` e "Reconectando…" quando `connectionState==='reconnecting'`; esconde ao `connected`. Se a reconexão expira (`unavailable`) → fallback gracioso ao lobby/title (reusa o caminho da Fatia 2). Single-player (`mode local`) ignora tudo isso.
- [ ] **Step 5 (verde):** tsc + vitest + build verdes; `scripts/e2e-reconnect.mjs` (já existe, usa `context.setOffline`) continua passando — opcionalmente adicionar um caso que simula `visibilitychange` na web. Commit: `feat(v2): lifecycle de app — pausa input no background e re-join via token de reconexão no foreground`

### Task 4: Build variant mobile co-op + verificação em simulador/emulador

> Um build nativo **interno** (debug) com `NET_ENABLED=true` + `SERVER_URL=wss://coop.werdumfight.com`, instalado e lançado em simulador iOS e emulador Android, dirigindo o join pelo harness `__coopTest` exposto no WebView. **Sem bump de versão, sem submissão.**

**Files:**
- Create: `.env.coop` (ou `scripts/build-coop.mjs`) com `VITE_NET_ENABLED=true` + `VITE_SERVER_URL=wss://coop.werdumfight.com`
- Modify: `package.json` (script `build:coop` → vite build para `dist/demo` com env de co-op; e `cap:coop:ios` / `cap:coop:android` para sync+run)
- Create: `scripts/verify-ios-sim.mjs`, `scripts/verify-android-emu.mjs` (build → install → launch → join via harness → screenshot)
- Modify: `README.md`/`server/README.md` (como rodar o build variant + limites de verificação)

- [ ] **Step 1:** criar o build variant: `build:coop` roda `vite build` com `VITE_NET_ENABLED=true` e `VITE_SERVER_URL=wss://coop.werdumfight.com` no `dist/demo` (o `webDir` do Capacitor). Confirmar que o build de **loja** default (`npm run build`) permanece `NET_ENABLED=false` (sem env → flag false). Documentar que este build é **debug/internal-only**.
- [ ] **Step 2 (iOS):** `scripts/verify-ios-sim.mjs`:
  - `npm run build:coop` → `npx cap sync ios`;
  - `xcrun simctl list devices available` → escolher um iPhone booted/bootável; `xcrun simctl boot <udid>`;
  - build do app para simulador via `xcodebuild` (scheme `App`, destino simulator) e `xcrun simctl install <udid> <App.app>` **OU** `npx cap run ios --target <udid>` (mais simples; documentar qual funcionou);
  - `xcrun simctl launch <udid> com.werdumfight.app`;
  - aguardar o WebView; via `simctl` não há JS bridge direto — **documentar honestamente**: tirar `xcrun simctl io <udid> screenshot _e2e-shots/ios-coop-boot.png` do app no menu; se o harness `__coopTest` for alcançável (não é por CLI nativo), anotar; caso contrário, a evidência iOS é **"app sobe, conecta visualmente ao lobby co-op contra coop.werdumfight.com"** e o **join programático real fica no checklist manual do usuário**.
- [ ] **Step 3 (Android):** `scripts/verify-android-emu.mjs`:
  - localizar Android SDK (`$ANDROID_HOME`/`~/Library/Android/sdk`) e adicionar `emulator`/`platform-tools` ao PATH **dentro do script** (não estão no PATH global — auditado); se ausente, **reportar ao usuário** (Regra 4 do Setup Protocol) e parar com diagnóstico, não silenciar;
  - `emulator -avd <nome> -no-snapshot &`; `adb wait-for-device`;
  - `npm run build:coop` → `npx cap sync android` → `npx cap run android --target <emu>` (ou `gradlew assembleDebug` + `adb install`);
  - `adb shell am start -n com.werdumfight.app/.MainActivity`;
  - `adb exec-out screencap -p > _e2e-shots/android-coop-boot.png`.
- [ ] **Step 4 (verificação honesta de join):** onde o WebView expõe o harness (Android com `chrome://inspect` / `adb forward` para o devtools do WebView), **opcionalmente** dirigir `window.__coopTest.join(code)` via CDP e screenshot do lobby. Se inviável no tempo do agente, **documentar como limite** e deixar como passo manual do usuário. NÃO fingir cobertura.
- [ ] **Step 5 (doc + verde):** documentar no README: comando do build variant, env, e a **tabela honesta de o-que-foi-automatizado-vs-manual** (build/install/launch/screenshot = automatizado; toque de combate e cross-device físico = manual). tsc + vitest + build (loja) verdes. Commit: `feat(v2): build variant mobile co-op (NET_ENABLED + wss://coop.werdumfight.com) + scripts de verificação em simulador/emulador`

### Task 5: Polish de robustez de rede (timeouts de lobby + erros) — só o spec'd em §8

> Apenas o que o spec §8 cobre (quedas, servidor fora, fallback gracioso). **Sem** indicador de latência (não está no spec — NÃO adicionar). Foco: mensagens de erro claras e timeouts no lobby que hoje podem travar.

**Files:**
- Modify: `src/net/NetClient.ts` (timeout em `createRoom`/`joinByCode` — se o connect pendurar, resolver `null`/`unavailable` após N segundos)
- Modify: `src/scenes/LobbyScene.ts` (mensagens de erro específicas: sala cheia, sala não existe, servidor fora; estado de "conectando…" com timeout)
- Test: `tests/net/netclient.test.ts` (estender: timeout de connect → `unavailable` sem throw)

- [ ] **Step 1 (RED):** testes do timeout de connect no `NetClient` (SDK mockado que nunca resolve): após ~8s (mockar timers), `createRoom`/`joinByCode` resolvem `null` e `connectionState='unavailable'`, sem throw (spec §8 — nunca crash).
- [ ] **Step 2 (RED):** testes de mapeamento de erro → mensagem PT-BR: sala cheia (4215 / room locked) → "Sala cheia"; sala inexistente → "Sala não encontrada"; servidor fora → "Servidor indisponível". (Mapear os códigos reais do Colyseus observados nos testes da Fatia 2.)
- [ ] **Step 3 (GREEN):** implementar timeout (Promise.race com timer) e o mapa de erros; `LobbyScene` mostra a mensagem certa e volta ao menu/join sem travar em "conectando…". Manter todo o fallback gracioso existente.
- [ ] **Step 4 (verde):** tsc + vitest + build verdes; `scripts/e2e-server-kill.mjs` (já existe) continua verde (servidor fora ⇒ single-player intacto). Commit: `fix(v2): timeouts de lobby + mensagens de erro de rede claras (sala cheia/inexistente/servidor fora)`

### Task 6: Encerramento — suítes, spec, push, redeploy do beta

**Files:**
- Modify: spec `docs/superpowers/specs/2026-06-09-evolucao-v2-multiplayer-design.md` (§6: Fatia 3 ✅ + data)
- Modify: README / CODEMAP do `game-v2` (novos módulos `net/inviteLink`, `net/shareInvite`, `net/appLifecycle`; build variant co-op)
- Build/redeploy do beta web (`werdumfight.com/v2`) com o convite por share-link vivo

- [ ] **Step 1:** `npx vitest run --coverage` (client) e `npm test -w server` — módulos novos (`inviteLink`, `shareInvite`, `appLifecycle`, timeouts do `NetClient`) ≥80% lines; completar gaps. Rodar a bateria E2E existente + `e2e-invite-link.mjs` contra dev local + servidor (ou `wss://coop.werdumfight.com`).
- [ ] **Step 2:** build do beta web (`build:beta` com `VITE_NET_ENABLED=true` + `VITE_SERVER_URL=wss://coop.werdumfight.com`) e confirmar que o build de **loja** (default) mantém `NET_ENABLED=false`. Smoke single-player no beta (não-regressão).
- [ ] **Step 3 (critérios de aceite):**
  - convite por share-link funciona no beta web vivo: host compartilha → guest abre `?sala=CODE` → cai na sala (E2E verde);
  - Web Share API na web + `@capacitor/share` no app (caminho nativo coberto por teste; verificação visual em simulador);
  - lifecycle: background pausa input + overlay, foreground re-join via token de 60s; servidor fora ⇒ single-player nunca quebra;
  - build variant mobile co-op instala/sobe em simulador iOS e emulador Android contra `wss://coop.werdumfight.com` (evidência por screenshot), **sem bump de versão e sem submissão**;
  - build de loja (single-player, `NET_ENABLED=false`) e beta (co-op) ambos verdes; suíte client + server verde.
- [ ] **Step 4:** atualizar spec §6 (Fatia 3 ✅ + data), README/CODEMAP. `git push` da branch `v2`; redeploy do beta. Lembrar o usuário de **hard-refresh** do `werdumfight.com/v2` (regra global de cache). Commit: `chore(v2): Fatia 3 ✅ — mobile co-op + share-link + robustez; spec/README atualizados`

---

## Questões abertas (DECISÃO DO USUÁRIO)

1. **App deep-links nativos (DEFERIDO nesta fatia — confirmar):** universal links iOS exigem **conta Apple Developer + capability "Associated Domains" no Portal** (fronteira de autonomia — precisa do login Apple do usuário); app links Android exigem o **SHA256 do keystore de produção** + `assetlinks.json` no domínio + intent-filter. Como esta fatia proíbe tocar em assinatura/versionamento, o convite é **web-only** (abre no navegador, onde o co-op da Fatia 2 já roda). **Pergunta:** fazer os deep-links nativos na Fatia 4 (junto da config de loja), ou o usuário quer habilitá-los antes? Se sim, ele precisa fornecer acesso ao Portal/Play Console e o keystore.
2. **Distribuição interna (TestFlight / Internal Testing) — passo do usuário:** o spec §6 cita "Co-op em TestFlight/internal testing" como ship da Fatia 3. Subir ao TestFlight/Play Internal **exige a conta do usuário e provavelmente um bump de build** (conflita com a restrição "sem bump"). **Decisão proposta:** esta fatia entrega builds **debug/internal-only** verificáveis em simulador/emulador; a distribuição real ao TestFlight/Internal fica como **ação manual do usuário** quando ele decidir (pode reusar o número de build em revisão ou criar um canal separado). Confirmar.
3. **`SERVER_URL` no build variant:** o plano fixa `wss://coop.werdumfight.com` (infra PM2 + Cloudflare Tunnel já existente nesta Mac). Confirmar que esse host é estável o suficiente para os testes em device (se a Mac/tunnel cair, o build não conecta — esperado, fallback gracioso cobre).
4. **Personagem no auto-join por link:** quando alguém entra por `?sala=CODE` sem ter passado pela tela de seleção, qual personagem default? Proposta: quick-pick no lobby de join (escolher entre os slots livres) antes de confirmar. Confirmar UX.
5. **Android SDK no PATH:** `adb`/`emulator` não estão no PATH global desta Mac (auditado). A Task 4 localiza o SDK (`~/Library/Android/sdk`) dentro do script; se o SDK não estiver instalado, o agente **reporta e para** (não instala Android Studio sozinho). Confirmar que o SDK existe ou que o usuário prefere só a verificação iOS por enquanto.
