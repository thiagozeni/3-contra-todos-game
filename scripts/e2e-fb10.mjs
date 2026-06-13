// FB10 E2E — ally HUD status badge (DOWN/OFF) + legible name.
//
// Two browser contexts: host (slot 0) + guest (slot 1), both reach GameScene
// playing state. Assertions:
//
//   1. While both are connected and alive, the host's ally HUD row for the guest
//      has status 'ok' (no badge).
//   2. After the GUEST PAGE IS CLOSED, the server fires onDrop → allowReconnection
//      (60s) and sets connected=false WITHOUT removing the player. The host's ally
//      HUD row for the guest then flips to status 'off' (the "OFF" badge).
//   3. Screenshot of the host showing the OFF badge on the guest's row.
//
// The 'down' path (player at 0 HP) is covered by the pure unit test
// (tests/net/allyStatus.test.ts) since forcing a kill is non-deterministic here.
//
// Run: VITE_NET_ENABLED=true node scripts/e2e-fb10.mjs
// (requires dev client on :3000 + Colyseus server on :2567)

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(__dirname, '..', '_e2e-shots')
const URL = 'http://localhost:3000/'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function bootToLobby(page) {
  await page.goto(URL)
  await page.waitForFunction(() => !!(window).__game, null, { timeout: 30000 })
  await page.evaluate(() => {
    const o = document.getElementById('loader-overlay')
    if (o) { o.style.display = 'none'; o.style.pointerEvents = 'none' }
  })
  await page.evaluate(() => { (window).__game.scene.start('LobbyScene') })
  await page.waitForFunction(() => !!(window).__coopTest, null, { timeout: 15000 })
}

const getNetDebug = (page) => page.evaluate(() => (window).__netDebug ?? null)

async function main() {
  const fs = await import('node:fs')
  fs.mkdirSync(SHOTS, { recursive: true })

  const assertOk = (cond, msg) => { if (!cond) throw new Error('ASSERT FAIL: ' + msg) }

  const browser = await chromium.launch({ args: ['--disable-background-timer-throttling'] })

  console.log('\n=== FB10: ally HUD status badge (OFF on disconnect) ===')
  const hostCtx  = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const host  = await hostCtx.newPage()
  const guest = await guestCtx.newPage()

  const logs = []
  for (const [name, p] of [['host', host], ['guest', guest]]) {
    p.on('console', (m) => { if (m.type() === 'error') logs.push(`[${name} error] ${m.text()}`) })
    p.on('pageerror', (e) => logs.push(`[${name} pageerror] ${e.message}`))
  }

  await bootToLobby(host)
  await bootToLobby(guest)

  const code = await host.evaluate(async () => await (window).__coopTest.host())
  console.log('Room code:', code)
  assertOk(code && code.length === 4, `invalid room code: ${code}`)

  const joined = await guest.evaluate(async (c) => await (window).__coopTest.join(c), code)
  assertOk(joined === code, `guest join mismatch: ${joined} != ${code}`)

  await sleep(800)

  await host.evaluate(() => (window).__coopTest.select('werdum'))
  await guest.evaluate(() => (window).__coopTest.select('dida'))
  await sleep(500)
  await host.evaluate(() => (window).__coopTest.confirm())
  await guest.evaluate(() => (window).__coopTest.confirm())

  for (const [name, p] of [['host', host], ['guest', guest]]) {
    await p.waitForFunction(() => {
      const d = (window).__netDebug
      return d && d.status === 'playing'
    }, null, { timeout: 25000 }).catch(() => { throw new Error(`${name} never reached playing state`) })
    console.log(`[${name}] playing`)
  }

  await sleep(2000) // let HUD settle

  // ── Step 1: both connected → host's ally row for guest is 'ok' (no badge) ────
  const guestSid = await guest.evaluate(() => (window).__netDebug?.sessionId ?? null)
  assertOk(guestSid, 'could not read guest sessionId')

  const before = await getNetDebug(host)
  const rowBefore = (before.allyHuds ?? []).find(r => r.sessionId === guestSid)
  console.log('Host ally row (before disconnect):', JSON.stringify(rowBefore))
  assertOk(rowBefore, `host has no ally row for guest ${guestSid}`)
  assertOk(rowBefore.status === 'ok', `expected status 'ok' while connected, got '${rowBefore.status}'`)
  console.log("OK: guest's row is 'ok' (no badge) while connected")

  await host.screenshot({ path: join(SHOTS, 'fb10-ok-host.png') })

  // ── Step 2: close the guest PAGE → server onDrop → connected=false (kept 60s) ─
  console.log('Closing guest page (simulates an abrupt disconnect)...')
  await guestCtx.close()

  // Poll the host until the guest's row flips to 'off' (server detect + state sync).
  let rowAfter = null
  for (let i = 0; i < 20; i++) {
    await sleep(500)
    const d = await getNetDebug(host)
    rowAfter = (d.allyHuds ?? []).find(r => r.sessionId === guestSid)
    if (rowAfter && rowAfter.status === 'off') break
  }
  console.log('Host ally row (after disconnect):', JSON.stringify(rowAfter))
  assertOk(rowAfter, `host lost the ally row for guest ${guestSid} (player removed instead of marked off)`)
  assertOk(rowAfter.status === 'off',
    `expected status 'off' after guest disconnect, got '${rowAfter?.status}'`)
  console.log("OK: guest's row flipped to 'off' (OFF badge) inside the reconnection window")

  await host.screenshot({ path: join(SHOTS, 'fb10-off-host.png') })
  console.log('Screenshots saved: fb10-ok-host.png, fb10-off-host.png')

  console.log('\n=== FB10 E2E: ALL ASSERTIONS PASSED ===')
  if (logs.length) {
    console.log('\nConsole errors:')
    logs.forEach((l) => console.log('  ' + l))
  } else {
    console.log('No console errors captured.')
  }

  await browser.close()
}

main().catch((e) => {
  console.error('\nFB10 E2E FAILED:', e.message)
  process.exit(1)
})
