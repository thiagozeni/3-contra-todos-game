# Fatia 2 — Co-op web: servidor Colyseus + salas por código — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o 3 Contra Todos jogável em co-op online (2–3 humanos na mesma arena, cada um com um personagem: werdum/dida/thor), entrando por **código de sala**, com um **servidor Colyseus autoritativo** rodando o `core/Simulation` extraído na Fatia 1 a ~20 ticks/s. Cliente envia apenas input; servidor simula, valida e distribui estado. O single-player offline **nunca quebra** — o multiplayer é uma camada opcional atrás de um feature flag, com fallback gracioso.

**Architecture (do spec §5):**
```
core/        ← simulação pura (TS, zero Phaser) — JÁ EXISTE (Fatia 1)
             roda no servidor (autoritativo) E no cliente (single-player / prediction)
client/      ← Phaser 4: renderiza estado, captura input — JÁ EXISTE
server/      ← NOVO: sala Colyseus que instancia o core, valida inputs, distribui estado
```
A extração do `core/` já está pronta e determinística (283 testes, 99% cobertura). Esta fatia (a) **estende o core de 1 humano + 2 IA para N humanos** (1–3, IA preenche os slots vazios), (b) **embrulha o core num servidor Colyseus**, (c) **conecta o cliente Phaser ao servidor atrás de um flag**, (d) adiciona **interpolação + prediction**, (e) **reconexão + robustez**, (f) faz o **deploy do beta co-op web**.

**Princípio de altitude (server-authoritative):** o servidor é a ÚNICA fonte de verdade. O `state` sincronizado do Colyseus (Schema) é uma **projeção** do `GameState` do core — não o core em si. O loop de simulação opera sobre o `GameState` puro; a cada patch, projetamos o `GameState` no Schema. Isso mantém o core 100% Phaser-free E Colyseus-free (testável, determinístico, reutilizável no single-player).

**Tech Stack (versões verificadas em 2026-06-10 via npm + docs.colyseus.io / repo colyseus/docs @ master):**
- **Colyseus** `0.17.10` (meta-pacote) / `@colyseus/core` `0.17.43` — servidor autoritativo, TS, salas nativas.
- **@colyseus/schema** `4.0.26` — state sync; decorators `@type()` (requer `experimentalDecorators: true` e `useDefineForClassFields: false` no tsconfig do server).
- **@colyseus/sdk** `^0.17.0` — client SDK oficial do 0.17 (substitui o antigo `colyseus.js`; expõe `Client`, `Callbacks.get(room)`, `room.onMessage`, `room.onDrop/onReconnect/onLeave`). *Nota: o pacote legado `colyseus.js` ainda existe (0.16.22) mas para 0.17 o caminho recomendado é `@colyseus/sdk`.*
- **@colyseus/testing** `0.17.11` — `boot(appConfig)`, `colyseus.createRoom()`, `colyseus.connectTo()`, `room.waitForMessage/waitForNextPatch/waitForNextMessage` — para testes de integração de sala.
- **@colyseus/tools** `0.17.19` — `defineServer({ rooms: { name: defineRoom(Room) }, express })` bootstrap.
- Mantidos: TypeScript 5.4, Vitest 4.1, Phaser 4.1 (só client), Vite 5, Capacitor 8, Supabase.

**Worktree:** /Users/pro15/Claude/3-contra-todos/game-v2 (branch `v2`)

**Decisão de empacotamento — npm workspaces, justificativa:**
O `server/` NÃO pode viver no mesmo build do client: o client roda em `experimentalDecorators: false` / `useDefineForClassFields: true` (defaults modernos do Vite), e o Colyseus Schema EXIGE o oposto (`experimentalDecorators: true`, `useDefineForClassFields: false`). Dois tsconfigs incompatíveis no mesmo `rootDir` quebram. Por isso:
- Converter `game-v2/` num **npm workspaces** root com dois pacotes: o pacote atual do jogo (raiz/`client`) e `server/`.
- `server/` é um pacote próprio (`game-v2/server/`) com seu `package.json`, `tsconfig.json` (decorators ON) e deps Colyseus — isoladas do bundle do cliente.
- **O `core/` é compartilhado** sem duplicação: o server importa de `../src/core` via path mapping (`@core/*` → `../src/core/*`) OU, mais limpo, extraindo `core/` para um workspace `packages/core` consumido pelos dois. **Decisão para esta fatia:** manter `core/` onde está (`src/core`) e o server importá-lo por path relativo/alias — extrair para pacote separado é refactor opcional anotado, não bloqueante. Justificativa: zero risco ao build do client já publicável; o `core/` já é Phaser-free, então compila no contexto do server sem mudança.
- O root workspace ganha scripts `test`, `test:server`, `dev:server` que delegam ao pacote certo.

