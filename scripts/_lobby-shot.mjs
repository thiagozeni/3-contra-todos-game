// Capture the co-op character selector (CoopSelector in the lobby). Read-only.
// Run: node scripts/_lobby-shot.mjs   (client :3000 + server :2567, VITE_NET_ENABLED)
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
// host picks werdum (cursor moves), guest picks dida — selector shows colored frames
await host.evaluate(() => (window).__coopTest.select('werdum'))
await guest.evaluate(() => (window).__coopTest.select('dida'))
await sleep(1200)
await host.screenshot({ path: join(SHOTS, 'lobby-selector.png') })
console.log('wrote docs/fatia-v/mockups/lobby-selector.png')
await b.close()
