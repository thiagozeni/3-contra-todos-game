# Sistema de Anúncios (Ads) — referência

> Estado em 20/jun/2026. O core já existia (AdMob nativo + cadência + fiação no
> continue e no host-unlock co-op, 83 testes). Esta sprint adicionou o
> **simulador web** e a **config por env**. Total atual: ~112 testes de ads verdes.

## Visão geral

Toda diferença de plataforma vive atrás da interface `AdService` (`src/ads/AdService.ts`).
Cenas/sistemas só conhecem a interface (`init`, `prepareRewarded`, `showRewarded`,
`prepareInterstitial`, `showInterstitial`) e pegam o serviço do registry do Phaser
(`this.registry.get('adService')`). O factory `createAdService` escolhe a implementação:

| Contexto | Implementação | Comportamento |
|---|---|---|
| Free **nativo** (`ADS_ENABLED && isNative`) | `AdMobService` | AdMob real (`@capacitor-community/admob`) |
| Web + `VITE_WEB_AD_SIM=true` | `WebAdService` | **Overlay simulado** (QA/beta) |
| Web ou premium (default) | `NoopAdService` | `showRewarded` concede na hora; interstitial silencioso |

Onde é usado:
- **Game Over → Continue** (`GameOverContinueScene`): `showRewarded()` → `resolveContinue()` → +1 continue.
- **Co-op host-unlock** (`LobbyScene.watchAdToHost`): rewarded libera a criação de sala (entitlement override, fail-closed).
- **Interstitial** entre partidas: `interstitialCadence` decide quando (nunca no 1º game-over, intervalo, cooldown, nunca em co-op).

## Simulador web (novo) — `VITE_WEB_AD_SIM`

A web não é a superfície monetizada (isso é o app nativo via AdMob), então por padrão
ela usa `NoopAdService` (sem fricção). Para **ver e sentir** o fluxo real de
continue/host-unlock no navegador:

```bash
npm run dev:adsim        # dev server com o overlay simulado ligado
```

O overlay (`src/ads/web/WebAdOverlay.ts`) é um card DOM branded ("PUBLICIDADE /
simulação", contador, barra de progresso, recompensa, CTA fake) que flutua acima do
canvas. Semântica idêntica ao AdMob: assistir até o fim → `{granted:true}`; fechar
antes → `{granted:false}`.

> Não ligar `VITE_WEB_AD_SIM` na web de produção — isso adicionaria fricção a
> jogadores web que não estão sendo monetizados. É ferramenta de QA/beta.

## Config por env (novo) — `src/ads/adConfig.ts`

Antes, os ad unit IDs e `isTesting:true` estavam **hardcoded** no código (o checklist
de launch pedia editar fonte em vários lugares). Agora tudo vem de env, com defaults =
test IDs do Google + `isTesting=true` (ou seja, **sem env = comportamento idêntico ao
anterior**, suíte de testes intacta).

| Env var | Default | Para produção |
|---|---|---|
| `VITE_ADMOB_REWARDED_ANDROID` | test ID Google | seu ad unit ID real |
| `VITE_ADMOB_REWARDED_IOS` | test ID Google | seu ad unit ID real |
| `VITE_ADMOB_INTERSTITIAL_ANDROID` | test ID Google | seu ad unit ID real |
| `VITE_ADMOB_INTERSTITIAL_IOS` | test ID Google | seu ad unit ID real |
| `VITE_ADMOB_TESTING` | `true` | **`false`** (serve ads reais) |
| `VITE_AD_INTERVAL` | `3` | game-overs entre interstitials |
| `VITE_AD_COOLDOWN_MS` | `90000` | ms entre interstitials |

> Segurança: `isTesting` é `true` por padrão e só vira `false` com
> `VITE_ADMOB_TESTING=false` explícito — evita servir ad real com ID de teste
> (violação de política) caso o env seja esquecido.

## IDs reais do AdMob (conta `ca-app-pub-8782557489858174` — Thiago Zeni)

> Criados em 21/jun (conta em "Requer revisão" — até ~24h; usar test IDs até aprovar).
> Estes IDs **não são secretos** (ficam embutidos no app distribuído).

| Onde vai | Chave | Valor |
|---|---|---|
| **App ID** — AndroidManifest | `APPLICATION_ID` (Android) | `ca-app-pub-8782557489858174~1428340732` |
| **App ID** — Info.plist | `GADApplicationIdentifier` (iOS) | `ca-app-pub-8782557489858174~4983452688` |
| Ad unit (env build) | `VITE_ADMOB_REWARDED_ANDROID` | `ca-app-pub-8782557489858174/3806102388` |
| Ad unit (env build) | `VITE_ADMOB_REWARDED_IOS` | `ca-app-pub-8782557489858174/7161793385` |
| Ad unit (env build) | `VITE_ADMOB_INTERSTITIAL_ANDROID` | `ca-app-pub-8782557489858174/1235779365` |
| Ad unit (env build) | `VITE_ADMOB_INTERSTITIAL_IOS` | `ca-app-pub-8782557489858174/6241683713` |

Os 4 ad unit IDs (`/`) **já estão no script** `npm run build:free:prod`. Os 2 App IDs
(`~`) vão no nativo (passos abaixo). `~` = App, `/` = ad unit — não confundir.

## ✅ Checklist de launch do app free (o que DEPENDE de você)

**Parte JS — já automatizada (nada a editar):**
1. Build de produção do free: `npm run build:free:prod` (free + co-op + ad unit IDs reais
   + `VITE_ADMOB_TESTING=false`). Para testar antes da aprovação da conta, use
   `npm run build:free:coop` (test ads).

**Parte nativa — manual (o free roda em árvore descartável; ver nota no `capacitor.config.ts`):**
2. **Android** — `AndroidManifest.xml`, dentro de `<application>`:
   ```xml
   <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID"
              android:value="ca-app-pub-8782557489858174~1428340732"/>
   ```
3. **iOS** — `Info.plist`:
   ```xml
   <key>GADApplicationIdentifier</key>
   <string>ca-app-pub-8782557489858174~4983452688</string>
   <!-- ATT: AdMobService chama requestTrackingAuthorization() no init iOS -->
   <key>NSUserTrackingUsageDescription</key>
   <string>Usamos seu identificador para exibir anúncios mais relevantes.</string>
   <!-- SKAdNetwork (atribuição de instalações): adicionar a lista oficial do Google
        — https://developers.google.com/admob/ios/quick-start#update_your_infoplist
        (mínimo: cstr6suwn9.skadnetwork) -->
   ```
4. `npm run cap:free:sync:android|ios` (árvore descartável) → `npm run check:native`
   (confirma que o premium android/ios NÃO foi contaminado). Os passos 2-3 são reaplicados
   na árvore temp a cada sync.
5. Testar em device real com **test ads primeiro** (`build:free:coop`), depois `build:free:prod`.
   ⚠️ NUNCA clicar nos próprios anúncios reais (Google suspende a conta).

## Testes

`tests/ads/` — `AdService`, `AdMobService`, `NoopAdService`, `WebAdService`,
`adConfig`, `interstitialCadence`, `continueCadence`, `adGating`, `testAdUnits`,
`buildFlavor`. Rodar: `npm test -- tests/ads`.