**Princípios obrigatórios:**
- **Server-authoritative:** o cliente nunca decide dano/morte/score. Só envia `MoveInput`. O servidor simula e o leaderboard co-op só aceita partidas simuladas no servidor (continuidade do anti-cheat v2 — spec §8).
- **`core/` permanece puro:** nunca importa de `colyseus`, `phaser`, nem do `server/`. Guard de teste estendido (já existe um para phaser na Fatia 1 — adicionar `colyseus`).
- **Single-player offline jamais quebra:** todo código de rede vive atrás de `NET_ENABLED` flag + try/catch com fallback. Servidor fora / sem internet = botão "Co-op" desabilitado, NUNCA crash (spec §8). Smoke do single-player roda a cada task de rede.
- **TDD:** core (Vitest) e sala (Vitest + `@colyseus/testing`) — teste primeiro (RED), implementação (GREEN), refactor.
- **Cada task termina verde + publicável:** `npx tsc --noEmit` (client e server), `npm test` (ambos pacotes), `npm run build` (client) verdes antes do commit; `werdumfight.com/v2` continua idêntico por fora até a Task de UI de lobby, e mesmo aí o flag mantém o default single-player.
- **Determinismo preservado:** o RNG seedado do core (`rngState` em `GameState`) é a base do replay/validação; o servidor escolhe e guarda a seed.

**Fatos do core atual (auditados — fonte para as extensões multiplayer):**
- `createInitialState(character, seed) → GameState`: 1 player + 2 allies (os outros 2 personagens), wand hp 200, wave 0. `update(state, input: MoveInput & {punch,kick}, deltaMs) → { state, events }`, puro e imutável (retorna NOVO state; no-op quando `status !== 'playing'`).
- `GameState`: `{ status, player: PlayerState, enemies: EnemyState[], allies: AllyState[], wand, wave, score, gameTimerMs, rngState, cheatUsed }` (src/core/types.ts).
- `MoveInput`: `{ up, down, left, right, block, punch, kick }`.
- `SimEvent`: união discriminada (hit, enemyDied, enemySpawned, playerDamaged, wandDamaged, waveStarted, waveCleared, bossPhase2, gameOver, victory, …).
- `PLAYER_STATS`: werdum (speed 180, hp 200), dida (190, 190), thor (200, 200).
- 12 WAVES hardcoded (`src/core/config/waves.ts`): `WaveConfig { id, enemies: {type,count}[], spawnInterval, isBoss? }`. Waves 8/10/12 são boss. Spawn 1800→900ms.
- Allies hoje: 2 IA controladas por `stepAlly` (seek/attack a <75px, 6 dmg, cooldown 900ms). **Esses slots são o que humanos vão ocupar.**

---

### Task 1: Workspaces + guard anti-colyseus no core + skeleton do pacote server

**Files:**
- Modify: `package.json` (root → npm workspaces: `["server"]`; scripts `test:server`, `dev:server`)
- Create: `server/package.json`, `server/tsconfig.json` (decorators ON), `server/README.md`
- Create: `server/src/index.ts` (placeholder `console.log` — sem Colyseus ainda)
- Modify: `tests/core/no-phaser-imports.test.ts` → renomear/estender para `no-forbidden-imports.test.ts` (também barra `from 'colyseus'`/`@colyseus`)

