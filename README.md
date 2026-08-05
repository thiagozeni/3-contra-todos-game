# Projeto de Jogo - Arena Beat'em Up

Projeto de jogo 2D estilo beat'em up inspirado em clássicos como Streets of Rage.

## Conceito

O jogador controla um lutador dentro de um ringue e deve proteger um personagem nocauteado contra ondas de inimigos.

O jogo possui estética retrô pixel art e gameplay arcade.

## Características principais

- Beat'em up 2D com profundidade
- Sistema de ondas de inimigos
- Personagens aliados controlados por IA
- Possibilidade de multiplayer cooperativo
- Visual retrô estilo 16 bits
- Arena única (ringue)

## Plataformas alvo

Inicialmente:

- Web (HTML5)
- Mobile browser

Possivelmente no futuro:

- Android
- iOS

## Tecnologias possíveis

- HTML5 Canvas
- Phaser
- Unity
- OpenBOR

## Builds

| Script | Saída | `NET_ENABLED` | Uso |
|--------|-------|---------------|-----|
| `npm run build` | `dist/demo` + landing em `dist/` | **false** (loja, NET-OFF) | Build **default e store-safe**. É o que `npx cap sync` copia para os apps nativos. |
| `npm run build:beta` | `dist-beta` | herda do env do chamador | Beta web (`3contratodos.com/v2`). |
| `npm run build:mobile-coop` | `dist/demo` + landing em `dist/` | **true** + `VITE_SERVER_URL=wss://coop.werdumfight.com` | **Variant mobile co-op (debug/internal-only).** Builda o app nativo com o co-op ligado contra o servidor público. |

### Build variant mobile co-op

```bash
npm run build:mobile-coop      # tsc --noEmit + vite build (NET_ENABLED=true, wss://coop.werdumfight.com) + landing
npx cap sync ios               # (ou android) copia os web assets do variant para o projeto nativo
```

O env é **inline no script** para o variant ser reprodutível (não depende do env do chamador).
Este build é **debug/internal-only** — **nenhum bump de versão, nenhuma assinatura, nenhuma submissão de loja**.

> ⚠️ **`build:mobile-coop` contamina `dist/demo` com a URL do servidor (`wss://coop.werdumfight.com`) e `NET_ENABLED=true`.**
> O `dist/demo` permanece NET-ON até o próximo `npm run build` (default). **Antes de qualquer trabalho de loja, SEMPRE rode `npm run build && npx cap sync`** para restaurar os assets nativos ao estado store-safe NET-OFF. Verificação: `grep -rl coop.werdumfight.com dist/demo/assets/` deve retornar **vazio** após o rebuild default.

### Build do app grátis (Fatia 4) — variante FREE_BUILD

| Script | Saída | `FREE_BUILD` | Uso |
|--------|-------|-------------|-----|
| `npm run build:free` | `dist/` | **true** (ads no-op na web, gate de host visível) | Build web/beta do app grátis. |
| `npm run build:free:coop` | `dist/` | **true** + `NET_ENABLED=true` | Build do app grátis com join co-op (bundle móvel). |
| `npm run cap:free:sync:android` | tmpdir | **true** | Sync nativo Android para **diretório descartável** (`mktemp`). |
| `npm run cap:free:sync:ios` | tmpdir | **true** | Sync nativo iOS para **diretório descartável** (`mktemp`). |
| `npm run check:native` | — | — | **Sync-guard**: verifica que `android/` e `ios/` do repo têm `appId: com.werdumfight.app`. |

> **AVISO CRÍTICO — `cap:free:sync:*` e `check:native`**
>
> O projeto **premium** (`android/`, `ios/`) está em revisão de loja com `appId: com.werdumfight.app`.
> Um sync com `FREE_BUILD=1` *sem* os overrides de path pode tainar esses arquivos com `com.werdumfight.free`
> (incidente registrado em 2026-06-11). Os scripts `cap:free:sync:*` usam `CAPACITOR_ANDROID_PATH` /
> `CAPACITOR_IOS_PATH` apontando para `mktemp`, mas como segunda linha de defesa:
>
> **Sempre rode `npm run check:native` após qualquer `npx cap sync` manual.** Se falhar, rode
> `npx cap sync` sem `FREE_BUILD` para restaurar os arquivos e execute `check:native` de novo.

A configuração nativa **definitiva** do app grátis (flavors Android, targets iOS, Bundle ID, AdMob IDs, `Info.plist`) é um **passo manual do usuário no lançamento** — ver `docs/superpowers/specs/2026-06-11-checklist-lancamento.md`.

### Verificação em simulador/emulador (Task 4, Fatia 3)

O que é **automatizado** vs **manual** (limite honesto — dirigir toque por CLI é frágil):

| Verificação | Plataforma | Status |
|-------------|-----------|--------|
| Build do variant + `cap sync` + compilação nativa | iOS + Android | ✅ Automatizado |
| App instala e lança no simulador/emulador | iOS (simulador) | ✅ Automatizado |
| Screenshot mostra o botão **CO-OP ONLINE** (prova do flag `NET_ENABLED`) | iOS (simulador) | ✅ Automatizado — `_e2e-shots/ios-coop-title-readable.png` |
| App roda sem crash (process vivo + log limpo) | iOS (simulador) | ✅ Automatizado |
| Handshake `wss` real contra o servidor público (create room + leave) | host (mesma Mac via SDK) | ✅ Automatizado — `node scripts/verify-wss-live.mjs` |
| Tap CO-OP ONLINE → CRIAR SALA → lobby com código (join dentro do WebView nativo) | Android (emulador, `adb shell input tap`) | ⛔ **Bloqueado** — emulator/system-image não instalados neste host (ver abaixo) |
| Join via WebView WKWebView dirigido por CLI | iOS (simulador) | ⛔ Inviável — WKWebView não expõe JS bridge/CDP por `simctl`. **Checklist manual** |
| Gestos de combate + teste cross-device físico | iOS + Android | ⛔ **Checklist manual do usuário** (device real) |

**Gap Android (emulador):** o Android SDK existe em `~/Library/Android/sdk` com `platform-tools` (adb), `build-tools` e `platforms` — suficiente para **compilar o APK** (feito: `app-debug.apk` com a URL do co-op embarcada). Mas **não há `emulator` nem `system-images` instalados** (`sdkmanager --list_installed` confirma), então não há AVD para bootar. Conforme a restrição (não baixar imagens multi-GB sem necessidade), o run em emulador — e portanto a prova de toque dirigindo o join — fica como **passo manual**: instale `app-debug.apk` num device/emulador real e toque CO-OP ONLINE → CRIAR SALA.
