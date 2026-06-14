// Preview da arena dark responsiva no GameScene. Read-only (não altera código do jogo).
// Injeta a camada de fundo full-viewport (cover) atrás do canvas transparente, esconde
// o fundo opaco interno + vídeo, e captura em 4:3 / 16:9 / 21:9 pra validar o reveal lateral.
// Run: node scripts/_dark-arena-shot.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'docs', 'fatia-v', 'art')
const URL = 'http://localhost:3000/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BLEED = 'imgs/cenario/game-bg-bleed.png'

const shots = [
  { name: 'ingame-43',  w: 1440, h: 1080 }, // 4:3  — ringue preenche a largura
  { name: 'ingame-169', w: 1920, h: 1080 }, // 16:9 — pilares + torcida
  { name: 'ingame-219', w: 2520, h: 1080 }, // 21:9 — muita torcida lateral
]

const b = await chromium.launch()
for (const s of shots) {
  const page = await (await b.newContext({ viewport: { width: s.w, height: s.h } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(URL)
  await page.waitForFunction(() => !!(window).__game, null, { timeout: 30000 })
  await page.evaluate(() => { const o = document.getElementById('loader-overlay'); if (o) o.style.display = 'none' })
  await page.evaluate(() => {
    const g = (window).__game
    g.registry.set('selectedChar', 'werdum')
    g.scene.getScenes(true).forEach((sc) => { if (sc.scene.key !== 'BootScene') g.scene.stop(sc.scene.key) })
    g.scene.start('GameScene')
  })
  await sleep(1400)
  await page.evaluate((bleedUrl) => {
    // 1) camada de fundo full-viewport (cover) atrás do canvas (z-index 2)
    let bleed = document.getElementById('arena-bleed')
    if (!bleed) {
      bleed = document.createElement('div')
      bleed.id = 'arena-bleed'
      const wrap = document.getElementById('game-wrap')
      wrap.insertBefore(bleed, wrap.firstChild)
    }
    Object.assign(bleed.style, {
      position: 'fixed', inset: '0', zIndex: '0',
      backgroundImage: `url('${bleedUrl}')`,
      backgroundPosition: 'center', backgroundSize: 'cover', backgroundRepeat: 'no-repeat',
    })
    // 2) esconder fundo opaco interno (game-bg + rect preto) e vídeo verde -> canvas vira transparente
    const g = (window).__game
    const sc = g.scene.getScene('GameScene')
    sc.children.list.forEach((o) => {
      if (o.type === 'Video') o.setVisible(false)
      if (o.type === 'Rectangle' && o.depth <= -2) o.setVisible(false)
      if (o.type === 'Image' && o.texture && o.texture.key === 'game-bg') o.setVisible(false)
    })
    // 3) garantir o ringue 3/4 dark por cima
    if (!sc.children.list.some((o) => o.name === '__darkRing')) {
      sc.add.image(960, 540, 'game-bg-ringue').setDisplaySize(1920, 1080).setDepth(1).setName('__darkRing')
    }
  }, BLEED)
  await sleep(700)
  await page.screenshot({ path: join(OUT, `${s.name}.png`) })
  console.log(`wrote ${s.name}.png ${errs.length ? '(errs: ' + errs.slice(0,3).join('; ') + ')' : ''}`)
  await page.close()
}
await b.close()
