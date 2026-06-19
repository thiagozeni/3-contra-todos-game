# Sprint noturno — 18/jun/2026

Revisão de todos os itens da lista + auditoria de layout vs `_gpt_concept/` + vídeos de background.

## ✅ Feito e no ar (/v2)

### Re-skin tela-por-tela (commit f9d9596)
- **Top 10**: estrelas centralizadas ao título, brilho em loop, botão VOLTAR com rollover animado (novo `makeBackButton`), entrada em cascata, `> PRESS START <`.
- **Intro**: rollover sem inversão (estrutura escura + texto dourado + ícones na cor original), Options refeito no estilo das demais, véu cobrindo 100% (escurece camadas DOM, resolve laterais ultrawide).
- **How to Play**: reconstruída em elementos (4 painéis MOVIMENTO/ATAQUE/DEFESA/SISTEMA com ícones + keycaps), cascata, missão pulsando, seta do hint centralizada, rollover do VOLTAR.
- **Game Play (HUD)**: HUD central centralizado, miniaturas mais largas, botão pause redondo (sem fundo amarelo), cinegrafistas separados e ancorados nos cantos.

### Auditoria de layout vs conceito (commit c2b0f6c)
- **Novo `makeRoundedPortrait`**: retrato em card retangular vertical arredondado (substitui o paralelogramo `makeAngledPortrait`, que não batia com o conceito).
- **Select**: cards verticais arredondados, busto enquadrado, selecionado maior + seta 1P, sem painel de fundo — fiel ao `select-player.png`.
- **HUD**: retratos do player/wand/aliados retangulares arredondados (`game-play.png`).
- **Novo `makeResultPanel`**: caixa arredondada + 4 linhas com ícone colorido (troféu/caveira/relógio/coração; caveira e coração desenhados via graphics).
- **Game Over**: usa `makeResultPanel` (removido o "RESULTADO" inexistente no conceito).
- **You Win**: usa `makeResultPanel` + removido "PLAY AGAIN?" (conceito só tem `> PRESS START <`).

### Vídeo de fundo da arena (commit 9ed4432)
- Seedance 2.0 (image-to-video) → loop seamless por crossfade (`scripts/_make-loop.sh`), câmera fixa. `#arena-bg` religado como vídeo com fallback PNG. Arquivo: `public/videos/arena-loop.mp4`.

## ✅ Vídeos de fundo de menu — FEITOS (commit 03ccc61)
Os 3 saíram da fila na manhã seguinte (Game Over precisou de `reveal_generation` por `ip_detected`).
Loops seamless gerados (crossfade, câmera fixa) e integrados via `mountSceneBgVideo` (fallback PNG):
- `public/videos/howtoplay-loop.mp4` — luzes varrendo o ringue
- `public/videos/select-loop.mp4` — título + linhas LED vermelhas + lutadores
- `public/videos/gameover-loop.mp4` — título/caveiras + personagens idle

## ✅ Cinegrafistas animados (commit 03fe304)
Opção 3 escolhida (croma + key-out). Como vídeo alpha não funciona em iOS/Safari,
entregue como **sprite-sheet animado** (idle filmando, anim com yoyo = loop seamless):
- Seedance 2.0 gera cada cinegrafista sobre **magenta** (não verde — um usa roupa verde
  militar) → croma key + despill + erosão de borda (`scripts/_cam_sheet.py`).
- `public/imgs/cenario/cam-left-sheet.png` / `cam-right-sheet.png` (14 frames cada).
- GameScene: sprites animados ancorados nos cantos (depth 1400, abaixo das SPECIAL bars).

## Observações
- **Verde nos cards (Select) no /v2**: aparece só no screenshot headless (WebGL por software, sem GPU) do build de produção; no dev local e provavelmente em navegador real (com GPU) não aparece. Confirmar visualmente em tela real.
- **Top 10 / MULTIPLATAFORMA**: o toggle no canto sup-direito não está no conceito, mas é funcional (Game Center iOS). Mantido; pode ser deixado mais discreto se quiser.
- Saldo Higgsfield ao fim do sprint: ~600 créditos (4 vídeos = ~90).
