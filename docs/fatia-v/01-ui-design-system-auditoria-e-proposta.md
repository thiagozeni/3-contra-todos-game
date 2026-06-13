# Fatia V · Trilha 1 — UI/HUD Design System
## Auditoria do estado atual + proposta de direção (material de decisão)

> Status: **rascunho de brainstorm** — não é spec aprovado. Preparado enquanto o
> Thiago estava fora (13/jun). Objetivo: ao voltar, ele revisa, escolhe a direção,
> e só então seguimos pro spec formal → plano → execução. Nada foi gerado,
> implementado ou commitado no jogo.

---

## 1. Por que esta trilha primeiro

A linguagem visual da UI (tipografia, paleta, espaçamento, componentes) é a
**fundação** que as outras trilhas (personagens, arena, vídeos, loja) vão seguir.
Definir isso primeiro evita retrabalho: sprites e telas geradas depois já nascem
dentro do sistema.

---

## 2. Auditoria do estado atual

### 2.1 Cor — 40+ hex sem sistema
Varredura de `src/scenes/` + `src/ui/`:

- **Dourados brigando** (deveria ser UMA cor de marca): `#f3c204` (45×, o dominante),
  `#ffdd00` (13×), `#ffdd44`, `#ffcc66`, `#ffe500`, `#fff3bf`, `#ffffaa`, `#ddaa00`.
- **6 vermelhos** ad-hoc: `#ff4d4d`, `#ff4444`, `#ff3300`, `#ff0000`, `#dd2222`, `#ff6666`.
- **Verdes** dispersos: `#44ff88`, `#22cc44`, `#52e85c` (player P3), + verde-lore `#2D6A2D`/`#1A6B1A`.
- `#000000` em 110 lugares (stroke/sombra — ok, mas deveria ser token).
- Player colors (FB8) já formam um mini-sistema coerente: P1 `#3b9eff`, P2 `#ff4fd8`, P3 `#52e85c`.

**Diagnóstico:** ausência de tokens semânticos. Cada tela reinventou tons próximos.

### 2.2 Tipografia — caos de escala
- **~33 tamanhos de fonte distintos** (10px → 110px), sem nenhuma progressão.
- Família: predominantemente `"Press Start 2P"` (pixel) — boa para o arcade, mas
  ilegível em texto corrido (ex.: How-to-Play).
- Títulos como "GAME OVER" / "CONGRATULATIONS" usam um bitmap **diferente** do
  resto → quebra de consistência.

### 2.3 Mídia — três linguagens sem regra
Convivem sem critério definido:
- **Foto real B&W** (retratos no Select, backstage no Title)
- **Pixel art** (sprites in-game, logo, ícones de HUD)
- **Arena fotorrealista** (fundo das telas)

**Diagnóstico:** falta uma regra de "quando cada mídia aparece".

### 2.4 Telas auditadas (screenshots em `_e2e-shots/audit-*.png`)
| Tela | Observação principal |
|---|---|
| Title | Logo forte; **menu inferior apertado/ilegível** |
| Select | Retrato foto-real + cards pixel; hierarquia ok, espaçamento ad-hoc |
| Game Over | Fonte de título destoa; sprites pixel; layout centrado ok |
| You Win | Stats com boa hierarquia, mas alinhamento/spacing irregular |
| How-to-Play | Texto em fonte pixel pesa na leitura |
| Top 10 | Lista funcional, sem ritmo tipográfico |
| HUD (jogo) | Barras + FB9/10/11 recentes; densidade alta no canto sup-esq |

---

## 3. Três direções estéticas (escolher UMA)

### A. Arcade fiel — "16-bit consolidado" *(menor risco)*
Mantém exatamente a estética pixel atual, mas aplica **sistema**: tokens de cor,
escala tipográfica, grid de espaçamento, alinhamento. Consolida os dourados/vermelhos
e padroniza as fontes. **Sem geração pesada** — é disciplina + refactor de UI.
- ✅ Rápido, barato, zero risco de descaracterizar. Coerência imediata.
- ❌ Não eleva o "teto" visual — continua parecendo o mesmo jogo, só mais limpo.

