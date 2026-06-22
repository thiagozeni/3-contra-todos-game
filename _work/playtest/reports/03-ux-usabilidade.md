# Relatório 03 — UX e Usabilidade (Avaliação Heurística)

> **Jogo:** 3 Contra Todos / Werdum Fight — beat'em up de arena em Phaser (web `/v2` + nativo iOS/Android).
> **Tipo:** Revisão heurística de especialista a partir do **código das telas**. Ver seção *Limitações* — **não houve jogadores reais nem inspeção visual ao vivo**.
> **Foco:** usabilidade que afeta a JOGABILIDADE (onboarding, controles, legibilidade do combate, feedback, fluxo).
> **Data:** 2026-06-21

---

## Resumo executivo

- **O loop central do jogo (BLOQUEAR → contra-atacar) NÃO é ensinado em lugar nenhum.** O How-to-Play lista "DEFESA / BLOQUEAR" como uma tecla, mas nunca diz *que bloquear reduz o dano a 1 E deixa o inimigo aberto (staggered) para o contra-ataque* — que é a única estratégia viável. A telemetria confirma o custo: **0% de win rate single-player** e o "Button-masher (novato)" morre na **wave ~2,9**; o "Defensivo (turtle)" — que tropeça no loop por acidente — chega à **wave ~8,1** (2,8× mais longe). É o achado #1.
- **Não existe tutorial nem primeira-wave guiada.** O jogador sai do Select direto para a wave 1 sem nenhum prompt contextual ("BLOQUEIE!", "CONTRA-ATAQUE AGORA!"). O game-over agrupa-se nas waves 2–4 (101 de 153 game-overs), exatamente onde um novato precisaria ter internalizado a defesa.
- **A objetivo "defender o Wand" é comunicado fracamente.** Aparece só na barra de MISSÃO do How-to-Play (que pode ser pulada com um toque) e implicitamente no HUD. Em combate **não há indicador de quem está mirando o Wand** nem alerta quando o Wand está em estado crítico — só um flash de tela a cada golpe recebido.
- **Controles de teclado são razoáveis, mas a descoberta depende 100% do How-to-Play** (uma tela que se auto-avança ao primeiro toque). Setas/WASD + J (soco) / K (chute) / L (bloqueio) — esquema não-óbvio (bloqueio em "L" não é convencional).
- **Controles touch existem e são descobríveis** (joystick + 3 botões coloridos visíveis em tela), mas têm problemas: posição fixa (não reposiciona sob o polegar), botões podem ficar perto das bordas em telas largas, e o rótulo de bloqueio usa emoji 🛡 (renderização inconsistente).
- **Legibilidade do HUD é boa no topo** (barras anguladas player/wand com %, timer, wave, score), mas **as barras SPECIAL do rodapé são puramente decorativas e sempre cheias** — comunicam um recurso que não existe (mentira de UI que confunde).
- **i18n é exemplar:** pt como fonte da verdade, paridade pt/en/es forçada por tipo + teste, até a mensagem de rotação do HTML é localizada via `boot.rotate`. Pouquíssimo hardcode relevante.
- **Fluxo de telas é limpo** (Boot → Título → How-to-Play → Select → Game). O lobby co-op tem código de 4 letras + compartilhar, mas insere a tela How-to-Play **entre** o título e o Select sempre (atrito em replays — ver achados).

---

## Achados de usabilidade (com referência a arquivo/linha)

### 1. Onboarding — o loop block→counter é invisível para o jogador

A mecânica decisiva está em `src/core/multi.ts:363-377`: quando o player está `isBlocking` e o inimigo ataca, o dano cai para 1 **e** o inimigo entra em `staggered` (a janela de contra-ataque). Essa é a chave do jogo inteiro.

