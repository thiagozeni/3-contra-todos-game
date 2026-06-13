# 3 Contra Todos · Design System — Especificação (Fatia V · Trilha 1)

> Status: **spec aprovado** (calibrado com o Thiago em 13/jun/2026). Define a fundação
> formal do DS antes de continuar a repintura tela-a-tela. Estética e fontes já estavam
> aprovadas (direção B) — esta fase **formaliza o que existe**, não redesenha.
>
> Preview de calibração da fundação: `docs/fatia-v/mockups/ds-foundation.html` / `.png`.

---

## 1. Contexto e escopo

A Trilha 1 evoluiu tela-a-tela (HUD → Select → Lobby), com `src/ui/theme.ts` crescendo
*ad-hoc* a partir das necessidades de cada tela. Resultado: tokens parciais e componentes
(`AngledBar`, `makeAngledPortrait`) nascidos do HUD, mas **sem um Design System de verdade** —
faltam escala tipográfica, escala de espaçamento, naming/IDs semânticos, inventário de
componentes e regras de consumo.

**Diagnóstico (scan de `src/scenes` + `src/ui`, jun/2026):**
- ~90 cores distintas (8 dourados brigando, 9 vermelhos, etc.). Só HUD/Select/Lobby migraram.
- 33 tamanhos de fonte (10px→110px), sem progressão.
- Cada `add.text` repete `fontFamily`/`fontSize`/`color`/`stroke` inline.

**Escopo desta fase — FORMALIZAR O QUE EXISTE:**
- Tokens em 3 camadas (primitive → semantic → component) com IDs.
- Escala tipográfica e de espaçamento canônicas.
- Inventário de componentes nomeados, token-driven.
- Este spec + StyleGuideScene (referência viva no Phaser).

**Fora de escopo (fases posteriores):**
- Revisão de UX dos fluxos/telas (vem depois, em cima deste DS).
- Geração de novos assets (Higgsfield), Trilhas 2–5 (personagens, arena, vídeos, loja).
- Troca de estética ou de fontes — **proibido** nesta fase.

**Travas (decididas):**
- Estética: **direção B** (pixel arcade premium, paralelogramo chanfrado).
- Fontes: `Press Start 2P` (display/labels/HUD) + `Pixelify Sans 700` (números de destaque),
  ambas já carregadas via Google Fonts no `index.html`. **Não mudar.**
- Plataforma: canvas/Phaser 4 → tokens vivem como constantes TS (não CSS vars).
- Theming: tema único (sem light/dark — é um jogo).

---

## 2. Arquitetura de código

Módulo `src/ui/ds/` em camadas (regra "muitos arquivos pequenos"):

```
src/ui/ds/
  tokens/
    colors.ts    primitivas + semânticas + de componente (cor)
    type.ts      escala tipográfica (roles → px) + famílias
    space.ts     escala base-4
    shape.ts     skew, strokes, geometria do paralelogramo
  components/
    angledBar.ts      (migra de theme.ts)
    angledPortrait.ts (migra de theme.ts)
    angledPanel.ts    🆕
    menuButton.ts     🆕
    listRow.ts        🆕
    statLine.ts       🆕
    statusBadge.ts    🆕  (extrai do HUD)
    overlay.ts        🆕
    diagDot.ts        (migra: drawDot)
    scanlines.ts      (migra: addScanlines)
  text.ts        dsText() factory
  index.ts       barrel (re-exporta tudo)
```

`src/ui/theme.ts` permanece como **re-export** de `ds/index.ts` para não quebrar os imports
existentes (`import { COLORS, FONT, AngledBar, makeAngledPortrait } from '../ui/theme'`).

**Regra de ouro:** componentes e telas consomem **tokens semânticos**, nunca valores crus.
A cor de um botão é `colors.semantic.text.brand`, não `0xf3c204`.

---

## 3. Tokens

### 3.1 Cor — 3 camadas

**Primitivas** (rampa crua, nomeada por matiz):

| id | hex | id | hex |
|---|---|---|---|
| `gold.hi` | #fff3b0 | `cyan` | #2a93e6 |
| `gold` | #ffd23f | `cyan.hi` | #bfefff |
| `gold.brand` ⭐ | #f3c204 | `p1` | #3b9eff |
| `gold.lo` | #9c6b00 | `p2` | #ff4fd8 |
| `red` | #ff4d4d | `p3` | #52e85c |
| `orange` | #ffaa22 | `white` | #ffffff |
| `green` | #22cc44 | `gray.20` | #cccccc |
| `gray.50` | #888888 | `black` | #000000 |
| `night` | #0d0d1a | `panel` | #1a1a2e |
| `trough` | #0a0e1c | `troughEdge` | #2a3566 |
| `steel` | #8a8a9a | | |

