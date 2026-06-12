// FB5 E2E — a 'down' player must LIE on the ground: play the knockdown anim ONCE and
// FREEZE on its last frame, never standing back up via the per-frame idle/run sync.
//
// Repro the real bug (not just the instant after injection): inject playerDown, then
// WAIT well past the knockdown anim's full duration (36 frames @ 14fps ≈ 2.6s) plus many
// syncNetViews frames. Before the fix, syncFromState fell back to idle once the anim
// completed and animLocked cleared → the corpse stood up. Assert the view STILL holds the
// knockdown anim, frozen (not playing) on its last frame.
//
// Run: node scripts/e2e-fb5-knockdown-freeze.mjs  (dev client :3000 + server :2568)
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(__dirname, '..', '_e2e-shots')
const URL = 'http://localhost:3000/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function bootToLobby(page) {
  await page.goto(URL)
  await page.waitForFunction(() => !!(window).__game, null, { timeout: 30000 })
  await page.evaluate(() => {
    const o = document.getElementById('loader-overlay')
    if (o) { o.style.display = 'none'; o.style.pointerEvents = 'none' }
  })
  await page.evaluate(() => { (window).__game.scene.start('LobbyScene') })
  await page.waitForFunction(() => !!(window).__coopTest, null, { timeout: 15000 })
}

async function main() {
  const fs = await import('node:fs')
  fs.mkdirSync(SHOTS, { recursive: true })
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

  await bootToLobby(page)
  await page.evaluate(async () => (window).__coopTest.host())
  await sleep(600)
  await page.evaluate(() => (window).__coopTest.select('werdum'))
  await sleep(400)
  await page.evaluate(() => (window).__coopTest.confirm())
  await page.waitForFunction(() => { const d = (window).__netDebug; return d && d.status === 'playing' }, null, { timeout: 20000 })
  await sleep(1200)

  // Drive the LOCAL player into the terminal 'down' state through GameScene's OWN per-
  // frame render path. GameScene calls this.player.syncFromState(predicted) once per
  // frame (renderPredictedLocal); we wrap that call to force fsm:'down' on its argument,
  // so the REAL production loop (with real Phaser timing) advances the knockdown anim and
  // must freeze it on the last frame. A real co-op death yields the same authoritative
  // fsm:'down'; a solo bot can't be killed on demand, hence the wrap.
  const sid = await page.evaluate(() => {
    const scene = (window).__game.scene.getScene('GameScene')
    const sid = scene.mySessionId
    const view = scene.player
    const origSync = view.syncFromState.bind(view)
    view.syncFromState = (ps) => origSync({ ...ps, fsm: 'down', isBlocking: false, hp: 0 })
    // Fire the down FX once (knockdown anim + HUD), as GameScene does on the playerDown event.
    scene.processNetEvents([{ type: 'playerDown', sessionId: sid }])
    return sid
  })

  await sleep(200)
  const justAfter = await page.evaluate(() => {
    const view = (window).__game.scene.getScene('GameScene').player
    return { animKey: view.anims.currentAnim?.key ?? '', frame: view.anims.currentFrame?.index ?? -1, playing: view.anims.isPlaying }
  })
  console.log('just after down:', justAfter)

  // WAIT past the full knockdown anim duration (36 frames @ 14fps ≈ 2.6s) + hundreds of
  // sync frames. THIS is where the bug used to surface (idle fallback after the anim
  // completed + animLocked cleared).
  await sleep(4000)

  const afterWait = await page.evaluate(() => {
    const view = (window).__game.scene.getScene('GameScene').player
    return {
      animKey: view.anims.currentAnim?.key ?? '', animFrame: view.anims.currentFrame?.index ?? -1,
      animIsPlaying: view.anims.isPlaying, fsm: view.fsm,
    }
  })
  console.log('after 4s hold:', afterWait)

  await page.screenshot({ path: join(SHOTS, 'fb5-knockdown-freeze.png') })

  // Discover the knockdown anim's last frame index (so the assertion is char-agnostic).
  const lastFrameIdx = await page.evaluate((sid) => {
    const scene = (window).__game.scene.getScene('GameScene')
    const view = scene.player
    const anim = view.scene.anims.get(`${view.charKey}-knockdown`)
    return anim ? anim.frames.length : -1
  }, sid)
  console.log('knockdown anim total frames:', lastFrameIdx, '| held frame:', afterWait.animFrame)

  const assertOk = (cond, msg) => { if (!cond) throw new Error('ASSERT FAIL: ' + msg) }
  assertOk(justAfter.animKey.endsWith('-knockdown'), 'knockdown anim starts on down')
  assertOk(afterWait.animKey.endsWith('-knockdown'), 'STILL on knockdown anim after 4s (did NOT fall back to idle/run)')
  assertOk(!afterWait.animKey.endsWith('-idle') && !afterWait.animKey.endsWith('-run'), 'never reverted to idle/run')
  assertOk(afterWait.animIsPlaying === false, 'knockdown anim is FROZEN (not looping/playing)')
  assertOk(afterWait.animFrame === lastFrameIdx, `frozen on the LAST knockdown frame (${afterWait.animFrame} === ${lastFrameIdx})`)
  assertOk(afterWait.fsm === 'down', "fsm is still 'down'")
  assertOk(errors.length === 0, 'no console errors: ' + errors.join(' | '))

  console.log('FB5 KNOCKDOWN-FREEZE OK')
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