- [ ] **Step 1 (RED):** estender o guard test da Fatia 1 para falhar se algum arquivo de `src/core/**` contiver `from 'colyseus'`, `from '@colyseus`, ou `import.*[Cc]olyseus`. Rodar `npx vitest run` → o teste ainda passa (core está limpo) mas agora cobre a nova regra.
- [ ] **Step 2:** Converter `game-v2/package.json` em workspaces root: adicionar `"workspaces": ["server"]`. Adicionar scripts: `"test:server": "npm test -w server"`, `"dev:server": "npm run dev -w server"`, `"build:server": "npm run build -w server"`. NÃO mexer nos scripts existentes do client.
- [ ] **Step 3:** Criar `server/package.json`:
```json
{
  "name": "@werdum-fight/server",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run"
  }
}
```
- [ ] **Step 4:** Criar `server/tsconfig.json` (decorators ON, conforme docs Colyseus 0.17):
```json
{
  "compilerOptions": {
    "outDir": "./dist",
    "module": "commonjs",
    "target": "ES2022",
    "moduleResolution": "node",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "esModuleInterop": true,
    "strict": true,
    "strictNullChecks": false,
    "skipLibCheck": true,
    "sourceMap": true,
    "declaration": true
  },
  "include": ["src"]
}
```
- [ ] **Step 5:** `npm install` na raiz (instala o workspace). Criar `server/src/index.ts` com um `console.log('[server] placeholder')`. `npx tsc --noEmit -p server` verde.
- [ ] **Step 6:** tsc (client e server) + `npm test` + `npm run build` (client) verdes. Commit: `chore(v2): workspaces + pacote server skeleton + guard anti-colyseus no core`

### Task 2: `core` multiplayer — `MultiInput` e N players (substituir IA por humanos)

> Esta é a task de design-chave da fatia: estender o core de "1 player + 2 IA" para "1–3 players humanos + IA nos slots vazios", **sem quebrar o single-player** (que continua sendo "1 humano + 2 IA"). Toda lógica de combate/IA/ondas já é pura; o que muda é a **forma do input** e **quantos personagens são controlados por humanos**.

**Files:**
- Create: `src/core/multi.ts` (`createMultiInitialState`, `updateMulti`, tipos `MultiInput`, `PlayerSlot`)
- Modify: `src/core/types.ts` (adicionar `controlledBy?: 'human' | 'ai'` a `AllyState`/`PlayerState` OU introduzir lista unificada `characters` — ver Step 1 decisão)
- Modify: `src/core/config/waves.ts` (helper `scaleWaveForPlayers(wave, playerCount)`)
- Test: `tests/core/multi.test.ts`, `tests/core/wave-scaling.test.ts`

- [ ] **Step 1 (decisão de modelagem, RED):** escrever testes que fixam a semântica antes de implementar. Decisão a fixar: **NÃO** reescrever player/ally; em vez disso introduzir uma noção de **slots de personagem**. Modelo proposto (validar nos testes):
  - `PlayerSlot = { sessionId: string; charKey: 'werdum'|'dida'|'thor'; controlledBy: 'human'|'ai' }`.
  - O `GameState` ganha um campo `slots: PlayerSlot[]` (1–3). O `player` atual vira o slot[0]; allies viram os demais slots. **Para single-player:** slot[0] = humano, slots 1–2 = ai → comportamento IDÊNTICO ao de hoje (teste de regressão: `createMultiInitialState([{char,human}])` produz `GameState` equivalente ao `createInitialState` atual em combate/IA).
  - **Refactor mínimo:** unificar player+allies sob um array de "personagens jogáveis" é tentador mas arriscado; preferir **manter `player` + `allies` como estão** e mapear: o humano de cada slot dirige o personagem daquele slot. Quando um slot é humano, `stepAlly` NÃO roda para ele — em vez disso aplica-se `movePlayer` + `performAttack` com o input daquele humano. Testes devem provar: ally humano usa `MoveInput`; ally IA usa `stepAlly`; combate de ally humano usa os MESMOS ranges/dano do player (não os 6 dmg fixos da IA).
  - **Onde mora a complexidade:** o `player` original tem FSM de knockdown/recover e ataque por reach do personagem; os allies não. Tornar um ally humano significa dar a ele a mesma FSM. **Decisão:** promover a struct de ally controlado por humano para reusar `PlayerState` (todo slot humano é um `PlayerState`; todo slot IA continua `AllyState`). Fixar isso nos testes.
