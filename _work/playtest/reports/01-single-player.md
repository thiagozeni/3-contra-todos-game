# Relatório de Jogabilidade — Single-Player
**Jogo:** 3 Contra Todos / Werdum Fight (beat'em up de arena, Phaser)
**Escopo:** modo single-player (1 jogador + 2 aliados IA, defendendo o "wand", até 12 waves)
**Base:** 75 partidas single da telemetria headless + leitura do core (`src/core/`)
**Data:** 2026-06-21

---

## ⚠️ Leia antes: caveat metodológico (vale para todo o relatório)

A telemetria foi gerada por um **harness HEADLESS que dirige o core REAL do jogo com BOTS heurísticos** (não humanos). A policy do bot é reativa: "bloqueia ameaça iminente → pune o inimigo staggered". São 5 personas (agressivo, defensivo, button-masher, kiter, guardião), `dt=50ms` (20 tps), 75 partidas single.

**Consequência:** o **win-rate ABSOLUTO (0% em single) NÃO prova que o jogo é difícil demais.** Ele reflete a skill de um bot reativo decente — não a de um humano experiente, que lê telegrafias, posiciona melhor e gerencia aggro com intenção. Um humano provavelmente vai bem mais longe que a média dos bots.

**O que É robusto** (e onde ancoro as recomendações): sinais **COMPARATIVOS** — persona vs persona, char vs char, wave vs wave, causa de morte — e os **mecanismos** lidos no código. Toda recomendação abaixo está ancorada em telemetria comparativa **+** linhas de código.

---

## Resumo executivo (achados de maior impacto)

- **O "wand" é o verdadeiro chefe do jogo, não os inimigos.** 61 de 75 game-overs single (**81%**) foram por **morte do wand**, não por morte do jogador. Os inimigos **spawnam mirando o wand por padrão** (`waves.ts:38 target:'wand'`) e só perseguem o jogador depois de apanhar. O jogo, na prática, é um *protect-the-VIP* disfarçado de brawler.
- **O loop premia turtling de forma extrema.** A persona Defensiva (block 70%) chega à **wave 8.13** — mais que o **DOBRO** da Agressiva (**3.80**) e ~2.8× o Button-masher (**2.93**). Bloquear reduz dano de 10–35 → **1 HP fixo** *e* deixa o inimigo staggered para counter (`multi.ts:363-377`). É uma defesa quase sem custo e com upside ofensivo: agressão pura é punida, paciência é recompensada.
- **Guardar o wand correlaciona quase 1:1 com sobreviver.** A persona Guardião (guardWand 90%) termina com wand HP médio mais alto e vai à wave 5.47; a Agressiva e a Kiter (que ignoram o wand) terminam com **wand HP médio = 0** em 100% das corridas. O sinal é inequívoco: a habilidade que o jogo realmente testa é **gestão de aggro**, não combate.
- **Os aliados IA NÃO são figurantes — são protagonistas demais.** Estimo que os aliados causam **~41% de todo o dano a inimigos** em single (6.910 hits de aliado × 6 dmg ≈ 41.460, vs 60.029 do jogador). Em algumas personas passa de **48–55%**. Isso ajuda a sobreviver, mas dilui a agência do jogador.
- **Parede de dificuldade clara na wave 4** (e a rampa 2→4 em geral): 41 game-overs ocorrem na wave 4 — o maior pico de toda a campanha — e a wave 4 tem o maior tempo médio de clear (~25–29 s). A wave 4 introduz o **fat (130 HP, imune a knockdown)**, e o gargalo combina com a pressão crescente sobre o wand.
- **Baixa precisão de ataque do bot (33,8%)** — 8.242 whiffs vs 4.216 acertos. Parte é o bot; mas os reaches/janelas curtas (kick cooldown 500ms, faixa vertical de 40px) sugerem que o jogo **perdoa pouco erro de posicionamento**, o que para um humano novato vira frustração.
- **Inimigo derrubado fica imune a dano** (`combat.ts:124,142`): por design, um knockdown que você causou **trava** esse alvo por 1500ms sem você poder finalizá-lo — anti-clímax e contra-intuitivo num brawler.
- **O jogo não ensina o loop block→counter.** O button-masher (novato simulado) lava cedíssimo (wave 2.93) e morre majoritariamente por morte do PRÓPRIO jogador (11/15), não do wand — o oposto dos jogadores hábeis. Sem tutorial do bloqueio, o novato cai no buraco mais raso.

---

## Achados detalhados (com evidência)

### 1. Curva de dificuldade — a parede é a wave 4, e a "dificuldade" real é o wand

**Histograma de game-over por wave (single + co-op agregado da telemetria):**

| wave | 1 | 2 | 3 | **4** | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| game-overs | 6 | 26 | 34 | **41** | 2 | 9 | 8 | 11 | 6 | 6 | 2 | 2 |

- A massa de mortes está concentrada em **2→4** (101 de 153 game-overs). A wave 4 é o **pico absoluto**.
- A wave 4 é a primeira a trazer o **`fat`**: `hp:130, damageToPlayer:18, damageToWand:20` (`stats.ts:51`) e **`KNOCKDOWN_THRESHOLDS.fat = 9999`** (`combat.ts:36`) — ou seja, **nunca pode ser derrubado**. Ele aguenta ~13 socos (10 dmg) e fica martelando o wand sem ser interrompido.
- Tempo médio de clear sobe monotonicamente até a wave 4 (**~25–29 s**, o maior da campanha) e despenca na wave 5 (~15–19 s, que é só `weak×4 + chair×1`) — confirmando que a wave 4 é um *outlier* de dificuldade, não parte de uma rampa suave.
- A queda brusca de game-overs após a wave 4 é **survivorship bias**: quem passa da wave 4 já provou dominar a gestão de aggro/bloqueio, então sobrevive melhor adiante. Não significa que o late-game seja fácil (só 6 partidas chegaram à wave 10).

**O dado que reenquadra tudo — causa de morte (single, 75 partidas):**

| causa | nº | % |
|---|---|---|
| **wand morreu** | **61** | **81%** |
| jogador(es) caíram | 14 | 19% |
| ambos | 0 | — |

O jogo é vencido/perdido pelo **HP do wand (200)**, não pelo do jogador. Mecanicamente isso é coerente com o core:
- Inimigos **nascem mirando o wand** (`systems/waves.ts:38 target:'wand'`).
- Só trocam para o jogador quando **apanham** (`combat.ts:48 target:'player'`).
- Voltam a mirar o wand após **1500 ms sem apanhar** (`enemyAi.ts:66-67`).
- Cada ataque ao wand tira 12–40 HP (`stats.ts` damageToWand) — **3 a 5 ataques de fat/boss derrubam o wand inteiro.**

→ A skill real do jogo é **revezar aggro**: manter inimigos batendo em VOCÊ (que pode bloquear → 1 HP) em vez do wand (que não bloqueia). Isso não está sinalizado ao jogador.

### 2. Dominância de estratégia — turtling domina, agressão é punida

**Por persona (single, 15 corridas cada):**

| persona | block | guardWand | avgWave | wandDeaths | humanDeaths | wand HP final (méd) |
|---|---|---|---|---|---|---|
| **Defensivo (turtle)** | 0.70 | 0.60 | **8.13** | 14 | 1 | 8 |
| Guardião do wand | 0.40 | 0.90 | 5.47 | 13 | 2 | 4 |
| Cauteloso (kiter) | 0.45 | 0.30 | 4.73 | 15 | 0 | 0 |
| Agressivo (rush) | 0.05 | 0.10 | 3.80 | 15 | 0 | 0 |
| Button-masher | 0.15 | 0.00 | 2.93 | 4 | 11 | 83 |

- O **defensivo chega 2.1× mais longe que o agressivo** (8.13 vs 3.80). A diferença não é ruído: é a maior separação entre personas.
- **Por que turtling é tão forte** (`multi.ts:363-377`): bloquear converte um golpe de 10–35 em **−1 HP fixo** *e* aplica `staggerEnemy` (inimigo aberto para counter, com `attackCooldown` de 1800ms / boss 1200ms). É **defesa quase gratuita + abre janela ofensiva**. Não há quebra-de-guarda, não há custo de stamina, não há chip damage relevante (1 HP). Um jogador que só bloqueia e dá counters dificilmente toma dano.
- **Por que agressão é punida:** o atacante puro fica exposto sem stagger preventivo, e — pior — **puxa o aggro para si sem bloquear**, então toma o dano cheio. Some-se que o kick (a arma de dano, 16) tem **cooldown 500ms** (`combat.ts:22`): o whiff custa caro.

**Implicação de feel:** o jogo está dizendo "seja paciente e reativo", mas a *fantasia* de um brawler do Werdum é "avançar e bater". Há um descompasso entre o que a estética promete e o que o sistema recompensa. Não é necessariamente ruim (Punch-Out! também premia paciência), mas hoje o desequilíbrio é grande demais — agressão não tem **nenhum** caminho viável.

### 3. Balanceamento de personagens — diferenças pequenas, thor levemente "glass"

| char | maxHp | speed | punchReach | kickReach | avgWave | dmg dado | dmg tomado |
|---|---|---|---|---|---|---|---|
| werdum | 200 | 180 | 150 | 170 | **5.24** | 798 | 128 |
| thor | 200 | 200 | 130 | 150 | 5.08 | **862** | **142** |
| dida | 190 | 190 | 140 | 160 | **4.72** | 742 | 127 |

- **Spread baixíssimo** (avgWave 4.72–5.24): nenhum char domina nem afunda. Saudável em primeira ordem.
- **werdum** vai mais longe — maior reach (150/170) deixa-o acertar de mais longe → menos exposição. Coerente com `stats.ts:17`.
- **thor** dá mais dano porém toma mais (142, o maior) — speed alta (200) + **menor reach (130/150)** o força a chegar perto. Perfil "glass cannon" leve. Funciona como fantasia, mas o reach curto agrava o problema de whiff num jogo que já perdoa pouco.
- **dida** (190 HP, o único abaixo de 200) é o que vai menos longe. A diferença de 10 HP é marginal, mas combinada com reach médio não dá a ela um nicho claro — risco de ser o char "sem identidade".

→ Char balance está **OK**; o que falta é **identidade de playstyle** (ex.: dar a dida um diferencial real — mais velocidade de combo? bloqueio melhor?).

### 4. Onboarding / novato — o jogo não ensina seu loop central

- O **button-masher** (skill 0.45, block 0.15, mash on) morre na **wave 2.93** — o pior de todos.
- Crucialmente, ele morre por **morte do próprio jogador (11/15)**, não do wand — o **oposto** das personas hábeis (que morrem por wand). O novato simulado **não bloqueia → toma dano cheio → é nocauteado**.
- O loop que separa quem passa de quem não passa — **block → stagger → counter** + **gestão de aggro do wand** — é **100% emergente e não-ensinado**. Não há tutorial, prompt, nem telegrafia explicada.
- Os inimigos têm **~1s de windup** (`stepWait` waitTimer 1000ms; chase cooldown 1200/900ms) — janela de reação justa **se você souber que deve bloquear**. O novato não sabe.

→ Sem onboarding do bloqueio e do papel do wand, o novato cai no buraco mais raso (wave 2–4) e provavelmente abandona. Este é o gargalo de **retenção** mais sério em jogabilidade.

### 5. Quirks de design

- **Inimigo derrubado = imune a dano por 1500ms** (`combat.ts:124,142` — o hit conta para combo e feedback, mas `if (e.fsm !== 'knockdown')` pula o dano; `enemyAi.ts:196` knockdownTimer 1500ms / boss 800ms). Você derruba alguém e **não pode finalizá-lo** — ele se levanta intacto. Anti-clímax e contra-intuitivo: a recompensa por derrubar (knockdown threshold 18/30) é... perder a janela de dano. Em brawlers, o chão costuma ser quando você mais pune.
- **fat nunca cai** (`KNOCKDOWN_THRESHOLDS.fat = 9999`): não há ferramenta de crowd-control contra o inimigo que mais ameaça o wand. Você só pode "tankar" o aggro dele bloqueando, ou DPS puro.
- **Aliados IA causam ~41% do dano** (estimativa 6.910 hits × 6 dmg vs 60.029 do jogador). Eles **claramente contribuem** (não são figurantes) — mas tanto que reduzem a agência. Atacam o inimigo mais próprio (`ally.ts:106-137`), 6 dmg, cooldown 900ms, **não bloqueiam e não defendem o wand**. São DPS auxiliar que ignora o objetivo real (proteger o wand), o que explica por que mesmo com ajuda o wand cai em 81% das partidas.
- **Combo dá multiplicador de dano** (tier1: 3 hits ×1.5; tier2: 5 hits ×2 — `combat.ts:23-27`), mas com whiff de 66% e cooldown de kick alto, o bot raramente o sustenta (maxCombo médio baixo). Sistema bom subaproveitado.

### 6. Combate — feel

- **Punch:** rangeH 80, dmg 10, **cooldown 150ms** — rápido e spammável; é a ferramenta de stagger/pressão.
- **Kick:** rangeH 100, dmg 16, **cooldown 500ms** — alto risco/recompensa; o whiff dói (3.3× o cooldown do soco).
- **Faixa vertical de acerto: 40px** (`COMBAT.*.rangeV`) — estreita. Em arena 2.5D com inimigos em Y variado, errar o eixo Y é fácil → contribui para os **66% de whiff**.
- **Janelas de stagger:** normal 650ms / boss 400ms (`enemyAi.ts:244`) — generosas o bastante para counter, o que reforça (de novo) que **bloquear é a jogada dominante**.
- Veredito de feel: **sólido e responsivo no soco, punitivo no chute e no posicionamento vertical.** O combate é competente, mas o *incentivo* empurra para um ritmo defensivo/reativo que pode soar lento para a fantasia de "brigão".

---

## Pontos negativos / fricções de jogabilidade

1. **Objetivo real (proteger o wand) é invisível e não-tutorializado** — 81% das derrotas vêm daí, mas o jogo se apresenta como brawler.
2. **Turtling domina; agressão não tem caminho viável** — bloqueio é defesa de 1 HP + counter grátis; rush morre 2× mais cedo.
3. **Parede da wave 4** (fat imune a knockdown) destoa da rampa — pico de 41 game-overs.
4. **Novato lava cedo** sem onboarding do block→counter — pior gargalo de retenção.
5. **Knockdown pune quem derruba** (alvo fica imune 1500ms) — anti-clímax.
6. **fat sem qualquer crowd-control** — única resposta é bloquear/DPS.
7. **Aliados IA dominam ~41% do dano** — diluem a agência e ainda assim não salvam o wand (não o defendem).
8. **Posicionamento vertical punitivo** (rangeV 40px) inflando whiffs.

---

## Sugestões de melhoria (priorizadas)

> Severidade reflete impacto na **jogabilidade/retenção**, não esforço. Valores são pontos de partida para playtest com humanos — recalibrar.

### 🔴 ALTA

1. **Tutorializar o loop central (block → counter) e o papel do wand.**
   Wave 1 como tutorial guiado: prompt de bloqueio quando um inimigo telegrafa (já há ~1s de windup em `stepWait`), e um indicador de aggro/HP do wand bem visível. *Acionável:* overlay de "BLOQUEIE!" no primeiro windup; barra de HP do wand com pulso/alerta quando inimigos o miram. Ataca diretamente o gargalo da wave 2–4 e do novato.

2. **Reduzir a parede da wave 4.** Opções (testar isoladamente):
   - Adiar o `fat` para a wave 5 e deixar a wave 4 como `weak×6 + strong×1` (rampa mais suave); **ou**
   - Reduzir `fat.hp` de **130 → ~100** (`stats.ts:51`), e/ou `fat.damageToWand` de **20 → 14**; **ou**
   - Dar ao `fat` um threshold de knockdown finito alto (ex.: **`fat: 60`** em `combat.ts:36`) para existir *alguma* ferramenta de interrupção via combo.

3. **Dar à agressão um caminho viável** sem matar o turtling. Ex.: bloqueio passa a ter **custo de chip** (ex.: 2–4 HP em vez de 1) OU **stamina/guarda quebrável** após N bloqueios seguidos. Assim defensivo continua forte, mas não é dominante absoluto. *Acionável:* `multi.ts:364` trocar `hp - 1` por dano de chip escalonado por golpe (ex.: `Math.ceil(enemyDmg * 0.15)`).

### 🟡 MÉDIA

4. **Resolver o quirk do knockdown imune.** Em vez de imunidade total, dar **janela de "ground pound"**: enquanto derrubado, recebe dano reduzido (ex.: 50%) mas finalizável — recompensa quem derruba. *Acionável:* `combat.ts:142` aplicar `finalDmg * 0.5` em vez de pular o dano.

5. **Rebalancear contribuição dos aliados.** Baixar dano de aliado de **6 → 4** (`ally.ts:124,127`) e/ou cooldown 900 → 1100ms para devolver agência ao jogador; **ou** redirecionar parte da IA aliada para **defender o wand** (interceptar inimigos com `target:'wand'`) — transformando-os de DPS redundante em suporte ao objetivo real.

6. **Dar identidade de playstyle a cada char.** dida precisa de um nicho (ex.: janela de combo maior, ou bloqueio mais barato); thor (glass cannon) merece reach um pouco maior (130→140) para não ser punido duplamente por dano-alto + reach-curto.

### 🟢 BAIXA

7. **Alargar levemente a faixa vertical de acerto** (`rangeV 40 → 48–52`) para reduzir whiffs por desalinhamento de Y e melhorar o feel — sem tornar o combate trivial.

8. **Telegrafar melhor o retarget do wand.** Quando um inimigo volta a mirar o wand (`enemyAi.ts:66-67`), dar feedback visual (seta/ícone) para o jogador reagir conscientemente — reforça a skill de gestão de aggro que o jogo já exige implicitamente.

---

## Limitações deste relatório

- **A telemetria vem de BOTS heurísticos reativos, não de humanos.** O **win-rate absoluto (0% em single) NÃO deve ser lido como "o jogo é difícil/injusto".** É o teto de um bot reativo decente. Um humano hábil deve ir bem mais longe; um humano novato, possivelmente menos que o bot médio.
- **O que confio:** comparações relativas (persona×persona, char×char, wave×wave), causas de morte e os mecanismos verificados no código. As recomendações estão ancoradas nesses sinais + leitura do core.
- **Dano de aliado é estimado** (6.910 hits × 6 dmg) — a telemetria registra `allyHits` (contagem), não dano agregado; o valor de 6 dmg vem de `ally.ts:124`. Kills de aliado não foram desagregados de kills do jogador no `damageDealt`.
- **Amostras finas no late-game** (wave ≥8: n ≤ 7 em single): conclusões sobre o end-game são fracas. A rampa 1→4 é estatisticamente sólida; o pós-wave-4 sofre de survivorship bias.
- Tudo deve ser **revalidado com playtest humano** antes de aplicar mudanças de balance em produção.
