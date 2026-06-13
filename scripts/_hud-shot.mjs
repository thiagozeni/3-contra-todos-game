// Capture the real in-game HUD (co-op) for design calibration. Read-only utility.
// Run: node scripts/_hud-shot.mjs   (requires client :3000 + server :2567, VITE_NET_ENABLED)
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(__dirname, '..', 'docs', 'fatia-v', 'mockups')
const URL = 'http://localhost:3000/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function boot(page) {
  await page.goto(URL)
  await page.waitForFunction(() => !!(window).__game, null, { timeout: 30000 })
  await page.evaluate(() => { const o = document.getElementById('loader-overlay'); if (o){o.style.display='none';o.style.pointerEvents='none'} })
  await page.evaluate(() => { (window).__game.scene.start('LobbyScene') })
  await page.waitForFunction(() => !!(window).__coopTest, null, { timeout: 15000 })
}

const b = await chromium.launch()
const hostCtx = await b.newContext({ viewport: { width: 1280, height: 720 } })
const guestCtx = await b.newContext({ viewport: { width: 1280, height: 720 } })
const host = await hostCtx.newPage(); const guest = await guestCtx.newPage()
await boot(host); await boot(guest)
const code = await host.evaluate(async () => await (window).__coopTest.host())
await guest.evaluate(async (c) => await (window).__coopTest.join(c), code)
await sleep(800)
await host.evaluate(() => (window).__coopTest.select('werdum'))
await guest.evaluate(() => (window).__coopTest.select('dida'))
await sleep(500)
await host.evaluate(() => (window).__coopTest.confirm())
await guest.evaluate(() => (window).__coopTest.confirm())
for (const p of [host, guest]) {
  await p.waitForFunction(() => { const d=(window).__netDebug; return d && d.status==='playing' }, null, { timeout: 25000 })
}
await sleep(2500)
await host.screenshot({ path: join(SHOTS, 'hud-real-premium.png') })
console.log('wrote docs/fatia-v/mockups/hud-real-premium.png')
await b.close()
