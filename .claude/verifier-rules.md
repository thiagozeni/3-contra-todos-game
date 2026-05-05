# Verifier Rules — werdum-fight (Phaser 3 + Capacitor, App Store rejeição 4.2 pendente)

Stack: Phaser 3 (web) + Capacitor (iOS + Android wrappers) + Supabase + Vite + TS.
Estende as regras globais com checks específicos de app/store/multi-target.

## W001 — Apple Review 4.2 (minimum functionality)
- **severity**: critical
- **trigger**: edição em `src/`, `index.html`, ou copy/textos visíveis ao usuário
- **check**:
  - Confirmar que pelo menos 3 features de valor único estão acessíveis no primeiro launch (sem paywall imediato).
  - Grep textos de UI por placeholders ("lorem", "TODO", "test", "draft", "WIP", "placeholder").
  - Confirmar que telas de fight têm conteúdo real, não mock data.
- **rationale**: rejeição 4.2 anterior; não pode reincidir.

## W002 — Capacitor sync após mudança web
- **severity**: critical
- **trigger**: builder editou arquivos em `src/`, `public/`, `dist/`, ou rodou `npm run build`
- **check**: confirmar que builder rodou (ou planeja rodar) `npx cap sync` antes de submeter pra store. Sem sync, iOS/Android serve build antigo.
- **rationale**: bug clássico de Capacitor — web atualiza, native fica defasado.

## W003 — Privacy strings em Info.plist e AndroidManifest
- **severity**: critical
- **trigger**: edição em `ios/App/App/Info.plist`, `android/app/src/main/AndroidManifest.xml`, ou capabilities de plugin Capacitor (`@capacitor/local-notifications`, `@capacitor/share`, `@capacitor/haptics`)
- **check**:
  - iOS: confirmar que toda `NS*UsageDescription` adicionada tem string descritiva (>20 chars, pt-BR e en).
  - Android: confirmar que permissions têm rationale via `<uses-permission>` apropriado.
- **rationale**: privacy strings vazias ou genéricas = rejeição automática.

## W004 — Sem chaves Supabase de dev em build de prod
- **severity**: critical
- **trigger**: edição em `src/lib/supabase*`, `.env*`, `vite.config.ts`, ou capacitor.config.ts
- **check**: grep no diff/arquivos editados por: anon key/url de staging, `.local`, `127.0.0.1`, `localhost` em código que vai pra build de produção. Falhar se achar.
- **rationale**: app submetido com URL de dev = não funciona pro reviewer = rejeição.

## W005 — Branding "3 Contra Todos" consistente
- **severity**: warning
- **trigger**: edição em copy, app name, splash, store-assets/, landing/
- **check**: grep "Werdum Fight" em strings visíveis ao usuário. **werdum-fight** é só nome do repo/build/package — UI deve dizer **3 Contra Todos**.
- **rationale**: rebranding obrigatório.

## W006 — Capturas de fight não vazem dados de outros usuários
- **severity**: critical
- **trigger**: edição em código de share/captura (`@capacitor/share`), exports, payloads pra Supabase
- **check**: confirmar que payload de share não contém: emails, IDs internos, tokens, raw API responses, dados de outros jogadores.
- **rationale**: privacidade do usuário; risco de rejeição 5.1.1.

## W007 — Bundle iOS vs Android consistente
- **severity**: warning
- **trigger**: edição em `capacitor.config.ts`, `ios/App/App/Info.plist`, `android/app/build.gradle`, `package.json`
- **check**: confirmar que `version` em package.json bate com `CFBundleShortVersionString` (Info.plist) e `versionName` (build.gradle). Divergência quebra changelog público.
- **rationale**: incoerência de versão entre platforms causa confusão de QA e suporte.

## W008 — Store assets atualizados quando UI muda
- **severity**: info
- **trigger**: mudança visual significativa em `src/` ou `index.html`
- **check**: alertar (UNVERIFIED) "screenshots em store-assets/ podem estar desatualizados — revisar antes de submit". Não falhar.
- **rationale**: screenshots desatualizados são motivo comum de rejeição 2.3.

## W009 — Domínio www.werdumfight.com em produção, não staging
- **severity**: warning
- **trigger**: edição em `CNAME`, `index.html`, links absolutos
- **check**: grep absolute URLs por padrões de staging (`*-preview.vercel.app`, `staging.`, `dev.`, `*.netlify.app` não-canônicos). Domínio canônico é `werdumfight.com`.
- **rationale**: deeplinks ou meta tags com URL errada = quebra share + SEO.

## Notas
- Rejeição prévia: Apple Review 4.2 (minimum functionality)
- Distribuição principal: app stores (não web)
- Tier de sensibilidade: ALTO — IP do jogo, assets, builds pré-aprovação