- [ ] **Step 2 (RED):** `MultiInput = Record<sessionId, MoveInput>`. Testes de `updateMulti(state, inputs: MultiInput, deltaMs) → { state, events }`:
  - aplica o input de cada slot humano ao seu `PlayerState` (movimento, ataque, block, FSM) na ordem dos slots;
  - slots IA continuam via `stepAlly`;
  - inimigos/ondas/wand processados UMA vez por tick (não por jogador);
  - dano de inimigo→jogador escolhe alvo conforme a IA já faz (target wand/player) — generalizar "player" para "qualquer slot humano mais próximo" (fixar a regra de alvo nos testes: enemy `chasePlayer` mira o humano vivo mais próximo);
  - determinismo: mesma seed + mesmo script de inputs por sessionId → `JSON.stringify(state)` idêntico após 60s simulados;
  - `gameOver` quando wand hp ≤ 0; jogador com hp ≤ 0 fica inerte (knockdown permanente / "down"), partida segue se ainda há humano vivo (co-op PvE).
- [ ] **Step 3 (RED):** `scaleWaveForPlayers(wave: WaveConfig, playerCount: 1|2|3): WaveConfig` (spec §5 "ondas escalam com nº de jogadores"). Testes: playerCount 1 = wave intacta; 2 e 3 escalam contagem de inimigos comuns (NÃO bosses) por um fator a definir e fixar (proposta: `count` de não-boss × playerCount, bosses inalterados; spawnInterval inalterado). O fator exato é tuning — fixar um default determinístico e deixar comentário `// TUNING`.
- [ ] **Step 4 (GREEN):** implementar `src/core/multi.ts` compondo os sistemas existentes (`movePlayer`, `performAttack`, `stepEnemy`, `stepAlly`, ondas) — reusando o máximo do `Simulation.ts` atual. Onde `Simulation.update` assume um único `player`, generalizar para iterar `slots`. **Manter `Simulation.ts` (single-player) funcionando**: ou (a) `Simulation.update` passa a delegar para `updateMulti` com um único slot humano, ou (b) os dois coexistem e `Simulation.update` é deprecado depois. Preferir (a) para uma fonte de verdade só — mas só se os testes da Fatia 1 continuarem 100% verdes; senão, (b) e anotar a dívida.
- [ ] **Step 5:** rodar a suíte INTEIRA (Fatia 1 + nova) — regressão zero no single-player. `npx vitest run --coverage`, core multi ≥80% lines.
- [ ] **Step 6:** tsc + vitest + build (client ainda usa o `Simulation`/`updateMulti` em single-player) + smoke Playwright (single-player idêntico). Commit: `feat(v2): core multiplayer — MultiInput, slots humano/IA e wave scaling`

### Task 3: Pacote `server` — sala Colyseus rodando o core a 20 ticks/s

**Files:**
- Modify: `server/package.json` (deps: `colyseus@0.17.10`, `@colyseus/core`, `@colyseus/schema@4.0.26`, `@colyseus/tools`; dev: `@colyseus/testing@0.17.11`, `vitest`, `ts-node-dev`)
- Create: `server/src/schema/ArenaState.ts` (Schema: projeção do `GameState`)
- Create: `server/src/rooms/ArenaRoom.ts` (sala autoritativa)
- Create: `server/src/app.config.ts` (`defineServer({ rooms: { arena: defineRoom(ArenaRoom) } })`)
- Create: `server/src/index.ts` (listen)
- Test: `server/tests/arena.test.ts`

- [ ] **Step 1:** instalar deps no workspace server: `npm install -w server colyseus @colyseus/schema @colyseus/tools` e `npm install -D -w server @colyseus/testing vitest ts-node-dev`. Verificar versões instaladas (`npm ls -w server colyseus @colyseus/schema`).
- [ ] **Step 2:** definir o **Schema** (`@colyseus/schema` 4.x, decorators) como projeção mínima do `GameState` — só o que o cliente precisa renderizar:
```ts
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class PlayerNet extends Schema {
  @type("string") sessionId = "";
  @type("string") charKey = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = 0;
  @type("number") maxHp = 0;
  @type("string") fsm = "normal";
  @type("int8")   facing = 1;
  @type("boolean") connected = true;
}
export class EnemyNet extends Schema {
  @type("number") id = 0;
  @type("string") enemyType = "";
  @type("number") x = 0; @type("number") y = 0;
  @type("number") hp = 0; @type("string") fsm = "approach";
}
export class ArenaState extends Schema {
  @type("string") status = "lobby"; // lobby | playing | gameover | victory
  @type("number") wave = 0;
  @type("number") wandHp = 0; @type("number") wandMaxHp = 0;
  @type("number") score = 0;
  @type({ map: PlayerNet }) players = new MapSchema<PlayerNet>();
  @type([ EnemyNet ]) enemies = new ArraySchema<EnemyNet>();
}
```
- [ ] **Step 3 (RED, via @colyseus/testing):** `server/tests/arena.test.ts` com `boot(appConfig)`:
  - criar sala, conectar 1 cliente → `room.clients.length === 1`, `state.players` tem 1 entrada;
  - cliente envia `{ type: 'ready' }` → host inicia partida → `state.status === 'playing'`, `state.wave >= 1` (aguardar via `room.waitForNextPatch()`);
  - cliente envia `input` (MoveInput) → após N patches, posição do seu PlayerNet muda;
  - 3 clientes entram → 3 entradas em `players`, slots IA preenchem o resto;
  - servidor é autoritativo: input forjado de "tomei 0 dano" não existe (cliente não manda hp) — assert que o cliente nunca seta hp.
