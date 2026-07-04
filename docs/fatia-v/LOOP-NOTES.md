# Loop autônomo — Fatia V (branch v2)

> Bridge de contexto para o loop autônomo de ~2h. Ler no início, atualizar ao fim de cada tarefa.
> Iniciado: 2026-06-16. Teto: ~2h. Sem push (só commits locais de checkpoint).

## Guard-rails (NÃO violar)
- Nunca passar pixel art por IA generativa. Escalar só com nearest-neighbor (`magick -filter point` / CSS `image-rendering: pixelated`).
- Não gerar masters novas no Higgsfield (custo + risco pixel). Só instalar masters que JÁ existem no disco.
- Não fazer `git push`. Commits locais de checkpoint na branch `v2`, um por tarefa verde.
- Antes de cada checkpoint: `npx tsc --noEmit` (0 erros) + `npm test` (manter 670+ verdes).
- Não tocar nos VFX de combo/wave do HUD (preservados deliberadamente).
- Cenas de produção: zero hex cru (usar tokens do DS / dsText).

## Decisões do Thiago (calibração)
- Arte: PODE instalar masters existentes (official-16x9/, select-bg-dark-concept.png). Ele revê depois.
- Commits: SIM, checkpoints locais (sem push).
- OPTIONS: escopo mínimo — música on/off, SFX on/off, fullscreen, localStorage.

## Padrão de referência #scene-bg (TitleScene.create)
```ts
const sceneBg = document.getElementById('scene-bg') as HTMLImageElement | null
if (sceneBg) { sceneBg.src = 'imgs/cenario/<bg>.png'; sceneBg.style.display = 'block' }
this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { if (sceneBg) sceneBg.style.display = 'none' })
```

## Fila
1. [x] Migrar 5 telas (Select, TopTen, HowToPlay, YouWin, GameOverContinue) → #scene-bg
2. [x] Instalar masters superwide oficiais nessas telas (→ ACHADO: produção já correta; ver abaixo)
3. [x] Animar HUD (glow/shine/pulse)
4. [x] Loader screen (→ já existia; harmonizado à paleta dourada)
5. [x] Tela OPTIONS real

## Progresso (atualizar por tarefa)
- **T1 ✅** Criado helper `src/ui/sceneBg.ts` (`mountSceneBg`). Migradas Title+Select+TopTen+HowToPlay+YouWin+GameOver do `add.image().setDisplaySize` → `#scene-bg` DOM cover. Backgrounds mantidos (Select=select-player-bg, demais=arena-premium-bg). tsc 0, 670 testes. Overlays de escurecimento preservados. NOTA p/ T2: BootScene ainda carrega texturas `select-player-bg`/`arena-still` que agora podem estar órfãs — checar e limpar/repurpose.
- **T2 ✅ (reclassificada)** Comparei visualmente masters vs assets de produção vs mockup-alvo do GPT:
  - `intro-bg.png` (1881×836) JÁ É a master `intro-ultrawide-master` → Home OK.
  - Select: `select-player-bg.png` (atual) JÁ BATE com o mockup-alvo do GPT (fight-night dark + "SELECT PLAYER"). O concept `select-bg-dark-concept.png` é uma **passarela de gala** — obsoleto/errado p/ jogo de luta. NÃO instalado (seria downgrade). Decisão de arte fina (master ultrawide do Select) fica pro Thiago.
  - `arena-premium-bg.png` (arena fight-night c/ ringue+logo) coerente p/ TopTen/HowToPlay/YouWin/GameOver → mantido.
  - **Limpeza:** removidas do BootScene as texturas órfãs `select-player-bg` e `arena-still` (após T1 ninguém as usa; #scene-bg busca os PNGs por HTTP). PNGs em public/ preservados. ~5MB a menos de load.
  - Masters de referência em `docs/fatia-v/art/official-16x9/` deixadas no working tree (pesadas, 4k) — Thiago decide se versiona.
- **T3 ✅** Animações de HUD (pixel-safe, Phaser tweens):
  - `AngledBar.enableShine()` — shine de mesmo skew varrendo o preenchido (sem máscara: paralelogramo clipado matematicamente à área cheia; Phaser 4 mask é arriscado). Ligado em player (gap 2600) e wand (gap 3100, dessincronizado).
  - Special bars: shimmer "energia carregada" em onda (alpha yoyo, stagger 120ms/seg).
  - Score: pop de escala (1→1.22) no número dourado quando o placar sobe (guarda `lastScore`).
  - API verificada na .d.ts do Phaser 4.1: `tweens.addCounter` + `tween.getValue(index?): number|null` (tratei o null com `?? 0`). tsc 0, 670 testes.
  - PENDENTE validação visual em runtime (HUD só no GameScene) — fazer screenshot no fim do loop.
- **T4 ✅ (reclassificada)** Loader JÁ EXISTIA no `index.html` (vídeo `loader.mp4` + barra `#loader-bar` + `#loader-pct` + botão JOGAR neon; BootScene.preload já atualiza o progresso). NÃO há `loader.png` (a memória estava desatualizada). Ação: **harmonizado à paleta canônica** — estava todo CIANO (#00aaff/#00eeff), único elemento fora da identidade dourada (Home/Select/HUD são gold). Troquei barra+glow+%+botão JOGAR+keyframe neon p/ gold (#ffc400/#fff3b0/#9c6b00). Estrutura/comportamento intactos. Reversível trivial se o Thiago preferir ciano.
- **T5 ✅** Tela OPTIONS real (substituiu o placeholder "em breve"):
  - SoundManager estendido: `musicEnabled`/`sfxEnabled` independentes + persistência localStorage (`wf_music_enabled`/`wf_sfx_enabled`). `muted` (tecla M no gameplay) mantido como master kill-switch. Guards sfx()/tone()/syncMusicMute/playMusic respeitam `musicActive`/`sfxActive`.
  - Novo `src/ui/optionsOverlay.ts` (`makeOptionsOverlay`): overlay DS com 3 toggles — MÚSICA / EFEITOS / TELA CHEIA (Phaser ScaleManager.toggleFullscreen). Navegável ↑↓/W/S + ENTER/SPACE/←/→; hover foca; clique no scrim fecha; ESC pela TitleScene. Input próprio removido no destroy. Cores via tokens (hex(semantic[id])), zero hex cru.
  - 6 testes novos (`tests/systems/soundManagerPrefs.test.ts`). **676 testes**, tsc 0.

## Resumo do loop
5/5 tarefas concluídas. Checkpoints commitados na v2 (sem push). Árvore verde (tsc 0, 676 testes).
Validação visual FEITA (Playwright, `scripts/_loop-validate*.mjs`): loader, Title, Select, TopTen, HowToPlay, GameOver, YouWin, OPTIONS (via clique), + **ultrawide 3440×1440** (Title/Select/TopTen) + **HUD single-player** (selectedChar='werdum' → GameScene). Zero page errors em todas. Timer 00:00→00:01 confirma GameScene vivo (tweens rodando).
RESSALVA ultrawide: `#scene-bg` cobre sem barras ✅, MAS `select-player-bg` é asset 16:9 com "SELECT PLAYER" embutido → cover corta levemente o topo dele em 21:9. Canvas do jogo fica centrado/intacto. Fix 100% = master ULTRAWIDE do Select (geração de arte do Thiago — Title já tem, Select não).
SÓ-AO-VIVO: o shine das life bars é sutil (alpha 0.16) — imperceptível em still; Thiago confirma o movimento jogando.
