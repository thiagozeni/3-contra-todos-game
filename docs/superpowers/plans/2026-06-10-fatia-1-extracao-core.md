# Fatia 1 — Extração do `core/` (simulação pura) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair a simulação do jogo (estado, combate, IA, ondas, movimento) para `src/core/` — TypeScript puro, zero Phaser — com testes unitários, mantendo o gameplay idêntico (single-player vira "core rodando localmente").

**Architecture:** Estratégia *strangler*: extrair sistema por sistema como funções puras em `core/`, com as classes Phaser delegando para elas a cada passo — o jogo permanece jogável e publicável após CADA task. No final, `core/Simulation.ts` orquestra tudo (`update(state, input, delta) → { state, events }`) e a camada Phaser vira renderização + efeitos dirigidos por eventos.

**Tech Stack:** TypeScript 5, Vitest (novo devDependency), Phaser 4.1 (só na camada client), Vite 5.

**Worktree:** /Users/pro15/Claude/3-contra-todos/game-v2 (branch `v2`)

**Princípios obrigatórios:**
- TDD em todas as funções do core: teste primeiro (RED), implementação (GREEN), refactor.
- `core/` NUNCA importa de `phaser` (nem tipos). Guard de teste verifica isso (Task 1).
- Estado é dado puro (interfaces, sem classes com métodos Phaser). `update` retorna novo estado + eventos (imutabilidade na API; mutação local dentro do tick é aceitável por performance, desde que o chamador nunca veja mutação do estado que passou).
- A cada task: `npx tsc --noEmit` + `npx vitest run` + `npm run build` verdes antes do commit.
- Smoke visual (harness Playwright em `.claude/smoke-v2/smoke.py`) ao final das Tasks 5, 7 e 8.

**Fatos do código atual (auditados — usar como fonte das constantes):**
- Hit detection por distância (GameScene.doAttack, ~linha 416): punch range 80px H × 40px V, 10 dmg, cooldown 150ms; kick 100×40, 16 dmg, 500ms.
- Combo: janela 1800ms; multiplicador 1.5× com ≥3 hits, 2× com ≥5.
- Player STATS: werdum/dida/thor — speed 180–200, maxHp 190–200, punchReach/kickReach 130–170.
- Enemy AI states: approach | waitBeforeAttack | chasePlayer | knockdown | recover | staggered | dead. Chega a 60px do Wand / 120px do player; waitTimer 1000ms; attack cooldowns 900–1500ms; knockdown 800ms (boss) / 1500ms; stagger 400–650ms; boss_coco fase 2 a HP<100 (+40% speed).
- Ally: ataca a <75px, 6 dmg, cooldown 900ms; knockdown 2500ms.
- Wand (ProtectedChar): hp/maxHp 200; derrota se ≤0.
- 12 WAVES hardcoded; spawn intervals 1800→900ms; +15% HP do player por wave (exceto a 1ª); fim de wave = fila vazia + 0 inimigos; 3000ms entre waves.
- Y-damping de movimento: 0.6× (player), 0.7× (enemy/ally).
- RING: bounds com leftAt(y)/rightAt(y) por interpolação linear.
- Eventos Phaser usados pela lógica: 'enemyAttackWand', 'enemyAttackPlayer' (Enemy emite, GameScene aplica dano) — substituir por fila de eventos do sim.
- RNG: Math.random/Phaser.Math.Between/Shuffle sem seed — substituir por RNG seedado no estado.

---

### Task 1: Infra de testes (Vitest) + guard anti-Phaser no core

**Files:**
- Modify: `package.json` (devDependency vitest + script "test")
- Create: `vitest.config.ts`
- Create: `src/core/README.md` (regra do diretório)
- Test: `tests/core/no-phaser-imports.test.ts`

- [ ] **Step 1:** `npm install -D vitest`
- [ ] **Step 2:** Criar `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
```

Adicionar em package.json scripts: `"test": "vitest run"`.

- [ ] **Step 3 (RED):** teste que varre `src/core/**/*.ts` e falha se algum arquivo contiver `from 'phaser'` ou `import Phaser`:

```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
  })
}

describe('core/ é Phaser-free', () => {
  it('nenhum arquivo de src/core importa phaser', () => {
    const files = walk('src/core')
    expect(files.length).toBeGreaterThan(0) // core existe e tem arquivos
    for (const f of files) {
      const src = readFileSync(f, 'utf-8')
      expect(src, `${f} importa phaser`).not.toMatch(/from ['"]phaser['"]|import Phaser/)
    }
  })
})
```

