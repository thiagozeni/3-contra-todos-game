// Capture the single-player character select (SelectScene). Read-only.
// Run: node scripts/_select-shot.mjs   (client :3000)
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(__dirname, '..', 'docs', 'fatia-v', 'mockups')
const URL = 'http://localhost:3000/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const out = process.argv[2] || 'select-current.png'

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

await page.goto(URL)
await page.waitForFunction(() => !!(window).__game, null, { timeout: 30000 })
await page.evaluate(() => {
  const o = document.getElementById('loader-overlay')
  if (o) { o.style.display = 'none'; o.style.pointerEvents = 'none' }
})
await page.evaluate(() => {
  const g = (window).__game
  g.scene.getScenes(true).forEach((s) => { if (s.scene.key !== 'BootScene') g.scene.stop(s.scene.key) })
  g.scene.start('SelectScene')
})
await sleep(2500)
await page.screenshot({ path: join(SHOTS, out) })
console.log('wrote docs/fatia-v/mockups/' + out)
if (errs.length) { console.log('page errors:'); errs.forEach((e) => console.log('  ' + e)) }
await b.close()
