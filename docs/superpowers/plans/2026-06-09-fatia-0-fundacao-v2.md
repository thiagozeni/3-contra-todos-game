# Fatia 0 — Fundação V2 (branch + worktree + Phaser 4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a branch `v2` com worktree paralelo, migrar Phaser 3.87 → 4.1, manter gameplay idêntico, e publicar o beta web em `werdumfight.com/v2` com builds nativos compilando.

**Architecture:** A V1 permanece intocada na `main` (inclusive os apps 1.0.x em revisão nas lojas). A V2 vive na branch `v2` via git worktree em `../game-v2`. O deploy do beta copia o bundle buildado da V2 para `dist/v2/` da `main` (GitHub Pages serve a `main`; o bundle usa `base: './'`, então funciona em qualquer subpasta).

**Tech Stack:** Phaser 4.1.0, Vite 5, TypeScript 5, Capacitor 8. Sem testes unitários nesta fatia (não há lógica nova — os gates são `tsc`, builds e smoke-test manual; testes automatizados começam na Fatia 1 com a extração do `core/`).

**Referência de migração:** https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/MIGRATION-GUIDE.md
Breaking changes que afetam ESTE código (auditado em 2026-06-09):
1. `createGeometryMask()` + `setMask()` → sistema de Filters: `obj.filters.internal.addMask(maskObject)` — 2 ocorrências em `src/ui/HUD.ts` (linhas ~74–85 e ~185–196).
2. Tint por canto (`tintTopLeft`) substituído por tint único — 1 leitura em `src/entities/Enemy.ts:255`.
3. Todo o resto que o jogo usa segue igual: `add.particles(x, y, key, config)`, arcade physics, `Phaser.Scale.FIT`/`refresh()`, `type: Phaser.AUTO`, Graphics `fillStyle/fillRect`, tweens, text, `setTint/clearTint`, keyboard.

---

### Task 1: Branch `v2` + worktree `game-v2/`

**Files:** nenhum arquivo de código — só git.

- [ ] **Step 1: Confirmar estado limpo o suficiente**

```bash
cd /Users/pro15/Claude/3-contra-todos/game
git status --porcelain
```

Esperado: apenas os pendentes já conhecidos (`android/app/build.gradle`, `ios/.../project.pbxproj`, `Info.plist`, `?? infra-recomendada.md`, `?? ios/ExportOptions.plist`, `?? .claude/worktrees/`). Esses arquivos NÃO entram nesta fatia — são da submissão de lojas da V1. Não commitá-los aqui.

- [ ] **Step 2: Criar branch e worktree**

```bash
git branch v2
git worktree add ../game-v2 v2
```

Esperado: `Preparing worktree (checking out 'v2')`. Resultado: `/Users/pro15/Claude/3-contra-todos/game-v2` com a branch `v2`.

- [ ] **Step 3: Instalar dependências no worktree (node_modules não é compartilhado)**

```bash
cd /Users/pro15/Claude/3-contra-todos/game-v2
npm install
```

- [ ] **Step 4: Baseline verde — build da V2 ainda em Phaser 3**

```bash
npm run build
```

Esperado: `tsc --noEmit` sem erros + `vite build` OK. Se falhar AQUI, o problema não é a migração — resolver antes de seguir.

### Task 2: Upgrade Phaser 4.1 + triagem de erros

**Files:**
- Modify: `game-v2/package.json` (dependência `phaser`)

- [ ] **Step 1: Instalar Phaser 4**

```bash
cd /Users/pro15/Claude/3-contra-todos/game-v2
npm install phaser@^4.1.0
```

Verificar: `grep '"phaser"' package.json` → `"phaser": "^4.1.0"`.

- [ ] **Step 2: Rodar o type-check e listar TODOS os erros**

```bash
npx tsc --noEmit 2>&1 | head -60
```

