# 3 Contra Todos / Werdum Fight — Relatório executivo de jogabilidade
**Bateria de playtest simulado — 2026-06-21**

> Síntese dos 3 relatórios detalhados: [single-player](01-single-player.md) · [co-op](02-coop.md) · [UX/usabilidade](03-ux-usabilidade.md).

---

## Como isto foi feito (e o caveat que importa)

Não é viável ter agentes "jogando" um beat'em up em tempo real pelo navegador (a latência de cada ação é de segundos; o jogo roda a 60fps). Em vez disso, rodei um **harness headless que dirige o CORE REAL do jogo** (`src/core/` — o mesmo código que o servidor co-op de produção executa, confirmado em `ArenaRoom.tick → updateMulti`), com **5 "personas" de jogador scriptadas** (agressivo, defensivo/turtle, button-masher/novato, cauteloso/kiter, guardião do wand), em **155 partidas** completas (75 single, 60 co-op 2p, 20 co-op 3p), a 20 ticks/s.

**Caveat metodológico (vale para tudo):** os "jogadores" são **bots heurísticos reativos**, não humanos. A policy deles é "bloqueia ameaça iminente → pune o inimigo aberto". Logo:
- ❌ **NÃO leia o win-rate absoluto** (0% single, ~3% co-op) como "o jogo é difícil/injusto". É o teto de um bot reativo decente — um humano hábil vai bem mais longe.
- ✅ **O que é robusto:** sinais **comparativos** (persona×persona, char×char, modo×modo, wave×wave, causa de morte) e os **mecanismos verificados no código**. Toda recomendação está ancorada nisso.

Telemetria crua: `_work/playtest/{runs.json,summary.json,telemetry-summary.md}`.

---

## Os 5 achados que mais importam (convergem nos 3 relatórios)

### 1. 🔴 O verdadeiro "chefe" do jogo é o WAND, não os inimigos — e o jogo não conta isso
**81% das derrotas single (61/75) são por morte do wand**, não do jogador. Inimigos nascem mirando o wand (`waves.ts target:'wand'`), só perseguem o jogador quando apanham, e voltam ao wand após 1,5s. A habilidade real que o jogo testa é **gestão de aggro** — manter os inimigos batendo em VOCÊ (que bloqueia) e não no wand (que não bloqueia). Isso é 100% emergente e nunca é sinalizado nem tutorializado.

### 2. 🔴 Co-op está INVERTIDO: quanto mais gente, pior — e a causa está no código
Wave média **cai** (single 5.0 → 2p 4.6 → 3p 3.35) e a sobrevivência do wand **despenca** (19% → 7% → 5%) apesar de mais defensores. Causa-raiz confirmada: `scaleWaveForPlayers` multiplica os inimigos por nº de jogadores (×2/×3), mas **o HP do wand é fixo em 200** (`multi.ts:98`). O "orçamento de HP do wand por atacante" cai de **67 (solo) → 33 (2p) → 22 (3p)** — defesa ~3× mais frágil em trio. Em co-op 3p, **100% dos game-overs são morte do wand** e **0% dos humanos morrem**: a parte "sobreviver" fica trivial e a parte "defender" fica matematicamente impossível. Para um jogo cujo apelo nas lojas é "joguem juntos", essa é a fricção mais grave.

### 3. 🔴 O loop central (bloquear → contra-atacar) domina tudo, mas nunca é ensinado
Bloquear reduz dano de 10–35 → **1 HP fixo** *e* deixa o inimigo `staggered` para counter (`multi.ts:363-377`). Efeito: a persona **defensiva chega 2,1× mais longe que a agressiva** (wave 8.1 vs 3.8). O button-masher (novato simulado) lava na wave **2.9** e morre pela própria mão (11/15), o oposto dos hábeis. O How-to-Play só **lista "BLOQUEAR" como tecla** — não ensina que bloquear é a chave do jogo. Resultado: o novato cai no buraco mais raso e provavelmente abandona. **Maior gargalo de retenção.**

### 4. 🟡 Parede de dificuldade na wave 4 (o `fat`)
A wave 4 é o pico absoluto de game-overs (41) e o maior tempo de clear. É a 1ª a trazer o **`fat` (130 HP, `KNOCKDOWN_THRESHOLDS.fat = 9999` = imune a derrubada)** — não existe nenhuma ferramenta de crowd-control contra o inimigo que mais ameaça o wand. Destoa da rampa, não é parte de uma curva suave.

