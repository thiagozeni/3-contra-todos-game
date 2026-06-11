// Focused verification for Debt 2: GameScene playerDown FX in NET mode.
// Boots a solo net match (host only), reaches GameScene, then injects a synthetic
// `playerDown` SimEvent for the local session straight into processNetEvents and
// asserts: (1) no exception/console error, (2) the local player view is locked in
// the knockdown pose, (3) the HUD "VOCÊ CAIU" down-badge exists and is visible.
//
// Run: node scripts/e2e-playerdown.mjs  (needs client :3000 + server, NET enabled)
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

async function main() {
  const fs = await import('node:fs')
  fs.mkdirSync(SHOTS, { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

  await bootToLobby(page)
  await page.evaluate(async () => (window).__coopTest.host('werdum'))
  await sleep(600)
  await page.evaluate(() => (window).__coopTest.start())
  await page.waitForFunction(() => {
    const d = (window).__netDebug
    return d && d.status === 'playing'
  }, null, { timeout: 20000 })
  await sleep(1200)

  // Inject a synthetic playerDown for MY session into the live GameScene.
  const result = await page.evaluate(() => {
    const g = (window).__game
    const scene = g.scene.getScene('GameScene')
    const sid = scene.mySessionId
    // Call the private net FX dispatcher directly (JS has no real privacy).
    scene.processNetEvents([{ type: 'playerDown', sessionId: sid }])
    const animKey = scene.player?.anims?.currentAnim?.key ?? null
    // Probe the HUD down-badge (added by Debt 2) without exposing internals broadly.
    const hud = scene.hud
    const downBadge = hud?.downBadge
    return {
      sid,
      animKey,
      downBadgeExists: !!downBadge,
      downBadgeAlpha: downBadge?.alpha ?? null,
      downBadgeText: downBadge?.text ?? null,
    }
  })

  await sleep(300)
  await page.screenshot({ path: join(SHOTS, 'net-playerdown.png') })

  console.log('injected playerDown for sid:', result.sid)
  console.log('player anim after down:', result.animKey)
  console.log('down badge exists/alpha/text:', result.downBadgeExists, result.downBadgeAlpha, JSON.stringify(result.downBadgeText))

  const assertOk = (cond, msg) => { if (!cond) throw new Error('ASSERT FAIL: ' + msg) }
  assertOk(result.animKey && result.animKey.endsWith('-knockdown'), 'player view plays knockdown anim when down')
  assertOk(result.downBadgeExists, 'HUD down badge was created')
  assertOk(result.downBadgeAlpha === 1, 'HUD down badge is visible (alpha 1)')
  assertOk(/CAIU/i.test(result.downBadgeText || ''), 'down badge shows the VOCÊ CAIU message')
  assertOk(errors.length === 0, 'no console errors: ' + errors.join(' | '))

  console.log('PLAYER-DOWN FX OK')
  console.log(errors.length ? errors.join('\n') : 'No console errors captured.')
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
