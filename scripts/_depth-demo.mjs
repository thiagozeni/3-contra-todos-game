import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage()
await p.goto('http://localhost:3000/')
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 })
await p.evaluate(() => { const o = document.getElementById('loader-overlay'); if (o) o.style.display = 'none' })
await p.evaluate(() => {
  const g = window.__game
  g.registry.set('selectedChar', 'werdum')
  g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'BootScene') g.scene.stop(s.scene.key) })
  g.scene.start('GameScene')
})
await new Promise(r => setTimeout(r, 1800))
// pausa a cena (congela o update) e move o player pra frente, sobre as cordas
await p.evaluate(() => {
  const g = window.__game
  const sc = g.scene.getScene('GameScene')
  sc.scene.pause()
  const pl = sc.player
  if (pl) { pl.x = 960; pl.y = 980; if (pl.setDepth) pl.setDepth(980) }
})
await new Promise(r => setTimeout(r, 400))
await p.screenshot({ path: 'docs/fatia-v/art/_depth-demo.png' })
await b.close()
console.log('ok')
