# Sprint Fase 3 — Limpeza & Consolidação do DS (Fatia V · Trilha 1)

> Sessão autônoma de 15/jun/2026. Thiago saiu e pediu um sprint de ~2h na v2.
> Este doc registra o **diagnóstico do estado real**, o que foi feito de forma segura
> nesta sessão, e o **backlog que precisa do olho do Thiago** (calibração visual).

---

## 1. Diagnóstico (estado real, 15/jun)

Baseline verde no início: `tsc --noEmit` exit 0; `vitest run` → **668 passed / 39 files**.

### O que JÁ está pronto (revisado arquivo a arquivo)

| Item | Plano | Estado real |
|------|-------|-------------|
| **Task 14 — SelectScene** | migrar p/ DS | ✅ feito (dsText + makeAngledPanel/Portrait + tokens) |
| **Task 15 — TopTenScene** | makeListRow + dsText + score numeric | ✅ **já feito** (usa makeListRow, makeMenuButton, dsText, tokens) |
| **Task 16 — HowToPlayScene** | makeAngledPanel + chips + dsText | ✅ **já feito** (painel outline, keycaps angulados, dsText) |
| **Task 17 — FB12 overlay** | makeOverlay no showCoopDefeatOverlay | ✅ **já feito** (GameScene:1349 monta via makeOverlay) |
| **Bug package-lock desync** | npm install + commit | ✅ **resolvido** (`npm ci --dry-run` roda limpo) |

> O relatório anterior subestimava o progresso: as 4 telas de fluxo principais da Fase 3
> já consomem o DS. O que resta é a **Task 18 (limpeza dos legados)** nas telas
> secundárias, e a maior parte dela é **decisão visual** (precisa de calibração).

### O que ainda usa legados (`add.text` cru / `FONT` local / hex ad-hoc)

| Tela | `add.text` cru | `FONT` local | Observação |
|------|:---:|:---:|------------|
| TitleScene | 5 | — | já usa `hex/primitive/FAMILY`; tamanhos custom calibrados (42/26/20px) |
| YouWinScene | 11 | — | topo migrado; corpo com hex cru + tamanhos custom (72/80/27/64/44px) |
| GameOverContinueScene | 6 | — | a migrar |
| LobbyScene | 15 | ✅ | `FONT`, `YELLOW`, `WHITE='#f8f7f7'`, `GREY='#aaaaaa'`, `RED_ERR='#ff6666'` |
| CoopSelector | 7 | ✅ | `FONT` + cores hex cruas |
| HUD | 16 | — | badge "DOWN"/"OFF" como texto; cores `#ff4d4d`/`#cccccc` |
| AnimTestScene | 20 | — | **cena de dev/teste** — fora do escopo de produção |

### A tensão central da Task 18

O DS define **34 cores hex distintas** espalhadas pelas telas, mas a paleta semântica
cobre só ~6 delas exatamente. As outras ~28 são **ad-hoc fora da paleta**
(`#e4e4e4`, `#ffdd00`, `#aaccff`, `#44ff88`, `#ff6666`, `#f8f7f7`, …).

- **Promover todas como estão** → incha a paleta com cores quase-duplicadas (anti-DS).
- **Consolidar para a paleta semântica** → muda a cor renderizada (decisão visual).

A regra do plano (Fase 3) é explícita: *"calibrar rodando no jogo, commit só após OK do Thiago"*.
Portanto a consolidação NÃO é feita no escuro — ela vira a **proposta** da seção 3.

---

## 2. Feito nesta sessão (seguro, visual-equivalente)

> Critério: só refactor **byte-idêntico** no resultado renderizado (provado por screenshot).
> Nenhuma cor/tamanho muda. Commits locais `[skip-gate]`, **sem push** (aguarda review).

- [ ] Substituir `FONT` local (`'"Press Start 2P", monospace'`) por `FAMILY.display` (idêntico) — Lobby, CoopSelector.
- [ ] Substituir hex literais que têm **token exato** pelos tokens do DS:
  `#000000`→`black`, `#f3c204`→`goldBrand`, `#ffffff`→`white`, `#cccccc`→`gray20`,
  `#888888`→`gray50`, `#ff4d4d`→`red`.
- [ ] Verificar a cada tela: `tsc --noEmit` + `vitest run` verde + screenshot idêntico ao anterior.

(Ver seção 4 para o status de execução.)

---

## 3. Backlog que precisa do Thiago (calibração visual) — Task 18 restante

Ordem sugerida quando o Thiago voltar. Cada item: mockup/screenshot → OK → executo → screenshot → commit.

1. **Aprovar a paleta semântica consolidada** (mapa das 34 cores → ~12 semantic). É o desbloqueio de tudo abaixo — ver `07-paleta-consolidada-proposta.md`.
2. **YouWinScene** — migrar stats para `makeStatLine`, títulos/labels para `dsText` (decide roles vs tamanhos atuais 72/80/27/64/44px).
3. **GameOverContinueScene** — `dsText` + tokens.
4. **LobbyScene / CoopSelector** — `dsText` + tokens + `makeMenuButton` nos botões; cores fora de paleta resolvidas pelo item 1.
5. **HUD** — decidir se o badge "DOWN"/"OFF" passa a usar `makeStatusBadge` (muda aparência) ou mantém texto.
6. **Limpeza final** — quando nenhuma tela usar hex cru, remover constantes locais; rodar suíte E2E relevante (`e2e-fb12.mjs` etc.).

---

## 4. Status de execução desta sessão (15/jun)

Feito (seguro, no working tree — **sem commit/push**, aguarda review):

1. **Diagnóstico + plano** — este doc (`06`). Corrige o entendimento: tasks 14–17 já feitas, lock OK.
2. **Proposta de paleta** — `07-paleta-consolidada-proposta.md`.
3. **Opção A implementada (TDD, aditiva)** — `src/ui/ds/tokens/colors.ts`:
   - primitives: `gray33` (#aaaaaa), `greenOk` (#44ff88), `redErr` (#ff4444), `amber` (#ffdd44)
   - semantic: `textMuted`, `feedbackOk`, `feedbackError`, `feedbackWarn`
   - testes: `tests/ui/ds/colors.test.ts` (+2 casos). Suite **670 passed** / `tsc` exit 0.
   - É **aditivo**: nenhuma tela consome ainda → zero mudança visual. Destrava a migração.

NÃO feito (deliberadamente — precisa de você / seria re-trabalho):

- **Migração das telas** (YouWin/GameOver/Lobby/CoopSelector/HUD) — aguarda OK da paleta
  (Opção A vs B). Fazê-la antes seria reescrever as telas duas vezes.
- **Cordas da frente** — recorte manual seu (escuro-sobre-escuro, fora do automático).
- **Arte Higgsfield** — geração com créditos/sua aprovação.

### Gargalo real da v2

Não são horas de código — são **3 decisões/recursos seus**: (1) aprovar a paleta
(Opção A já está pronta, é só dizer "vai"), (2) recorte manual das 2 faixas pretas das
cordas, (3) liberar geração de arte no Higgsfield. Com (1) destravado, a migração de
todas as telas é mecânica e eu fecho a Fase 3 rápido.
</content>