- [ ] **Step 4:** Rodar `npx vitest run` → deve FALHAR ("core existe e tem arquivos" — src/core ainda não existe). Criar `src/core/README.md` com a regra ("Simulação pura. Proibido importar phaser. Roda no servidor e em testes.") e um `src/core/index.ts` vazio exportando nada ainda → re-rodar → PASS.
- [ ] **Step 5:** Commit: `chore(v2): vitest + guard anti-phaser em src/core`

### Task 2: `core/config` — constantes extraídas (RING, WAVES, STATS, scores, tuning)

**Files:**
- Create: `src/core/config/ring.ts`, `src/core/config/waves.ts`, `src/core/config/stats.ts`, `src/core/config/combat.ts`
- Modify: `src/scenes/GameScene.ts`, `src/entities/Player.ts`, `src/entities/Enemy.ts`, `src/entities/Ally.ts`, `src/entities/ProtectedChar.ts` (importar do core, deletar duplicatas locais)
- Test: `tests/core/config.test.ts`

- [ ] **Step 1 (RED):** testes das constantes e helpers de RING (valores exatos copiados do código atual — ler GameScene.ts:17–44, Player.ts:10–14, Enemy.ts:7–26, Ally.ts:10–14 antes de escrever): leftAt/rightAt interpolam corretamente nos extremos; WAVES tem 12 entradas; waves 8/10/12 têm isBoss; STATS de player têm os 3 personagens.
- [ ] **Step 2 (GREEN):** mover (não copiar) as constantes para `core/config/*`. Substituir `Phaser.Math.Linear/Clamp` por helpers puros locais (`lerp`, `clamp`) em `core/config/ring.ts`.
- [ ] **Step 3:** atualizar todos os imports nas classes Phaser; deletar as definições antigas. `grep -rn "WAVES\|STATS\|ENEMY_SCORE\|RING" src/ --include="*.ts" | grep -v core/` para confirmar que só há usos, não definições.
- [ ] **Step 4:** tsc + vitest + build verdes. Commit: `refactor(v2): extrai config do jogo para core/config`

### Task 3: `core/types` + RNG seedado + fila de eventos

**Files:**
- Create: `src/core/types.ts` (GameState, PlayerState, EnemyState, AllyState, WandState, MoveInput, SimEvent)
- Create: `src/core/rng.ts` (mulberry32: `createRng(seed) → { next(): number, between(min,max): number, shuffle<T>(arr: T[]): T[] }` — shuffle retorna NOVO array)
- Test: `tests/core/rng.test.ts`

- [ ] **Step 1 (RED):** testes do RNG: mesma seed → mesma sequência; between respeita limites inclusivos; shuffle é determinístico por seed e não muta o array de entrada.
- [ ] **Step 2 (GREEN):** implementar mulberry32 (algoritmo público de 4 linhas).
- [ ] **Step 3:** definir os tipos em `core/types.ts` cobrindo TODO o inventário de estado (ver "Fatos do código atual" + exploração): player {hp, maxHp, x, groundY, facing, state: 'normal'|'knockdown'|'recovering'|'blocking', knockdownTimer, attackCooldown, character}, enemies (id, type, hp, maxHp, x, y, aiState, target, timers, inPhase2, isBoss), ally, wand {hp, maxHp}, wave {current, spawnQueue, spawnTimer, spawnInterval, active, endTimer}, score {value, combo, comboTimer, enemiesDefeated, maxCombo}, gameTimerMs, rngState, status: 'playing'|'gameover'|'victory'.
  SimEvent = união discriminada: {type:'hit', targetId, amount, x, y} | {type:'enemyDied', id, enemyType, x, y} | {type:'playerDamaged', amount} | {type:'wandDamaged', amount} | {type:'playerKnockdown'} | {type:'enemyKnockdown', id} | {type:'enemyStaggered', id} | {type:'waveStarted', wave} | {type:'waveCleared', wave, flawless} | {type:'bossPhase2', id} | {type:'gameOver'} | {type:'victory'} | {type:'comboMilestone', count} | {type:'attackSwung', kind:'punch'|'kick', hit: boolean}.
- [ ] **Step 4:** tsc + vitest verdes. Commit: `feat(v2): core/types, RNG seedado e eventos do sim`

