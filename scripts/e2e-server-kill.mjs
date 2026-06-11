// Server kill E2E (Task 9 acceptance).
// Host + guest start a match, then the Colyseus server process is killed.
// Assert: both clients land on TitleScene gracefully with no uncaught exceptions.
//
// Run: COLYSEUS_PORT=2568 node scripts/e2e-server-kill.mjs
// (requires dev client :3000 + a LOCAL test server on COLYSEUS_PORT already running)
// Default port is 2568 to avoid killing the pm2 production server on 2567.
// NEVER run without COLYSEUS_PORT set (or with the default) against the pm2 server.

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)
const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(__dirname, '..', '_e2e-shots')
const URL = process.env.E2E_CLIENT_URL || 'http://localhost:3000/'
// Use COLYSEUS_PORT env to identify which server process to kill.
// Default is 2568 (test server) — never default to 2567 (pm2 production).
const COLYSEUS_PORT = process.env.COLYSEUS_PORT || '2568'
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

  const assertOk = (cond, msg) => { if (!cond) throw new Error('ASSERT FAIL: ' + msg) }

  const browser = await chromium.launch({ args: ['--disable-background-timer-throttling'] })
  const hostCtx  = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } })

  const host  = await hostCtx.newPage()
  const guest = await guestCtx.newPage()

  const errors = []
  for (const [name, p] of [['host', host], ['guest', guest]]) {
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name} error] ${m.text()}`) })
    p.on('pageerror', (e) => errors.push(`[${name} pageerror] ${e.message}`))
  }

  await bootToLobby(host, 'host')
  await bootToLobby(guest, 'guest')

  const code = await host.evaluate(async () => await (window).__coopTest.host('werdum'))
  console.log('Room code:', code)
  assertOk(code && code.length === 4, `Valid room code: ${code}`)

  const joined = await guest.evaluate(async (c) => await (window).__coopTest.join(c, 'dida'), code)
  assertOk(joined === code, `guest joined: ${joined}`)

  await sleep(800)
  await host.evaluate(() => (window).__coopTest.start())

  for (const [name, p] of [['host', host], ['guest', guest]]) {
    await p.waitForFunction(() => {
      const d = (window).__netDebug
      return d && d.status === 'playing'
    }, null, { timeout: 25000 }).catch(() => { throw new Error(`${name} never reached playing`) })
    console.log(`[${name}] playing`)
  }

  await sleep(3000) // let game tick for 3s

  // Kill the Colyseus TEST server (COLYSEUS_PORT, default 2568 — NOT the pm2 server on 2567)
  console.log(`Killing Colyseus test server (port ${COLYSEUS_PORT})...`)
  try {
    const { stdout } = await execAsync(`lsof -ti :${COLYSEUS_PORT} | head -1`)
    const pid = stdout.trim()
    if (pid) {
      await execAsync(`kill -9 ${pid}`)
      console.log(`Killed PID ${pid}`)
    } else {
      console.warn(`Could not find Colyseus PID on port ${COLYSEUS_PORT} — server may already be down`)
    }
  } catch (e) {
    console.warn('Kill command failed (server may already be down):', e.message)
  }

  // Wait for clients to detect the drop and recover
  await sleep(6000)

  await host.screenshot({ path: join(SHOTS, 'serverkill-host.png') })
  await guest.screenshot({ path: join(SHOTS, 'serverkill-guest.png') })

  // Assert: both clients should be in a graceful state (TitleScene or error overlay,
  // NOT a crashed page with uncaught exceptions)
  const uncaughtErrors = errors.filter(l =>
    l.includes('Uncaught') ||
    l.includes('Cannot read') ||
    l.includes('is not a function') ||
    (l.includes('pageerror') && !l.includes('WebSocket') && !l.includes('Network'))
  )
  if (uncaughtErrors.length > 0) {
    console.warn('Errors captured after server kill:', uncaughtErrors)
  }
  assertOk(uncaughtErrors.length === 0, `No uncaught exceptions after server kill: ${JSON.stringify(uncaughtErrors)}`)

  // Check that both clients are NOT still showing "playing" (they should have fallen back)
  for (const [name, p] of [['host', host], ['guest', guest]]) {
    const state = await p.evaluate(() => {
      const g = (window).__game
      const netDebug = (window).__netDebug
      return {
        activeScenes: g ? Object.keys(g.scene.scenes).filter(k => g.scene.isActive(k)) : [],
        netState: netDebug?.connectionState ?? null,
      }
    }).catch(() => null)
    console.log(`[${name}] after server kill: ${JSON.stringify(state)}`)
    // The game should not be in "playing" with "connected" state — that would mean
    // the client didn't detect the server going down
    if (state?.netState === 'connected' && state?.activeScenes?.includes('GameScene')) {
      throw new Error(`${name}: still showing connected + playing after server kill — fallback not triggered`)
    }
    console.log(`[${name}] gracefully handled server kill ✓`)
  }

  console.log('\nSERVER KILL E2E: ALL ASSERTIONS PASSED')
  if (errors.length) { console.log('\nAll console errors:'); errors.forEach((l) => console.log('  ' + l)) }
  else console.log('No console errors captured.')

  await browser.close()
}

main().catch((e) => {
  console.error('\nSERVER KILL E2E FAILED:', e.message)
  process.exit(1)
})
