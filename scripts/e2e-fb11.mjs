// FB11 E2E — world-space DOWN/OFF marker over fallen/disconnected players.
//
// Two browser contexts: host (slot 0) + guest (slot 1), both reach GameScene
// playing state. Assertions (via __netDebug.downMarkers[sessionId]):
//
//   1. While both are connected and alive, the host shows NO world marker over
//      the guest (downMarkers[guestSid] === '').
//   2. After the GUEST PAGE IS CLOSED, the server keeps the guest in state with
//      connected=false (60s reconnection window); the host then shows an "OFF"
//      marker floating over the guest's character (downMarkers[guestSid] === 'OFF').
//   3. Screenshot of the host showing the OFF marker in the arena.
//
// The 'DOWN' path (player at 0 HP) shares the same pure rule (allyStatus), covered
// by tests/net/allyStatus.test.ts; forcing a kill here is non-deterministic.
//
// Run: VITE_NET_ENABLED=true node scripts/e2e-fb11.mjs
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

  console.log('\n=== FB11: world DOWN/OFF marker (OFF on disconnect) ===')
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

  await sleep(2000)

  // ── Step 1: both connected → no world marker over the guest ──────────────────
  const guestSid = await guest.evaluate(() => (window).__netDebug?.sessionId ?? null)
  assertOk(guestSid, 'could not read guest sessionId')

  const before = await getNetDebug(host)
  const markBefore = (before.downMarkers ?? {})[guestSid]
  console.log(`Host world marker over guest (before): '${markBefore}'`)
  assertOk(markBefore === '', `expected no marker while connected, got '${markBefore}'`)
  console.log('OK: no world marker over the guest while connected + alive')

  // ── Step 2: close the guest PAGE → server keeps connected=false → "OFF" marker ─
  console.log('Closing guest page (simulates an abrupt disconnect)...')
  await guestCtx.close()

  let markAfter
  for (let i = 0; i < 20; i++) {
    await sleep(500)
    const d = await getNetDebug(host)
    markAfter = (d.downMarkers ?? {})[guestSid]
    if (markAfter === 'OFF') break
  }
  console.log(`Host world marker over guest (after disconnect): '${markAfter}'`)
  assertOk(markAfter === 'OFF', `expected 'OFF' world marker after disconnect, got '${markAfter}'`)
  console.log("OK: 'OFF' marker floats over the guest's character in the arena")

  await host.screenshot({ path: join(SHOTS, 'fb11-off-host.png') })
  console.log('Screenshot saved: fb11-off-host.png')

  console.log('\n=== FB11 E2E: ALL ASSERTIONS PASSED ===')
  if (logs.length) {
    console.log('\nConsole errors:')
    logs.forEach((l) => console.log('  ' + l))
  } else {
    console.log('No console errors captured.')
  }

  await browser.close()
}

main().catch((e) => {
  console.error('\nFB11 E2E FAILED:', e.message)
  process.exit(1)
})