**Semânticas** (por papel — é só nisso que as telas tocam):

```
text.primary    = white       text.secondary = gray.20      text.disabled = gray.50
text.brand      = gold.brand
bg.screen       = night        bg.panel       = panel        bg.overlay    = black @ 0.78
ink             = black
border.default  = black        border.brand   = gold.brand   border.muted  = steel
hp.full         = green        hp.mid         = orange       hp.low        = red
accent.combo    = gold.brand   accent.damage  = cyan         accent.damageHi = cyan.hi
player.1 = p1   player.2 = p2  player.3 = p3
```

**De componente** (tier 3, derivam das semânticas):

```
bar.fill (gold bands)  bar.trough  bar.chip (cyan)  bar.outline (ink)
card.frame.selected = border.brand   card.frame.idle = border.muted   card.back = night
button.primary.bg = gold.brand  button.primary.text = ink
button.ghost.border = border.brand  button.ghost.text = text.brand
panel.fill = bg.panel  panel.border = border.default  panel.filet = border.brand
listRow.highlight = gold.brand @ 0.12   badge.down = red   badge.off = gray.50
```

Consolidações: os 8 dourados → família `gold.*`; os 9 vermelhos → `red`; oranges → `orange`;
greens → `green` (+ `p3` mantido); cyans/blues claros → `cyan`/`cyan.hi`; grays de texto → 3 níveis.

### 3.2 Tipografia

Famílias (inalteradas):
- `display` = `'"Press Start 2P", monospace'` — títulos, labels, HUD, corpo.
- `numeric` = `'"Pixelify Sans", monospace'` — números de destaque (timer, score, combo).

Escala (roles → px @1920×1080) — 9 degraus, cada um absorvendo um cluster real:

| role | px | absorve | uso |
|---|---|---|---|
| `mega` | 110 | 110 | título hero (TOP 10) |
| `title` | 90 | 80, 90 | título de tela (GAME OVER) |
| `display` | 72 | 64, 72 | título de tela (SELECT PLAYER) |
| `h1` | 60 | 56, 60 | cabeçalho de seção forte |
| `h2` | 44 | 40, 42, 44, 50, 52, 54 | cabeçalho de seção |
| `h3` | 32 | 30, 32, 34, 35, 36 | sub-cabeçalho |
| `body` | 26 | 24, 26, 27, 28 | conteúdo |
| `small` | 20 | 18, 20, 22 | label, meta |
| `caption` | 16 | 10, 13, 14, 15, 16 | micro-texto |

`stroke` (sombra/contorno do texto) escala com o role (ex.: `caption`≈3, `body`≈4, `h2`≈6,
`title`≈10, `mega`≈14) — tokenizado, não inline.

### 3.3 Espaçamento — base 4

```
4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96
```
Toda margem/padding/gap usa um destes. Sem 7px/13px ad-hoc.

### 3.4 Forma

```
skew         = 0.287   (~16° — assinatura do shape; deslocamento topo↔base)
stroke.hair  = 2       stroke.bold = 3       stroke.heavy = 6
```
Linguagem: **paralelogramo chanfrado + contorno preto grosso**. Sem `border-radius`
arredondado (anti-pixel). Geometria já implementada em `theme.ts` (`edgeX`, `paraBandPath`,
`fillPara`, `strokePara`, `fillBands`) — migra para `ds/tokens/shape.ts` + `ds/components/`.

---

## 4. `dsText()` — factory de texto

Substitui todo `scene.add.text(..., { fontFamily, fontSize, color, stroke })` espalhado.

```ts
dsText(scene, x, y, 'TOP 10', { role: 'mega', color: 'text.brand', align: 'center' })
// resolve família+px+stroke pelo role e a cor pelo token semântico
```

Assinatura (proposta):
```ts
function dsText(
  scene: Phaser.Scene,
  x: number, y: number, text: string,
  o: { role: TypeRole; color?: SemanticColorId; family?: 'display' | 'numeric';
       align?: 'left' | 'center' | 'right'; origin?: [number, number] }
): Phaser.GameObjects.Text
```
- `family` default = `display`; passar `numeric` para números de destaque.
- `color` default = `text.primary`.
- Aplica `stroke` do role automaticamente.

**Regra dura:** nenhuma tela escreve `fontSize`/`fontFamily`/hex de novo. Lint social: se
aparecer `add.text` com estilo inline numa tela migrada, é bug de DS.

---

## 5. Inventário de componentes

Todo componente: **anatomia · estados · variantes · tokens**. Os 4 marcados ✅ existem e só
migram para o tier de tokens; os 🆕 extraem o que hoje está inline.