- [ ] **Step 4 (GREEN):** `ArenaRoom`:
  - `maxClients = 3`.
  - `onCreate(options)`: gerar **seed**, `this.gameState = createMultiInitialState([])` (vazio até join), `this.setState(new ArenaState())` (via `state = new ArenaState()`), `this.setPatchRate(50)` (20fps — default do 0.17 já é 50ms, mas fixar explicitamente), `this.setSimulationInterval((dt) => this.tick(dt))`. O tick roda o core a passo fixo; usar acumulador para 20 ticks/s lógicos independentes do patch.
  - `messages = { input: validate(zInput, (client, payload) => this.inputs[client.sessionId] = payload), ready: (client) => this.tryStart(client) }`.
  - `onJoin(client, options)`: alocar um `PlayerSlot` (charKey escolhido / primeiro livre), inserir `PlayerNet` no `state.players`. Recusar se já em `playing` e sala cheia.
  - `tick(dt)`: acumular dt; enquanto ≥ 50ms (20Hz), `const { state, events } = updateMulti(this.gameState, this.inputs, FIXED_DT); this.gameState = state;` então **projetar** `gameState` → `ArenaState` (mutar o Schema: atualizar players/enemies/wand/score/status). Broadcast de eventos relevantes via `this.broadcast('events', batch)` quando útil (hits/sons) — mas o estado é a fonte; eventos são só para FX.
  - `onLeave/onDrop`: stub por enquanto (Task 6 implementa reconexão).
- [ ] **Step 5:** `app.config.ts` com `defineServer({ rooms: { arena: defineRoom(ArenaRoom) } })`; `index.ts` faz `server.listen(Number(process.env.PORT) || 2567)`. **Porta 2567** (default Colyseus) — NÃO usar 8080/8443/8843/8880 (reservadas UniFi, ver CLAUDE.md). Confirmar 2567 livre.
- [ ] **Step 6:** `npm run dev -w server` sobe; `npm test -w server` verde. tsc do server verde. Commit: `feat(v2): servidor Colyseus — ArenaRoom autoritativa rodando o core a 20Hz`

### Task 4: Salas por código (4–6 chars) + lobby mínimo + criar/entrar

**Files:**
- Modify: `server/src/rooms/ArenaRoom.ts` (custom roomId via Presence API)
- Create: `server/src/util/roomCode.ts` (gerador + colisão)
- Modify: `server/src/app.config.ts` (expor só `join`/`joinById`/`reconnect` ao cliente; `create` server-side controlado)
- Test: `server/tests/room-code.test.ts`

- [ ] **Step 1 (RED):** testes de código de sala (via testing): criar sala → `room.roomId` casa `/^[A-Z]{4,6}$/`; dois `createRoom` geram códigos distintos; `joinById(code)` entra na sala certa; `joinById('ZZZZ')` (inexistente) rejeita.
- [ ] **Step 2 (GREEN):** implementar custom roomId **conforme recipe oficial Colyseus** (presence `smembers`/`sadd`/`srem` num canal `$arena_codes`): `onCreate` → `this.roomId = await this.generateRoomId()` (gera 4 letras A–Z, regenera em colisão); `onDispose` → `this.presence.srem(...)` libera o código. (Recipe: docs.colyseus.io/recipes/custom-room-id.)
- [ ] **Step 3:** **expor só os métodos seguros ao cliente** (sem matchmaking público — spec): `matchMaker.controller.exposedMethods = ['join', 'joinById', 'reconnect']` no bootstrap. Criar sala é um fluxo explícito do cliente "host" via `client.create('arena')` — manter `create` exposto SOMENTE se o gate de host (premium) for server-side; nesta fatia (beta web) liberar `create` também e anotar que o gate premium entra na Fatia 4.
- [ ] **Step 4:** tsc + `npm test -w server` verde. Commit: `feat(v2): salas por código (custom roomId via Presence) + matchmaking restrito a join/joinById`

