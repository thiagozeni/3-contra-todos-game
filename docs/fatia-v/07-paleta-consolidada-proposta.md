# Proposta — Consolidação da paleta semântica (desbloqueio da Task 18)

> **Decisão pendente do Thiago.** A migração das telas restantes (YouWin, GameOver,
> Lobby, CoopSelector, HUD) está travada numa única decisão: como as cores hex ad-hoc
> espalhadas pelo código mapeiam para a paleta semântica do DS. Este doc põe o mapa na
> mesa para você bater o martelo — depois a migração vira mecânica.

## Contexto

`src/ui/ds/tokens/colors.ts` hoje tem **20 primitives** e **18 semantic**. As telas de
produção ainda usam **~10 cores hex ad-hoc fora da paleta**. (As cores exóticas
`#ffdd00 #aaccff #ffcc66 #445566 #335544 #88aacc …` aparecem **só na AnimTestScene**,
que é cena de debug interno — **fora de escopo**, fica como está.)

## O mapa (cores ad-hoc de produção → token)

| Hex ad-hoc | Onde (produção) | Papel | Token proposto | Δ visual |
|------------|-----------------|-------|----------------|:--------:|
| `#f8f7f7` | CoopSelector, Lobby (`WHITE`) | texto claro | `textPrimary` (#ffffff) | quase nulo |
| `#e4e4e4` | GameOverContinue | texto claro | `textPrimary` (#ffffff) | leve |
| `#aaaaaa` | Lobby (`GREY`), GameScene | texto secundário | **novo `textMuted` (#aaaaaa)** ou `textSecondary` (#cccccc) | nulo / leve |
| `#44ff88` | CoopSelector, YouWin ("SALVO!"/ready) | feedback OK | **novo `feedbackOk` (#44ff88)** | nulo |
| `#ff4444` | YouWin (erro ao salvar) | feedback erro | **novo `feedbackError` (#ff4444)** ou `hpLow` (#ff4d4d) | nulo / leve |
| `#ff6666` | Lobby (`RED_ERR`), GameScene | feedback erro suave | `feedbackError` ou `hpLow` | leve |
| `#ffdd44` | GameScene (reconnect), HUD | aviso | **novo `feedbackWarn` (#ffdd44)** ou `gold` (#ffd23f) | nulo / leve |
| `#ff9900` | Lobby | aviso/ação laranja | `primitive.orange` (#ffaa22) | leve |
| `#ff8800` | HUD | aviso laranja | `primitive.orange` (#ffaa22) | leve |

## Duas direções (escolha uma)

### Opção A — Conservadora (Δ visual = ~zero) ⭐ recomendada p/ esta fase — ✅ JÁ IMPLEMENTADA (15/jun)
Adicionar 4 tokens semânticos ancorados nos valores **já usados**, preservando o pixel atual.
> **Status:** os tokens abaixo já estão em `colors.ts` com testes (suite 670 passed, tsc verde),
> de forma **aditiva** (nenhuma tela consome ainda). Falta só seu OK para eu migrar as telas
> para consumi-los. Se preferir a Opção B, removo os 4 tokens trivialmente.

```ts
// primitive: + gray33: 0xaaaaaa, greenOk: 0x44ff88, redErr: 0xff4444, amber: 0xffdd44
// semantic:
textMuted:     primitive.gray33,   // #aaaaaa — textos secundários atuais
feedbackOk:    primitive.greenOk,  // #44ff88 — "SALVO!", "READY"
feedbackError: primitive.redErr,   // #ff4444 — erros de salvar/conexão
feedbackWarn:  primitive.amber,    // #ffdd44 — "Reconectando…", avisos
```
Resultado: migração 100 % byte-idêntica. Telas passam a consumir só `semantic`.
Custo: a paleta cresce (mais tokens), mas é fiel ao visual aprovado.

### Opção B — Agressiva (consolida, aceita Δ pequeno)
Não cria tokens novos; mapeia tudo para os existentes (`textSecondary`, `hpLow`, `gold`,
`orange`). Paleta enxuta, porém alguns textos/avisos mudam de tom levemente. Exige seu
olho nas telas afetadas (Lobby, HUD, YouWin, GameOver).

## Recomendação

**Opção A agora** (destrava a migração sem nenhuma mudança visual — coerente com a regra
"sem mudar estética" da Fase 3), e uma passada **B** opcional depois, só se você quiser
enxugar a paleta, tela a tela com screenshot. Assim o ganho de fundação vem já, e a
decisão estética fica para quando você puder olhar.

> Ao aprovar, eu: (1) adiciono os tokens da Opção A com TDD em `tests/ui/ds/colors.test.ts`,
> (2) migro Lobby → CoopSelector → YouWin → GameOver → HUD para `dsText`/tokens,
> (3) screenshot de cada uma p/ você conferir, (4) commits locais e só então push.
</content>
