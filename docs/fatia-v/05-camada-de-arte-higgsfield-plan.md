# Camada de arte premium (Higgsfield) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Natureza deste plano:** trabalho generativo com gate humano. Diferente de um plano TDD puro, as tarefas de geração têm como "teste" a **aprovação do usuário rodando no jogo**. As tarefas de código (camada de fundo responsiva) têm verificação real (tsc + screenshot). Não fabricar testes de imagem; o gate é a validação visual.

**Goal:** Elevar o teto visual do jogo realçando cada arena/fundo para uma versão premium via Higgsfield, no lugar (image-to-image), começando pela calibração de `game-bg.png` e estabelecendo um pipeline repetível.

**Architecture:** Cada asset é regenerado mantendo a essência, com troca de patrocinador SPATEN→Cachorradas e outpaint para enquadramento responsivo. Assets são trocados sobrescrevendo o PNG no mesmo caminho (carregados por chave no `BootScene`, sem mudança de código). O letterbox é eliminado por uma camada full-bleed atrás do canvas transparente em `#game-wrap`.

**Tech Stack:** Phaser (Scale.FIT 1920×1080), Vite/TS, MCP Higgsfield (`generate_image`, `upscale_image`, `reframe`/`outpaint_image`, `generate_video`), Playwright (screenshots de verificação).

---

## Referência de arquivos

- **Assets origem:** `public/imgs/cenario/*.png` (carregados em `src/scenes/BootScene.ts:34-42`)
- **Asset de calibração:** `public/imgs/cenario/game-bg.png` (chave `game-bg`, usado em `GameScene.ts:179`)
- **Logo real:** `public/imgs/cachorradas-logo.png` (cabeça de cão + raio, com alpha)
- **Backups + stills gerados:** `docs/fatia-v/art/` (criar)
- **Camada de fundo responsiva:** `index.html` (`#game-wrap`) + `src/main.ts`
- **Cordas frontais (alpha):** `GameScene.ts:225` (`game-cordas`)

---

## Fase 0 — Preparação

### Task 0: Backup e working dir

**Files:**
- Create: `docs/fatia-v/art/` (pasta)
- Create: `docs/fatia-v/art/_originais/game-bg.png` (backup)

- [ ] **Step 1: Criar working dir e backup do asset de calibração**

```bash
cd /Users/pro15/Claude/3-contra-todos/game-v2
mkdir -p docs/fatia-v/art/_originais
cp public/imgs/cenario/game-bg.png docs/fatia-v/art/_originais/game-bg.png
ls -la docs/fatia-v/art/_originais/
```
Expected: `game-bg.png` copiado.

- [ ] **Step 2: Baseline — screenshot da arena atual rodando no jogo**

```bash
npm run dev   # em background; servir em localhost
node scripts/_styleguide-shot.mjs 2>/dev/null || echo "usar script de screenshot existente ou Playwright direto"
```
Objetivo: ter o frame atual de `game-bg` no jogo como ponto de comparação ("antes"). Salvar em `docs/fatia-v/art/game-bg-antes.png`.

- [ ] **Step 3: Commit do baseline**

```bash
git add docs/fatia-v/art/
git commit -m "chore(v2): backup e baseline de game-bg p/ camada de arte (Fatia V)"
```

---

## Fase 1 — Calibração de `game-bg.png`

> Gerar UM concept, aprovar, e só então escalar. Consultar a skill `higgsfield-prompts` na hora da geração para seleção de modelo e estrutura de prompt.

### Task 1: Concept de enhance premium (sem mexer no patrocinador ainda)

**Files:**
- Create: `docs/fatia-v/art/game-bg-v1.png` (concept gerado)

- [ ] **Step 1: Importar a original como referência no Higgsfield**

Tool: `media_import_url` ou `media_upload_widget` com `public/imgs/cenario/game-bg.png`. Guardar o `media_id` retornado.

- [ ] **Step 2: Gerar o concept (image-to-image, força moderada)**

Tool: `generate_image` com modelo de edição (recomendado: **Nano Banana** ou **GPT Image** edit — preserva composição da referência). Prompt de direção:
> "Versão premium e cinematográfica deste ringue de boxe: mesma composição, mesma plateia, mesma paleta verde, mesmo enquadramento. Iluminação volumétrica, maior profundidade e detalhe, resolução alta. Manter a estética de jogo arcade. NÃO alterar a posição do ringue nem do público."