### Task 5: Camada de rede no cliente (atrás de flag) + lobby UI mínima

**Files:**
- Create: `src/net/NetClient.ts` (wrapper de `@colyseus/sdk`: connect, create-by-code, join-by-code, send input, subscribe state)
- Create: `src/net/flags.ts` (`NET_ENABLED`, `SERVER_URL` por env)
- Create: `src/scenes/LobbyScene.ts` (criar sala → mostra código; entrar com código; lista de players; "pronto")
- Modify: `src/scenes/*` (entrada de menu "Co-op" atrás do flag; default = single-player intacto)
- Modify: `package.json` (dep `@colyseus/sdk@^0.17.0`)
- Test: `tests/net/netclient.test.ts` (lógica pura: parse de código, estados de conexão — mock do SDK), smoke E2E manual

- [ ] **Step 1:** instalar `@colyseus/sdk` no client (`npm install @colyseus/sdk`). Verificar versão.
- [ ] **Step 2 (RED):** testes da lógica pura de `NetClient` que NÃO precisa de servidor real: validação/normalização do código (uppercase, 4–6 A–Z, rejeita inválido); máquina de estados de conexão (`idle → connecting → connected → error`) com SDK mockado; **fallback gracioso**: se `connect` lança (servidor fora), `NetClient` emite `unavailable` e NUNCA throw para o chamador (spec §8).
- [ ] **Step 3 (GREEN):** `NetClient` embrulha `new Client(SERVER_URL)`:
  - `createRoom(charKey)` → `client.create('arena', { charKey })` → retorna `{ code: room.roomId, room }`;
  - `joinByCode(code, charKey)` → `client.joinById(code, { charKey })`;
  - `onState(cb)` via `Callbacks.get(room)` (`onAdd/onRemove('players')`, `listen` em hp/x/y) — padrão 0.17;
  - `sendInput(input: MoveInput)` → `room.send('input', input)`;
  - `room.onMessage('events', …)` para FX;
  - tudo em try/catch com fallback.
- [ ] **Step 4:** `flags.ts`: `NET_ENABLED` (default `false` em produção de loja; `true` no beta web via env do Vite `import.meta.env.VITE_NET_ENABLED`); `SERVER_URL` de `import.meta.env.VITE_SERVER_URL` (default `ws://localhost:2567` em dev).
- [ ] **Step 5:** `LobbyScene` mínima (Phaser ou DOM overlay): botão "Criar sala" (mostra o código grande + copiar), campo "Entrar com código", seletor de personagem, lista de jogadores conectados, botão "Pronto". Entrada no menu principal "Co-op online" só aparece se `NET_ENABLED`. **Single-player permanece o caminho default e intocado.**
- [ ] **Step 6:** tsc + vitest + build verdes. Subir `npm run dev -w server` + `npm run dev` e testar manualmente: criar sala em uma aba, entrar com o código em outra, ver os dois personagens. Commit: `feat(v2): NetClient + LobbyScene (atrás de NET_ENABLED) — criar/entrar por código`

### Task 6: GameScene em modo rede — render do estado do servidor (sem prediction ainda)

**Files:**
- Modify: `src/scenes/GameScene.ts` (modo dual: `local` roda `core` localmente; `net` renderiza o `ArenaState` do servidor e envia input)
- Modify: `src/entities/*` (já são views desde a Fatia 1 — `syncFromState`)
- Test: smoke E2E manual co-op (2 abas)