Esperado: erros em `src/ui/HUD.ts` (`createGeometryMask`/`setMask`) e `src/entities/Enemy.ts` (`tintTopLeft`). Se aparecerem erros em outros arquivos, anotar e tratar na Task 5 consultando o guia de migração — NÃO silenciar com `any`/`@ts-ignore`.

- [ ] **Step 3: Commit do bump (build ainda vermelho — ok, é a branch v2 de trabalho)**

```bash
git add package.json package-lock.json
git commit -m "chore(v2): upgrade phaser 3.87 -> 4.1"
```

### Task 3: Migrar as máscaras do HUD para o sistema de Filters

**Files:**
- Modify: `game-v2/src/ui/HUD.ts:74-85` (retrato do player) e `game-v2/src/ui/HUD.ts:185-196` (retrato do Wand)

- [ ] **Step 1: Migrar a máscara do retrato do player**

Código atual (v3):

```ts
const playerMaskShape = this.scene.make.graphics()
playerMaskShape.fillStyle(0xffffff)
playerMaskShape.fillRect(43, 42, 185, 185)
const playerMask = playerMaskShape.createGeometryMask()

this.playerPortraitSprite = this.scene.add.sprite(135, 42, 'hud-werdum')
  .setDisplaySize(185, 185)
  .setOrigin(0.5, 0)
  .setDepth(D + 1)
  .setScrollFactor(0)
  .setMask(playerMask)
```

Novo (v4):

```ts
const playerMaskShape = this.scene.make.graphics()
playerMaskShape.fillStyle(0xffffff)
playerMaskShape.fillRect(43, 42, 185, 185)

this.playerPortraitSprite = this.scene.add.sprite(135, 42, 'hud-werdum')
  .setDisplaySize(185, 185)
  .setOrigin(0.5, 0)
  .setDepth(D + 1)
  .setScrollFactor(0)
this.playerPortraitSprite.enableFilters()
this.playerPortraitSprite.filters!.internal.addMask(playerMaskShape)
```

Nota: se `tsc` reclamar que `enableFilters` não existe, o objeto já expõe `filters` direto — remover a linha do `enableFilters()` e manter o `addMask`. Conferir a assinatura real em `node_modules/phaser/types/phaser.d.ts` (buscar `addMask`).

- [ ] **Step 2: Migrar a máscara do retrato do Wand (mesmo padrão)**

```ts
const wandMaskShape = this.scene.make.graphics()
wandMaskShape.fillStyle(0xffffff)
wandMaskShape.fillRect(1692, 42, 185, 185)

this.wandPortraitImg = this.scene.add.image(1784, 42, 'hud-wand')
  .setDisplaySize(185, 185)
  .setOrigin(0.5, 0)
  .setDepth(D + 1)
  .setScrollFactor(0)
this.wandPortraitImg.enableFilters()
this.wandPortraitImg.filters!.internal.addMask(wandMaskShape)
```

- [ ] **Step 3: Type-check do arquivo**

```bash
npx tsc --noEmit 2>&1 | grep HUD
```

Esperado: nenhuma linha (zero erros em HUD.ts).

- [ ] **Step 4: Commit**

```bash
git add src/ui/HUD.ts
git commit -m "fix(v2): migra mascaras do HUD para o sistema de filters do phaser 4"
```

### Task 4: Migrar `tintTopLeft` no Enemy

**Files:**
- Modify: `game-v2/src/entities/Enemy.ts:253-260`

- [ ] **Step 1: Substituir a leitura de tint por canto**

Código atual (v3), dentro de `playHitAnim()`:

```ts
const hadTint = this.isTinted
const prevTint = this.tintTopLeft
this.setTint(0xffffff)
this.scene.time.delayedCall(120, () => {
  if (this.isDead) return
  hadTint ? this.setTint(prevTint) : this.clearTint()
})
```

Novo (v4 — tint único):

```ts
const hadTint = this.isTinted
const prevTint = this.tint
this.setTint(0xffffff)
this.scene.time.delayedCall(120, () => {
  if (this.isDead) return
  hadTint ? this.setTint(prevTint) : this.clearTint()
})
```

