import { chromium } from 'playwright'
const SHOTS = [
  { name: '_real-43',     w: 1440, h: 1080 },
  { name: '_real-169',    w: 1920, h: 1080 },
  { name: '_real-195x9',  w: 2340, h: 1080 },
  { name: '_real-219',    w: 2520, h: 1080 },
]
const b = await chromium.launch()
for (const s of SHOTS) {
  const p = await (await b.newContext({ viewport: { width: s.w, height: s.h } })).newPage()
  await p.goto('http://localhost:3000/')
  await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 })
  await p.evaluate(() => { const o = document.getElementById('loader-overlay'); if (o) o.style.display = 'none' })
  await p.evaluate(() => {
    const g = window.__game
    g.registry.set('selectedChar', 'werdum')
    g.scene.getScenes(true).forEach(x => { if (x.scene.key !== 'BootScene') g.scene.stop(x.scene.key) })
    g.scene.start('GameScene')
  })
  await new Promise(r => setTimeout(r, 1800))
  await p.screenshot({ path: `docs/fatia-v/art/${s.name}.png` })
  console.log('wrote', s.name)
  await p.close()
}
await b.close()