- [ ] **Step 1:** introduzir `GameScene.mode: 'local' | 'net'`. Em `net`: NÃO chamar `sim.update`; em vez disso, a cada frame: coletar input local → `net.sendInput(input)`; ler o último `ArenaState` recebido → `syncFromState` em players/enemies/wand/HUD; consumir `events` para FX. Em `local`: comportamento da Fatia 1 inalterado.
- [ ] **Step 2:** mapear `PlayerNet`/`EnemyNet` do Schema para os sprites existentes (criar sprite ao `onAdd('players')`/novo enemy id; destruir ao `onRemove`/sumir da lista). Reusar a tabela evento→FX da Fatia 1.
- [ ] **Step 3:** smoke manual: 2–3 abas, mesma sala; cada uma controla seu personagem; inimigos/ondas sincronizados; wand compartilhada; game over/victory sincronizados. Latência local óbvia (sem interpolação) — aceitável nesta task, resolvido na Task 7.
- [ ] **Step 4:** tsc + vitest + build verdes; single-player (`mode local`) idêntico no smoke. Commit: `feat(v2): GameScene modo rede — renderiza ArenaState e envia input`

### Task 7: Interpolação + client-side prediction

**Files:**
- Create: `src/net/interpolation.ts` (buffer + lerp de posições remotas), `src/net/prediction.ts` (prediction do próprio personagem + reconciliação)
- Modify: `src/scenes/GameScene.ts`, `src/net/NetClient.ts` (timestamps/seq de input)
- Test: `tests/net/interpolation.test.ts`, `tests/net/prediction.test.ts` (lógica pura)

- [ ] **Step 1 (RED):** testes puros de interpolação: dado um buffer de snapshots (t0,t1) e um render-time entre eles, a posição interpolada é o lerp correto; clamp nos extremos; descarte de snapshots antigos. (Spec §5: interpolação dos demais jogadores e inimigos.)
- [ ] **Step 2 (RED):** testes puros de prediction: o cliente roda `movePlayer` localmente sobre o próprio input (mesma função pura do core) e, ao chegar o estado autoritativo, **reconcilia** (se divergência > limiar, snap/smooth para a posição do servidor). Como o jogo é PvE tolerante a latência (spec §5), prediction só do MOVIMENTO do próprio personagem (não de dano) — fixar esse escopo nos testes.
- [ ] **Step 3 (GREEN):** implementar buffer de interpolação (~100ms de atraso de render) para entidades remotas + inimigos; prediction de movimento do personagem local reusando `movePlayer` do core (zero duplicação de regra). Reconciliação por correção suave.
- [ ] **Step 4:** smoke manual co-op: movimento próprio responsivo (prediction), remotos suaves (interpolação), sem "teleporte" perceptível em rede local. tsc + vitest + build verdes. Commit: `feat(v2): interpolação de remotos + prediction de movimento do próprio personagem`

### Task 8: Reconexão (~60s) + robustez de quedas

**Files:**
- Modify: `server/src/rooms/ArenaRoom.ts` (`onDrop`/`onReconnect`/`onLeave`, slot inerte, re-escala de ondas)
- Modify: `src/net/NetClient.ts` (`room.onDrop`/`onReconnect`/`onLeave`, overlay "Reconectando…")
- Modify: `src/scenes/LobbyScene.ts`/`GameScene.ts` (UI de reconexão e de fallback)
- Test: `server/tests/reconnection.test.ts`

- [ ] **Step 1 (RED):** testes de reconexão via `@colyseus/testing`: cliente cai (fechar conexão sem consent) → servidor `onDrop` marca `PlayerNet.connected=false` e mantém o slot; reconectar dentro de 60s → `onReconnect` restaura `connected=true`, mesma `sessionId`; expirar (mockar timeout) → `onLeave` remove o slot e a partida re-escala/segue. (Spec §8: slot segurado ~60s, personagem inerte, sem retorno a partida segue.)
- [ ] **Step 2 (GREEN, servidor):** implementar conforme API 0.17:
```ts
onDrop(client: Client) {
  this.allowReconnection(client, 60);            // 60s de janela
  const p = this.state.players.get(client.sessionId);
  if (p) p.connected = false;                    // slot inerte, NÃO remove
  this.markSlotInert(client.sessionId);          // core: slot vira 'down'/inerte
  this.rescaleWaves();                           // re-escala ondas (spec §8)
}
onReconnect(client: Client) {
  const p = this.state.players.get(client.sessionId);
  if (p) p.connected = true;
  this.markSlotActive(client.sessionId);
}
onLeave(client: Client, code) {
  // chamado só quando reconexão falha/expira ou saída consentida
  this.removeSlot(client.sessionId);
  this.state.players.delete(client.sessionId);
  this.rescaleWaves();
}
```
- [ ] **Step 3 (GREEN, cliente):** `room.onDrop(() => overlay('Reconectando…'))`, `room.onReconnect(() => hideOverlay())`, `room.onLeave((code) => code === CloseCode.FAILED_TO_RECONNECT ? voltarAoLobbyComErro() : voltarAoLobby())`. Usar os defaults de auto-reconnect do SDK (maxRetries 15, backoff exponencial). **Fallback gracioso:** se o servidor cair de vez, o jogador volta ao menu single-player sem crash (spec §8).
- [ ] **Step 4:** teste manual: matar a conexão de uma aba por <60s e reconectar; matar o servidor inteiro e confirmar que o single-player continua jogável e o botão Co-op vira "indisponível". tsc + vitest (client+server) + build verdes. Commit: `feat(v2): reconexão 60s (onDrop/onReconnect) + fallback gracioso de quedas`