### 5. 🟡 HUD/feedback não comunicam o que é crítico
Sem **alerta de estado crítico do wand**, sem **indicador de aggro** (quem está mirando o wand), e o **feedback de bloqueio bem-sucedido é fraco demais** para ensinar por descoberta. Pior: as **barras "SPECIAL" do HUD são decorativas** — prometem um recurso que não existe no código (quebra de expectativa). Pontos fortes: i18n (pt/en/es) e o fluxo de telas/lobby co-op são sólidos.

**Tema transversal:** o jogo tem um **bom sistema de combate escondido atrás de zero onboarding** e um **objetivo (o wand) invisível e mal-escalado**. As correções de maior impacto são de *comunicação* e *balanceamento de um punhado de constantes* — não de reescrita.

---

## Plano de ação priorizado (foco jogabilidade)

> Severidade = impacto em jogabilidade/retenção, não esforço. Valores são pontos de partida — recalibrar com playtest humano.

### 🔴 ALTA — fazer primeiro
1. **Escalar o HP do wand pelo nº de jogadores.** `WAND_HP` fixo → `200 + 120*(humanCount-1)` (2p≈320, 3p≈440). Um único valor em `createMultiInitialState`; **maior impacto, menor custo** para destravar o co-op. Re-rodar o harness depois (baseline novo).
2. **Tutorializar o loop block→counter + tornar o wand visível.** Wave 1 guiada: prompt "BLOQUEIE!" no 1º windup do inimigo (já há ~1s de telegrafia), barra de HP do wand com pulso/alerta quando cercado, indicador de aggro. Ataca os achados #1, #3 e #5 de uma vez.
3. **Suavizar a parede da wave 4.** Adiar o `fat` para a wave 5, **ou** baixar `fat.hp` 130→~100 / `damageToWand` 20→14, **ou** dar ao `fat` um threshold de knockdown finito (ex.: 60) para existir alguma interrupção via combo.
4. **(co-op) Scaling de inimigos sub-linear** se #1 não bastar: `ceil(count*(1+0.6*(playerCount-1)))` em `waveScaling.ts` (3p ≈ ×2.2 em vez de ×3); calibrar junto com #1.

### 🟡 MÉDIA
5. **Dar à agressão um caminho viável** sem matar o turtling: bloqueio passa a ter **chip damage** leve (ex.: `ceil(enemyDmg*0.15)` em vez de 1 HF fixo) ou guarda quebrável após N bloqueios. Defensivo continua forte, mas deixa de ser dominante absoluto.
6. **Aliados IA defenderem o wand** (interceptar inimigos com `target:'wand'`) e/ou baixar seu dano (6→4): hoje causam ~41% do dano mas **diluem a agência** e não salvam o objetivo real.
7. **Resolver o anti-clímax do knockdown:** inimigo derrubado é imune a dano por 1,5s — trocar por dano reduzido (50%) e finalizável, recompensando quem derruba.
8. **(co-op) Recompensar o papel de guardião como mecânica:** wand ganha redução de dano/regeneração lenta com ≥1 humano por perto (em 3p, ter 1 guardião já quase triplica a wave média — hoje é conhecimento tribal não-sinalizado).
9. **Sinalizar perigo do wand** (HUD/áudio quando cercado ou <30% HP) para induzir os jogadores a recuar e defender.

### 🟢 BAIXA / polish
10. **Alargar a faixa vertical de acerto** (`rangeV 40→48`) — reduz whiffs por desalinhamento de Y, melhora o feel.
11. **Identidade de playstyle por char:** dida precisa de um nicho; thor (glass cannon) merece reach 130→140 para não ser punido 2× (dano-alto + reach-curto).
12. **Remover ou implementar as barras "SPECIAL"** do HUD (hoje prometem um recurso inexistente).
13. **`spawnInterval` escalar levemente em co-op** para reduzir saturação simultânea ao redor do wand.

---

## Limitações (honestidade metodológica)
- **Bots, não humanos** — win-rate absoluto não é leitura de dificuldade real; o robusto são os sinais comparativos + mecânica do código (todos os achados ALTA têm confirmação no código, independente do bot).
- **Amostras finas no late-game e em co-op 3p** (n=20) — tratar números de 3p como direcionais.
- **Sem inspeção visual ao vivo** — o relatório de UX é revisão heurística do código das telas, não teste com usuários reais nem screenshots.
- **Recalibrar com playtest humano** antes de aplicar mudanças de balance em produção. O harness (`tests/sim/playtest.sim.test.ts`) fica versionado para re-rodar após cada ajuste e medir o efeito.