### Task 4: `core/systems/combat.ts` — ataque do player como função pura

**Files:**
- Create: `src/core/systems/combat.ts`
- Modify: `src/scenes/GameScene.ts` (doAttack delega para o core)
- Test: `tests/core/combat.test.ts`

- [ ] **Step 1 (RED):** testes com os valores reais: punch acerta inimigo a 79px H/39px V e erra a 81px H; dano base 10 (punch) / 16 (kick); multiplicador 1× (<3 combo), 1.5× (3–4), 2× (≥5); cooldowns 150/500ms; múltiplos inimigos no alcance levam dano todos; combo incrementa só se acertou alguém; score usa ENEMY_SCORE × multiplicador; inimigo com hp≤0 vira evento enemyDied; knockdown threshold por tipo (fat: nunca; strong/boss: ≥30; weak: ≥18).
- [ ] **Step 2 (GREEN):** `performAttack(state, kind: 'punch'|'kick') → { state, events }` pura, replicando exatamente a lógica de GameScene.doAttack + Enemy.takeDamage (a parte de dados: hp, target switch para player, fase 2 do boss, morte) — SEM partículas/som/anim (são eventos).
- [ ] **Step 3:** GameScene.doAttack passa a: montar snapshot do estado a partir dos objetos atuais, chamar performAttack, aplicar resultado de volta nos sprites e disparar efeitos a partir dos events. (Ponte temporária — desaparece na Task 8.)
- [ ] **Step 4:** tsc + vitest + build + jogar 30s no dev server conferindo soco/chute/dano/combo. Commit: `refactor(v2): combate do player extraído para core/systems/combat`

### Task 5: `core/systems/movement.ts` + `enemyAi.ts` + `ally.ts` — movimento e IA puros

