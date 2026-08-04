# Migração de domínio: werdumfight.com → 3contratodos.com

> Criado em 2026-08-04. Motivo: 3ª recusa do AdSense ("conteúdo de baixo valor", 30/jul/2026).
> Decisão: consolidar site, jogo web e conteúdo sob **3contratodos.com** (o nome do jogo e o
> domínio operacional), cumprindo de fato a mudança de endereço aberta no Search Console em 26/abr.

## Status

| Fase | Estado |
|---|---|
| 0 — decisão de conteúdo | ✅ home da promo (vídeo + selo Nº 1), com nav/rodapé do site |
| 1 — repo pronto para o novo domínio | ✅ commit `d178d2f` (repo `game`) + `8b894b7` (branch `v2`), **não publicado** |
| 2 — DNS e GitHub Pages | ⬜ pendente — exige acesso a GitHub, Cloudflare |
| 3 — Google (Search Console + AdSense) | ⬜ pendente |
| 4 — 4ª revisão do AdSense | ⬜ pendente |

Nada foi ao ar: os commits estão em branches locais (`migracao-3contratodos` no repo do jogo,
`v2` no game-v2), sem push. O deploy só dispara em push para `main`.

## Diagnóstico que motivou a migração

- AdSense recusou `werdumfight.com` 3× (01/jul, 11/jul, 30/jul) sempre por **"conteúdo de baixo valor"**.
- Search Console: **mudança de endereço ativa desde 26/abr/2026** declarando `werdumfight.com` →
  `3contratodos.com`. Consequências medidas: **0 cliques orgânicos** em 3 meses; a SERP de
  `site:werdumfight.com` devolve título/trecho do domínio de destino.
- A mudança de endereço **nunca foi cumprida**: não há 301: `werdumfight.com` responde 200 com
  conteúdo próprio, mais rico que o do destino. Os dois sites estão vivos, e um deles declarado morto.
- Ou seja: o revisor do AdSense avalia um domínio sem tráfego próprio, cujos sinais o Google já
  consolidou em outro lugar. A qualidade do texto nunca foi o gargalo.

## Estado atual (medido)

| | werdumfight.com | 3contratodos.com |
|---|---|---|
| Repo | `3-contra-todos-game` | `3-contra-todos-landing` |
| Publicação | GitHub Pages + **Cloudflare** (`cf-ray`) | GitHub Pages **direto** (sem CF) |
| Build | `vite build` → `dist/demo`; `cp -R landing/. dist/`; branch `v2` → `dist/v2` | estático puro |
| Páginas | 13 no sitemap + `/demo/` + `/v2/` | **1** (só a home) |
| Conteúdo | ~6.800 palavras (guia, personagens, como-jogar, 5 devlogs) | one-pager de download |
| Jogo jogável | `/demo/` e `/v2/` | **não hospeda** |
| `ads.txt` | presente, "Autorizado" no AdSense | **404** |

**O ativo monetizável inteiro está no domínio declarado morto.** É isso que a migração corrige.

## Estratégia

**Trocar o domínio de cada repositório, em vez de mover conteúdo entre repos.** O repo `game` já
contém jogo + conteúdo + pipeline de build; movê-lo para o domínio certo é uma mudança de CNAME
mais um search-replace. O caminho inverso (portar 13 páginas e o build do Vite para o repo da
landing) refaria a pipeline sem ganho.

- `3-contra-todos-game` passa a servir **3contratodos.com** (home + 13 páginas + `/demo/` + `/v2/`)
- `werdumfight.com` vira **301 permanente** via Cloudflare — não pode ser desligado (ver Riscos)
- `3-contra-todos-landing` é aposentado como site; seus blocos bons migram para a home nova

---

## Fase 0 — Decisão de conteúdo (precisa do Zeni)

Qual home fica. As duas são boas e diferentes:

