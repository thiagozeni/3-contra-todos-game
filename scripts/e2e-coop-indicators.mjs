// FB4 E2E — Player indicators (P1/P2/P3) in co-op.
//
// Two browser contexts: host (P1) + guest (P2). Both reach GameScene and wait for the
// match to start. Once playing, this script asserts:
//   1. Each context sees indicators for BOTH players (hasIndicator = true).
//   2. The slot indices match the join order (host = slot 0 = P1, guest = slot 1 = P2).
//   3. In the HOST context: MY indicator is slot 0 (P1); the remote is slot 1 (P2).
//   4. In the GUEST context: MY indicator is slot 1 (P2); the remote is slot 0 (P1).
//   5. indicatorSlot matches slotIndex for every player in both contexts.
//   6. Screenshots from both contexts showing the arrows.
//
// Run: node scripts/e2e-coop-indicators.mjs  (requires dev client on :3000, server on :2568)

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
  await page.evaluate(() => {
    const g = (window).__game
    g.scene.start('LobbyScene')
  })
  await page.waitForFunction(() => !!(window).__coopTest, null, { timeout: 15000 })
}

async function getNetDebug(page) {
  return page.evaluate(() => (window).__netDebug ?? null)
}

async function main() {
  const fs = await import('node:fs')
  fs.mkdirSync(SHOTS, { recursive: true })

  const browser = await chromium.launch()
  const hostCtx  = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const host  = await hostCtx.newPage()
  const guest = await guestCtx.newPage()

  const logs = []
  for (const [name, p] of [['host', host], ['guest', guest]]) {
    p.on('console', (m) => { if (m.type() === 'error') logs.push(`[${name} console.error] ${m.text()}`) })
    p.on('pageerror', (e) => logs.push(`[${name} pageerror] ${e.message}`))
  }

  await bootToLobby(host)
  await bootToLobby(guest)

  // Host creates a room (joins first → slot 0 = P1), guest joins (slot 1 = P2).
  const code = await host.evaluate(async () => await (window).__coopTest.host())
  console.log('room code:', code)
  if (!code || code.length !== 4) throw new Error(`host did not get a valid room code: ${code}`)

  const joined = await guest.evaluate(async (c) => await (window).__coopTest.join(c), code)
  if (joined !== code) throw new Error(`guest join mismatch: ${joined} != ${code}`)
  await sleep(600)

  // Both pick + confirm different characters.
  await host.evaluate(() => (window).__coopTest.select('werdum'))
  await sleep(400)
  await guest.evaluate(() => (window).__coopTest.select('dida'))
  await sleep(400)
  await host.evaluate(() => (window).__coopTest.confirm())
  await guest.evaluate(() => (window).__coopTest.confirm())

  // Wait until both reach GameScene playing state.
  for (const [name, p] of [['host', host], ['guest', guest]]) {
    await p.waitForFunction(() => {
      const d = (window).__netDebug
      return d && d.status === 'playing'
    }, null, { timeout: 20000 }).catch(() => { throw new Error(`${name} never reached playing state`) })
  }
  await sleep(1500) // let wave 1 spawn + first render cycle

  const hostDbg  = await getNetDebug(host)
  const guestDbg = await getNetDebug(guest)

  const assertOk = (cond, msg) => {
    if (!cond) throw new Error('ASSERT FAIL: ' + msg)
  }

  // ── Extract player entries ───────────────────────────────────────────────────
  const hostPlayers  = Object.values(hostDbg.players)
  const guestPlayers = Object.values(guestDbg.players)

  console.log('\nHost debug players:')
  hostPlayers.forEach(p => console.log(
    `  sid=${hostDbg.sessionId === p.sessionId ? 'MINE' : 'REMOTE'}`,
    `  mine=${p.mine}  char=${p.charKey}  slot=${p.slotIndex}`,
    `  hasIndicator=${p.hasIndicator}  indicatorSlot=${p.indicatorSlot}`,
  ))

  console.log('\nGuest debug players:')
  guestPlayers.forEach(p => console.log(
    `  sid=${guestDbg.sessionId === p.sessionId ? 'MINE' : 'REMOTE'}`,
    `  mine=${p.mine}  char=${p.charKey}  slot=${p.slotIndex}`,
    `  hasIndicator=${p.hasIndicator}  indicatorSlot=${p.indicatorSlot}`,
  ))

  // ── Assertion 1: both contexts see exactly 2 players ────────────────────────
  assertOk(hostPlayers.length === 2, `host sees 2 players (got ${hostPlayers.length})`)
  assertOk(guestPlayers.length === 2, `guest sees 2 players (got ${guestPlayers.length})`)

  // ── Assertion 2: slot indices are set (non-negative) for all players ─────────
  for (const p of hostPlayers) {
    assertOk(p.slotIndex >= 0, `host: player ${p.charKey} has slotIndex >= 0 (got ${p.slotIndex})`)
  }
  for (const p of guestPlayers) {
    assertOk(p.slotIndex >= 0, `guest: player ${p.charKey} has slotIndex >= 0 (got ${p.slotIndex})`)
  }

  // ── Assertion 3: all players have indicators ─────────────────────────────────
  for (const p of hostPlayers) {
    assertOk(p.hasIndicator, `host: player ${p.charKey} (slot ${p.slotIndex}) has indicator`)
  }
  for (const p of guestPlayers) {
    assertOk(p.hasIndicator, `guest: player ${p.charKey} (slot ${p.slotIndex}) has indicator`)
  }

  // ── Assertion 4: indicatorSlot matches slotIndex for every player ────────────
  for (const p of hostPlayers) {
    assertOk(
      p.indicatorSlot === p.slotIndex,
      `host: player ${p.charKey} indicatorSlot (${p.indicatorSlot}) === slotIndex (${p.slotIndex})`,
    )
  }
  for (const p of guestPlayers) {
    assertOk(
      p.indicatorSlot === p.slotIndex,
      `guest: player ${p.charKey} indicatorSlot (${p.indicatorSlot}) === slotIndex (${p.slotIndex})`,
    )
  }

  // ── Assertion 5: host joined first → slot 0 (P1); guest → slot 1 (P2) ───────
  const hostMineEntry  = hostPlayers.find(p => p.mine)
  const guestMineEntry = guestPlayers.find(p => p.mine)
  assertOk(hostMineEntry,  'host has a "mine=true" entry')
  assertOk(guestMineEntry, 'guest has a "mine=true" entry')
  assertOk(
    hostMineEntry.slotIndex === 0,
    `host (first to join) is slot 0 / P1 (got ${hostMineEntry.slotIndex})`,
  )
  assertOk(
    guestMineEntry.slotIndex === 1,
    `guest (second to join) is slot 1 / P2 (got ${guestMineEntry.slotIndex})`,
  )

  // ── Assertion 6: from host's view, remote player is slot 1 (P2) ──────────────
  const hostRemoteEntry = hostPlayers.find(p => !p.mine)
  assertOk(hostRemoteEntry, 'host sees a remote player')
  assertOk(
    hostRemoteEntry.slotIndex === 1,
    `from host's view, remote is slot 1 / P2 (got ${hostRemoteEntry.slotIndex})`,
  )

  // ── Assertion 7: from guest's view, remote player is slot 0 (P1) ─────────────
  const guestRemoteEntry = guestPlayers.find(p => !p.mine)
  assertOk(guestRemoteEntry, 'guest sees a remote player')
  assertOk(
    guestRemoteEntry.slotIndex === 0,
    `from guest's view, remote is slot 0 / P1 (got ${guestRemoteEntry.slotIndex})`,
  )

  // ── Assertion 8: the two slot assignments use different slot indices ───────────
  const hostSlots  = new Set(hostPlayers.map(p => p.slotIndex))
  const guestSlots = new Set(guestPlayers.map(p => p.slotIndex))
  assertOk(hostSlots.size === 2,  `host sees 2 distinct slot indices (got ${[...hostSlots]})`)
  assertOk(guestSlots.size === 2, `guest sees 2 distinct slot indices (got ${[...guestSlots]})`)
  assertOk(hostSlots.has(0) && hostSlots.has(1),  `host sees slots 0 and 1`)
  assertOk(guestSlots.has(0) && guestSlots.has(1), `guest sees slots 0 and 1`)

  // ── Screenshots ───────────────────────────────────────────────────────────────
  await host.screenshot({ path: join(SHOTS, 'fb4-host-indicators.png') })
  await guest.screenshot({ path: join(SHOTS, 'fb4-guest-indicators.png') })
  console.log(`\nScreenshots saved to ${SHOTS}/fb4-{host,guest}-indicators.png`)

  console.log('\nALL FB4 INDICATOR ASSERTIONS PASSED')
  if (logs.length) {
    console.log('\nConsole errors captured:')
    logs.forEach(l => console.log('  ' + l))
  } else {
    console.log('No console errors captured.')
  }

  await browser.close()
}

main().catch((e) => {
  console.error('\nE2E FAILED:', e.message)
  process.exit(1)
})