**Files:**
- Create: `src/core/systems/movement.ts` (movePlayer com clamp no RING e damping 0.6; separação/anti-overlap; clamp de todos no ringue)
- Create: `src/core/systems/enemyAi.ts` (stepEnemy: máquina de estados completa → { enemyState', intents } onde intents inclui attackWand/attackPlayer — NUNCA aplica dano direto)
- Create: `src/core/systems/ally.ts` (stepAlly: seek/attack/knockdown → intents de dano)
- Modify: `src/entities/Player.ts`, `src/entities/Enemy.ts`, `src/entities/Ally.ts` (métodos update delegam ao core; classes mantêm só animação/visual)
- Test: `tests/core/movement.test.ts`, `tests/core/enemyAi.test.ts`, `tests/core/ally.test.ts`

- [ ] **Step 1 (RED):** testes-chave: player se move speed×dt e clampa no RING; damping vertical 0.6; enemy em 'approach' muda para 'waitBeforeAttack' a ≤60px do wand e para 'chasePlayer' quando target é player a ≤120px; waitTimer 1000ms expira → intent attackWand + cooldown; takeDamage muda target para player; stagger 400–650ms bloqueia ataque; knockdown expira para recover→approach; boss fase 2 a hp<100 (evento bossPhase2 uma única vez); ally ataca a <75px com 6 dmg/900ms.
- [ ] **Step 2 (GREEN):** implementar como funções puras `(state-slice, ctx, deltaMs) → resultado`. Decisão de timing: TODA transição usa timers em ms (nada de callbacks de animação) — onde hoje a lógica espera animação (ex.: knockdown do player 2000ms), usar o timer fixo equivalente já existente.
- [ ] **Step 3:** classes Phaser delegam: `Enemy.update(delta)` monta o slice, chama stepEnemy, aplica posição/estado ao sprite, converte intents em eventos para o GameScene (ponte temporária mantém o event emitter Phaser até a Task 8).
- [ ] **Step 4:** tsc + vitest + build + **smoke Playwright** (adaptar `.claude/smoke-v2/smoke.py`): inimigos perseguem, atacam o Wand, ally luta. Commit: `refactor(v2): movimento e IA extraídos para core/systems`

### Task 6: `core/systems/waves.ts` — progressão de ondas pura

**Files:**
- Create: `src/core/systems/waves.ts` (startNextWave, stepSpawning, checkWaveEnd — usando o RNG seedado do estado para side/Y/shuffle)
- Modify: `src/scenes/GameScene.ts` (delegação)
- Test: `tests/core/waves.test.ts`

- [ ] **Step 1 (RED):** testes: wave 1 não shufflada? (conferir código: shuffle só em não-boss — replicar exato); spawn decrementa timer e emite spawn quando ≤0; fila vazia + 0 inimigos → waveCleared (flawless se sem dano); +15% HP exceto wave 1 (cap no maxHp); após wave 12 → victory; determinismo: mesma seed → mesma sequência de spawns (tipo, lado, Y).
- [ ] **Step 2 (GREEN):** implementar; spawn retorna evento {type:'enemySpawned', id, enemyType, x, y} (acrescentar ao SimEvent).
- [ ] **Step 3:** GameScene delega spawn/forecast de waves ao core; criação do sprite acontece ao consumir o evento.
- [ ] **Step 4:** tsc + vitest + build. Commit: `refactor(v2): sistema de ondas extraído para core/systems/waves`

### Task 7: `core/Simulation.ts` — orquestrador único

**Files:**
- Create: `src/core/Simulation.ts`: `createInitialState(character: string, seed: number) → GameState` e `update(state, input: MoveInput & {punch, kick}, deltaMs) → { state, events }`
- Test: `tests/core/simulation.test.ts`

- [ ] **Step 1 (RED):** testes de integração do sim SEM Phaser: partida sintética — spawna wave 1, avança update em passos de 16.67ms com input de ataque quando inimigo no alcance, e assertions: inimigos morrem, score sobe, wave 2 começa; wand chega a 0 → gameOver; **teste de determinismo**: duas execuções com mesma seed + mesmo script de inputs → JSON.stringify(state) idêntico após 60s simulados; **teste de performance**: simular 10 minutos de jogo (36.000 ticks) em <2s de wall clock.
- [ ] **Step 2 (GREEN):** compor os sistemas na ordem do GameScene.update atual: timers → input/move player → ally → enemies (com intents→danos centralizados aqui) → spawning → wave end → win/lose. Toda aplicação de dano (enemy→wand, enemy→player com block/stagger do player) acontece AQUI consumindo intents — elimina a necessidade do event bus.
- [ ] **Step 3:** tsc + vitest verdes (build ainda nem usa o Simulation — ok). Commit: `feat(v2): core/Simulation — loop de simulação completo e determinístico`

### Task 8: GameScene vira renderizador do sim

**Files:**
- Modify: `src/scenes/GameScene.ts` (update() → coleta input, chama sim.update, sincroniza sprites com o estado, consome eventos para som/partículas/haptics/HUD/camera)
- Modify: `src/entities/*.ts` (classes viram views: syncFromState(entityState) + animação dirigida por estado/eventos; remover lógica delegada e pontes temporárias)
- Test: smoke Playwright completo + vitest suite

- [ ] **Step 1:** mapear eventos→efeitos: hit→partículas+som+damage number; enemyDied→anim morte+score popup; playerDamaged→flash+haptics; waveCleared→mensagem HUD; bossPhase2→camera shake; gameOver/victory→transições de cena. Tabela explícita no código (um switch único).
- [ ] **Step 2:** reescrever GameScene.update(): `const { state, events } = sim.update(this.simState, input, delta)` + sync de sprites (criar sprite ao ver enemySpawned, destruir ao enemyDied após anim) + processar events. Remover: event bus 'enemyAttack*', lógica de dano nas classes, timers duplicados.
- [ ] **Step 3:** remover código morto das entidades (`grep` por métodos não usados). As classes mantêm APENAS: criação de anims, play por estado, posicionamento, flipX, HP bar.
- [ ] **Step 4:** tsc + vitest + build + **smoke Playwright completo** comparando contra a V1 como na Fatia 0 (fluxo, HUD, combate, wave progression, game over e continue).
- [ ] **Step 5:** Commit: `refactor(v2): GameScene renderiza o core/Simulation — fatia 1 completa`

### Task 9: Encerramento

- [ ] **Step 1:** `npx vitest run --coverage` (instalar @vitest/coverage-v8 se preciso) — meta: core/ ≥80% lines. Se abaixo, completar testes dos gaps.
- [ ] **Step 2:** atualizar spec (§6: Fatia 1 ✅ com data) e CODEMAP/README do game-v2 se existir.
- [ ] **Step 3:** push da branch v2. Critérios de aceite: core/ Phaser-free (guard test), suite verde, determinismo provado, gameplay idêntico no smoke, build três plataformas não regrediu (`npx cap sync` + gradle/xcodebuild rápidos).
