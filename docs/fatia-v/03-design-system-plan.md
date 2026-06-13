# Design System Implementation Plan (Fatia V · Trilha 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formalizar a fundação do Design System do jogo (tokens em 3 camadas, escala tipográfica/espaçamento, `dsText()`, inventário de componentes) e uma StyleGuideScene viva, sem mudar estética nem comportamento.

**Architecture:** Módulo `src/ui/ds/` em camadas — `tokens/` (Phaser-free, unit-testável) + `text.ts` (resolver puro + wrapper) + `components/` (Phaser). `src/ui/theme.ts` vira re-export para não quebrar imports. Fases 1–2 são **aditivas** (nada quebra); Fase 3 migra as telas, uma a uma, validando por screenshot.

**Tech Stack:** TypeScript, Phaser 4 (WebGL), Vitest (node env, `tests/**/*.test.ts`), Playwright (captura de tela), Vite.

**Spec:** `docs/fatia-v/02-design-system-spec.md`. **Baseline (13/jun/2026):** `tsc --noEmit` exit 0; `vitest run` → 652 passed / 35 files.

## Testing strategy (lê a base do projeto)

O projeto já separa: **lógica pura → unit test** (ex.: `coopSummary.ts` + `tests/ui/coopSummary.test.ts`), **render Phaser → validação visual** (screenshots E2E). Este plano segue isso:
- **Fase 1** (tokens, math de geometria, resolver de estilo) é Phaser-free → **TDD real** com Vitest.
- **Fase 2** (componentes Phaser) é validada pela **StyleGuideScene + screenshot** (regressão visual), não por unit test falso de GameObject.
- **Fase 3** (telas) é calibrada **rodando no jogo** (loop de screenshot), commit só após OK do Thiago.

Regra de runtime: módulos em `ds/tokens/` e `ds/text.ts` **não podem** ter `import` de valor de `'phaser'`. Para tipos, usar `import type Phaser from 'phaser'` (apagado em runtime).

---

# FASE 1 — Fundação testável (aditiva, TDD)

### Task 1: Tokens de cor (`ds/tokens/colors.ts`)

**Files:**
- Create: `src/ui/ds/tokens/colors.ts`
- Test: `tests/ui/ds/colors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/ds/colors.test.ts
import { describe, it, expect } from 'vitest'
import { primitive, semantic, hex, overlayAlpha } from '../../../src/ui/ds/tokens/colors'

describe('color tokens', () => {
  it('brand gold primitive is #f3c204', () => {
    expect(primitive.goldBrand).toBe(0xf3c204)
  })
  it('semantic text.brand maps to brand gold', () => {
    expect(semantic.textBrand).toBe(primitive.goldBrand)
  })
  it('semantic hp colors map to state primitives', () => {
    expect(semantic.hpFull).toBe(primitive.green)
    expect(semantic.hpMid).toBe(primitive.orange)
    expect(semantic.hpLow).toBe(primitive.red)
  })
  it('hex() formats a 6-digit css string with leading zeros', () => {
    expect(hex(0xf3c204)).toBe('#f3c204')
    expect(hex(0x000000)).toBe('#000000')
    expect(hex(0x00ff00)).toBe('#00ff00')
  })
  it('overlay alpha is 0.78', () => {
    expect(overlayAlpha).toBe(0.78)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/ds/colors.test.ts`
Expected: FAIL — "Cannot find module '../../../src/ui/ds/tokens/colors'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ui/ds/tokens/colors.ts
/** Color tokens — Phaser-free (unit-testable). Primitives are numeric (0xRRGGBB)
 *  for Phaser Graphics; hex() converts to '#rrggbb' for Phaser Text. */

