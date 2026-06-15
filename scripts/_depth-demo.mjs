import { chromium } from 'playwright'
const b = await chromium.launch()
const POS = [{ name: 'L', x: 360 }, { name: 'C', x: 960 }, { name: 'R', x: 1560 }]
for (const pos of POS) {
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage()
  await p.goto('http://localhost:3000/')
  await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 })
  await p.evaluate(() => { const o = document.getElementById('loader-overlay'); if (o) o.style.display = 'none' })
  await p.evaluate(() => {
    const g = window.__game
    g.registry.set('selectedChar', 'werdum')
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'BootScene') g.scene.stop(s.scene.key) })
    g.scene.start('GameScene')
    setTimeout(() => { const sc = g.scene.getScene('GameScene'); sc.scene.pause() }, 1200)
  })
  await new Promise(r => setTimeout(r, 1800))
  await p.evaluate((x) => {
    const sc = window.__game.scene.getScene('GameScene')
    const pl = sc.player
    if (pl) { pl.x = x; pl.y = 980; if (pl.setDepth) pl.setDepth(980) }
  }, pos.x)
  await new Promise(r => setTimeout(r, 400))
  await p.screenshot({ path: `docs/fatia-v/art/_depth-${pos.name}.png` })
  await p.close()
}
await b.close()
console.log('ok')
