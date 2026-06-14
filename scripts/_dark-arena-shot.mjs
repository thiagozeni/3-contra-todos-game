// Preview da arena dark no GameScene. Read-only (não altera código do jogo).
// Sobe o GameScene, injeta o ringue overlay e esconde o vídeo verde (Fase 3 ainda).
// Run: node scripts/_dark-arena-shot.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'docs', 'fatia-v', 'art')
const URL = 'http://localhost:3000/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const shots = [
  { name: 'game-bg-ingame-16x9', w: 1920, h: 1080 },
  { name: 'game-bg-ingame-wide', w: 2400, h: 1080 }, // simula celular deitado / ultrawide (barra lateral)
]

const b = await chromium.launch()
for (const s of shots) {
  const page = await (await b.newContext({ viewport: { width: s.w, height: s.h } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(URL)
  await page.waitForFunction(() => !!(window).__game, null, { timeout: 30000 })
  await page.evaluate(() => { const o = document.getElementById('loader-overlay'); if (o) o.style.display = 'none' })
  // boot direto no GameScene com personagem selecionado
  await page.evaluate(() => {
    const g = (window).__game
    g.registry.set('selectedChar', 'werdum')
    g.scene.getScenes(true).forEach((sc) => { if (sc.scene.key !== 'BootScene') g.scene.stop(sc.scene.key) })
    g.scene.start('GameScene')
  })
  await sleep(1400)
  // injeta ringue dark e esconde qualquer vídeo (verde) — preview coerente
  await page.evaluate(() => {
    const g = (window).__game
    const sc = g.scene.getScene('GameScene')
    if (!sc) return
    sc.children.list.filter((o) => o.type === 'Video').forEach((v) => v.setVisible(false))
    const ring = sc.add.image(960, 540, 'game-bg-ringue').setDisplaySize(1920, 1080).setDepth(1)
    ring.setName('__darkRing')
  })
  await sleep(700)
  await page.screenshot({ path: join(OUT, `${s.name}.png`) })
  console.log(`wrote ${s.name}.png ${errs.length ? '(errs: ' + errs.join('; ') + ')' : ''}`)
  await page.close()
}
await b.close()
