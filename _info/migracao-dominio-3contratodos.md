# Migração de domínio: werdumfight.com → 3contratodos.com

> Criado em 2026-08-04. Motivo: 3ª recusa do AdSense ("conteúdo de baixo valor", 30/jul/2026).
> Decisão: consolidar site, jogo web e conteúdo sob **3contratodos.com** (o nome do jogo e o
> domínio operacional), cumprindo de fato a mudança de endereço aberta no Search Console em 26/abr.

## Status

| Fase | Estado |
|---|---|
| 0 — decisão de conteúdo | ✅ home da promo (vídeo + selo Nº 1), com nav/rodapé do site |
| 1 — repo pronto para o novo domínio | ✅ `d178d2f` + `99cc3cf` (repo `game`), `8b894b7` (branch `v2`) |
| 2 — GitHub Pages | ✅ **3contratodos.com no ar com o site consolidado** |
| 2b — Redirect 301 do domínio antigo | ✅ Redirect Rule ativa na Cloudflare |
| 3a — Search Console | ✅ sitemap reenviado + indexação solicitada |
| 3b — AdSense (trocar o site) | ⏸️ **em espera proposital** — ver abaixo |
| 4 — 4ª revisão do AdSense | ⬜ pendente |

**Search Console (04/08):** sitemap reenviado — passou de **1 para 14 URLs** encontradas.
Indexação solicitada para `/`, `/demo/`, `/guia/`, `/personagens/`, `/como-jogar/`, `/novidades/`.

**Por que o AdSense fica em espera:** adicionar `3contratodos.com` agora dispara revisão com o
domínio recém-migrado, `/demo/` ainda não indexada e tráfego orgânico zerado — o mesmo quadro que
gerou as três recusas. O certo é esperar a reindexação assentar (2–4 semanas), confirmar páginas
indexadas e tráfego > 0 em Desempenho, e só então trocar o site na conta e pedir a 4ª revisão.
Lembrete: a mudança de endereço expira ~23/out/2026.

**Bug encontrado e corrigido (`6bdca5f`):** a substituição de domínio da fase 1 cobriu `landing/`
mas **não** `index.html` na raiz do repo — que é a fonte do `/demo/`. A página do jogo, a URL mais
importante do site, ficou se auto-canonicalizando para `https://werdumfight.com/demo/`. O Google
chegou a rastreá-la nesse estado (04/08 18:51) e classificou como *"Página alternativa com tag
canônica adequada"* — ou seja, não indexaria no domínio novo. Corrigido e recrawl solicitado.
Lição: o `build:landing` copia `landing/` por cima do `dist/`, mas `index.html` da raiz vira
`/demo/` pelo Vite — **os dois precisam do mesmo tratamento de domínio**.

**`/v2/` fora do sitemap de propósito:** serve `noindex,nofollow` e canonicaliza para `/demo/`;
submetê-la faz o Search Console recusar a solicitação ("problemas de indexação detectados").

**Redirect Rule (zona `werdumfight.com`)** — nome `301 werdumfight.com -> 3contratodos.com (exceto coop)`:
filtro `http.host in {"werdumfight.com" "www.werdumfight.com"}`, ação Dynamic
`concat("https://3contratodos.com", http.request.uri.path)`, 301, *Preserve query string* ligado.
Verificado: 14 rotas × 3 passadas todas em 301, path e query preservados
(`/v2/?sala=ABCD` → `https://3contratodos.com/v2/?sala=ABCD`), cadeia terminando em 200 no destino,
e `coop.werdumfight.com` sem `Location` — fora da regra.

**Gotcha nº 2:** durante a janela em que `werdumfight.com` esteve em 404, a Cloudflare cacheou
essas respostas e passou a servi-las intermitentemente *depois* da regra entrar no ar (sintoma:
mesma URL alternando 301 e 404 entre chamadas, com header `age:` alto). Resolvido com
**Caching → Configuration → Purge Everything** na zona.

**Feito em 04/08:** Pages do repo `3-contra-todos-landing` desativado (liberou o domínio);
`3contratodos.com` atribuído ao repo `game`; deploy publicado; HTTPS obrigatório ligado.
Certificado Let's Encrypt válido até 23/set/2026, cobrindo apex e `www`.

**Verificado no ar:** 15 rotas em 200 (incluindo `/demo/`, `/v2/`, vídeo e `ads.txt`), canonical
correto, sitemap com 15 URLs, snippet do AdSense presente, nenhum resíduo do domínio antigo além
de `com.werdumfight.app` (package id do Android).

**Gotcha registrado:** publicar com o `CNAME` novo *antes* de liberar o domínio no repo antigo faz
o GitHub recusar o domínio e **apagar o custom domain do repo que está publicando** — foi o que
derrubou `werdumfight.com`. A ordem liberar → publicar não é preferência, é obrigatória.

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
4. [ ] `werdumfight.com` (já no Cloudflare): **Redirect Rule 301** → `https://3contratodos.com` + path, **preservando path e query string** (crítico para os convites `/v2/?sala=XXXX`)

   ⚠️ **NÃO use `All incoming requests`.** Redirect Rules valem para a zona inteira, e
   `coop.werdumfight.com` — o servidor Colyseus do co-op — é **proxied pela Cloudflare**
   (mesmos IPs do apex, `cf-ray` presente). Um rule abrangente devolveria 301 em todo
   handshake WebSocket e mataria o co-op, inclusive no app das lojas. Filtre por host:

   ```
   http.host in {"werdumfight.com" "www.werdumfight.com"}
   ```

   Expressão do destino: `concat("https://3contratodos.com", http.request.uri.path)`, status 301.
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
