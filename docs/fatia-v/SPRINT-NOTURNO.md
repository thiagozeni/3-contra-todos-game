# Sprint noturno — 18/jun/2026

Revisão de todos os itens da lista + auditoria de layout vs `_gpt_concept/` + vídeos de background.

---

## 3ª rodada (19/jun) — REVISÃO DO JOGO (lista tela-a-tela do Thiago)

Revisão completa enviada pelo Thiago, atacada tela por tela (código primeiro, vídeos no fim). **Tudo no /v2.**

**Loader:** botão JOGAR ganhou roll-over (pausa o pulse, scale 1.1, moldura/preenchimento arredondado + brilho no hover). Vídeo voltou ao **v2 (Seedance, preferido)** no lugar do v3 (Hailuo).

**Intro:** 4:3 — cabeça do nocauteado sai do enquadramento → **anotado p/ futuro** (não corrigido nesta rodada).

**Top 10:** fundo = arena animada (howtoplay-loop) no lugar do estático; toggle Multiplataforma/Game Center refeito como **pills arredondados com ícone** (globe/trophy, gold-fill ativo).

**Co-op:** texto premium/propaganda novo; cadeado (ic-lock) e setas dos CTAs alinhados ao texto; **novo botão "ASSISTIR UMA PROPAGANDA"** (rewarded ad → libera criação de sala, entitlement override server-side, fail-closed sem adService); espaçamento vertical maior p/ mobile.

**How to Play:** "TOQUE PARA CONTINUAR" centralizado entre a missão e a base; seta = triângulo desenhado (alinhada ao texto).

**Select:** nomes **abaixo** das miniaturas (não dentro do card quando selecionado); **matte cinza recortado** do topo das perfis (~9px); wand com mesmo enquadramento (zoom 1.08) + texto "KNOCKED OUT"; **bg regerado SEM lutadores no ringue** (Seedance, câmera estática).

**Game-play (HUD):** thumbs em **paralelogramo** (mesmo ângulo das barras); barra de life = **amarelo (vida atual) + VERMELHO (vida perdida)** no lugar do chip azul; **pisca vermelho ao tomar dano**; SPECIAL recuadas p/ dentro (ao lado dos cinegrafistas); **PROTEGIDO→WANDERLEI**; dots decorativos removidos; cinegrafistas -30px; ícone de pause centrado no círculo. **Personagens +10%** (CHAR_SCALE em player/ally/enemy/bosses).

**⚠️ Bounds do palco — NÃO alterados (pendente playtest):** investiguei a fundo. Expandir o RING **acopla com a elipse de colisão do wand** (`wandScale()` em movement.ts deriva o tamanho do wand de RING.top/bottom). Bounds maiores → elipse do wand maior → inimigos assentam ~3px fora da faixa de ataque (`|dy|<30` em enemyAi) → **wand para de tomar dano (quebra o game-over)**. Recalibrar exige afinar JUNTO bounds + faixa de ataque do wand, validando em playtest. Tool: `scripts/_ring-debug.mjs` (overlay do trapézio sobre o tapete). Revertido p/ não arriscar a mecânica.

**Game Over:** CONTINUE alinhado à esquerda do box; opções em 2 linhas "SIM (VER PROPAGANDA)"/"NÃO (VOLTAR AO INÍCIO)" (cursor vertical); cores das infos por categoria (conceito); **bg regerado com câmera TRAVADA** (1º=último frame, acaba a emenda do zoom) + **plateia mais ilustrada/estilizada**.

**Aberto p/ você:** (1) bounds do palco + faixa de ataque do wand em playtest; (2) enquadramento 4:3 da intro; (3) validar os 2 vídeos novos (select/gameover) e o loader v2 em tela.

---

## 2ª rodada (madrugada 18→19/jun) — polish + sprint autônomo

**Pedidos do Thiago:**
- ✅ **Cinegrafistas filmando o ringue** — regerados (antes viravam de costas); perfil travado, movimento sutil.
- ✅ **Cinegrafistas colados nas bordas** (mobile largo) — movidos do canvas (letterboxed) p/ camada DOM ancorada nas bordas reais (left/right -40px, bottom -20px), animados por sprite-sheet via CSS steps.
- ✅ **Botões maiores no mobile** — home (altura 66→84, gap 14→26, fonte h3→h2) e pause (r 38→50).
- ✅ **Loader cropado** — preto ao redor removido (1536×1024 → 1146×649, -26%).
- ✅ **Loader animado** — Minimax Hailuo (movimento dos personagens 2.3× o do Seedance: balançam, placa se move, logo pulsa), loop seamless, `<video>` + fallback PNG.

**Sprint autônomo (tier objetivo):**
- ⚠️ **Verde nos cards (Seleção)** — INVESTIGADO A FUNDO, **não corrigido** (gate de hardware). Conclusão: o glitch do filter-mask do Phaser 4 **só** aparece no WebGL por software (SwiftShader, que o Playwright headless/headed sempre usa) servindo o build via **CDN/HTTPS** (latência). NÃO reproduz no localhost (mesmo SwiftShader) nem é reproduzível em GPU real — provável framebuffer não-inicializado, que GPU real zera corretamente. Tentei: re-aplicar a máscara (não limpa) e recriar os cards (não limpa + adiciona flicker p/ quem NÃO tem o glitch) → **revertido**. **Precisa de confirmação em navegador real (GPU):** se o Thiago vê o verde em tela, dá p/ atacar com debug em ambiente GPU; se não vê (provável), era só artefato de captura.
- ✅ **Auditoria mobile** — todas as telas em landscape estreito/largo: ok (FIT mantém proporção); sem cortes/overflow; botões já cobertos.
- ✅ **Otimização de assets** — pngquant nos PNGs grandes carregados: **-21,8MB (-34%)**, sprite-sheets dos cinegrafistas -75%, sem perda visível.
- ✅ **Testes** — suíte verde (40 arquivos, 676 testes); tsc limpo.
- ✅ **Co-op/Lobby fiel ao conceito (`co-op.png`)** — `CoopSelector` reescrito (só camada visual, lógica de rede 100% preservada: assinaturas públicas, `render(view)`, cores por jogador, cursores, check):
  - Cards **arredondados** (`makeRoundedPortrait`, igual ao Select) no lugar do paralelogramo.
  - **Meu pick fica maior** ("1P"), recriado só quando minha seleção muda (não a cada patch ~20Hz → sem flicker).
  - Nomes **abaixo** dos cards + status abaixo (LIVRE/VOCÊ/Pn travado/✓).
  - 4º slot agora é **"AGUARDANDO JOGADOR"** (card escuro + cadeado) — cadeira livre, não mais o wand "KNOCKED YOU OUT".
  - Bloco de código movido p/ **painel à esquerda** (`LobbyScene`): "CÓDIGO DA SALA / OHBZ / COMPARTILHAR / dica" — libera o centro-topo p/ os cards (como no conceito).
  - Rodapé "★ ESCOLHA SEU LUTADOR ★" com estrelas (igual ao Select).
  - **Fundo do lobby = arena animada** (reusa `howtoplay-loop.mp4`: ring limpo + luzes varrendo, sem texto) no lugar do fundo chapado `0x0d0d1a` + véu p/ legibilidade — o conceito mostra arena atrás dos cards. Fallback PNG/isMacCompat.
  - Bug pego pelo quality-gate e corrigido: estrelas (`makeIconTile`) não vão ao container (handle ≠ GameObject) — geridas por `decorIcons[]`. tsc limpo, 676 testes verdes, validado por screenshot.

**Aberto p/ você:** confirmar o verde sumiu no `/v2` em navegador real (GPU).

---

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
