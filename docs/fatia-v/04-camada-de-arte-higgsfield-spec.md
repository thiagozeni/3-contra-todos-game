# Fatia V · Camada de arte premium (Higgsfield) — Spec

> Data: 2026-06-14 · Branch: `v2`
> Antecede: `01-ui-design-system-auditoria-e-proposta.md`, `02-design-system-spec.md`, `03-design-system-plan.md`
> Pré-requisito concluído: Design System migrado (`766a9f3` — aliases legados removidos, telas consomem tokens do `ds/`).

## Contexto e motivação

O Design System resolveu **consistência/fundação**, mas não o **teto visual ("uau")** — a fidelidade pictórica é a mesma estética desenhada à mão. O salto de "parece jogo caro" vem da **camada de arte**, não da UI sistemática.

No **v1**, a dor central foi manter elementos separados em camadas: imagens geradas no Gemini exigiram **recomposição manual no Figma**. Esta passada elimina isso: cada asset é **realçado no lugar** (image-to-image, mantendo a essência), continua sendo sua própria camada PNG, e o Phaser compõe em runtime. Zero recomposição.

## Objetivo

Elevar o teto visual realçando cada asset de **fundo e elemento** para uma versão mais premium (maior resolução, iluminação/profundidade cinematográfica), mantendo a essência de cada imagem, ajustando o enquadramento para os principais dispositivos e trocando o patrocinador SPATEN pela marca Cachorradas Estúdios. Tudo orquestrado a partir do Claude Code (sem ferramenta externa).

## Decisão estética central

**Palco premium renderizado + lutadores pixel art = beat'em up arcade clássico, deliberado.** Os sprites de personagem permanecem pixel; só fundos/elementos sobem de fidelidade. Isso resolve (em vez de criar) a tensão estética que já existe hoje no jogo.

## Escopo

### ✅ Entram (full-frame, opacos — image-to-image direto)
- `cenario/game-bg.png` (ringue com SPATEN) — **asset de calibração**
- `cenario/bg-ringue.png`
- `cenario/intro-bg.png`
- `cenario/select-player-bg.png`
- `cenario/sem-crowd.png`
- `cenario/cachorradas.png` (arena alternativa, estilo mais cartoon — avaliar unificação de estilo)
- `cenario/real.png` (só 1368×768 — a mais necessitada de upscale)

### ⚠️ Entram com cuidado de transparência (alpha) — fase posterior
- `cenario/cenario-cordas.png`, `cenario/game-cordas.png` (overlays de corda na frente dos personagens)
- `elementos/logo-novo.png`, `elementos/logo.png` (key art)
- `elementos/good-guys*.png`, `elementos/bad-guys*.png` (grupos)

Tratamento: enhance + `remove_background` para restaurar alpha, ou recompor o elemento à parte.

### 🚫 Fora de escopo
- **Todos os sprite sheets** (`public/sprites/` — bosses, dida, enemies): pixel art em folhas de animação; enhance generativo destrói frames e estética.
- Retratos pequenos de HUD (`hud-*.png` 370×370) e perfis de UI (`*-perfil.png`): decidir depois; risco de quebrar a leitura em tamanho pequeno.

## Pipeline por asset (orquestrado via MCP Higgsfield)

1. **Enhance premium** — `generate_image` usando a original como referência (image-to-image, força moderada para preservar enquadramento, plateia, paleta) + `upscale_image` para resolução. Saldo atual: 842 créditos (plano Plus).
2. **Troca de patrocinador** — SPATEN / "SHATEN" → Cachorradas Estúdios, usando o **logo real** (`imgs/cachorradas-logo.png` — cabeça de cão + raio, com alpha). O SPATEN aparece em múltiplos pontos por arena: letreiro no tatame, faixas nas cordas, logo circular central.
   - **Decisão aberta (resolver na calibração):** logo *baked* na imagem gerada vs. logo como **layer Phaser separado** sobre uma arena gerada limpa (sem patrocinador). Baked é mais simples; layer separado é mais nítido e editável. Testar baked no 1º concept e medir nitidez.
3. **Enquadramento para dispositivos** — o jogo roda em canvas fixo **1920×1080 com `Scale.FIT` + `CENTER_BOTH`** (letterbox em telas não-16:9, sem reflow). Estratégia aprovada: **outpaint generoso** (`reframe`/`outpaint_image`) gerando um master mais largo/alto, + pequeno ajuste no layer de fundo do jogo para exibir arena estendida em vez de barra preta (ex.: fundo full-bleed atrás do canvas). No celular em pé, o jogador vê mais arena, não barra preta.
4. **Gate de aprovação** — o still é validado **rodando no jogo real** (não só mockup); o usuário aprova antes de qualquer vídeo.
5. **Vídeo** — somente após o still aprovado, gerar o loop animado (`generate_video`, image-to-video) para os fundos animados (`videos/br-ringue.mp4`, `videos/intro.mp4`).

## Ordem de execução

1. **`game-bg.png`** — calibração. Exercita todos os passos (enhance + premium + resolução + troca SPATEN→Cachorradas + enquadramento). Gerar **UM** concept, aprovar rodando no jogo.
2. Escalar para as demais arenas opacas (repetição do pipeline calibrado).
3. Assets com alpha (cordas, key art).
4. Vídeos dos fundos animados.

## Regras de calibração (do usuário)

- Calibrar com referência real (a própria imagem original como norte de essência), **UM concept de cada vez**, esperar feedback — não disparar variações às cegas.
- **Não mostrar estado meio-termo/incompleto** — completar a integração e só então mostrar, comparando com o original.
- Validar **rodando no jogo**, não só no still.
- Checar saldo antes de gerar em volume.

## Riscos

- **Nitidez de texto/logo gerado** — generative inpaint de letreiro pode borrar; mitigar com layer separado se baked não aguentar.
- **Alpha em overlays de corda** — enhance pode achatar transparência; tratar em fase própria com `remove_background`.
- **Coerência entre arenas** — estilos divergentes hoje (`game-bg` realista vs `cachorradas` cartoon); definir um norte de estilo no 1º concept e aplicar a todas.
- **Custo de vídeo** — image-to-video é caro; gate de still aprovado protege o saldo.

## Critérios de sucesso

- `game-bg.png` aprovado rodando no jogo, com troca de patrocinador legível e enquadramento que elimina a barra preta nos devices alvo.
- Pipeline repetível documentado, escalável às demais arenas sem retrabalho de recomposição.
- Estética coerente entre todas as arenas; personagens pixel preservados.

## Fora de escopo desta fase

- Re-arte de sprites/personagens.
- Mudança da direção estética aprovada (B — pixel arcade premium).
- Refactor de UI/DS (já concluído).