Nota: se `isTinted` também tiver sumido no v4, substituir por comparação direta: `const hadTint = this.tint !== 0xffffff` (tint default é branco). Conferir em `phaser.d.ts`.

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit 2>&1 | grep Enemy
git add src/entities/Enemy.ts
git commit -m "fix(v2): migra tintTopLeft para tint unico do phaser 4"
```

Esperado no grep: nenhuma linha.

### Task 5: Zerar o restante dos erros e fechar o build

**Files:** os que o `tsc` apontar (não previsíveis — triagem guiada).

- [ ] **Step 1: Type-check completo**

```bash
npx tsc --noEmit
```

Se houver erros restantes: para cada um, buscar o nome da API no guia de migração (URL no topo deste plano) e aplicar o mapeamento oficial. Regras: mudança mínima, sem `any`, sem `@ts-ignore`, um commit por arquivo/tema corrigido (`fix(v2): migra <api> do phaser 4 em <arquivo>`).

- [ ] **Step 2: Build completo verde**

```bash
npm run build
```

Esperado: `tsc` limpo + `vite build` OK + landing copiada (`build:landing`).

- [ ] **Step 3: Commit final se algo mudou fora dos commits anteriores**

```bash
git status --porcelain   # se houver restos, commitar com mensagem descritiva
```

### Task 6: Smoke test — gameplay idêntico à V1

**Files:** nenhum (verificação manual + checklist).

- [ ] **Step 1: Subir o dev server**

```bash
cd /Users/pro15/Claude/3-contra-todos/game-v2
npm run dev
```

Abre em `http://localhost:3000`. (Porta 3000 já configurada no vite.config — fora do range UniFi.)

- [ ] **Step 2: Checklist de smoke (executar jogando, comparando com a V1 em werdumfight.com/demo)**

- [ ] Title screen: vídeo de fundo rodando, fonte "Press Start 2P" carregada, botões respondem
- [ ] HowToPlay e Select: navegação ok, retratos/sprites corretos
- [ ] GameScene: mover (WASD), soco (J), chute (K), pulo (espaço), bloqueio (L)
- [ ] **HUD: retratos do player e do Wand recortados nos quadrados 185×185** (a migração das máscaras — comparar pixel a pixel com a V1)
- [ ] **Flash branco nos inimigos ao apanhar** (a migração do tint) e partículas de hit aparecendo
- [ ] Barras de vida, dano flutuante, ondas progridem, game over + continue, leaderboard Top 10 carrega (Supabase)
- [ ] Mobile (devtools modo touch): virtual joystick funciona
- [ ] Console do browser: zero erros

- [ ] **Step 3: Registrar resultado**

Qualquer divergência visual/comportamental vs V1 é bug de migração — corrigir antes de seguir (voltar à Task 5, guia de migração em mãos).

### Task 7: Deploy do beta em werdumfight.com/v2

> **CORRIGIDO em 2026-06-10** após investigação do deploy real: `dist/` é gitignored (não versionado).
> O site é servido assim: GitHub Pages serve a **branch `gh-pages`** (jogo na RAIZ da árvore);
> o **Cloudflare** na frente redireciona `werdumfight.com/` → `3contratodos.com` (301) e faz proxy
> de `/demo/` para o Pages. Logo, o beta vai como pasta `v2/` commitada na branch `gh-pages`.

**Files:**
- Modify: `game-v2/package.json` (novo script) + `game-v2/.gitignore`
- Create: pasta `v2/` na branch `gh-pages` (bundle copiado)

- [ ] **Step 1: Adicionar script de build do beta no worktree v2**

Em `game-v2/package.json`, adicionar em `"scripts"`:

```json
"build:beta": "tsc --noEmit && vite build --outDir dist-beta --emptyOutDir"
```

E adicionar `dist-beta/` ao `.gitignore` do worktree:

