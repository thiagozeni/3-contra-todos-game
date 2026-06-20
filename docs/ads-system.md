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

## ✅ Checklist de launch do app free (o que DEPENDE de você)

1. Criar app + ad units no painel **AdMob** (rewarded + interstitial, Android e iOS).
2. Configurar os 4 `VITE_ADMOB_*_*` + `VITE_ADMOB_TESTING=false` no comando de build
   free / secret de CI. **Nenhuma edição de código** — só env.
   - Ex.: `VITE_FREE_BUILD=true VITE_ADMOB_TESTING=false VITE_ADMOB_REWARDED_ANDROID=... [...] npm run build:free`
3. Pôr o **AdMob App ID** no `AndroidManifest.xml` / `Info.plist` (valor de app, não de unit).
4. `npm run cap:free:sync:android|ios` (árvore descartável) → `npm run check:native`.
5. Testar em device real com `VITE_ADMOB_TESTING=true` primeiro (test ads), depois flipar.

## Testes

`tests/ads/` — `AdService`, `AdMobService`, `NoopAdService`, `WebAdService`,
`adConfig`, `interstitialCadence`, `continueCadence`, `adGating`, `testAdUnits`,
`buildFlavor`. Rodar: `npm test -- tests/ads`.
