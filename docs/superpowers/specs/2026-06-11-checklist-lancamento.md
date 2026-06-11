# Checklist de Lançamento — App Grátis "3 Contra Todos" (Fatia 4)

> **Para:** usuário (Thiago)
> **Contexto:** A engenharia da Fatia 4 está completa no worktree `game-v2` (branch `v2`). Tudo o que está neste checklist são **passos manuais** que exigem suas contas, credenciais ou decisões de loja — o agente não faz isso autonomamente.
>
> O código está pronto para plugar. Cada seção referencia onde trocar / o que ativar.

---

## Antes do Lançamento

### 1. Criar os dois listings de loja

**Google Play:**
- O app premium atual (`com.werdumfight.app`) está no listing existente. Quando a V2 sair de revisão, publique a atualização normal no listing atual.
- **Crie um listing NOVO** para o app grátis com `applicationId: com.werdumfight.free`. No Google Play, um app pago **nunca volta a ser gratuito** — listing novo é obrigatório.
- Decida o nome final: `"3 Contra Todos"` (recomendado — mesma marca, diferenciação por ícone + preço) ou `"3 Contra Todos FREE"`. O `appId` técnico fica `com.werdumfight.free` de qualquer forma.

**App Store Connect:**
- Crie um segundo app com Bundle ID `com.werdumfight.free`.
- O app premium (`com.werdumfight.app`) continua no listing atual.

### 2. Conta AdMob + ad unit IDs reais

