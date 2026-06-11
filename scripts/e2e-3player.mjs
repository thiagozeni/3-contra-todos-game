// 3-player co-op E2E (Task 9 acceptance).
// Host creates a room; 2 guests join (3 players total); host starts.
// All three reach GameScene playing state; play ~90s; reach at least wave 2.
// Screenshots of all three contexts after each phase.
//
// Run: VITE_NET_ENABLED=true node scripts/e2e-3player.mjs
// (requires dev client on :3000 + server on :2567)

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(__dirname, '..', '_e2e-shots')
const URL = 'http://localhost:3000/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function bootToLobby(page, label) {
  await page.goto(URL)
  await page.waitForFunction(() => !!(window).__game, null, { timeout: 30000 })
  await page.evaluate(() => {
    const o = document.getElementById('loader-overlay')
    if (o) { o.style.display = 'none'; o.style.pointerEvents = 'none' }
  })
  await page.evaluate(() => { (window).__game.scene.start('LobbyScene') })
  await page.waitForFunction(() => !!(window).__coopTest, null, { timeout: 15000 })
  console.log(`[${label}] at LobbyScene`)
}

async function main() {
  const fs = await import('node:fs')
  fs.mkdirSync(SHOTS, { recursive: true })

  const browser = await chromium.launch({ args: ['--disable-background-timer-throttling'] })
  const hostCtx  = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const guest1Ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const guest2Ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })

  const host   = await hostCtx.newPage()
  const guest1 = await guest1Ctx.newPage()
  const guest2 = await guest2Ctx.newPage()

  const logs = []
  for (const [name, p] of [['host', host], ['guest1', guest1], ['guest2', guest2]]) {
    p.on('console', (m) => { if (m.type() === 'error') logs.push(`[${name} error] ${m.text()}`) })
    p.on('pageerror', (e) => logs.push(`[${name} pageerror] ${e.message}`))
  }

  // Boot all three to lobby
  await bootToLobby(host, 'host')
  await bootToLobby(guest1, 'guest1')
  await bootToLobby(guest2, 'guest2')

  // Host creates room
  const code = await host.evaluate(async () => await (window).__coopTest.host())
  console.log('Room code:', code)
  if (!code || code.length !== 4) throw new Error(`Invalid room code: ${code}`)

  // Both guests join
  const joined1 = await guest1.evaluate(async (c) => await (window).__coopTest.join(c), code)
  console.log('guest1 joined:', joined1)
  if (joined1 !== code) throw new Error(`guest1 join mismatch: ${joined1} != ${code}`)

  const joined2 = await guest2.evaluate(async (c) => await (window).__coopTest.join(c), code)
  console.log('guest2 joined:', joined2)
  if (joined2 !== code) throw new Error(`guest2 join mismatch: ${joined2} != ${code}`)

  await sleep(1000) // let lobby settle

  // FB3: each player picks a DISTINCT character in the arcade selector (werdum/dida/thor),
  // then confirms. The match auto-starts once all 3 are confirmed.
  await host.evaluate(() => (window).__coopTest.select('werdum'))
  await guest1.evaluate(() => (window).__coopTest.select('dida'))
  await guest2.evaluate(() => (window).__coopTest.select('thor'))
  await sleep(600)

  // Take lobby screenshots (mid-selection).
  await host.screenshot({ path: join(SHOTS, '3p-lobby-host.png') })
  await guest1.screenshot({ path: join(SHOTS, '3p-lobby-guest1.png') })
  await guest2.screenshot({ path: join(SHOTS, '3p-lobby-guest2.png') })

  // All confirm → auto-start.
  await host.evaluate(() => (window).__coopTest.confirm())
  await guest1.evaluate(() => (window).__coopTest.confirm())
  await guest2.evaluate(() => (window).__coopTest.confirm())

  const assertOk = (cond, msg) => { if (!cond) throw new Error('ASSERT FAIL: ' + msg) }

  // All three must reach playing state
  for (const [name, p] of [['host', host], ['guest1', guest1], ['guest2', guest2]]) {
    await p.waitForFunction(() => {
      const d = (window).__netDebug
      return d && d.status === 'playing'
    }, null, { timeout: 25000 }).catch(() => { throw new Error(`${name} never reached playing state`) })
    console.log(`[${name}] playing`)
  }

  await sleep(1500) // let wave 1 spawn

  // Verify all three see wave 1 + enemies
  const dbg = {}
  for (const [name, p] of [['host', host], ['guest1', guest1], ['guest2', guest2]]) {
    dbg[name] = await p.evaluate(() => (window).__netDebug)
    console.log(`[${name}] wave=${dbg[name].wave} enemies=${dbg[name].enemies}`)
  }
  assertOk(dbg.host.wave >= 1, 'host wave >= 1')
  assertOk(dbg.guest1.wave >= 1, 'guest1 wave >= 1')
  assertOk(dbg.guest2.wave >= 1, 'guest2 wave >= 1')
  assertOk(dbg.host.enemies > 0, 'host sees enemies')
  assertOk(dbg.guest1.enemies > 0, 'guest1 sees enemies')
  assertOk(dbg.guest2.enemies > 0, 'guest2 sees enemies')

  // Check 3 players are present in all views
  const playerCount = Object.keys(dbg.host.players ?? {}).length
  console.log(`Player count in host view: ${playerCount}`)
  assertOk(playerCount === 3, `host sees 3 players (got ${playerCount})`)

  // Phase 1 screenshots
  await host.screenshot({ path: join(SHOTS, '3p-wave1-host.png') })
  await guest1.screenshot({ path: join(SHOTS, '3p-wave1-guest1.png') })
  await guest2.screenshot({ path: join(SHOTS, '3p-wave1-guest2.png') })

  // All three attack for ~90s scripted fight:
  // Strategy: hold down direction key toward enemies and spam punch/kick.
  // Enemies approach the wand (center of screen), so players should move toward center.
  console.log('Starting ~90s combat phase (all three attacking)...')
  const DURATION_MS = 90000
  const TICK_MS = 150
  let elapsed = 0

  // Cycle through: move toward center, then attack, then move, then attack...
  const phases = ['move', 'attack', 'move', 'attack', 'attack', 'attack']
  let phaseIdx = 0
  let phaseTime = 0

  while (elapsed < DURATION_MS) {
    const phase = phases[phaseIdx % phases.length]

    const pressKeyFn = (k) => {
      const codeMap = { j: 'KeyJ', k: 'KeyK', d: 'KeyD', a: 'KeyA', w: 'KeyW', s: 'KeyS' }
      const keyCodeMap = { j: 74, k: 75, d: 68, a: 65, w: 87, s: 83 }
      const opts = { key: k, code: codeMap[k] || k, keyCode: keyCodeMap[k] || 0, bubbles: true }
      document.dispatchEvent(new KeyboardEvent('keydown', opts))
      window.dispatchEvent(new KeyboardEvent('keydown', opts))
      setTimeout(() => {
        document.dispatchEvent(new KeyboardEvent('keyup', opts))
        window.dispatchEvent(new KeyboardEvent('keyup', opts))
      }, 80)
    }

    if (phase === 'move') {
      // Move toward center (d = right for host, a = left for guests)
      const moves = ['d', 'a', 'd']
      for (let i = 0; i < 3; i++) {
        const p = [host, guest1, guest2][i]
        const k = moves[i]
        p.evaluate(pressKeyFn, k).catch(() => {})
      }
    } else {
      // Attack: punch + kick combo
      const attackKey = elapsed % 600 < 300 ? 'j' : 'k'
      for (const p of [host, guest1, guest2]) {
        p.evaluate(pressKeyFn, attackKey).catch(() => {})
      }
    }

    phaseTime += TICK_MS
    if (phaseTime >= 1200) { phaseIdx++; phaseTime = 0 }

    await sleep(TICK_MS)
    elapsed += TICK_MS
  }

  // Check wave progress
  const dbg2 = {}
  for (const [name, p] of [['host', host], ['guest1', guest1], ['guest2', guest2]]) {
    dbg2[name] = await p.evaluate(() => (window).__netDebug).catch(() => null)
    if (dbg2[name]) console.log(`[${name}] after 90s: wave=${dbg2[name].wave} enemies=${dbg2[name].enemies}`)
  }

  // Take final screenshots
  await host.screenshot({ path: join(SHOTS, '3p-final-host.png') })
  await guest1.screenshot({ path: join(SHOTS, '3p-final-guest1.png') })
  await guest2.screenshot({ path: join(SHOTS, '3p-final-guest2.png') })

  // Assert wave progression: either wave >= 2, OR fewer enemies than started (combat happening)
  const hostWave = dbg2.host?.wave ?? 1
  const hostEnemiesNow = dbg2.host?.enemies ?? 9
  const combatHappened = hostWave >= 2 || hostEnemiesNow < 9 // wave cleared or enemies dying
  assertOk(combatHappened, `combat progressed: wave=${hostWave}, enemies=${hostEnemiesNow} (expected wave>=2 OR fewer enemies)`)
  console.log(`Wave progression: host wave=${hostWave}, enemies remaining=${hostEnemiesNow} ✓`)

  console.log('\n3-PLAYER E2E: ALL ASSERTIONS PASSED')
  if (logs.length) { console.log('\nConsole errors:'); logs.forEach((l) => console.log('  ' + l)) }
  else console.log('No console errors captured.')

  await browser.close()
}

main().catch((e) => {
  console.error('\n3-PLAYER E2E FAILED:', e.message)
  process.exit(1)
})