Mas o ensino disso, em `HowToPlayScene.ts:178-184` (`buildDefensePanel`), é apenas: ícone de escudo + keycap "L" + a palavra `t('howto.block')` = "BLOQUEAR". E a missão (`pt.ts:33`) é só `"MISSÃO: PROTEJA O WAND DOS INIMIGOS!"`. Em nenhum momento o jogo diz:
- que bloquear **reduz o dano** (a 1);
- que bloquear **abre o inimigo** para o contra;
- que **martelar ataque (button-mash) não funciona** — confirmado pela persona button-masher morrendo na wave ~2,9 (`telemetry-summary.md:25`).

**Impacto:** alto. É a causa-raiz mais provável do 0% de vitórias e do pico de game-overs nas waves 2–4.

### 2. Sem tutorial nem prompt contextual no combate

`SelectScene.confirmSelection()` (`SelectScene.ts:342-351`) vai direto para `GameScene`. Não há onboarding inline. Em `GameScene.processEvents` (`GameScene.ts:463-561`) há feedback rico de **acerto/erro** (sons, partículas, números de dano, shake), mas **nenhum prompt de ensino** — p.ex. nada dispara "BLOQUEIE!" quando um inimigo está prestes a atacar o player pela primeira vez.

### 3. Feedback de BLOQUEIO bem-sucedido é fraco / ambíguo

Quando o player bloqueia com sucesso, o único retorno é:
- `sound.block()` e a FX de stagger no inimigo (`GameScene.ts:500-503`, evento `enemyStaggered`).

Não há: badge "BLOCKED!" / "PERFEITO!", flash no próprio player, nem qualquer dica de "contra-ataque AGORA" durante a janela de stagger. O jogador que bloqueou por acaso não recebe sinal claro de que **acabou de fazer a coisa certa** nem de **o que fazer em seguida**. Isso impede o aprendizado por descoberta.

> Contraste: o feedback de **dar dano** é abundante — `sound.hitEnemy()` + `spawnDamageNumber` + `spawnHitParticles` + alpha-flash (`GameScene.ts:484-491`). O jogo "ensina" implicitamente a atacar (muito feedback) e "esconde" a defesa (pouco feedback) — exatamente o inverso do que a dificuldade exige.

### 4. Estado crítico do Wand não é comunicado

`HUD.updateWandHP` (`HUD.ts:360-371`) faz: encolhe a barra, atualiza %, `flashDamage()` na barra a cada queda, e um `damageFlash` vermelho de tela inteira em **qualquer** golpe no Wand. `setWandKO()` (`HUD.ts:373-386`) só age quando o Wand **já morreu** (HP ≤ 0).

Faltam:
- **alerta de Wand crítico** (ex.: barra pulsando vermelho < 25%, alarme sonoro, vinheta);
- **indicador de aggro** — não há nada mostrando *quais* inimigos estão indo atrás do Wand vs. do player. O jogador não sabe onde correr para interceptar. (O alvo é resolvido em `multi.ts` via `result.intents.attackPlayer`/target, mas nada disso vira sinal visual.)

**Impacto:** alto para o objetivo central (proteger o Wand). "Wand sobrevive" é só **19%** single / **7%** coop2 / **5%** coop3 (`telemetry-summary.md:8-10`).

### 5. HUD: barras SPECIAL decorativas comunicam recurso inexistente

`HUD.buildSpecialBars()` (`HUD.ts:290-332`) desenha label "SPECIAL" + 5 segmentos dos dois lados, **sempre cheios**, com shimmer "carregado". O próprio comentário admite: *"Decorativo por ora (cheio): o jogo ainda não tem mecânica de special ligada ao HUD."* Um jogador vai tentar usar um especial que não existe — frustração e desperdício de atenção em combate. (A tela Select inclusive lista um "ESPECIAL: MATA-LEÃO/GANCHO DUPLO/MARRETADA" por personagem — `SelectScene.ts:17-19` — reforçando a expectativa de um golpe que não está implementado.)

### 6. Controles de teclado — esquema não-convencional e dependente do How-to-Play