| Componente | Anatomia | Estados | Variantes | Tokens-chave |
|---|---|---|---|---|
| `AngledBar` ✅ | trough + fill em bandas + chip de dano + outline | ratio 0..1 | anchor L/R; cor por HP | `bar.*`, `hp.*` |
| `AngledPortrait` ✅ | back + foto mascarada (filtro) + frame (outline+filet) | selected/idle/muted | size/zoom | `card.frame.*`, `card.back` |
| `DiagDot` ✅ | paralelogramo pequeno | on/off | tamanho | `accent.combo`, `ink` |
| `Scanlines` ✅ | linhas CRT sobre região | — | densidade | `ink @ α` |
| `AngledPanel` 🆕 | fundo + outline preto + filet dourado | — | `filled`(night/panel) / `outline`; frame color | `panel.*` |
| `MenuButton` 🆕 | painel + label (dsText) + hit area | idle/hover/pressed/disabled | `primary`(gold bg) / `ghost`(outline) / `link`(< VOLTAR) | `button.*` |
| `StatusBadge` 🆕 | chip + label | — | `down` / `off` | `badge.*` |
| `ListRow` 🆕 | faixa + colunas (rank/nome/personagem/cont/tempo/score) | normal / `highlight` | — | `listRow.highlight`, `text.*` |
| `StatLine` 🆕 | label (display) + valor (numeric) | — | — | `text.secondary`, `accent.combo` |
| `Overlay` 🆕 | scrim full-screen + `AngledPanel` central + título + corpo | — | `defeat` / `reconnect` | `bg.overlay`, `panel.*` |

`Overlay` compõe `AngledPanel` + `dsText`. `MenuButton` compõe `AngledPanel` + `dsText` + hit area.
Composição > duplicação.

---

## 6. StyleGuideScene — referência viva

Cena `StyleGuideScene` (key própria), **escondida** do fluxo normal:
- **Acesso:** tecla `~` (backquote) em dev, ou `?style=1` na URL / flag no registry.
- **Paginação:** tela única 1920×1080 sem scroll → páginas trocáveis por tecla (←/→).
  - **Página 1:** swatches (3 camadas) + escala tipográfica (9 roles + numeric) + espaçamento.
  - **Página 2:** galeria de componentes em todos os estados (bar full/mid/low; card
    selected/idle/muted; MenuButton idle/hover/pressed/disabled; AngledPanel filled/outline;
    ListRow normal/highlight; StatLine; StatusBadge down/off; Overlay).

**Usos:** (1) calibração no motor real; (2) regressão visual (Playwright captura a cada
mudança — novo script `scripts/_styleguide-shot.mjs`); (3) ferramenta de dev permanente.

---

## 7. Ordem de implementação

1. `ds/tokens/` (colors, type, space, shape) + `dsText()`; `theme.ts` re-exporta. **Critério de aceite: tsc limpo + 652 testes intactos** (nada de comportamento muda). Baseline verificado em 13/jun/2026: `tsc --noEmit` exit 0; `vitest run` → 652 passed / 35 files.
2. Migrar os 4 componentes existentes (`AngledBar`, `AngledPortrait`, `DiagDot`, `Scanlines`) para o tier de tokens.
3. Criar os 🆕: `AngledPanel` → `MenuButton` → `ListRow`/`StatLine`/`StatusBadge`/`Overlay`.
4. `StyleGuideScene` + script de captura. **Calibrar com o Thiago aqui.**
5. Migrar telas, uma a uma, validando rodando (loop de screenshot): refino do Select,
   TopTen, HowToPlay, FB12, e as já-feitas (Title/YouWin/GameOver/HUD/Lobby) para consumir
   os tokens novos e os componentes 🆕.

Cada etapa mantém `tsc` + testes verdes; telas migradas validadas via captura antes de commit.

---

## 8. Riscos e mitigação

- **Máscara de retrato (Phaser 4):** usar o sistema de filtros (`enableFilters` +
  `filters.external.addMask`), **não** `setMask`; não colocar sprite mascarado dentro de
  `Container`. (Já documentado; manter na migração de `AngledPortrait`.)
- **`theme.ts` re-export:** garantir que todos os símbolos atuais (`COLORS`, `CSS`, `FONT`,
  `SKEW`, `AngledBar`, `makeAngledPortrait`, `drawDot`, `addScanlines`, `fillPara`,
  `strokePara`) continuem exportados, senão quebra import.
- **Tamanhos em px @1920:** a escala assume o canvas base; componentes recebem px resolvido
  do role, não recalculam por conta própria.
```
