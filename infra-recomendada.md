# Infra Recomendada — 3-contra-todos/game

> Recomendação de hospedagem em produção considerando perfil de carga e potencial de escala.
> Última atualização: 2026-05-22

## Resumo

| Camada | Serviço | Custo/mês |
|---|---|---|
| Hosting build web | Cloudflare Pages | $0 (bandwidth ilimitado) |
| Storage de assets pesados | Cloudflare R2 | $0-15 (~$0.015/GB armazenado, **zero egress**) |
| DNS + WAF | Cloudflare (já incluso) | $0 |
| **Total estimado** | | **$0-15/mês** |

## Justificativa

Jogo Phaser 3 com sprites, atlas, áudio e vídeos = **assets pesados**. Distribuição principal é nas app stores (Apple/Google via Capacitor), mas `werdumfight.com` ainda serve o build web como vitrine.

**Por que Cloudflare em vez de Vercel/GitHub Pages**:
- **Bandwidth ilimitado mesmo no plano free** — viral no TikTok/YouTube não gera custo surpresa
- **R2 não cobra egress** — diferente de S3/Vercel Blob, onde escala de downloads vira fatura cara
- **Edge global** — latência baixa pra jogadores no mundo todo, importante pra carregamento inicial do Phaser

GitHub Pages atual funciona, mas tem **limite de 100GB/mês de bandwidth** — se o jogo viralizar, derruba o site.

## Plano de migração

1. **Criar conta Cloudflare** (free)
2. **Cloudflare Pages**: conectar ao repo `git@github.com:thiagozeni/3-contra-todos-game.git`, build command `npm run build`, output `dist/`
3. **Migrar assets pesados** (`public/assets/`, `_videos/` se servidos) pra **R2 bucket** — referenciar via subdomain `assets.werdumfight.com`
4. **DNS**: apontar `werdumfight.com` pra Cloudflare (manter CNAME atual no DNS)
5. **Manter GitHub Pages como fallback** por 1 semana antes de desativar

## Escala esperada

| Cenário | Custo estimado |
|---|---|
| 1k visitas/mês (atual) | $0 |
| 100k visitas/mês (lançamento) | $0-5 |
| 1M visitas/mês (viral) | $5-15 |
| 10M visitas/mês (top trending) | $15-30 |

## Quando reconsiderar

- Se backend dinâmico for adicionado (multiplayer, leaderboard server-side) → avaliar Cloudflare Workers ou Fly.io
- Se monetização exigir analytics avançado → Cloudflare Web Analytics free basta no início

## Não recomendado

- **Vercel Pro**: cobra bandwidth após 1TB ($0.15/GB), Phaser com assets pesados queima rápido
- **Netlify**: limite de 100GB bandwidth no Pro, mesmo problema
- **AWS CloudFront + S3**: técnico funciona mas cobrança de egress S3 ($0.09/GB) e DX inferior