`GameScene.ts:301-312`: movimento por **setas OU WASD**, soco **J**, chute **K**, bloqueio **L**, pausa **ESC**, mute **M**. Observações:
- **Bloqueio em "L"** não é uma convenção; combinado com a falta de ensino do loop defensivo, é provável que muitos novatos nunca descubram que bloqueio existe (J/K parecem o jogo todo).
- A descoberta só acontece no How-to-Play, **que se auto-avança ao primeiro toque/tecla** (`HowToPlayScene.ts:98-106`) — um jogador apressado pode dispensá-la antes de ler.
- Não há remapeamento de teclas (Options só tem música/SFX/fullscreen/idioma — `optionsOverlay`/`pt.ts:143-149`).

### 7. Controles touch — existem e são visíveis, mas com fricções

`VirtualJoystick.ts`:
- O joystick e os botões só são criados se `isTouch` (`VirtualJoystick.ts:36`). Bom: descobríveis (sempre na tela).
- **Posição fixa** do joystick (`bX=180, bY=857`, `VirtualJoystick.ts:33-34`) — não é um joystick "flutuante" que nasce onde o polegar toca. Em mãos/telas diferentes isso cansa e gera imprecisão. (A captura de toque é na metade esquerda da tela, `:57`, mas o knob/base ficam ancorados num ponto fixo.)
- Botões em coordenadas absolutas `@1920×1080` (`:88-90`) escalam com o canvas, mas o botão de bloqueio (x:1826) fica **muito perto da borda direita** — em recortes/telas largas pode encostar na borda ou no cinegrafista DOM.
- **Botão de bloqueio rotulado com emoji `🛡`** (`:90`) em `fontFamily:'monospace'` — renderização de emoji é inconsistente entre plataformas (pode virar tofu/□ ou um glifo P&B fora do estilo pixel). Os outros usam letras (J/K) coerentes com o teclado; o bloqueio quebra o padrão.
- Sem affordance de **estado "bloqueando"** além de aumentar a opacidade do botão (`:104-107`) — coerente, mas discreto.

### 8. Fluxo: How-to-Play sempre entre Título e Select

`TitleScene.goToSelect()` (`TitleScene.ts:263-270`) vai para **HowToPlayScene**, não direto para o Select. Para um jogador recorrente isso é um passo extra a cada partida (mitigado por auto-avanço com 1 toque, mas ainda é fricção). Não há "não mostrar de novo" nem botão "pular para o Select".

### 9. Lobby co-op — fluxo claro, com bons detalhes

`LobbyScene.ts`: criar sala → mostra **código de 4 letras** num painel "CÓDIGO DA SALA" + botão COMPARTILHAR (`:303,314-360`), e entrar → "ENTRAR COM CÓDIGO" com dica "Digite o código e pressione ENTER" e validação "Insira exatamente 4 letras" (`pt.ts:123,130`). Auto-join por link `?sala=CODE` (`BootScene.ts:76-101`) é excelente UX. Erros são tratados e localizados (`pt.ts:128-132`). **Ponto positivo.** Pequeno atrito: criar sala exige premium/anúncio (`pt.ts:115`) — gate de monetização correto, mas pode confundir quem só quer testar co-op.

### 10. i18n — cobertura excelente, pouquíssimo hardcode

`src/i18n/locales/pt.ts` é a fonte da verdade, com paridade en/es garantida por tipo (`satisfies Record<string,string>`) + teste (`translate.test.ts`, citado no cabeçalho do arquivo). Até a `#rotate-msg` estática do `index.html` é sobrescrita por `boot.rotate` em `main.ts:41-46`. **Quase nada escapa.** Itens de chrome arcade (PRESS START, SCORE, WAVE, COMBO, SPECIAL, MUTE) propositalmente em inglês nos 3 idiomas — decisão consistente e documentada (`pt.ts:5-6`).

Resíduos hardcoded de menor impacto (gameplay-irrelevantes, mas vale citar):
- Nomes/labels do HUD construídos com strings literais em inglês: `'1P'`, `'WERDUM'`, `'WANDERLEI'`, `'WAVE 1 / 1'`, `'SCORE 0'` (`HUD.ts:139-201`) — são placeholders/chrome arcade e/ou nomes próprios, então OK, mas `WAVE`/`SCORE` ficam fora do sistema i18n (intencional pelo doc).
- Anúncios de combate (`'— WAVE n —'`, `'⚠ BOSS WAVE!'`, `'x{n} COMBO!'`) são hardcoded em `HUD.showWaveAnnouncement`/`showCombo` (`HUD.ts:466,475`) — chrome arcade, consistente com a política.

