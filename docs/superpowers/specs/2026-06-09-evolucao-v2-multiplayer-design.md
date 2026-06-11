# 3 Contra Todos — Evolução V2: Co-op Online + Modelo Comercial

> Spec de design validado em brainstorm — 2026-06-09
> Status: aprovado em conversa, aguardando revisão final do documento

## 1. Visão

Evoluir o 3 Contra Todos de wave-survivor solo para um **arcade co-op online** estilo
TMNT/Simpsons arcade: até 3 jogadores na mesma arena, cada um com um personagem
(Werdum, Dida, Thor), entrando por **código de sala**. Produto comercial, monetizado
por rewarded ads no app gratuito, com progressão persistente como fase seguinte.

O multiplayer é o carro-chefe: "entre na arena com 3 amigos" é a única feature do
roadmap que é manchete de marketing e diferencia o jogo de wave-survivors solo.

## 2. Modelo comercial — "anfitrião premium"

Dois apps nas lojas, mesmo código (feature flags):

| | App grátis (listing NOVO) | App premium (listing ATUAL, pago) |
|---|---|---|
| Single-player | ✅ com ads | ✅ sem ads |
| **Entrar** em sala por convite | ✅ grátis, com ads | ✅ sem ads |
| **Criar/hostear** sala | ❌ (avaliar depois: host via rewarded ad) | ✅ ilimitado |

Racional (modelo Jackbox): **um amigo compra, três entram de graça.**

- O convite é vetor de venda ("compra que eu quero jogar contigo") e de instalação
  do app grátis (3 downloads por sala).
- Quem comprou a V1 ganha o multiplayer de graça como update — recompensa
  compradores, gera reviews, e dá diferenciação real ao premium (multiplayer + sem
  ads, não só "sem anúncio").
- Restrição de loja: app pago que vira gratuito no Google Play nunca volta a ser
  pago — por isso a V2 free é um listing novo, não uma conversão do atual.
- Upsell no app grátis: "remova os ads e hosteie salas — conheça a edição premium".

## 3. Estratégia de versões — spin-off `v2`

- **Mesmo repositório**, branch de longa duração `v2`; `main` segue sendo a V1 em
  manutenção. Localmente, **git worktree** (`game-v2/`) para trabalhar nas duas em
  paralelo. Fixes da V1 entram na V2 via `cherry-pick`.
- **Beta público gratuito:** a versão web (`werdumfight.com/v2`) é o canal de teste
  da V2, sem revisão de loja a cada iteração.
- Lançamento: V2 substitui a V1 **no listing premium atual** (update) e estreia o
  **listing gratuito novo** com ads.

## 4. Stack técnica

**Decisão: permanecer no ecossistema TypeScript.** Avaliadas Godot 4, Unity e
Defold — todas implicam reescrever ~5.900 linhas funcionais, perder o pipeline web
e refazer o caminho recém-conquistado até as lojas, sem ganho que este jogo precise.

- **Engine:** upgrade **Phaser 3 → Phaser 4** (lançado abr/2026, renderer novo,
  API compatível para jogos com objetos padrão) como primeiro passo da branch `v2`.
  V1 fica intocada no Phaser 3.
- **Netcode:** **Colyseus** (servidor autoritativo, open source, TypeScript,
  salas com código nativas). Escolhido sobre Playroom Kit por: (a) anti-cheat por
  construção — a simulação roda no servidor, cliente só envia input; (b) sem
  lock-in SaaS; (c) matchmaking público é feature nativa quando a base justificar.
- **Hospedagem do game server:** Colyseus Cloud (gerenciado) ou VPS pequeno.
- **Mantidos:** Vite, Capacitor 8, Supabase (leaderboard, persistência), TS.

## 5. Arquitetura

```
core/        ← simulação pura (TS sem Phaser): estado, combate, ondas, física simples
             roda no servidor (Colyseus) E no cliente (prediction/single-player)
client/      ← Phaser 4: renderiza estado, captura input, efeitos, som, UI
server/      ← sala Colyseus: instancia o core, valida inputs, distribui estado
```

- O single-player da V2 é "o core rodando localmente" — um código só para os dois
  modos. A extração do `core/` é o grosso do esforço e o pré-requisito do multiplayer.

### Sincronização

- Servidor autoritativo a ~20 ticks/s: posições, IA, dano, ondas, vida do protegido.
- Cliente: *client-side prediction* do próprio personagem; *interpolação* dos
  demais jogadores e inimigos.
- Co-op PvE é tolerante a latência (sem duelo humano×humano).
- Ondas escalam com o nº de jogadores; o personagem protegido é compartilhado.

## 6. Fatias de entrega

Princípio: **cada fatia termina com o jogo publicável** (`v2` sempre deployável na
web). Ritmo livre de dedicação — uma pausa de um mês não apodrece nada.

