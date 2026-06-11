// One-off proof: real wss handshake from THIS machine to the live public server
// (wss://coop.werdumfight.com via Cloudflare Tunnel). Uses the same @colyseus/sdk
// the native WebView uses. Creates a room ('arena'), reads its code, then leaves.
// This independently proves the server endpoint the mobile co-op variant targets is
// reachable and completes a full matchmaking + WebSocket handshake.
//
// Run: node scripts/verify-wss-live.mjs

import { Client } from '@colyseus/sdk'

const URL = process.env.SERVER_URL || 'wss://coop.werdumfight.com'

async function main() {
  console.log(`[wss-proof] connecting to ${URL} ...`)
  const client = new Client(URL)
  const room = await client.create('arena', { charKey: 'werdum' })
  const code = room.roomId
  const sessionId = room.sessionId
  console.log(`[wss-proof] CREATE ok — roomCode=${code} sessionId=${sessionId}`)
  if (!/^[A-Z]{4}$/.test(code)) {
    console.error(`[wss-proof] FAIL — room code not 4-letter format: ${code}`)
    await room.leave(true)
    process.exit(1)
  }
  // brief settle so server registers the seat, then leave cleanly
  await new Promise((r) => setTimeout(r, 800))
  await room.leave(true)
  console.log(`[wss-proof] PASS — full wss handshake + room create + leave against live public server`)
  process.exit(0)
}

main().catch((e) => {
  console.error('[wss-proof] FAIL —', e?.message || e)
  process.exit(1)
})