/** Tier 1 — raw ramp, named by hue. */
export const primitive = {
  goldHi: 0xfff3b0, gold: 0xffd23f, goldBrand: 0xf3c204, goldLo: 0x9c6b00,
  red: 0xff4d4d, orange: 0xffaa22, green: 0x22cc44, cyan: 0x2a93e6, cyanHi: 0xbfefff,
  p1: 0x3b9eff, p2: 0xff4fd8, p3: 0x52e85c,
  white: 0xffffff, gray20: 0xcccccc, gray50: 0x888888, black: 0x000000,
  night: 0x0d0d1a, panel: 0x1a1a2e, trough: 0x0a0e1c, troughEdge: 0x2a3566, steel: 0x8a8a9a,
} as const

/** Tier 2 — semantic, by role. Screens consume ONLY this tier. */
export const semantic = {
  textPrimary: primitive.white, textSecondary: primitive.gray20, textDisabled: primitive.gray50,
  textBrand: primitive.goldBrand,
  bgScreen: primitive.night, bgPanel: primitive.panel, ink: primitive.black,
  borderDefault: primitive.black, borderBrand: primitive.goldBrand, borderMuted: primitive.steel,
  hpFull: primitive.green, hpMid: primitive.orange, hpLow: primitive.red,
  accentCombo: primitive.goldBrand, accentDamage: primitive.cyan, accentDamageHi: primitive.cyanHi,
  player1: primitive.p1, player2: primitive.p2, player3: primitive.p3,
} as const

/** bg.overlay = ink @ this alpha. */
export const overlayAlpha = 0.78

export type PrimitiveId = keyof typeof primitive
export type SemanticColorId = keyof typeof semantic

