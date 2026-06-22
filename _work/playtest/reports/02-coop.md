# Relatório de Jogabilidade — CO-OP (2 e 3 jogadores)

**Jogo:** 3 Contra Todos / Werdum Fight (beat'em up de arena, Phaser + core puro `src/core/multi.ts`, co-op server-authoritative via Colyseus)
**Base de dados:** 155 partidas headless dirigindo o CORE REAL (`single`=75, `coop2`=60, `coop3`=20). Personas scriptadas (bots), não humanos — ver "Limitações".
**Foco:** comparar a defesa do wand (HP 200) entre solo e co-op e diagnosticar por que o co-op está mais difícil que o solo.

---

## Resumo executivo

- **O co-op está invertido: quanto mais gente, pior o resultado.** Wave média cai (single 5.01 → coop2 4.58 → coop3 3.35) e a sobrevivência do wand despenca (19% → 7% → 5%) APESAR de haver mais defensores. Isso é o oposto do que um co-op de defesa deveria entregar.
- **A causa-raiz está no código, não no skill do bot:** `scaleWaveForPlayers` (waveScaling.ts) multiplica a quantidade de inimigos não-boss por `playerCount` (×2, ×3), mas o **HP do wand é fixo em 200** (`WAND_HP = 200`, multi.ts:98). Resultado: o mesmo objetivo de 200 HP é atacado por 2–3× mais inimigos.
- **O wand é o ponto único de falha — e ele domina cada vez mais o game-over com mais jogadores:** 81% dos game-overs no solo são por morte do wand; **95% em coop2; 100% em coop3.** Inimigos nascem com `target: 'wand'` e voltam pro wand sozinhos (retarget por `noHitTimer > 1500`).
- **Humanos praticamente não morrem em grupo:** 19% dos slots humanos morrem no solo, 7% em coop2, **0% em coop3.** Ou seja, a "ameaça aos jogadores" some no co-op e toda a pressão recai sobre o wand — o jogo vira uma corrida matemática perdida de defender 200 HP contra N× inimigos.
- **A matemática condena o objetivo:** wave 1 tem 3 `weak` no solo, 6 em coop2, **9 em coop3**. Como o wand tem HP fixo, o "orçamento de HP por atacante" cai de **67 (solo) → 33 (coop2) → 22 (coop3)** — a defesa fica ~3× mais frágil em trio.
- **3p morre cedíssimo:** distribuição de game-over do coop3 concentra-se nas **waves 1–2 (14 de 19 partidas)**; sem um guardião dedicado, a wave média do trio é **1.80**.
- **Papéis importam muito (e isso é, hoje, o único contrapeso):** em coop3, ter 1 guardião do wand sobe a wave média de **1.80 → 4.90**. O design depende fortemente de coordenação que o jogo nem ensina nem incentiva.
- **`spawnInterval` NÃO escala** com jogadores: os N× inimigos chegam no mesmo ritmo do solo → muito mais inimigos *concorrentes* na arena cercando o wand ao mesmo tempo, agravando a saturação.

---

## Achados com evidência

### 1. Scaling do co-op multiplica inimigos, mas não o objetivo

**Código (`src/core/systems/waveScaling.ts:23-32`):**
```ts
export function scaleWaveForPlayers(wave, playerCount: 1|2|3): WaveConfig {
  return { ...wave, enemies: wave.enemies.map(g =>
    BOSS_TYPES.has(g.type) ? { ...g } : { ...g, count: g.count * playerCount }) }
}
```
- Inimigos não-boss: `count * playerCount` (linear). Bosses não multiplicam.
- **`spawnInterval` é deixado intacto** (comentário do próprio arquivo). Logo, 2–3× mais inimigos no mesmo intervalo = densidade muito maior simultânea.

**Código (`src/core/multi.ts:98`):** `const WAND_HP = 200` — **fixo, não recebe `playerCount`.** Inicializado em `createMultiInitialState` (multi.ts:164) sem qualquer escala.

**Wave 1, quantitativo (weak = 12 dmg/wand, wand 200 HP):**

| modo | weak na wave 1 | HP do wand por atacante |
|---|---|---|
| single | 3 | **67** |
| coop2 | 6 | **33** |
| coop3 | 9 | **22** |

> Conclusão: o objetivo central (defender 200 HP) fica **2–3× mais frágil** em grupo. A vitória depende de matar os inimigos antes que cheguem ao wand, e o tempo disponível para isso encolhe proporcionalmente ao nº de jogadores — mas a capacidade de "tankar" do wand não cresce.

### 2. O wand é o ponto único de falha — e piora com mais gente

**Telemetria — causa do game-over:**

| modo | game-overs por morte do WAND | por todos os humanos caídos |
|---|---|---|
| single | 81% (61/75) | 14 |
| coop2 | 95% (56/59) | 3 |
| coop3 | **100% (19/19)** | 0 |

**Telemetria — dano sofrido pelo wand (média):** single 184.6 → coop2 200.2 → coop3 201.6 (ou seja, em co-op o wand quase sempre vai a zero; o teto de 200 é atingido).

**Mecânica (`src/core/systems/enemyAi.ts` + `waves.ts:39`):** inimigos nascem com `target: 'wand'`, aproximam-se do wand e atacam após `waitBeforeAttack` (1000ms). O `chasePlayer` só ocorre se forem desviados, e o retarget `e.noHitTimer > 1500 → target = 'wand'` (enemyAi.ts:66) **força o inimigo de volta ao wand** se ele não levar dano por 1,5s. O design empurra constantemente a horda para o objetivo fixo.

### 3. Os humanos quase não morrem em co-op

**Telemetria — slots humanos que morreram:** single 19% (14/75) → coop2 7% (8/120) → **coop3 0% (0/60).**

> O aggro se espalha entre os jogadores (cada inimigo mira o humano vivo mais próximo — `nearestLivingHuman`, multi.ts:212), então cada humano individualmente sofre menos. A "ameaça aos jogadores" praticamente desaparece em trio. Toda a dificuldade migra para o wand, que não tem quem o substitua. O co-op deixa de ser "sobreviva + defenda" e vira "defenda um alvo fixo contra uma horda 3×".

### 4. 2p vs 3p: por que 3p morre mais cedo

- **Mais inimigos por wave** (×3 vs ×2) sobre o mesmo wand → janela de defesa menor.
- **Densidade simultânea maior** (spawnInterval não escala) → o wand é cercado por vários atacantes ao mesmo tempo; 2 defensores não conseguem interceptar 9 inimigos convergindo.
- **Distribuição de game-over (coop3):** waves 1–2 concentram **14/19** partidas. coop2 é mais espalhado (mortes até wave 11). O coop3 frequentemente nem sai da wave 1 (avgWave 1.80 sem guardião).

### 5. Dinâmica de equipe / papéis (o único contrapeso atual)

**Telemetria — efeito de ter 1 "Guardião do wand" no time:**

| modo | 0 guardião | 1 guardião |
|---|---|---|
| coop2 | avgWave 4.80 (n=45) | avgWave 3.93 (n=15) |
| coop3 | **avgWave 1.80 (n=10)** | **avgWave 4.90 (n=10)** |

> Em coop3, um guardião **quase triplica** a wave média (1.80 → 4.90). O papel "alguém fica defendendo o wand" é decisivo no trio. Em coop2 o efeito aparece invertido na amostra (provável artefato de amostra pequena + a persona guardian ataca menos). O sinal robusto é o coop3: **o design já recompensa coordenação, mas não a ensina nem a sinaliza**, e não dá ferramentas (posicionar/curar o wand). Bots não coordenam — humanos coordenando provavelmente fariam melhor, mas o teto matemático (200 HP vs N× horda) continua punitivo.

### 6. Justiça / diversão percebida — problema de design sério

O co-op cooperativo de defesa cria a expectativa de **"mais fácil e mais divertido em grupo"**. A telemetria mostra o oposto mensurável: wave média e sobrevivência do wand caem monotonicamente com mais jogadores. Mesmo descontando o skill do bot (sinal absoluto), o **sinal comparativo é inequívoco**: o jogo pune escalar o time. Para um jogo cuja distribuição principal são as app stores (apelo de "joguem juntos"), isso é uma fricção central.

---

## Pontos negativos / fricções de co-op

1. **Objetivo escala contra o time:** HP do wand fixo + inimigos ×N = defesa matematicamente mais frágil em grupo (67→33→22 HP/atacante). É o achado mais grave.
2. **Wand = ponto único de falha absoluto no co-op** (100% dos game-overs coop3), sem mecânica de mitigação (não cura, não reposiciona, não ganha resistência com mais defensores).
3. **`spawnInterval` não escala** → saturação simultânea da arena ao redor do wand.
4. **Humanos viram quase invulneráveis em trio (0% de mortes)** enquanto o wand morre sozinho — desequilíbrio que torna a parte "sobreviver" trivial e a parte "defender" impossível.
5. **Dependência não-sinalizada de papéis:** o jogo exige um guardião dedicado em coop3 mas não comunica isso; quem joga "todo mundo ataca" cai na wave 1–2.
6. **Sem feedback de risco do wand:** nada empurra os jogadores a recuar e defender quando o wand está sendo cercado.

---

## Sugestões concretas (priorizadas)

### ALTA

- **A1 — Escalar o HP do wand pelo nº de jogadores.** Em `multi.ts`, trocar `WAND_HP = 200` fixo por algo como `200 * humanCount` ou `200 + 120*(humanCount-1)` (coop2 ≈ 320, coop3 ≈ 440). Aplicar em `createMultiInitialState` (já recebe `humanSlots.length`). Restaura o "orçamento de HP por atacante" para perto do solo (objetivo: voltar de 22 para ~50–67 em coop3). **É a correção de maior impacto e a mais barata.**
- **A2 — Reduzir a agressividade do scaling de inimigos.** A multiplicação linear `count * playerCount` é dura demais combinada com wand fixo. Opções: (a) escala sub-linear `ceil(count * (1 + 0.6*(playerCount-1)))` (coop3 ≈ ×2.2 em vez de ×3); ou (b) manter ×N mas **só se** A1 for adotado, calibrando os dois juntos. Local: `waveScaling.ts:29`.
- **A3 — Calibrar 3p especificamente para não morrer na wave 1.** 14/19 partidas coop3 morrem nas waves 1–2. Independentemente de A1/A2, suavizar as 2–3 primeiras waves do trio (menos inimigos iniciais e/ou `spawnInterval` maior nas waves 1–3).

### MÉDIA

- **M1 — Escalar `spawnInterval` (ritmo), não só a contagem.** Hoje N× inimigos chegam no mesmo ritmo. Aumentar o intervalo levemente em co-op (ex.: `spawnInterval * (1 + 0.15*(playerCount-1))`) reduz a saturação simultânea ao redor do wand sem mudar o total. Local: `waveScaling.ts` (hoje deixa `spawnInterval` intacto de propósito — reavaliar).
- **M2 — Dar ao wand uma defesa que aproveite o time.** Ex.: o wand ganha regeneração lenta ou redução de dano enquanto ≥1 humano estiver dentro de um raio dele (recompensa explicitamente "ficar defendendo"). Transforma o papel de guardião (que já comprovadamente ajuda) em mecânica recompensada, não em conhecimento tribal.
- **M3 — Permitir reposicionar/empurrar o wand** para um canto mais defensável, ou clusterizar o spawn de inimigos de menos lados em co-op, para que 2 defensores consigam segurar uma frente.
- **M4 — Sinalizar o estado de perigo do wand** (HUD/áudio quando o wand está cercado ou < 30% HP) para induzir os jogadores a recuar e defender — corrige a fricção #6.

### BAIXA

- **B1 — Onboarding de papéis em co-op:** dica/tutorial curto sugerindo "alguém defenda o wand" em partidas 3p.
- **B2 — Telemetria com humanos reais** para recalibrar os números de A1/A2 (o teto matemático é real, mas o ponto exato de balanceamento precisa de playtest humano).
- **B3 — Considerar HP do wand levemente dinâmico por desempenho** (rubber-banding suave) se A1/A2 não bastarem após playtest.

> **Recomendação de implementação:** começar por **A1 (HP do wand ×N)** isolado e re-rodar o harness — é a mudança de um único valor com o maior efeito esperado. Depois ajustar A2/M1 conforme o novo baseline.

---

## Limitações (caveat metodológico — LEIA)

- **A telemetria vem de BOTS heurísticos reativos, não de humanos.** O win-rate **absoluto** (0–5% de vitórias) reflete o skill dos bots — **não conclua daqui a dificuldade absoluta do jogo para humanos.** Humanos coordenando, mirando melhor e priorizando o wand quase certamente vão melhor.
- **O que é robusto são os sinais COMPARATIVOS:** single vs coop2 vs coop3 rodaram o **mesmo core** com personas equivalentes; a degradação monotônica (wave média e sobrevivência do wand caindo com mais jogadores) e a migração da causa de game-over para 100% wand em coop3 são conclusões válidas porque isolam a variável "nº de jogadores".
- **Mecanismos no código** (HP fixo do wand + scaling ×N de inimigos + spawnInterval não-escalado + retarget forçado ao wand) **confirmam independentemente** a causa-raiz — não dependem do skill do bot.
- **Amostras pequenas:** coop3 tem n=20 (e os recortes por nº de guardiões são n=10). Tratar os números de coop3 como direcionais, não precisos. O sinal de "guardião ajuda muito em 3p" é forte mas merece replicação.
- **O harness confirma que o server roda o mesmo core:** `ArenaRoom.tick` (server/src/rooms/ArenaRoom.ts:385) chama `updateMulti` com `FIXED_DT`, então a telemetria reflete a produção co-op.