- **werdumfight.com/** — estrutura de site: nav de 7 seções, "jogue no navegador", features, história curta, badges das lojas
- **3contratodos.com/** — peça de campanha: selo "Nº 1 App Store BR", **vídeo do Werdum conhecendo o jogo**, história longa, créditos (Felipe, Pedro, Zeni, Werdum)

Recomendação: **base = home do repo `game`** (é ela que sustenta um site navegável), enxertando da
promo o vídeo do Werdum, o selo de Nº 1 e o bloco de créditos. Trabalho de conteúdo, não mecânico —
não deve ser feito no automático.

## Fase 1 — Preparar o repo `game` para o novo domínio

Mecânico: **57 ocorrências de `werdumfight.com` em 17 arquivos** de `landing/`.

- [ ] `CNAME` (raiz) e `landing/CNAME` → `3contratodos.com`
- [ ] `landing/**/*.html`: `<link rel="canonical">`, `og:url`, `og:image`, `twitter:image`, JSON-LD, links absolutos
- [ ] `landing/sitemap.xml` (13 URLs) e `landing/robots.txt`
- [ ] `landing/css/site.css` (1 ocorrência)
- [ ] **Adicionar `/demo/` e `/v2/` ao sitemap** — hoje o jogo, a página mais importante, está fora dele
- [ ] `ads.txt` — já existe e está correto; segue para o novo domínio junto com o resto de `landing/`
- [ ] Branch `v2`: `game-v2/CNAME`, `game-v2/landing/CNAME`, e os 6 canonical/og de `game-v2/index.html` (apontam para `/demo/`)
- [ ] `game-v2/tests/net/inviteLink.test.ts`: URLs de teste. **O parser deve continuar aceitando links `werdumfight.com/v2/?sala=`** — há convites já compartilhados circulando

## Fase 2 — DNS e GitHub Pages (ordem importa)

1. [ ] Repo `3-contra-todos-landing`: **liberar** o custom domain primeiro — o GH Pages recusa um domínio já reivindicado por outro repo
2. [ ] Repo `3-contra-todos-game`: custom domain → `3contratodos.com`
3. [ ] Colocar `3contratodos.com` sob **Cloudflare (proxy ON + SSL Full)** — hoje está direto no GH Pages. Ver o gotcha de certificado já documentado (memória `reference_ghpages_cert_api_gotcha`): pedidos de cert presos em "new" server-side; CF proxy ON é a solução estável
4. [ ] `werdumfight.com` (já no Cloudflare): **Redirect Rule 301** `werdumfight.com/*` → `https://3contratodos.com/$1`, **preservando o path** (crítico para os convites `/v2/?sala=XXXX`)
5. [ ] Verificar: `curl -sI https://werdumfight.com/v2/?sala=ABCD` deve devolver `301` com `location:` no path equivalente

## Fase 3 — Google

- [ ] Search Console: com os 301 no ar, a mudança de endereço passa a ser verdadeira. Ela **expira 180 dias após 26/abr ≈ 23/out/2026** — se vencer antes de tudo estar no ar, refazer
- [ ] Propriedade `3contratodos.com` no Search Console: enviar o sitemap novo, pedir indexação das páginas principais
- [ ] **Esperar a reindexação** — semanas, não dias. Pedir revisão do AdSense antes de o novo domínio ter páginas indexadas e tráfego > 0 repete a recusa
- [ ] AdSense: remover `werdumfight.com`, adicionar `3contratodos.com` (com `ads.txt` no ar)
- [ ] **Publicar o snippet do AdSense.** Hoje ele não existe em nenhuma página: `WebAdSenseService`
      injeta a tag em runtime, e só quando `VITE_WEB_ADSENSE=true` — flag que o `deploy.yml` não usa
      no build do `/v2`. Colocar o snippet estático no `<head>` das 13 páginas de `landing/`; o
      revisor precisa vê-lo nas páginas de conteúdo, não dentro do canvas do jogo

## Fase 4 — Só então solicitar a 4ª revisão

---

## Riscos e pendências

- **Servidor co-op (`coop.werdumfight.com`)**: não há validação de `Origin` no repo, mas a config
  real vive na VM cloud. **Confirmar antes de virar o domínio** — se houver allowlist de origem, o
  co-op quebra para quem entrar por `3contratodos.com`. O subdomínio em si pode continuar como está:
  é infra, não é indexável, e não afeta SEO.
- **Convites já compartilhados** apontam para `werdumfight.com/v2/?sala=`. O 301 com preservação de
  path resolve — por isso o domínio antigo **vira redirecionador permanente, não é desligado**.
- **Apps nas lojas não dependem do domínio**: sem `apple-app-site-association`, sem `assetlinks.json`,
  e `capacitor.config.ts` não tem `server.url`. Nada a fazer no mobile.
- **Duplicação transitória**: enquanto os dois domínios servirem conteúdo, o sinal continua dividido.
  Fases 1 e 2 devem ir ao ar juntas.