### Task 9: Deploy do beta co-op web + encerramento

> **Hospedagem do game server é decisão do usuário — ver "Questões abertas".** Esta task entrega o beta rodando contra um servidor de **dev/local** apontado por env; o provedor de hospedagem do servidor NÃO é escolhido aqui.

**Files:**
- Modify: `landing`/build do beta (`dist-beta`) com `VITE_NET_ENABLED=true` + `VITE_SERVER_URL` apontando ao server de teste
- Modify: spec (§6: Fatia 2 ✅ com data), CODEMAP/README do game-v2 e do `server/`
- Create: `server/README.md` (como subir local, env, portas)

- [ ] **Step 1:** `npx vitest run --coverage` em ambos pacotes — core multi e `server/` ≥80% lines nos módulos novos. Completar gaps.
- [ ] **Step 2:** build do beta web (`npm run build:beta`) com flags de rede ligadas só no beta; confirmar que o build de **loja** (default) mantém `NET_ENABLED=false` → single-player intocado. Smoke E2E web (Playwright) do single-player no beta para garantir não-regressão.
- [ ] **Step 3:** subir o `server/` localmente (ou no ambiente de teste que o usuário indicar) e validar o beta co-op fim-a-fim (criar sala → 3 entram por código → jogar uma partida → game over). NÃO comprometer com provedor de hospedagem.
- [ ] **Step 4:** atualizar spec §6 (Fatia 2 ✅ + data), README do `server/`, CODEMAP. push da branch v2.
- [ ] **Step 5 (critérios de aceite):**
  - core multi Phaser-free E Colyseus-free (guard test), determinístico (teste de replay), single-player idêntico (smoke);
  - sala Colyseus autoritativa: cliente só envia input, servidor simula a 20Hz, salas por código de 4 letras;
  - reconexão 60s funcional; servidor fora ⇒ single-player nunca quebra;
  - ondas escalam por nº de jogadores;
  - suíte client + server verde; builds de loja (single-player) e beta (co-op) ambos verdes.

---

## Questões abertas (DECISÃO DO USUÁRIO)

1. **Hospedagem do game server (BLOQUEIA o lançamento, NÃO esta fatia):** **Colyseus Cloud** (gerenciado, deploy nativo, escala/presence prontos, custo recorrente) **vs VPS pequeno** (controle total, mais barato no baixo volume, você opera Node + presence + TLS). Esta fatia roda contra dev/local; a Fatia 3/4 precisa do alvo definido. O plano NÃO escolhe — sinalizado conforme spec §4 ("Colyseus Cloud ou VPS pequeno").
2. **Fator de wave-scaling por jogador (tuning):** o plano fixa um default determinístico (count de não-boss × playerCount, bosses inalterados) para os testes; o multiplicador "que diverte" é tuning de playtest — confirmar o número-alvo.
3. **`core/` como pacote separado vs path alias:** o plano mantém `src/core` consumido pelo server via alias (zero risco ao client). Extrair para `packages/core` é refactor opcional — vale a pena agora ou deixar para depois?
4. **Gate de host premium:** nesta fatia (beta web) `create` fica liberado para qualquer cliente. O gate "só premium hosteia" (spec §2) é server-side e entra na Fatia 4 — confirmar que NÃO deve entrar já.
5. **Client SDK — `@colyseus/sdk` vs `colyseus.js`:** o plano adota `@colyseus/sdk@^0.17.0` (recomendado para servidor 0.17). Se houver razão para o pacote legado `colyseus.js`, sinalizar.