| Fatia | Conteúdo | Ship |
|---|---|---|
| **0 — Fundação** ✅ 2026-06-10 | Branch `v2` + worktree, upgrade Phaser 4, build verde (web/iOS/Android) | `werdumfight.com/v2`, gameplay idêntico — *publicado na gh-pages; pendente exceção `/v2/` na regra de redirect do Cloudflare (ação manual no painel)* |
| **1 — Core** ✅ 2026-06-10 | Extração da simulação para `core/` (estado, combate, ondas), single-player vira core local | V2 web idêntica por fora + core sob testes (283 testes, 99% cobertura, determinístico) |
| **2 — Co-op web** ✅ 2026-06-11 | Servidor Colyseus, sala por código, 2–3 players + ondas sync, prediction + interpolação | Co-op web funcional contra servidor local/dev; hosting pendente (Colyseus Cloud vs VPS — decisão do usuário); 388 testes cliente + 23 servidor, cobertura net ≥95%, reconexão 60s validada, server down ⇒ single-player nunca quebra |
| **3 — Robustez + mobile** | Reconexão, quedas, polish de rede, lobby/convite (share link), devices reais | Co-op em TestFlight/internal testing |
| **V — Visual (paralela)** | Ver §7 — converge na Fatia 4 | Assets prontos pré-lançamento |
| **4 — Lançamento duplo** | Premium: update V2 no listing atual. Grátis: listing novo + AdMob + gate de host | Relançamento; inicia Marco 2 |

### Marcos seguintes (fora do escopo deste spec)

- **Marco 2 — Monetização e medição:** rewarded ads (continue + bônus), analytics
  de retenção (D1/D7, funil de sessão) — logo após o lançamento, no pico de atenção.
- **Marco 3 — Progressão e meta-game:** upgrades persistentes, desbloqueios,
  missões diárias — desenhado com os dados do Marco 2.

## 7. Fatia V — Revisão visual premium

Trilha paralela às Fatias 1–3; precisa estar pronta antes da Fatia 4.

- **Personagens/inimigos:** sprites em resolução maior — upscale via Higgsfield do
  acervo de `_artes-originais/` + geração nova onde valer; manter identidade do
  `art_direction.md` (consistência > novidade).
- **Arena/cenário:** fundo em alta resolução, camadas de profundidade, iluminação.
- **UI/componentes:** HUD, telas (title, select, game over, top 10) e o novo lobby
  como mini design system (tipografia, paleta, espaçamento consistentes).
  Sequência: redesign de UI **depois** da Fatia 2, quando o fluxo de lobby existir.
- **Vídeos:** background do title screen e trailer de lançamento via Higgsfield —
  o trailer do co-op é a peça central do relançamento.
- **Assets de loja:** screenshots, feature graphic e ícones para os **dois**
  listings (visualmente distintos entre si) + atualização da landing 3contratodos.com.
- **Critério de pronto:** página de loja indistinguível de beat'em ups comerciais
  de referência.

## 8. Tratamento de falhas

- **Jogador cai:** servidor segura o slot ~60s (token de reconexão Colyseus);
  personagem inerte; sem retorno, a partida segue e as ondas re-escalam.
- **Servidor fora / sem internet:** o jogo nunca quebra — single-player roda o core
  localmente, offline; multiplayer vira botão desabilitado, não crash.
- **Score:** apenas partidas simuladas no servidor entram no leaderboard co-op —
  anti-cheat por construção (continuidade do anti-cheat v2 da V1).

## 9. Testes

- **`core/`:** unit tests (Vitest) — combate, ondas, balanceamento, sem browser.
- **Servidor:** integração de sala (criar/entrar/simular partida) com as
  ferramentas de teste do Colyseus.
- **Cliente:** smoke E2E web (Playwright) + checklist manual em devices reais
  antes de cada release de loja.

## 10. Decisões registradas (e alternativas rejeitadas)

| Decisão | Rejeitado | Por quê |
|---|---|---|
| Multiplayer primeiro | Ads/analytics primeiro; progressão primeiro | Escolha do produto: carro-chefe de marketing; risco mitigado pelas fatias shippáveis |
| Anfitrião premium | Multiplayer só no app pago | Paywall total mataria o loop viral do convite |
| Dois listings | Converter listing pago em free | Compradores traídos + irreversível no Google Play |
| Colyseus | Playroom Kit, NetplayJS | Anti-cheat server-side, open source, matchmaking futuro |
| Phaser 4 (TS) | Godot, Unity, Defold | Reescrita total sem ganho necessário; pipeline web/lojas já funciona |
| Sala por código | Matchmaking público | Sem massa crítica; Colyseus permite adicionar depois |
