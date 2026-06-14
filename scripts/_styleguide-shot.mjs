// Capture the StyleGuideScene (4 pages). Read-only. Run: node scripts/_styleguide-shot.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
const MOCK = join(__dirname, '..', 'docs', 'fatia-v', 'mockups')
const URL = 'http://localhost:3000/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b = await chromium.launch()
const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(URL)
await page.waitForFunction(() => !!(window).__game, null, { timeout: 30000 })
await page.evaluate(() => { const o = document.getElementById('loader-overlay'); if (o) { o.style.display = 'none'; o.style.pointerEvents = 'none' } })
await page.evaluate(() => {
  const g = (window).__game
  g.scene.getScenes(true).forEach((s) => { if (s.scene.key !== 'BootScene') g.scene.stop(s.scene.key) })
  g.scene.start('StyleGuideScene')
})
await page.waitForFunction(() => !!(window).__sgTest, null, { timeout: 15000 })
for (let p = 1; p <= 4; p++) {
  await page.evaluate((n) => (window).__sgTest.go(n), p)
  await sleep(1200)
  await page.screenshot({ path: join(MOCK, `styleguide-p${p}.png`) })
  console.log(`wrote styleguide-p${p}.png`)
}
if (errs.length) { console.log('page errors:'); errs.forEach((e) => console.log('  ' + e)) }
await b.close()
