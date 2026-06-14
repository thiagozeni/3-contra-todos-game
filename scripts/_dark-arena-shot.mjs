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
const BLEED = 'imgs/cenario/arena-master.png'
const ZOOM = Number(process.env.ZOOM || 1) // zoom de palco (1 = sem zoom; master já enquadra)

const shots = [
  { name: 'ingame-43',    w: 1440, h: 1080 }, // 4:3
  { name: 'ingame-169',   w: 1920, h: 1080 }, // 16:9 (nativo)
  { name: 'ingame-195x9', w: 2340, h: 1080 }, // 19.5:9 (phone)
  { name: 'ingame-219',   w: 2520, h: 1080 }, // 21:9 (ultrawide)
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
  await page.evaluate(({ bleedUrl, zoom }) => {
    // 1) camada de fundo full-viewport (cover) atrás do canvas (z-index 2), com ZOOM de palco
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
      transform: `scale(${zoom})`, transformOrigin: 'center center',
    })
    // 2) esconder TUDO que é arena interna (fundo opaco, vídeo, ringue 3/4 e cordas frontais)
    //    -> sobra só a arena 21:9 única (CSS) + lutadores. SEM ringue-dentro-de-ringue.
    const g = (window).__game
    const sc = g.scene.getScene('GameScene')
    const hideKeys = ['game-bg', 'game-bg-ringue', 'game-cordas']
    sc.children.list.forEach((o) => {
      if (o.type === 'Video') o.setVisible(false)
      if (o.type === 'Rectangle' && o.depth <= -2) o.setVisible(false)
      if (o.type === 'Image' && o.texture && hideKeys.includes(o.texture.key)) o.setVisible(false)
    })
    // 3) ZOOM de palco (alinha câmera + fundo). zoom=1 = arena única já enquadra.
    if (zoom !== 1) { const cam = sc.cameras.main; cam.setZoom(zoom); cam.centerOn(960, 540) }
  }, { bleedUrl: BLEED, zoom: ZOOM })
  await sleep(700)
  try {
    await page.screenshot({ path: join(OUT, `${s.name}.png`) })
    console.log(`wrote ${s.name}.png ${errs.length ? '(errs: ' + errs.slice(0,3).join('; ') + ')' : ''}`)
  } catch (e) { console.log(`FALHOU ${s.name}: ${e.message}`) }
  await page.close().catch(() => {})
}
await b.close()
