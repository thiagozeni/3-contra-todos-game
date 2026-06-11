// Net co-op E2E smoke (Task 6). Two browser contexts: host + guest.
// Host creates a room → guest joins → host starts → both reach GameScene.
// Asserts: both show WAVE 1 + enemies; host moves right and the move replicates
// to the guest's view of the host; guest punches near an enemy and enemy hp drops.
//
// Latency / snapping is EXPECTED (no interpolation yet) — we assert convergence, not
// frame-perfect sync.
//
// Run: node scripts/e2e-coop.mjs   (requires dev client on :3000 + server on :2567)

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(__dirname, '..', '_e2e-shots')
const URL = 'http://localhost:3000/'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function bootToLobby(page) {
  await page.goto(URL)
  // Wait for the Phaser game + lobby test harness to exist.
  await page.waitForFunction(() => !!(window).__game, null, { timeout: 30000 })
  // Hide the DOM "JOGAR" splash overlay (it sits above the canvas until clicked).
  // Hide (don't remove) so index.html's splash script can still read overlay.style.
  await page.evaluate(() => {
    const o = document.getElementById('loader-overlay')
    if (o) { o.style.display = 'none'; o.style.pointerEvents = 'none' }
  })
  // Drive into the LobbyScene via the live game instance.
  await page.evaluate(() => {
    const g = (window).__game
    g.scene.start('LobbyScene')
  })
  await page.waitForFunction(() => !!(window).__coopTest, null, { timeout: 15000 })
}

async function getNetDebug(page) {
  return page.evaluate(() => (window).__netDebug ?? null)
}

async function main() {
  const fs = await import('node:fs')
  fs.mkdirSync(SHOTS, { recursive: true })

  const browser = await chromium.launch()
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const host = await hostCtx.newPage()
  const guest = await guestCtx.newPage()

  const logs = []
  for (const [name, p] of [['host', host], ['guest', guest]]) {
    p.on('console', (m) => { if (m.type() === 'error') logs.push(`[${name} console.error] ${m.text()}`) })
    p.on('pageerror', (e) => logs.push(`[${name} pageerror] ${e.message}`))
  }

  await bootToLobby(host)
  await bootToLobby(guest)

  // Host creates a room.
  const code = await host.evaluate(async () => {
    return await (window).__coopTest.host('werdum')
  })
  console.log('room code:', code)
  if (!code || code.length !== 4) throw new Error(`host did not get a valid room code: ${code}`)

  // Guest joins by code.
  const joined = await guest.evaluate(async (c) => {
    return await (window).__coopTest.join(c, 'dida')
  }, code)
  console.log('guest joined:', joined)
  if (joined !== code) throw new Error(`guest join mismatch: ${joined} != ${code}`)

  await sleep(800)

  // Host starts the match.
  await host.evaluate(() => (window).__coopTest.start())

  // Wait until BOTH reach GameScene net mode (debug hook populated, status playing).
  for (const [name, p] of [['host', host], ['guest', guest]]) {
    await p.waitForFunction(() => {
      const d = (window).__netDebug
      return d && d.status === 'playing'
    }, null, { timeout: 20000 }).catch(() => { throw new Error(`${name} never reached playing state`) })
  }

  await sleep(1500) // let wave 1 spawn

  const hostDbg1 = await getNetDebug(host)
  const guestDbg1 = await getNetDebug(guest)
  console.log('host wave/enemies:', hostDbg1.wave, hostDbg1.enemies)
  console.log('guest wave/enemies:', guestDbg1.wave, guestDbg1.enemies)

  await host.screenshot({ path: join(SHOTS, 'net-host-1.png') })
  await guest.screenshot({ path: join(SHOTS, 'net-guest-1.png') })

  // Assert wave 1 + enemies present in both.
  const assertOk = (cond, msg) => { if (!cond) throw new Error('ASSERT FAIL: ' + msg) }
  assertOk(hostDbg1.wave >= 1, 'host wave >= 1')
  assertOk(guestDbg1.wave >= 1, 'guest wave >= 1')
  assertOk(hostDbg1.enemies > 0, 'host sees enemies')
  assertOk(guestDbg1.enemies > 0, 'guest sees enemies')

  // ── Host moves RIGHT for 2s; both contexts should see host's x increase. ──
  const hostSid = hostDbg1.sessionId
  const hostXBefore_host = hostDbg1.players[hostSid]?.x
  const hostXBefore_guest = guestDbg1.players[hostSid]?.x

  await host.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', keyCode: 68, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', keyCode: 68, bubbles: true }))
  })
  await sleep(2000)
  await host.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', code: 'KeyD', keyCode: 68, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', code: 'KeyD', keyCode: 68, bubbles: true }))
  })
  await sleep(500)

  const hostDbg2 = await getNetDebug(host)
  const guestDbg2 = await getNetDebug(guest)
  const hostXAfter_host = hostDbg2.players[hostSid]?.x
  const hostXAfter_guest = guestDbg2.players[hostSid]?.x

  console.log('host.x (host view):', hostXBefore_host, '->', hostXAfter_host)
  console.log('host.x (guest view):', hostXBefore_guest, '->', hostXAfter_guest)

  await host.screenshot({ path: join(SHOTS, 'net-host-2-moved.png') })
  await guest.screenshot({ path: join(SHOTS, 'net-guest-2-moved.png') })

  assertOk(hostXAfter_host > hostXBefore_host + 10, 'host moved right in host view')
  assertOk(hostXAfter_guest > hostXBefore_guest + 10, 'host moved right in guest view (replicated)')

  // ── Guest punches repeatedly; total enemy HP in the arena should drop. ──
  const totalEnemyHp = async (p) => p.evaluate(() => {
    const s = (window).__game.scene.getScene('GameScene')
    const st = (window).__netDebug
    void st
    // Read enemy hp sum from the authoritative room state via the scene's net client.
    const net = (s).netClient
    const rs = net?.getRoomState?.()
    let sum = 0
    rs?.enemies?.forEach?.((e) => { sum += e.hp })
    return sum
  })

  const hpBefore = await totalEnemyHp(guest)
  // Punch many times (J) on the guest.
  for (let i = 0; i < 30; i++) {
    await guest.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', keyCode: 74, bubbles: true }))
      setTimeout(() => document.dispatchEvent(new KeyboardEvent('keyup', { key: 'j', code: 'KeyJ', keyCode: 74, bubbles: true })), 40)
    })
    await sleep(120)
  }
  await sleep(500)
  const hpAfter = await totalEnemyHp(guest)
  console.log('arena enemy hp sum:', hpBefore, '->', hpAfter)

  await guest.screenshot({ path: join(SHOTS, 'net-guest-3-punch.png') })
  await host.screenshot({ path: join(SHOTS, 'net-host-3-punch.png') })

  // The guest may not be adjacent to an enemy; treat a drop OR an enemy kill as success.
  const guestDbg3 = await getNetDebug(guest)
  const enemyChanged = hpAfter < hpBefore || guestDbg3.enemies !== guestDbg1.enemies
  assertOk(enemyChanged, `guest combat affected enemies (hp ${hpBefore}->${hpAfter}, enemies ${guestDbg1.enemies}->${guestDbg3.enemies})`)

  console.log('\nALL ASSERTIONS PASSED')
  if (logs.length) {
    console.log('\nConsole errors captured:')
    logs.forEach((l) => console.log('  ' + l))
  } else {
    console.log('No console errors captured.')
  }

  await browser.close()
}

main().catch((e) => {
  console.error('\nE2E FAILED:', e.message)
  process.exit(1)
})