Aspect ratio: 16:9. Passar a referência via `medias[]` com o `media_id` do Step 1.

- [ ] **Step 3: Revelar e mostrar ao usuário**

Tool: `reveal_generation` / `job_display`. Baixar o resultado para `docs/fatia-v/art/game-bg-v1.png`.

- [ ] **Step 4: GATE — aprovação do usuário (essência preservada + mais premium?)**

Mostrar v1 lado a lado com o original (`docs/fatia-v/art/_originais/game-bg.png`). Perguntar se a essência foi mantida e o salto de qualidade é o esperado.
- Se NÃO: iterar o prompt (ajustar força/direção) e voltar ao Step 2. Não prosseguir sem "ok".
- Se SIM: seguir para Task 2.

### Task 2: Troca de patrocinador SPATEN → Cachorradas

**Files:**
- Create: `docs/fatia-v/art/game-bg-v2-logo.png`

- [ ] **Step 1: Importar o logo Cachorradas como referência**

Tool: `media_import_url`/upload com `public/imgs/cachorradas-logo.png`. Guardar `media_id`.

- [ ] **Step 2: Editar o concept aprovado trocando o patrocinador**

Tool: edição de imagem (`generate_image` modo edit / inpaint) sobre o `game-bg-v1` aprovado. O SPATEN aparece em 3 pontos: letreiro grande no tatame ("SHATEN"), faixas nas cordas, logo circular central. Direção:
> "Substituir toda a marca de patrocinador 'SPATEN'/'SHATEN' pela marca Cachorradas Estúdios (cabeça de cão estilizada com raio). Aplicar no letreiro do tatame, nas faixas das cordas e no logo central. Manter o resto da arena idêntico."

- [ ] **Step 3: Baixar para `docs/fatia-v/art/game-bg-v2-logo.png` e avaliar nitidez**

Verificar se o logo/letreiro saiu legível e nítido.
- Se a nitidez NÃO aguentar (texto borrado): **fallback** — gerar a arena LIMPA (sem patrocinador) e compor o logo Cachorradas como **layer Phaser separado** sobre a arena (decisão registrada no spec §"Pipeline" passo 2). Anotar essa escolha.

- [ ] **Step 4: GATE — aprovação do usuário da troca de marca**

Mostrar. Se NÃO aprovado, iterar. Não prosseguir sem "ok".

### Task 3: Outpaint para enquadramento responsivo

**Files:**
- Create: `docs/fatia-v/art/game-bg-master-wide.png` (master estendido)

- [ ] **Step 1: Outpaint generoso do concept aprovado**

Tool: `outpaint_image`/`reframe` sobre `game-bg-v2-logo`. Estender lateral e verticalmente (alvo ~21:9 de largura e margem vertical) para cobrir a área de letterbox em portrait e ultrawide, **mantendo o ringue centralizado** na região 16:9 original.

- [ ] **Step 2: Upscale para resolução final**

Tool: `upscale_image`. Alvo: ≥ 2560px na maior dimensão (o canvas in-game usa 1920×1080; o master estendido é maior). Baixar para `docs/fatia-v/art/game-bg-master-wide.png`.

- [ ] **Step 3: Derivar o crop 16:9 do canvas a partir do master**

Recortar a região central 16:9 do master (a que vai virar `game-bg.png` in-canvas) para `docs/fatia-v/art/game-bg-final-16x9.png`, garantindo alinhamento com o full-bleed atrás.

```bash
# Exemplo (ajustar offsets ao master real):
sips -c 1080 1920 docs/fatia-v/art/game-bg-master-wide.png --out docs/fatia-v/art/game-bg-final-16x9.png
```

### Task 4: Integração no jogo + camada full-bleed (mata o letterbox)

**Files:**
- Modify: `public/imgs/cenario/game-bg.png` (sobrescrever com o crop 16:9 aprovado)
- Create: `public/imgs/cenario/game-bg-bleed.png` (master estendido para o fundo)
- Modify: `index.html` (`#game-wrap` — camada full-bleed atrás do canvas)

- [ ] **Step 1: Instalar os assets**

```bash
cp docs/fatia-v/art/game-bg-final-16x9.png public/imgs/cenario/game-bg.png
cp docs/fatia-v/art/game-bg-master-wide.png public/imgs/cenario/game-bg-bleed.png
```

- [ ] **Step 2: Adicionar a camada full-bleed atrás do canvas no `index.html`**

