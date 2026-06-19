import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
mkdirSync('/tmp/loop-shots', { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = process.argv[2] || '/tmp/loop-shots/select-now.png'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage()
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:3000/')
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 })
await p.evaluate(() => { const o = document.getElementById('loader-overlay'); if (o) o.style.display = 'none' })
await p.evaluate(() => { const g = window.__game; g.scene.getScenes(true).forEach(s=>{if(s.scene.key!=='BootScene')g.scene.stop(s.scene.key)}); g.scene.start('SelectScene') })
await sleep(2500)
await p.screenshot({ path: out })
console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no page errors')
await b.close()