```bash
echo "dist-beta/" >> .gitignore
git add package.json .gitignore
git commit -m "chore(v2): script build:beta para deploy em /v2"
```

- [ ] **Step 2: Buildar o beta**

```bash
cd /Users/pro15/Claude/3-contra-todos/game-v2
npm run build:beta
ls dist-beta/demo/   # o outDir do vite.config é dist/demo; com --outDir dist-beta vira dist-beta/demo? CONFERIR: se o bundle cair em dist-beta/ direto, usar esse caminho nos passos seguintes
```

O `base: './'` do vite.config faz o bundle funcionar em qualquer subpasta — nada a mudar.

- [ ] **Step 3: Publicar na branch gh-pages (worktree temporário, sem tocar a raiz)**

```bash
cd /Users/pro15/Claude/3-contra-todos/game
git fetch origin gh-pages
git worktree add ../game-ghpages gh-pages
cd ../game-ghpages
git pull origin gh-pages
rm -rf v2 && mkdir v2
cp -R ../game-v2/dist-beta/. v2/    # ajustar subpasta conforme Step 2
git add v2
git commit -m "feat(beta): publica V2 beta (phaser 4) em /v2"
git push origin gh-pages
```

Nota: só ADICIONA a pasta `v2/` — os arquivos do jogo V1 na raiz da gh-pages ficam intocados; reversível com `git revert`.

- [ ] **Step 4: Verificar ao vivo (aguardar ~60s o GitHub Pages + cache Cloudflare)**

```bash
sleep 60 && curl -sI https://werdumfight.com/v2/ | head -3
```

Esperado: `HTTP/2 200`. Risco conhecido: regras do Cloudflare desconhecidas podem interceptar `/v2/` — se vier 301/404, inspecionar as regras no painel Cloudflare (redirect rule da raiz pode ter catch-all). Abrir no browser e repetir o smoke da Task 6 em produção. O `noindex,nofollow` já presente no index.html mantém o beta fora dos buscadores.

- [ ] **Step 5: Remover o worktree temporário**

```bash
cd /Users/pro15/Claude/3-contra-todos/game
git worktree remove ../game-ghpages
```

### Task 8: Builds nativos verdes (compilação, sem submissão)

**Files:** nenhum commit esperado — só verificação. NÃO bumpar versão, NÃO submeter: os apps 1.0.x da V1 estão em revisão nas lojas agora.

- [ ] **Step 1: Sync do Capacitor no worktree v2**

```bash
cd /Users/pro15/Claude/3-contra-todos/game-v2
npm run build && npx cap sync
```

Esperado: `Sync finished` sem erros.

- [ ] **Step 2: Build Android (debug)**

```bash
cd android && ./gradlew assembleDebug && cd ..
```

Esperado: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Build iOS (sem assinar)**

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator build CODE_SIGNING_ALLOWED=NO 2>&1 | tail -3
```

Esperado: `BUILD SUCCEEDED`.

- [ ] **Step 4: Push da branch v2**

```bash
git push -u origin v2
```

### Task 9: Encerramento da fatia

- [ ] **Step 1: Atualizar o status no spec (na main)**

Em `game/docs/superpowers/specs/2026-06-09-evolucao-v2-multiplayer-design.md`, tabela da §6: marcar a Fatia 0 como concluída com a data. Commit: `docs(v2): fatia 0 concluida`.

- [ ] **Step 2: Critério de aceite da Fatia 0 (conferência final)**

- [ ] Worktree `game-v2/` na branch `v2`, pushed no remote
- [ ] Phaser 4.1 com `tsc` + `vite build` verdes
- [ ] Smoke test sem divergência vs V1
- [ ] `https://werdumfight.com/v2/` no ar (HTTP 200, jogável)
- [ ] `gradlew assembleDebug` e `xcodebuild` verdes
- [ ] V1 (`main`, `/demo`, apps em revisão) intocada
