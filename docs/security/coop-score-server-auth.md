# Co-op score server-authenticated (C2 + H4) — runbook

Fecha os achados **C2** (score co-op forjável: `submit_coop_score` confia num token de
sessão público) e **H4** (perda de score quando o host original sai) da revisão
adversarial Codex (2026-06-21).

**Estratégia:** o servidor Colyseus (que JÁ é autoritativo — roda a sim, tem score/wave/
status) **assina** o resultado na vitória com HMAC. O cliente passa essa assinatura ao
Supabase, que recomputa o HMAC com o mesmo segredo e rejeita valores forjados. O nome do
time continua vindo do cliente (cosmético). **Não muda o ciclo de vida da sala** — o token
viaja no evento de vitória e é usado mesmo após o cliente sair da sala.

H4 cai junto: o score é do servidor, então não importa quem é "host" no cliente — qualquer
jogador conectado pode enviar o nome com o token; o nonce de uso único impede duplicata.

## Artefatos já escritos neste repo

- `server/src/lib/coopScoreToken.ts` — helper de assinatura (HMAC-SHA256). ✅ compila
- `supabase/migrations/20260621000002_coop_score_signed.sql` — RPC `submit_coop_score_signed`
  + tabela de nonces. ⚠️ **não aplicada** (depende do segredo + servidor novos).

## O que falta implementar (diffs)

### 1. Servidor — `server/src/rooms/ArenaRoom.ts`

```ts
import { signCoopResult, coopSigningEnabled } from '../lib/coopScoreToken'

// em startMatch():
this.matchStartMs = Date.now()          // novo campo: private matchStartMs = 0

// no tick(), ao detectar a transição para vitória (g.status === 'victory') UMA vez:
if (this.gameState?.status === 'victory' && !this.coopResultSent && coopSigningEnabled()) {
  this.coopResultSent = true            // novo campo: private coopResultSent = false
  const durationMs = Date.now() - this.matchStartMs
  const token = signCoopResult(this.gameState.score.score, this.gameState.wave.currentWave, durationMs)
  this.broadcast('coopResult', token)   // { score, wave, timeMs, nonce, sig }
}
```

> O servidor NÃO precisa do Supabase — só assina. A submissão ao DB continua via cliente,
> mas agora inforjável (a assinatura prova a origem).

### 2. Cliente — `src/net/NetClient.ts`

Capturar o `coopResult` e expor o último token:

```ts
private lastCoopResult: SignedCoopResult | null = null
// no setup da room:
room.onMessage('coopResult', (t) => { this.lastCoopResult = t })
getCoopResult() { return this.lastCoopResult }
```

E **não sair da sala antes de capturar o token**: hoje `netVictory` chama
`leaveNetRoomAndResetPick()` imediatamente. O `coopResult` chega no broadcast de vitória —
garanta que o `leave()` aconteça DEPOIS de capturar (ou guarde o token antes do leave).
Como o token é só um objeto em memória, capturá-lo no `onMessage` já basta mesmo que o
leave ocorra logo em seguida (a mensagem chega antes do leave consentido).

### 3. Cliente — `src/scenes/YouWinScene.ts` (submit co-op)

Trocar `saveCoopScore(...)` por `saveCoopScoreSigned(...)` quando houver token; **fallback**
para o caminho antigo se o token não veio (servidor antigo) — isso mantém o /v2 seguro
durante a transição:

```ts
const token = this.registry.get('coopResult') as SignedCoopResult | null
if (coop && coopHost && token) {
  await saveCoopScoreSigned({ team_name: name, character, ...token })  // RPC nova
} else if (coop && coopHost) {
  await saveCoopScore({ team_name: name, character, time_ms, score }, sessionToken)  // legado
}
```

(`netVictory` no GameScene passa a guardar `registry.set('coopResult', this.net.getCoopResult())`.)

### 4. Cliente — `src/lib/leaderboard.ts`

```ts
export async function saveCoopScoreSigned(p: {
  team_name: string; character: string; score: number; wave: number; time_ms: number; nonce: string; sig: string
}) {
  const { data, error } = await supabase.rpc('submit_coop_score_signed', {
    p_team_name: p.team_name, p_character: p.character, p_time_ms: p.time_ms,
    p_score: p.score, p_wave: p.wave, p_nonce: p.nonce, p_sig: p.sig,
  })
  if (error) throw error
  return data
}
```

## Ordem de deploy (importante)

1. **Gerar um segredo** forte (ex.: `openssl rand -hex 32`). É o `COOP_SCORE_SECRET`.
2. **Supabase:** configurar o mesmo valor no banco e aplicar a migration:
   ```sql
   alter database postgres set app.coop_score_secret = '<segredo>';
   ```
   depois aplicar `20260621000002_coop_score_signed.sql`. (A RPC nova é aditiva — não quebra
   o caminho atual.)
3. **Servidor Colyseus** (`coop.werdumfight.com`): setar `COOP_SCORE_SECRET=<segredo>` no
   ambiente, implementar o item 1 (diff do ArenaRoom) e **redeployar**.
4. **Cliente:** implementar itens 2–4, buildar e publicar (`/v2` e/ou apps). O fallback
   mantém co-op salvando mesmo contra servidor antigo durante o rollout.
5. **End-to-end:** jogar uma partida co-op até a vitória; confirmar entrada `mode='coop'` no
   leaderboard via caminho assinado (logar qual RPC foi usada).
6. **Hardening final** (só quando o caminho assinado dominar): rodar o `revoke` comentado no
   fim da migration para fechar a `submit_coop_score` antiga (forjável).

## Por que não foi feito automaticamente

- Exige um **segredo provisionado** no servidor + no banco (não pode ir pro repo).
- Exige **redeploy do servidor** em `coop.werdumfight.com` (infra do dono do projeto).
- Exige **teste end-to-end contra um servidor ao vivo** — não dá pra validar a partir do
  ambiente de revisão sem o servidor rodando. Por isso entregue como pacote revisável, com
  fallback que não quebra o co-op durante a transição.
