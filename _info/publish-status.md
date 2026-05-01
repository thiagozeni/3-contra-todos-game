# 3 Contra Todos — Status de Publicação

> Última atualização: 2026-05-01

## Visão Geral

**3 Contra Todos** é um beat'em up arcade inspirado nos clássicos dos fliperamas, desenvolvido com **Phaser 3.87** + **Capacitor 8.3** (híbrido web → nativo). O jogo também roda como PWA na web.

- **Bundle ID**: `com.werdumfight.app`
- **Versão atual (código-fonte)**: `package.json` → 0.1.0

---

## Apple App Store (iOS)

| Campo | Valor |
|---|---|
| **App Store ID** | 6761487568 |
| **Status** | 1.0.6 — Build 10 enviado ao App Store Connect; aguardando processamento/seleção para revisão |
| **Versão publicada** | 1.0.5 (Pronto para distribuição) |
| **Build enviado** | 1.0.6 (build 10) |
| **MARKETING_VERSION** | 1.0.6 |
| **CFBundleVersion (build)** | 10 |
| **contentInset** | `never` |
| **Data do upload do build** | 2026-05-01 |

### Histórico de versões iOS

- **1.0 (build 4)** — Primeira versão publicada na App Store.
- **1.0.1 (build 5)** — Correções pós-lançamento, enviada para revisão em 10/04/2026.
- **1.0.5 (build 9)** — Correção para Mac rodando app iOS: fallback visual sem vídeo, unlock de áudio no clique inicial e cenas resilientes a falha de BGM.
- **1.0.6 (build 10)** — Correção complementar para Mac: música de fundo via HTMLAudioElement com retry por gesto do usuário, fallback completo do cenário no gameplay e ajustes finais de escala dos personagens.

### Correções na versão 1.0.1

1. **Banner PWA removido no app nativo** — O banner "Adicionar à tela de início" aparecia dentro do app iOS. Adicionada detecção via `Capacitor.isNativePlatform()` no `index.html` para nunca mostrar o banner no contexto nativo.
2. **Fullscreen API desativada no app nativo** — O alerta "capacitor://localhost is in full screen" aparecia por conta de chamadas à Fullscreen API do browser dentro do WKWebView. Adicionada verificação Capacitor em `index.html` e `TitleScene.ts` para pular essas chamadas no app nativo.
3. **Vídeo do loader re-codificado** — O vídeo `.m4v` original (1.2 MB, com trilha de áudio) não rodava no WKWebView. Convertido para `.mp4` (330 KB) com H.264 baseline profile, sem áudio, e flag `faststart` via ffmpeg. Adicionado fallback em caso de erro de reprodução.
4. **Barras brancas nas bordas corrigidas** — O app não ocupava a tela cheia por conta do `contentInset: 'always'` no `capacitor.config.ts`. Alterado para `'never'`.
5. **Setas de voltar corrigidas** — O caractere Unicode `←` (U+2190) renderizava como emoji no iOS. Substituído por `<` (ASCII) em `HowToPlayScene.ts`, `SelectScene.ts`, `TopTenScene.ts` e `AnimTestScene.ts`.

### Arquivos modificados (1.0.1)

- `index.html` — Detecção Capacitor para banner PWA, fullscreen e vídeo loader
- `src/scenes/TitleScene.ts` — Verificação Capacitor em `tryFullscreen()`
- `src/scenes/HowToPlayScene.ts` — `← VOLTAR` → `< VOLTAR`
- `src/scenes/SelectScene.ts` — `← VOLTAR` → `< VOLTAR`
- `src/scenes/TopTenScene.ts` — `← VOLTAR` → `< VOLTAR`
- `src/scenes/AnimTestScene.ts` — `← VOLTAR` → `< VOLTAR`
- `capacitor.config.ts` — `contentInset: 'never'`
- `public/videos/loader.mp4` — Novo arquivo de vídeo otimizado
- `ios/App/App/Info.plist` — Build 4 → 5
- `ios/App/App.xcodeproj/project.pbxproj` — MARKETING_VERSION 1.0 → 1.0.1

### Nota importante sobre as alterações

As correções foram feitas no código-fonte web compartilhado (não em arquivos específicos do iOS). Todas usam detecção em runtime via `Capacitor.isNativePlatform()`, o que significa que a versão web/PWA e a versão Android não são afetadas negativamente — os comportamentos web (banner PWA, Fullscreen API) continuam funcionando normalmente fora do contexto nativo.

---

## Google Play Store (Android)

| Campo | Valor |
|---|---|
| **Developer ID** | 8460845167994162330 |
| **App ID** | 4972966731731974685 |
| **Status** | 1.0.1 — Teste fechado (Alpha) em análise pelo Google |
| **Versão anterior em análise** | 1.0 (versionCode 1) — cancelada e substituída pela 1.0.1 |
| **Versão atual em análise** | 1.0.1 (versionCode 2) |
| **versionCode** | 2 |
| **versionName** | 1.0.1 |
| **Faixa de teste** | Teste fechado - Alpha |
| **Países/regiões** | 172 |
| **Testadores** | Lista de e-mails (Cachorradas Estúdios) |
| **Keystore** | `android/app/keystore/3contra.keystore` (alias `3contra-todos`) |
| **Assinatura** | Google Play App Signing ativado (proteção automática) |
| **Orientação** | Landscape + Modo imersivo |
| **Data do envio para revisão** | 2026-04-10 |

### Histórico de versões Android

- **1.0 (versionCode 1)** — Build inicial enviada em 08/04/2026 para Teste interno e 09/04/2026 para Teste fechado (Alpha). Continha os mesmos bugs encontrados no iOS.
- **1.0.1 (versionCode 2)** — Build corrigida com as mesmas 5 correções do iOS. Gerada em 10/04/2026 após `npx cap sync android` + `./gradlew bundleRelease`. Enviada para Teste fechado (Alpha) em 10/04/2026, substituindo a análise da 1.0.

### Build Android 1.0.1

- Web build: `npm run build` (mesmo código-fonte que iOS)
- Sincronização: `npx cap sync android` (copia assets web para `android/app/src/main/assets/public/`)
- AAB gerado: `./gradlew bundleRelease` com JAVA_HOME apontando para JDK 21 do Android Studio
- Arquivo: `android/app/build/outputs/bundle/release/app-release.aab` (133 MB)
- Aviso na revisão: ausência de arquivo de desofuscação R8/ProGuard (informativo, não bloqueante)

### Próximos passos para Google Play

1. Aguardar aprovação da análise do Teste fechado (Alpha) pela equipe do Google.
2. Após aprovação, testar com os testadores Alpha.
3. Promover para Teste aberto ou Produção quando pronto.
4. Acesso de produção ainda não liberado — solicitar quando a versão estiver validada.

---

## Links úteis

- App Store Connect: `https://appstoreconnect.apple.com/apps/6761487568`
- Google Play Console: `https://play.google.com/console/u/0/developers/8460845167994162330/app/4972966731731974685`
- Política de privacidade: `https://werdumfight.com/privacy`

---

#3ContraTodos #gamedev #capacitor #phaser #ios #android