/** Numeric color → '#rrggbb' css string for Phaser Text. */
export function hex(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/ds/colors.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/ds/tokens/colors.ts tests/ui/ds/colors.test.ts
git commit -m "feat(v2): tokens de cor do DS (primitive→semantic+hex) (Fatia V · Trilha 1)"
```

---

### Task 2: Tokens de tipografia (`ds/tokens/type.ts`)

**Files:**
- Create: `src/ui/ds/tokens/type.ts`
- Test: `tests/ui/ds/type.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/ds/type.test.ts
import { describe, it, expect } from 'vitest'
import { TYPE, FAMILY, ROLES } from '../../../src/ui/ds/tokens/type'

describe('type scale', () => {
  it('has 9 roles from mega to caption', () => {
    expect(ROLES).toEqual(['mega','title','display','h1','h2','h3','body','small','caption'])
  })
  it('mega is 110px, body 26px, caption 16px', () => {
    expect(TYPE.mega.px).toBe(110)
    expect(TYPE.body.px).toBe(26)
    expect(TYPE.caption.px).toBe(16)
  })
  it('px is monotonically non-increasing down the scale', () => {
    const px = ROLES.map((r) => TYPE[r].px)
    for (let i = 1; i < px.length; i++) expect(px[i]).toBeLessThan(px[i - 1])
  })
  it('families are the approved web fonts (unchanged)', () => {
    expect(FAMILY.display).toBe('"Press Start 2P", monospace')
    expect(FAMILY.numeric).toBe('"Pixelify Sans", monospace')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/ds/type.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ui/ds/tokens/type.ts
/** Typography tokens — Phaser-free. Fonts unchanged (loaded in index.html). */

export const FAMILY = {
  display: '"Press Start 2P", monospace', // titles, labels, HUD, body
  numeric: '"Pixelify Sans", monospace',  // highlight numbers (timer/score/combo)
} as const
export type FamilyId = keyof typeof FAMILY

export const ROLES = ['mega','title','display','h1','h2','h3','body','small','caption'] as const
export type TypeRole = typeof ROLES[number]

/** role → px (@1920×1080) + text stroke thickness. */
export const TYPE: Record<TypeRole, { px: number; stroke: number }> = {
  mega:    { px: 110, stroke: 14 },
  title:   { px: 90,  stroke: 10 },
  display: { px: 72,  stroke: 8 },
  h1:      { px: 60,  stroke: 7 },
  h2:      { px: 44,  stroke: 6 },
  h3:      { px: 32,  stroke: 5 },
  body:    { px: 26,  stroke: 4 },
  small:   { px: 20,  stroke: 3 },
  caption: { px: 16,  stroke: 3 },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/ds/type.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/ds/tokens/type.ts tests/ui/ds/type.test.ts
git commit -m "feat(v2): escala tipográfica do DS (9 roles) (Fatia V · Trilha 1)"
```

---

### Task 3: Tokens de espaçamento e forma (`ds/tokens/space.ts`, `ds/tokens/shape.ts`)

**Files:**
- Create: `src/ui/ds/tokens/space.ts`, `src/ui/ds/tokens/shape.ts`
- Test: `tests/ui/ds/shape.test.ts`

- [ ] **Step 1: Write the failing test** (geometry math is the bug-prone part — test it)

```ts
// tests/ui/ds/shape.test.ts
import { describe, it, expect } from 'vitest'
import { SPACE } from '../../../src/ui/ds/tokens/space'
import { SKEW, STROKE, edgeX, paraCorners } from '../../../src/ui/ds/tokens/shape'

describe('space scale', () => {
  it('is the base-4 ladder', () => {
    expect(Object.values(SPACE)).toEqual([4,8,12,16,24,32,48,64,96])
  })
})

describe('parallelogram geometry', () => {
  it('skew + strokes match the signature', () => {
    expect(SKEW).toBe(0.287)
    expect(STROKE).toEqual({ hair: 2, bold: 3, heavy: 6 })
  })
  it('edgeX: top edge shifted +skew/2, bottom edge -skew/2', () => {
    // box x=0,h=100,skew=20 → top(y=0)=+10, bottom(y=100)=-10
    expect(edgeX(0, 0, 100, 20, 0)).toBeCloseTo(10)
    expect(edgeX(0, 0, 100, 20, 100)).toBeCloseTo(-10)
    expect(edgeX(0, 0, 100, 20, 50)).toBeCloseTo(0)
  })
  it('paraCorners returns 4 points tracing the full box band', () => {
    const c = paraCorners(0, 0, 200, 100, 20, 0, 1)
    expect(c).toHaveLength(4)
    // TL, TR, BR, BL
    expect(c[0]).toEqual({ x: 10, y: 0 })    // top-left = edgeX(top)
    expect(c[1]).toEqual({ x: 210, y: 0 })   // top-right = top-left + w
    expect(c[2]).toEqual({ x: 190, y: 100 }) // bot-right = edgeX(bot)+w
    expect(c[3]).toEqual({ x: -10, y: 100 }) // bot-left = edgeX(bot)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/ds/shape.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ui/ds/tokens/space.ts
/** Spacing scale — base 4. Phaser-free. Every gap/pad/margin uses one of these. */
export const SPACE = {
  s4: 4, s8: 8, s12: 12, s16: 16, s24: 24, s32: 32, s48: 48, s64: 64, s96: 96,
} as const
export type SpaceId = keyof typeof SPACE
```

```ts
// src/ui/ds/tokens/shape.ts
/** Shape tokens + pure parallelogram math — Phaser-free (testable).
 *  The Graphics-drawing helpers live in ds/components/para.ts. */

/** Horizontal shift between top and bottom edges (≈ tan16·h). */
export const SKEW = 0.287

export const STROKE = { hair: 2, bold: 3, heavy: 6 } as const

/** Left-edge x at absolute y inside a parallelogram of height h:
 *  top (t=0) shifted +skew/2, bottom (t=1) shifted -skew/2. */
export function edgeX(x: number, y: number, h: number, skew: number, atY: number): number {
  const t = (atY - y) / h
  return x + skew / 2 - t * skew
}

export interface Pt { x: number; y: number }

/** Four corners (TL,TR,BR,BL) of a parallelogram sub-band [topFrac..botFrac]. */
export function paraCorners(
  x: number, y: number, w: number, h: number, skew: number,
  topFrac: number, botFrac: number,
): [Pt, Pt, Pt, Pt] {
  const yt = y + h * topFrac
  const yb = y + h * botFrac
  const lt = edgeX(x, y, h, skew, yt)
  const lb = edgeX(x, y, h, skew, yb)
  return [
    { x: lt, y: yt }, { x: lt + w, y: yt },
    { x: lb + w, y: yb }, { x: lb, y: yb },
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/ds/shape.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/ds/tokens/space.ts src/ui/ds/tokens/shape.ts tests/ui/ds/shape.test.ts
git commit -m "feat(v2): tokens de espaço (base-4) + geometria pura do paralelogramo (Fatia V · Trilha 1)"
```

---

### Task 4: Resolver de estilo + `dsText()` (`ds/text.ts`)

**Files:**
- Create: `src/ui/ds/text.ts`
- Test: `tests/ui/ds/text.test.ts`

- [ ] **Step 1: Write the failing test** (only the pure resolver is tested)

```ts
// tests/ui/ds/text.test.ts
import { describe, it, expect } from 'vitest'
import { resolveTextStyle } from '../../../src/ui/ds/text'

describe('resolveTextStyle', () => {
  it('resolves a role to family+size+stroke, default color = text.primary', () => {
    const s = resolveTextStyle({ role: 'mega' })
    expect(s.fontFamily).toBe('"Press Start 2P", monospace')
    expect(s.fontSize).toBe('110px')
    expect(s.color).toBe('#ffffff')
    expect(s.stroke).toBe('#000000')
    expect(s.strokeThickness).toBe(14)
  })
  it('resolves semantic color tokens', () => {
    expect(resolveTextStyle({ role: 'display', color: 'textBrand' }).color).toBe('#f3c204')
  })
  it('uses the numeric family when asked', () => {
    expect(resolveTextStyle({ role: 'h1', family: 'numeric' }).fontFamily)
      .toBe('"Pixelify Sans", monospace')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/ds/text.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** (`import type` keeps it Phaser-free at runtime)

```ts
// src/ui/ds/text.ts
import type Phaser from 'phaser'
import { TYPE, FAMILY, type TypeRole, type FamilyId } from './tokens/type'
import { semantic, hex, type SemanticColorId } from './tokens/colors'

export interface DsTextOpts {
  role: TypeRole
  color?: SemanticColorId
  family?: FamilyId
  align?: 'left' | 'center' | 'right'
  origin?: [number, number]
}

/** Pure — resolves a DS text spec to a Phaser text style object. Unit-tested. */
export function resolveTextStyle(o: DsTextOpts) {
  const t = TYPE[o.role]
  return {
    fontFamily: FAMILY[o.family ?? 'display'],
    fontSize: `${t.px}px`,
    color: hex(semantic[o.color ?? 'textPrimary']),
    stroke: hex(semantic.ink),
    strokeThickness: t.stroke,
    align: o.align ?? 'left',
  }
}

/** Phaser wrapper — the ONLY way screens create text. Validated visually. */
export function dsText(
  scene: Phaser.Scene, x: number, y: number, text: string, o: DsTextOpts,
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, resolveTextStyle(o))
  const [ox, oy] = o.origin ?? [0, 0]
  return t.setOrigin(ox, oy)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/ds/text.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/ds/text.ts tests/ui/ds/text.test.ts
git commit -m "feat(v2): dsText() + resolver de estilo do DS (Fatia V · Trilha 1)"
```

---

### Task 5: Barrel `ds/index.ts` + re-export aditivo em `theme.ts`

**Files:**
- Create: `src/ui/ds/index.ts`
- Modify: `src/ui/theme.ts` (adicionar re-exports; NÃO remover nada ainda)

- [ ] **Step 1: Create the barrel**

```ts
// src/ui/ds/index.ts
export * from './tokens/colors'
export * from './tokens/type'
export * from './tokens/space'
export * from './tokens/shape'
export * from './text'
// component re-exports são adicionados na Fase 2
```

- [ ] **Step 2: Add additive re-export to theme.ts**

No topo de `src/ui/theme.ts`, abaixo do `import Phaser`:

```ts
// Design System (Fatia V) — fundação canônica. theme.ts mantém os símbolos
// legados (COLORS/CSS/FONT/AngledBar/...) e re-exporta os tokens novos do ds/.
// A migração das telas (COLORS→semantic, add.text→dsText) acontece na Fase 3.
export * from './ds'
```

- [ ] **Step 3: Verify nothing broke — full suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` exit 0; `Tests 652+12 passed` (652 baseline + 12 novos: 5 colors, 4 type, 4 shape — ajustar contagem conforme somatório real; nenhum teste antigo quebra).

> Se `tsc` reclamar de conflito de nomes no re-export (ex.: `SKEW` existe em theme.ts E em ds/shape.ts), resolver removendo a definição duplicada de theme.ts e deixando só a do ds/ (são o mesmo valor 0.287). Conferir também `SemanticColorId`/`TypeRole` não colidirem.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ds/index.ts src/ui/theme.ts
git commit -m "feat(v2): barrel ds/ + re-export aditivo no theme (Fatia V · Trilha 1)"
```

---

# FASE 2 — Componentes (Phaser, validados na StyleGuideScene)

> Estes não têm unit test de GameObject. Cada um é exercido pela StyleGuideScene
> (Task 13) e validado por screenshot. Onde houver math pura nova, testar à parte.

### Task 6: Mover geometria de desenho + componentes existentes para `ds/components/`

**Files:**
- Create: `src/ui/ds/components/para.ts` (fillPara/strokePara/fillBands — tracejam `paraCorners`)
- Create: `src/ui/ds/components/angledBar.ts`, `angledPortrait.ts`, `diagDot.ts`, `scanlines.ts`
- Modify: `src/ui/theme.ts` (passa a re-exportar de `ds/components/*` em vez de definir inline)
- Modify: `src/ui/ds/index.ts` (export dos componentes)

- [ ] **Step 1:** Mover `fillPara`/`strokePara`/`fillBands` para `para.ts`, reimplementadas sobre `paraCorners` de `ds/tokens/shape.ts` (em vez do `paraBandPath` interno). Assinaturas idênticas às atuais de theme.ts.
- [ ] **Step 2:** Mover `AngledBar` (classe), `makeAngledPortrait`, `drawDot`, `addScanlines` para os arquivos respectivos em `ds/components/`, trocando `COLORS.*` por `semantic.*`/`primitive.*` equivalentes (mesmos valores). Manter assinaturas públicas idênticas.
- [ ] **Step 3:** `theme.ts` re-exporta esses símbolos de `ds/` (remove as definições inline). Garantir que continuam exportados: `AngledBar`, `AngledBarOpts`, `makeAngledPortrait`, `drawDot`, `addScanlines`, `fillPara`, `strokePara`, `SKEW`, e os legados `COLORS`/`CSS`/`FONT` (estes ficam até a Fase 3).
- [ ] **Step 4: Verify** — `npx tsc --noEmit && npx vitest run` (verde). Depois regressão visual:

```bash
node scripts/_hud-shot.mjs      # HUD inalterado
node scripts/_select-shot.mjs select-after-task6.png
```
Comparar `select-after-task6.png` com `select-current.png` — devem ser **idênticos** (refactor sem mudança visual).

- [ ] **Step 5: Commit**

```bash
git add src/ui/ds/components src/ui/theme.ts src/ui/ds/index.ts
git commit -m "refactor(v2): move componentes do HUD para ds/components (sem mudança visual) (Fatia V · Trilha 1)"
```

---

### Task 7–12: Novos componentes

Cada task segue o mesmo ritmo: **criar arquivo → renderizar na StyleGuideScene (Task 13) → screenshot → ajustar → commit**. Assinaturas (contratos — sem referência indefinida):

- [ ] **Task 7 — `ds/components/angledPanel.ts`**
```ts
export interface AngledPanelOpts {
  x: number; y: number; w: number; h: number
  variant?: 'filled' | 'outline'   // filled = bgPanel; outline = transparente
  frame?: number                   // cor do filete (default semantic.borderBrand)
  skew?: number; depth?: number
}
export function makeAngledPanel(scene: Phaser.Scene, o: AngledPanelOpts): {
  graphics: Phaser.GameObjects.Graphics; setVisible(v: boolean): void; destroy(): void
}
```
Desenho: `fillPara` (se filled, `semantic.bgPanel`) + `strokePara` heavy `semantic.ink` + `strokePara` bold `frame`.

- [ ] **Task 8 — `ds/components/menuButton.ts`**
```ts
export interface MenuButtonOpts {
  x: number; y: number; label: string
  variant?: 'primary' | 'ghost' | 'link'
  role?: TypeRole                  // default 'body'
  onClick: () => void
  w?: number; h?: number; depth?: number
}
export function makeMenuButton(scene: Phaser.Scene, o: MenuButtonOpts): {
  setEnabled(v: boolean): void; setVisible(v: boolean): void; destroy(): void
}
```
Compõe `makeAngledPanel` (primary: filled gold; ghost: outline; link: sem painel) + `dsText` + hit area (`padInteractive` de `utils/iosVideo`). Estados hover/pressed via tint/alpha; disabled via `semantic.textDisabled` + sem input.

- [ ] **Task 9 — `ds/components/listRow.ts`** (item do Top 10)
```ts
export interface ListRowData { rank: string; name: string; character: string;
  continues: string; time: string; score: string }
export interface ListRowOpts { x: number; y: number; w: number;
  cols: number[]; data: ListRowData; highlight?: boolean; depth?: number }
export function makeListRow(scene: Phaser.Scene, o: ListRowOpts): { destroy(): void }
```
`highlight` desenha faixa `listRow.highlight` (gold @0.12) atrás. Score em `dsText(..., {family:'numeric'})`.

- [ ] **Task 10 — `ds/components/statLine.ts`** (You Win)
```ts
export interface StatLineOpts { x: number; y: number; label: string; value: string;
  valueNumeric?: boolean; depth?: number }
export function makeStatLine(scene: Phaser.Scene, o: StatLineOpts): { destroy(): void }
```
Label `dsText` `small`/`textSecondary`; value `dsText` `h2`/`accentCombo` (numeric se `valueNumeric`).

- [ ] **Task 11 — `ds/components/statusBadge.ts`** (extrai do HUD — FB10/11)
```ts
export type BadgeState = 'down' | 'off'
export function makeStatusBadge(scene: Phaser.Scene, x: number, y: number,
  state: BadgeState, depth: number): { setState(s: BadgeState): void; destroy(): void }
```
Localizar o desenho atual do badge em `src/ui/HUD.ts` (lógica DOWN/OFF) e extrair sem mudar aparência; HUD passa a chamar `makeStatusBadge`.

- [ ] **Task 12 — `ds/components/overlay.ts`** (defeat FB12 / reconnect)
```ts
export interface OverlayOpts { title: string; titleColor?: SemanticColorId;
  lines?: { text: string; role?: TypeRole; color?: SemanticColorId; numeric?: boolean }[];
  footer?: string; depth?: number }
export function makeOverlay(scene: Phaser.Scene, o: OverlayOpts): { destroy(): void }
```
Scrim full-screen (`semantic.ink` @ `overlayAlpha`) + `makeAngledPanel` central + `dsText` título + linhas. `GameScene.showCoopDefeatOverlay` passa a montar via `makeOverlay` (texto continua vindo de `coopDefeatSummary`, já testado).

Cada task: `npx tsc --noEmit` verde + screenshot da StyleGuideScene + commit `feat(v2): componente <nome> do DS (Fatia V · Trilha 1)`.

---

### Task 13: StyleGuideScene (referência viva) + script de captura

**Files:**
- Create: `src/scenes/StyleGuideScene.ts`
- Create: `scripts/_styleguide-shot.mjs`
- Modify: registro de cena no game config (localizar onde as scenes são registradas — provavelmente `src/main.ts` ou `src/game.ts`) + gate de acesso

- [ ] **Step 1:** Criar `StyleGuideScene` (key `'StyleGuideScene'`), fundo `semantic.bgScreen`, paginada (`this.page` 1|2, troca por ←/→):
  - **Página 1:** swatches (loop sobre `primitive`/`semantic` com `makeAngledPanel` pequenos + `dsText` caption), escala tipográfica (loop sobre `ROLES` com `dsText`), espaçamento (loop sobre `SPACE`).
  - **Página 2:** galeria — `AngledBar` (full/mid/low via `semantic.hp*`), `makeAngledPortrait` (selected/idle/muted), `makeMenuButton` (primary/ghost/link, e um disabled), `makeAngledPanel` (filled/outline), `makeListRow` (normal/highlight), `makeStatLine`, `makeStatusBadge` (down/off), `makeOverlay` (preview reduzido).
- [ ] **Step 2:** Registrar a cena e o gate: acessível por `?style=1` na URL (ler `window.location.search` no boot) e/ou tecla `~` em dev. Não entra no fluxo normal (Title→Select→Game).
- [ ] **Step 3:** `scripts/_styleguide-shot.mjs` (baseado em `_select-shot.mjs`): inicia `StyleGuideScene`, captura página 1 e 2 → `docs/fatia-v/mockups/styleguide-p1.png` / `-p2.png`, viewport 1920×1080.
- [ ] **Step 4: Verify** — `npx tsc --noEmit` verde; rodar `node scripts/_styleguide-shot.mjs`; **calibrar com o Thiago** (mostrar os 2 PNGs, ajustar antes de seguir).
- [ ] **Step 5: Commit**

```bash
git add src/scenes/StyleGuideScene.ts scripts/_styleguide-shot.mjs src/main.ts
git commit -m "feat(v2): StyleGuideScene — referência viva do DS no Phaser (Fatia V · Trilha 1)"
```

---

# FASE 3 — Migração das telas (calibrada, uma a uma)

> Cada tela: trocar `add.text` por `dsText`, hex cru por `semantic.*`, e montar a partir
> dos componentes do DS. Validar **rodando no jogo** (screenshot), comparar com o estado
> anterior, **commit só após OK do Thiago**. Ordem:

- [ ] **Task 14 — Select** (refino aprovado: painel angulado atrás dos cards, ângulo do KNOCKED OUT, placa no nome) — `node scripts/_select-shot.mjs`.
- [ ] **Task 15 — TopTenScene** (`makeListRow` + `dsText` + `makeMenuButton` no VOLTAR/toggle; score em numeric) — `node scripts/_audit-shots.mjs` (captura TopTenScene).
- [ ] **Task 16 — HowToPlayScene** (`makeAngledPanel` de fundo + chips angulados nas teclas + `dsText`).
- [ ] **Task 17 — FB12 overlay** (`makeOverlay` no `showCoopDefeatOverlay`) — `node scripts/e2e-fb12.mjs` continua verde + screenshot.
- [ ] **Task 18 — Limpeza dos já-feitos** (Title/YouWin/GameOverContinue/HUD/Lobby: trocar `COLORS`/`CSS`/`FONT` legados e `add.text` inline pelos tokens novos + `dsText`). Quando nenhuma tela usar mais `COLORS`/`CSS`/`FONT`, **remover** os aliases legados de `theme.ts`.
- [ ] **Final:** `npx tsc --noEmit && npx vitest run` verde; suite E2E relevante verde; atualizar `docs/fatia-v/02-design-system-spec.md` se algo divergiu na calibração.

---

## Self-review (cobertura do spec)

- Spec §2 arquitetura `ds/` → Tasks 1–6, 13. ✅
- Spec §3.1 cor → Task 1. §3.2 tipo → Task 2. §3.3 espaço → Task 3. §3.4 forma → Task 3 (math) + Task 6 (desenho). ✅
- Spec §4 dsText → Task 4. ✅
- Spec §5 inventário (10 componentes) → Tasks 6 (4 existentes) + 7–12 (6 novos). ✅
- Spec §6 StyleGuideScene → Task 13. ✅
- Spec §7 ordem de implementação → Fases 1→2→3. ✅
- Spec §8 riscos (máscara Phaser 4, re-export, px@1920) → notas nas Tasks 6, 5, 2. ✅
