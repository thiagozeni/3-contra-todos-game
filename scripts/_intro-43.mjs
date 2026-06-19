import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
mkdirSync('/tmp/loop-shots', { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await chromium.launch()
async function shot(w, h, name) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage()
  await p.goto('http://localhost:3000/')
  await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 })
  await p.evaluate(() => { const o = document.getElementById('loader-overlay'); if (o) o.style.display = 'none' })
  await p.evaluate(() => { const g = window.__game; g.scene.getScenes(true).forEach(s=>{if(s.scene.key!=='BootScene')g.scene.stop(s.scene.key)}); g.scene.start('TitleScene') })
  await sleep(1800)
  await p.screenshot({ path: `/tmp/loop-shots/intro-${name}.png` })
  await p.close()
  console.log(name, w+'x'+h, 'ok')
}
await shot(1024, 768, '43')   // 4:3
await shot(1920, 1080, '169') // 16:9
await b.close()
