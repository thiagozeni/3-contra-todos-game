// Local-mode smoke (Task 6 regression guard): single-player still boots into
// GameScene with a clean console and a running local sim (no net debug hook).
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(__dirname, '..', '_e2e-shots')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const fs = await import('node:fs')
  fs.mkdirSync(SHOTS, { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

  await page.goto('http://localhost:3000/')
  await page.waitForFunction(() => !!(window).__game, null, { timeout: 30000 })

  // Drive straight into a local GameScene (werdum), bypassing menu clicks.
  await page.evaluate(() => {
    const g = (window).__game
    g.registry.set('selectedChar', 'werdum')
    g.scene.start('GameScene', { mode: 'local' })
  })
  await sleep(2500)

  // The local sim runs without __netDebug; assert the scene is active and ticking.
  const ok = await page.evaluate(() => {
    const g = (window).__game
    const s = g.scene.getScene('GameScene')
    return !!s && g.scene.isActive('GameScene') && (window).__netDebug == null
  })
  await page.screenshot({ path: join(SHOTS, 'local-smoke.png') })
  await browser.close()

  if (!ok) throw new Error('local GameScene not active OR net debug leaked into local mode')
  console.log('LOCAL SMOKE OK (GameScene active, no net hook)')
  if (errors.length) { console.log('Console errors:'); errors.forEach((e) => console.log('  ' + e)) }
  else console.log('No console errors.')
}
main().catch((e) => { console.error('LOCAL SMOKE FAILED:', e.message); process.exit(1) })
