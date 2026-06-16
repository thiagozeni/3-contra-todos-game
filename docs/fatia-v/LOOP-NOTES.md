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
2. [ ] Instalar masters superwide oficiais nessas telas
3. [ ] Animar HUD (glow/shine/pulse)
4. [ ] Loader screen
5. [ ] Tela OPTIONS real

## Progresso (atualizar por tarefa)
- **T1 ✅** Criado helper `src/ui/sceneBg.ts` (`mountSceneBg`). Migradas Title+Select+TopTen+HowToPlay+YouWin+GameOver do `add.image().setDisplaySize` → `#scene-bg` DOM cover. Backgrounds mantidos (Select=select-player-bg, demais=arena-premium-bg). tsc 0, 670 testes. Overlays de escurecimento preservados. NOTA p/ T2: BootScene ainda carrega texturas `select-player-bg`/`arena-still` que agora podem estar órfãs — checar e limpar/repurpose.
