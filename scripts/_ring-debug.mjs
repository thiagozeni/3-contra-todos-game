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
await p.evaluate(() => { const o = document.getElementById('loader-overlay'); if (o) o.style.display = 'none' })
await p.evaluate(() => {
  const g = window.__game
  g.registry.set('selectedChar', 'werdum')
  g.scene.getScenes(true).forEach((s) => { if (s.scene.key !== 'BootScene') g.scene.stop(s.scene.key) })
  g.scene.start('GameScene')
  setTimeout(() => { try { g.scene.getScene('GameScene').scene.pause() } catch {} }, 1500)
})
await sleep(2600)
// desenha o trapézio do RING atual sobre o gameplay
await p.evaluate(() => {
  const sc = window.__game.scene.getScene('GameScene')
  // RING atual (hardcoded p/ debug visual)
  const RING = { top: 650, bottom: 1000, leftAt: (y)=> 670+(430-670)*Math.max(0,Math.min(1,(y-650)/350)), rightAt:(y)=> 1260+(1530-1260)*Math.max(0,Math.min(1,(y-650)/350)) }
  const g = sc.add.graphics().setDepth(99999).setScrollFactor(0)
  g.lineStyle(4, 0x00ff00, 1)
  g.beginPath()
  g.moveTo(RING.leftAt(RING.top), RING.top)
  g.lineTo(RING.rightAt(RING.top), RING.top)
  g.lineTo(RING.rightAt(RING.bottom), RING.bottom)
  g.lineTo(RING.leftAt(RING.bottom), RING.bottom)
  g.closePath(); g.strokePath()
  // marcadores de y
  for (const y of [RING.top, RING.bottom]) { g.fillStyle(0xff0000,1); g.fillCircle(RING.leftAt(y), y, 8); g.fillCircle(RING.rightAt(y), y, 8) }

  // PROPOSTO (ciano) — calibrar p/ casar com o tapete
  const P = { top: 575, bottom: 1035, lt: 590, rt: 1350, lb: 380, rb: 1560 }
  const pLeftAt = (y)=> P.lt + (P.lb - P.lt) * Math.max(0,Math.min(1,(y-P.top)/(P.bottom-P.top)))
  const pRightAt = (y)=> P.rt + (P.rb - P.rt) * Math.max(0,Math.min(1,(y-P.top)/(P.bottom-P.top)))
  const g2 = sc.add.graphics().setDepth(99999).setScrollFactor(0)
  g2.lineStyle(4, 0x00e5ff, 1)
  g2.beginPath()
  g2.moveTo(pLeftAt(P.top), P.top); g2.lineTo(pRightAt(P.top), P.top)
  g2.lineTo(pRightAt(P.bottom), P.bottom); g2.lineTo(pLeftAt(P.bottom), P.bottom)
  g2.closePath(); g2.strokePath()
})
await sleep(300)
await p.screenshot({ path: '/tmp/loop-shots/ring-debug.png' })
console.log(errs.length ? 'ERR ' + errs.join(' | ') : 'no errors')
await b.close()
