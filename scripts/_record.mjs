import { chromium } from 'playwright'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: '/tmp/rec2', size: { width: 1920, height: 1080 } } })
const p = await ctx.newPage()
await p.goto('http://localhost:3000/')
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 })
await p.evaluate(() => { const o = document.getElementById('loader-overlay'); if (o) o.style.display = 'none' })
await p.evaluate(() => {
  const g = window.__game
  g.registry.set('selectedChar', 'werdum')
  g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'BootScene') g.scene.stop(s.scene.key) })
  g.scene.start('GameScene')
  // congela a simulação pra focar no fundo animado (pausa o update, vídeo DOM segue tocando)
  setTimeout(() => { const sc = g.scene.getScene('GameScene'); sc.scene.pause() }, 1200)
})
await new Promise(r => setTimeout(r, 8000))
await ctx.close()
await b.close()
console.log('ok')