### B. Arcade premium — "neo-retrô" *(recomendada)*
Eleva o pixel ao nível premium **sem perder a alma arcade** que a própria key art
do fliperama celebra:
- Sistema completo (tokens + escala + grid) como na opção A, **mais**:
- **Molduras/painéis** de HUD e telas com bordas estilizadas (cantos chanfrados,
  filete dourado), fundo com leve textura/scanline.
- **Key art premium nas telas** de título/menu (aproveita o material 4K já pronto).
- **Tipografia display** mais rica para títulos (bitmap custom legível) + Press Start 2P
  para HUD numérico + uma fonte de corpo legível para textos longos.
- Glow/brilho sutil nos acentos dourados; transições polidas.
- ✅ Salto de qualidade real, mantém identidade. Usa Higgsfield só para molduras/fundos.
- ❌ Mais trabalho que A; exige calibrar 1 tela-piloto antes de propagar.

### C. Cinematográfico — "modern beat'em up" (estilo SoR4) *(maior salto)*
UI limpa e moderna sobre a base pixel: tipografia condensada moderna, retratos
**ilustrados em alta** no HUD, telas com arte ilustrada (não pixel).
- ✅ Visual de jogo comercial AAA-indie.
- ❌ Caro, lento, e **risco de descaracterizar** o charme arcade/fliperama que é o
  coração da marca. Briga com a estética da key art existente.

**Minha recomendação: B.** É o ponto ótimo entre elevar o teto e proteger a
identidade. A key art do fliperama já provou que o "norte" é arcade premium, não
realismo moderno.

---

## 4. Rascunho de tokens (para a direção B — ajustável)

> Valores iniciais derivados da identidade existente; calibramos na tela-piloto.

### Paleta semântica (consolida os 40+ hex)
```
brand/gold        #f3c204   (consolida TODOS os dourados — marca, "PRESS START", acentos)
brand/gold-deep   #c9a84c   (variante sombra/relevo do dourado)
ring/green        #1a6b1a   (verde-lore SILVA — moldura/detalhe temático)
state/danger      #ff4d4d   (consolida os 6 vermelhos — alerta, DOWN, HP crítico)
state/warn        #ffaa22   (HP médio)
state/ok          #22cc44   (HP cheio, sucesso)
player/p1         #3b9eff   player/p2  #ff4fd8   player/p3  #52e85c   (FB8 — mantidos)
ink/black         #000000   (stroke/sombra)  surface/night #0d0d1a (fundos de painel)
text/hi #ffffff   text/mid #cccccc   text/lo #848484
```

### Escala tipográfica (substitui os 33 tamanhos)
```
display  72   (títulos de tela: GAME OVER, YOU WIN)
h1       48   h2 32   h3 24
body     20   small 16   micro 12   (HUD/labels)
```
Famílias: **Display** (bitmap custom a definir) · **HUD** Press Start 2P ·
**Body** (fonte legível a definir — para How-to-Play/Top 10).

### Espaçamento (base 4)
```
4 · 8 · 12 · 16 · 24 · 32 · 48 · 64
```

### Componentes a padronizar
Painel/moldura · botão de menu · barra de HP (player + aliado + inimigo) · badge de
status (DOWN/OFF — FB10/11) · linha de stat (You Win) · item de lista (Top 10) ·
card de seleção (Select/Lobby) · overlay (defeat FB12 / reconnect).

---

## 5. Perguntas para você decidir (ao voltar)

1. **Direção estética:** A, B (recomendada) ou C?
2. **Escopo da 1ª entrega:** começo por **uma tela-piloto** para calibrar o sistema
   (sugiro o **HUD** — é o que mais aparece) e só depois propago, certo?
3. **Tipografia display/body:** topa eu trazer 2-3 opções de fonte (bitmap display +
   corpo legível) para você escolher?
4. **Uso da key art premium:** posso usar o material 4K do fliperama nas telas de
   título/menu (direção B)?
5. **Mídia:** mantemos a regra "foto real só em retratos/marketing, pixel in-game"?

---

## 6. O que NÃO foi feito (espera sua decisão)
- Nenhum asset gerado no Higgsfield.
- Nenhuma mudança de código/UI.
- Nenhum commit no jogo.
- Saldo Higgsfield ainda não consumido (checo antes de gerar em volume).
