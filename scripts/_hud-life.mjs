import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync('/tmp/loop-shots', { recursive: true })
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage()
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:3000/')
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 })
await p.waitForFunction(() => window.__game?.textures?.exists('ic-pause'), null, { timeout: 30000 })
await p.evaluate(() => { const o = document.getElementById('loader-overlay'); if (o) { o.style.display = 'none' } })
await p.evaluate(() => {
  const g = window.__game
  g.registry.set('selectedChar', 'werdum')
  g.scene.getScenes(true).forEach((s) => { if (s.scene.key !== 'BootScene') g.scene.stop(s.scene.key) })
  g.scene.start('GameScene')
  setTimeout(() => { try { g.scene.getScene('GameScene').scene.pause() } catch {} }, 1500)
})
await sleep(2600)
const r = await p.evaluate(() => {
  const sc = window.__game.scene.getScene('GameScene')
  const hud = sc && sc.hud
  if (!hud) return 'no hud'
  hud.updatePlayerHP(52, 100)
  hud.updateWandHP(74, 100, false)
  return 'set'
})
await sleep(500)
await p.screenshot({ path: '/tmp/loop-shots/hud-life.png' })
await p.screenshot({ path: '/tmp/loop-shots/hud-pausebtn.png', clip: { x: 1770, y: 230, width: 140, height: 120 } })
console.log('hp:', r, errs.length ? 'ERR ' + errs.join(' | ') : 'no errors')
await b.close()