1. Acesse [AdMob](https://admob.google.com) com sua conta Google.
2. Crie um **App** para cada plataforma do app grátis:
   - "3 Contra Todos (Android Grátis)" → Android
   - "3 Contra Todos (iOS Grátis)" → iOS
3. Para cada app, gere dois ad units:
   - **Rewarded** (para continue após game over)
   - **Interstitial** (entre partidas, frequency-capped)
4. **Troque os test IDs pelos IDs reais** em `src/ads/testAdUnits.ts` no worktree `game-v2`:
   - Anote os `appId` (nível de app) separados dos `adUnitId` (nível de ad unit)
   - Substitua `TEST_AD_UNITS.android.rewarded`, `android.interstitial`, `ios.rewarded`, `ios.interstitial`
   - Crie um arquivo `src/ads/adUnits.ts` de produção (não commitar os IDs reais; use `.env` ou build-time injection)
5. Nos projetos nativos do app grátis:
   - **Android `AndroidManifest.xml`:** `<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="<SEU_APP_ID_ADMOB>"/>`
   - **iOS `Info.plist`:** adicionar chave `GADApplicationIdentifier` com valor `<SEU_APP_ID_ADMOB>` e o bloco `SKAdNetworkItems` (lista SKAdNetwork da Google — disponível na doc AdMob iOS)

### 3. Configuração nativa definitiva do app grátis

O worktree `game-v2` tem `android/` e `ios/` do **app premium** (em revisão). O app grátis precisa de sua própria árvore nativa:

**Android:**
```bash
# Crie um novo diretório para o projeto nativo do grátis
mkdir -p ~/free-app/android
FREE_BUILD=1 CAPACITOR_ANDROID_PATH=~/free-app/android npx cap sync android
# Abra ~/free-app/android no Android Studio
# Confirme applicationId = com.werdumfight.free em app/build.gradle
# Configure keystore SEPARADO do premium
# Adicione o APPLICATION_ID do AdMob no AndroidManifest.xml
```

**iOS:**
```bash
mkdir -p ~/free-app/ios
FREE_BUILD=1 CAPACITOR_IOS_PATH=~/free-app/ios npx cap sync ios
# Abra ~/free-app/ios/App/App.xcworkspace no Xcode
# Confirme Bundle Identifier = com.werdumfight.free em Signing & Capabilities
# Adicione GADApplicationIdentifier e NSUserTrackingUsageDescription ao Info.plist
# Configure um Apple Developer Team / signing profile separado se necessário
```

**Verificação pós-sync:** confirmar que o premium continua limpo:
```bash
npm run check:native
# Esperado: PASS — All native appIds confirmed as com.werdumfight.app
```

### 4. Assets de loja (Fatia V)

Por spec §7, os assets visuais de loja são trilha paralela. Antes de submeter:

- [ ] Ícones distintos para o app grátis (badge "FREE" ou diferença de cor — para diferenciar lado-a-lado na tela do usuário)
- [ ] Screenshots dos principais momentos de gameplay (gate de host visível no app grátis, co-op join, continue rewarded)
- [ ] Feature graphic (Google Play, 1024×500)
- [ ] Vídeo preview / trailer (recomendado — central no relançamento)
- [ ] Atualizar landing `3contratodos.com` com link para ambos os apps

### 5. Entitlement real — fechar a brecha do claim spoofável (futuro)

O gate de host atual usa **claim de build-time** (`entitlement: 'premium' | 'free'` enviado pelo cliente). É spoofável por um cliente modificado. Aceitável para beta — mas antes do lançamento amplo, considere:

1. Obtenha acesso à **App Store Server API** (Apple Developer Program) e/ou **Google Play Developer API** (chave de serviço no Google Play Console).
2. Implemente `ReceiptEntitlementVerifier` usando a interface já presente em `server/src/entitlement/EntitlementVerifier.ts` (veja o comentário-âncora `ReceiptEntitlementVerifier` no arquivo).
3. Nenhuma mudança no `ArenaRoom` — só trocar a implementação na factory `getVerifier()`.
4. Ative `HOST_GATE_ENABLED=true` no servidor de produção.
5. **Teste em sandbox** antes de ligar em produção (para não bloquear compradores legítimos por erro de validação de receipt).

---

## No Dia do Lançamento

### 6. Ativar o gate de host em produção

Quando estiver pronto para que o app grátis **não consiga criar salas** (apenas entrar):

```bash
# No servidor de produção (Colyseus / VPS / Oracle Free Tier):
HOST_GATE_ENABLED=true
# Reiniciar o servidor Colyseus
```

Antes do lançamento, o default é `AllowAllEntitlementVerifier` (gate off) — qualquer cliente cria sala.

> **Atenção:** ativar o gate enquanto o canal de beta web ainda está sendo usado pelos early adopters pode bloquear quem testa via web (onde `FREE_BUILD=false` → `entitlement='premium'`). O beta web sempre envia `'premium'`, então é seguro ativar.

### 7. Confirmar TestFlight (iOS) e Internal Testing (Android) antes da submissão pública

- [ ] Build do app grátis instalado via TestFlight em ao menos um device físico
- [ ] Build Android `app-release.apk` / `aab` testado via Internal Testing track
- [ ] Confirmar que ads de teste aparecem (rewarded + interstitial) em device real
- [ ] Confirmar que o prompt ATT aparece no iOS (primeira vez que o app pede autorização)
- [ ] Confirmar que CRIAR SALA está bloqueado (gate visível) e ENTRAR funciona

### 8. Co-op cross-device (teste manual obrigatório)

- [ ] Testar em 2 devices físicos: um com o app premium (ou web) cria sala → outro com o app grátis entra via código
- [ ] Confirmar que o gameplay sincroniza (ondas, personagens, combate)
- [ ] Confirmar que o rewarded continue aparece no device grátis e não no premium

### 9. Decisão de hosting definitivo do servidor Colyseus

O servidor de co-op precisa de hosting para produção. Opções avaliadas:

| Opção | Custo | Notas |
|-------|-------|-------|
| **Oracle Always Free** | Grátis | 1 OCPU + 1 GB RAM; suficiente para beta. Requer conta Oracle. |
| **Fly.io** | ~$5/mês | Deploy simples via Docker; bom DX. |
| **Railway** | ~$5/mês | Parecido com Fly, menos config. |
| **Colyseus Cloud** | Baseado em uso | Managed — sem ops; mais caro em escala. |

Após escolher: deploy do `server/` com `HOST_GATE_ENABLED=true` e a URL em `VITE_SERVER_URL` do build do app.

### 10. Cloudflare / Cache — após atualizar werdumfight.com

Se o beta web em `werdumfight.com/v2` tiver Cloudflare na frente:
- Purge do cache após cada deploy (ou configure Cache Rules para `/v2/*` com TTL curto)
- Confirmar que `werdumfight.com/v2` serve o HTML correto após deploy

---

## Depois do Lançamento

### 11. Deep-links nativos (deferido da Fatia 3)

Para que o convite `?sala=CODE` abra o app em vez do navegador:

- **iOS — Universal Links:** enrollment no Apple Developer Program com Associated Domains, adicionar `applinks:werdumfight.com` nas capabilities, hospedar `/.well-known/apple-app-site-association` em `werdumfight.com`.
- **Android — App Links:** hospedar `/.well-known/assetlinks.json` com o SHA256 do keystore do app grátis em `werdumfight.com/android/`.

Âncora de código: `src/net/inviteLink.ts` — a URL já é gerada; falta apenas a camada nativa para interceptar.

### 12. Marco 2 — Monetização e medição

Após o lançamento e primeiros dados de retenção:

- Analytics D1/D7 (Firebase / Amplitude) — instrumentar eventos-chave (session start, game over, continue rewarded, co-op join, host upsell clicado)
- Ajustar cadência do interstitial (default: nunca no 1º game over; 1 a cada 3 game overs + cooldown 90s) com dados reais
- Avaliar experimento "host via rewarded ad" (spec §2 — cria uma sala temporária para quem assiste um rewarded)
- Avaliar receita de rewarded vs. conversão para premium

---

## Referências rápidas de código

| O que trocar | Onde | Referência |
|---|---|---|
| Ad unit IDs (Android/iOS) | `src/ads/testAdUnits.ts` | Trocar por produção pré-lançamento |
| Gate de host (ligar/desligar) | Env var `HOST_GATE_ENABLED=true` no servidor | `server/src/entitlement/EntitlementVerifier.ts` |
| URL do servidor de co-op | `VITE_SERVER_URL` em `build:free:coop` | `package.json` scripts |
| URL de upsell do app premium | `src/scenes/LobbyScene.ts` — CTA "Conheça a edição premium" | Placeholder `3contratodos.com` → URL real da store |
| ReceiptEntitlementVerifier futuro | `server/src/entitlement/EntitlementVerifier.ts` | Comentário-âncora no arquivo |

---

*Gerado pela engenharia da Fatia 4 em 2026-06-11. Para dúvidas técnicas: ver o plano completo em `docs/superpowers/plans/2026-06-11-fatia-4-dual-app-ads.md`.*