Dentro de `#game-wrap`, antes do canvas do Phaser, inserir um elemento de fundo cobrindo o viewport (object-fit: cover), exibindo `game-bg-bleed.png`. Visível só na arena (não nas outras cenas) — controlar via classe togglada por evento de cena, OU manter genérico e neutro. CSS:

```css
#arena-bleed {
  position: fixed; inset: 0; z-index: -1;
  width: 100vw; height: 100vh;
  background: #000 center/cover no-repeat;
  opacity: 0; transition: opacity .3s;
}
#arena-bleed.show { opacity: 1; }
```
```html
<div id="arena-bleed" style="background-image:url('imgs/cenario/game-bg-bleed.png')"></div>
```

- [ ] **Step 3: Togglar a camada bleed ao entrar/sair do GameScene**

Em `GameScene.ts` (create) adicionar `document.getElementById('arena-bleed')?.classList.add('show')`; no SHUTDOWN, remover a classe. Garantir que só aparece no gameplay.

- [ ] **Step 4: tsc + lint**

```bash
npm run build   # tsc && vite build — deve passar verde
```
Expected: 0 erros.

- [ ] **Step 5: Screenshot em 3 aspect ratios (PC 16:9, tablet 4:3, mobile 9:16)**

Rodar o jogo e capturar o GameScene em três viewports via Playwright. Salvar em `docs/fatia-v/art/game-bg-ingame-{16x9,4x3,9x16}.png`. Verificar: arena premium no centro, **sem barra preta** (bleed cobrindo), ringue alinhado.

- [ ] **Step 6: GATE — aprovação do usuário rodando no jogo**

Mostrar os 3 screenshots. Validar premium + troca de marca + zero letterbox. Iterar se necessário (alinhamento do bleed é empírico). Não commitar sem "ok".

- [ ] **Step 7: Commit**

```bash
git add public/imgs/cenario/game-bg.png public/imgs/cenario/game-bg-bleed.png index.html src/scenes/GameScene.ts docs/fatia-v/art/
git commit -m "feat(v2): arena game-bg premium via Higgsfield + camada full-bleed responsiva (Fatia V)"
```

---

## Fase 2 — Escalar para as demais arenas (procedimento repetível)

> Só iniciar após a Fase 1 aprovada. Para cada asset abaixo, repetir o pipeline calibrado (Tasks 1→4), reaproveitando os prompts/parâmetros que funcionaram no `game-bg`. UM concept por vez, gate de aprovação por asset.

Ordem por impacto:
1. `select-player-bg.png` (chave `select-player-bg`) — sem troca de patrocinador.
2. `intro-bg.png` (chave `intro-bg`) — sem troca de patrocinador.
3. `bg-ringue.png` (chave `game-bg-ringue`) — overlay do ringue; alinhar com `game-bg`.
4. `real.png` (chave `arena`, só 1368×768) — prioridade de upscale.
5. `sem-crowd.png`, `cachorradas.png` — avaliar unificação de estilo com `game-bg`.

Para cada: backup em `docs/fatia-v/art/_originais/`, gerar, aprovar no jogo, sobrescrever PNG, commit individual.

---

## Fase 3 — Assets com alpha + vídeos (posterior)

> Só após todas as arenas opacas aprovadas.

- **Cordas** (`cenario-cordas.png`, `game-cordas.png`): enhance + `remove_background` para restaurar alpha; verificar que continuam corretas como overlay frontal (`GameScene.ts:225`).
- **Key art** (`logo-novo.png`, `logo.png`): tratar à parte, preservando transparência.
- **Vídeos** (`br-ringue.mp4`, `intro.mp4`): só após o still da arena correspondente aprovado, gerar loop via `generate_video` (image-to-video) a partir do still aprovado. Substituir o `.mp4` mantendo o mesmo caminho.

---

## Self-review (cobertura do spec)

- Enhance premium image-to-image → Task 1 ✓
- Troca SPATEN→Cachorradas com logo real → Task 2 ✓ (com fallback layer separado)
- Enquadramento responsivo / mata letterbox → Tasks 3 + 4 ✓
- Gate de aprovação antes de vídeo → Gates nas Tasks 1,2,4 + Fase 3 ✓
- Sprites/personagens fora de escopo → não há task que os toque ✓
- Calibração UM-concept-por-vez → Fase 1 isolada antes da Fase 2 ✓
- Ordem de execução (game-bg → arenas → alpha → vídeos) → Fases 1/2/3 ✓
- Personagens permanecem pixel → preservados (sem task de sprite) ✓
