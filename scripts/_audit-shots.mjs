// Fatia V — UI audit: capture each static screen for the design-system baseline.
// Read-only; writes PNGs to _e2e-shots/ (gitignored). Not a test.
//
// Run: node scripts/_audit-shots.mjs   (requires dev client on :3000)

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(__dirname, '..', '_e2e-shots')
const URL = 'http://localhost:3000/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// scene key → registry seed (so data-dependent scenes render)
const SCENES = [
  { key: 'TitleScene', seed: {} },
  { key: 'SelectScene', seed: {} },
  { key: 'HowToPlayScene', seed: {} },
  { key: 'GameOverContinueScene', seed: { gameOverScore: 12450, gameOverWave: 7, totalWaves: 12 } },
  { key: 'YouWinScene', seed: { youWinScore: 28900, totalWaves: 12, selectedChar: 'werdum' } },
  { key: 'TopTenScene', seed: {} },
]

async function main() {
  const fs = await import('node:fs')
  fs.mkdirSync(SHOTS, { recursive: true })

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(URL)
  await page.waitForFunction(() => !!(window).__game, null, { timeout: 30000 })
  await page.evaluate(() => {
    const o = document.getElementById('loader-overlay')
    if (o) { o.style.display = 'none'; o.style.pointerEvents = 'none' }
  })

  for (const { key, seed } of SCENES) {
    try {
      await page.evaluate(({ key, seed }) => {
        const g = (window).__game
        for (const [k, v] of Object.entries(seed)) g.registry.set(k, v)
        // stop everything visible, then start the target fresh
        g.scene.getScenes(true).forEach((s) => { if (s.scene.key !== 'BootScene') g.scene.stop(s.scene.key) })
        g.scene.start(key)
      }, { key, seed })
      await sleep(2500) // let assets + tweens settle
      await page.screenshot({ path: join(SHOTS, `audit-${key}.png`) })
      console.log(`captured ${key}`)
    } catch (e) {
      console.log(`FAILED ${key}: ${e.message}`)
    }
  }

  if (errs.length) { console.log('\nPage errors:'); errs.forEach((e) => console.log('  ' + e)) }
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