### 11. Acessibilidade

- **Contraste/legibilidade:** textos do HUD usam stroke preto grosso sobre as barras (`HUD.ts` em vários pontos) — bom para legibilidade sobre fundo claro do ringue. Scrim escuro atrás das rows de aliado (`HUD.ts:557-563`) é uma correção consciente de legibilidade. Positivo.
- **Daltonismo:** o feedback de dano/baixa vida depende fortemente de **vermelho** (flash de dano, barra baixa, badge DOWN). Para o estado crítico do Wand não há reforço por **forma/movimento/áudio** — um jogador com deuteranopia/protanopia pode perder o sinal. (Hoje nem há sinal crítico, ver achado #4.)
- **Tamanho de fonte:** badges de aliado em 14–16px `@1920` (`HUD.ts:53-54`) ficam pequenos quando o canvas reduz em telas mobile — risco de ilegibilidade do "DOWN"/"OFF".
- **Sem legendas para áudio-cues:** sinais sonoros importantes (block, hit, wave) não têm equivalente textual opcional. Como o jogo depende de áudio para confirmar bloqueio (achado #3), isso penaliza quem joga sem som.
- **Sem opção de reduzir flashes** (o `damageFlash` de tela inteira dispara a cada golpe no Wand — `HUD.ts:366-369`) — risco para fotossensibilidade e sem toggle.

---

## Pontos negativos / fricções que prejudicam a jogabilidade (consolidado)

1. Loop block→counter não ensinado → 0% win, novatos lavam nas waves 2–4. **(crítico)**
2. Estado crítico do Wand sem alerta + sem indicador de aggro → falha no objetivo central (Wand sobrevive 5–19%). **(crítico)**
3. Feedback de bloqueio bem-sucedido fraco → impede aprendizado por descoberta. **(alto)**
4. Barras SPECIAL decorativas + "ESPECIAL" no Select → expectativa de mecânica inexistente. **(alto)**
5. Joystick de posição fixa + botão de bloqueio com emoji e perto da borda. **(médio)**
6. Bloqueio em "L" pouco convencional + descoberta dependente de tela auto-avançável. **(médio)**
7. How-to-Play obrigatório a cada partida, sem "pular". **(baixo)**
8. Sem remapeamento de teclas / sem toggle de redução de flashes / cues só por áudio. **(baixo–médio, acessibilidade)**

---

## Sugestões concretas priorizadas

### ALTA

1. **Ensinar o loop defensivo explicitamente no How-to-Play.** No `buildDefensePanel` (`HowToPlayScene.ts:178-184`), trocar "BLOQUEAR" por algo como: *"BLOQUEIE (L) para reduzir o dano e ABRIR o inimigo — depois CONTRA-ATAQUE (J/K)."* Adicionar mini-sequência visual (escudo → inimigo tonto → soco). Criar chaves i18n `howto.blockDesc` / `howto.counterDesc`.

2. **Prompt contextual na wave 1 (tutorial leve, 1 tela embutida no jogo).** Na primeira vez que um inimigo for atacar o player, pausar levemente e mostrar "BLOQUEIE! (L / 🛡)"; ao bloquear com sucesso, mostrar "AGORA! CONTRA-ATAQUE (J/K)". Disparar a partir de `GameScene.processEvents` no primeiro `enemyAttacked`/`enemyStaggered` da partida. Mostrar só uma vez (flag em registry/localStorage).

3. **Alerta de Wand crítico.** Em `HUD.updateWandHP` (`HUD.ts:360-371`): quando `r < 0.25`, pulsar a barra do Wand em vermelho + tocar um alarme/heartbeat + vinheta vermelha persistente (não só o flash de 350ms). Adicionar `t('hud.wandCritical')` ("PROTEJA O WAND!").

4. **Indicador de aggro do Wand.** Para cada inimigo cujo intent atual é `attackPlayer`-no-Wand/`approach`-do-Wand, desenhar uma seta/ícone vermelho sobre ele (ou uma linha tênue inimigo→Wand). Permite o jogador interceptar — o núcleo do gênero "escolta".

5. **Resolver as barras SPECIAL.** Ou (a) implementar a mecânica de especial e ligá-la ao HUD, ou (b) **remover** `buildSpecialBars` (`HUD.ts:290-332`) e o campo "ESPECIAL" do Select (`SelectScene.ts`) até existir. Não deixar UI prometendo recurso inexistente.

### MÉDIA

6. **Feedback forte de bloqueio bem-sucedido.** No evento `enemyStaggered` causado por bloqueio (`GameScene.ts:500-503`), além do som, mostrar um badge curto "BLOCK!" no player + um flash branco/dourado no escudo + (opcional) leve hit-stop. Reforça o acerto e a janela de counter.

7. **Joystick flutuante no touch.** Em `VirtualJoystick.buildJoystick`, em vez de base fixa em `(180,857)`, nascer a base na posição do `pointerdown` dentro da metade esquerda (e esconder/reaparecer). Melhora ergonomia e precisão em qualquer mão/tela.

8. **Trocar o emoji do botão de bloqueio** (`VirtualJoystick.ts:90`) por um ícone do DS (ex.: `ic-shield`, já usado no How-to-Play) ou pela letra "L", mantendo coerência com J/K e evitando tofu de emoji. Garantir margem segura da borda direita (reduzir x ou ancorar relativo à largura).

9. **Botão "PULAR" / lembrar How-to-Play.** Em `HowToPlayScene`, adicionar um atalho visível "IR PARA SELECT" e/ou só forçar a tela na primeira sessão (flag persistida); nas demais, Título → Select direto com um "?" para reabrir as instruções.

### BAIXA

10. **Acessibilidade:** (a) toggle "reduzir flashes" no Options que limita `damageFlash`; (b) reforçar estados críticos com forma+movimento+áudio, não só cor (daltonismo); (c) aumentar/escalar mínimos de fonte dos badges de aliado para telas pequenas; (d) opção de cues textuais para eventos de áudio-chave.
11. **Mapear "K"/"J" também em teclas alternativas** (ex.: Z/X) e considerar bloqueio em tecla mais convencional (Shift/Space) — ou ao menos documentar melhor. Idealmente, remapeamento no Options.
12. **Co-op:** deixar claro no gate de "CRIAR SALA" que ENTRAR em sala de amigo é grátis (separar visualmente do gate premium).

---

## Limitações desta avaliação

- **É uma revisão heurística de especialista a partir do código-fonte das telas** (`src/scenes/*`, `src/ui/*`, `src/core/*`, `src/i18n/*`, `index.html`). **Não houve playtest com jogadores humanos reais.**
- **Não houve inspeção visual ao vivo** (sem rodar o build, sem screenshots, sem capturar o jogo em vídeo). Afirmações sobre legibilidade, contraste, timing de feedback e ergonomia de toque são **inferidas do código** (coordenadas, durações de tween, cores/tokens, fontes) e podem divergir da experiência renderizada — especialmente efeitos de vídeo de fundo, escala em telas reais e percepção de timing.
- A **telemetria** (`_work/playtest/telemetry-summary.md`) vem de **155 partidas simuladas por bots-persona** rodando o core real do jogo — é forte sinal de *dificuldade/balance e de onde os jogadores travam*, mas **não captura confusão de UI, descoberta de controles ou leitura de tela** (um bot "sabe" as regras; um humano novato não). Os números foram usados para **corroborar** hipóteses de onboarding, não como prova de UX.
- Não foi avaliado o build **nativo** em dispositivo (haptics, ATT/ads, fullscreen real, orientação) além do que o código revela.
- Acessibilidade não foi medida com ferramentas (sem leitor de tela, sem medição de contraste WCAG) — apenas inspeção de tokens e padrões no código.
