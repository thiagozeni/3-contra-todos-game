// FB12 E2E — co-op defeat overlay ("GAME OVER / TODOS CAÍRAM").
//
// A real team wipe can't be forced deterministically from the client (status is
// server-authoritative), so this drives the render via the window.__gsTest hook
// that GameScene exposes in net mode. The overlay WORDING is unit-tested
// (tests/ui/coopSummary.test.ts); this asserts the overlay actually renders and
// reports itself, plus a screenshot.
//
// Assertions:
//   1. Before: __netDebug.defeat.visible === false.
//   2. After __gsTest.previewDefeat(score, wave): defeat.visible === true and
//      defeat.title === 'GAME OVER'.
//   3. Screenshot of the rendered overlay.
//
// Run: VITE_NET_ENABLED=true node scripts/e2e-fb12.mjs
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

  console.log('\n=== FB12: co-op defeat overlay ===')
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
  await sleep(1500)

  // ── Step 1: overlay not shown yet ────────────────────────────────────────────
  const before = await getNetDebug(host)
  console.log('defeat (before):', JSON.stringify(before.defeat))
  assertOk(before.defeat && before.defeat.visible === false, 'defeat overlay should be hidden before wipe')
  console.log('OK: no defeat overlay during normal play')

  // ── Step 2: drive the overlay render via the test hook ───────────────────────
  await host.evaluate(() => { (window).__gsTest.previewDefeat(1234, 5) })
  await sleep(600)

  const after = await getNetDebug(host)
  console.log('defeat (after):', JSON.stringify(after.defeat))
  assertOk(after.defeat?.visible === true, `expected defeat.visible true, got ${after.defeat?.visible}`)
  assertOk(after.defeat?.title === 'GAME OVER', `expected title 'GAME OVER', got '${after.defeat?.title}'`)
  console.log("OK: co-op defeat overlay rendered (title 'GAME OVER')")

  await host.screenshot({ path: join(SHOTS, 'fb12-defeat-host.png') })
  console.log('Screenshot saved: fb12-defeat-host.png')

  console.log('\n=== FB12 E2E: ALL ASSERTIONS PASSED ===')
  if (logs.length) {
    console.log('\nConsole errors:')
    logs.forEach((l) => console.log('  ' + l))
  } else {
    console.log('No console errors captured.')
  }

  await browser.close()
}

main().catch((e) => {
  console.error('\nFB12 E2E FAILED:', e.message)
  process.exit(1)
})
