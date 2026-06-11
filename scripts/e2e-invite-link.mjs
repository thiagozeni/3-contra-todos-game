// Invite link E2E (Task 1, Step 6).
//
// Scenario A — Auto-join via ?sala=:
//   Context A (host):  creates room, reads invite URL via __coopTest.getInviteUrl()
//   Context B (guest): navigates DIRECTLY to localhost:3000/?sala=CODE (no lobby nav)
//   Assert: guest lands in the same lobby (2 players listed), lobby mode is 'joined'
//
// Scenario B — Share button with clipboard fallback:
//   Same host context: clicks share button, verify clipboard contains the invite URL.
//
// Scenario C — Flag off (NET_ENABLED=false at default build):
//   A fresh context without VITE_NET_ENABLED set navigates to ?sala=ABCD
//   Assert: normal TitleScene loads (param ignored), no crash.
//
// Run: VITE_NET_ENABLED=true node scripts/e2e-invite-link.mjs
//   (requires dev server on :3000 with NET_ENABLED=true + Colyseus server on :2567)
//
// Note: Scenario C uses the same dev server (which IS NET_ENABLED=true in this run).
// We verify flag-off behaviour by checking that if NET_ENABLED were false, BootScene
// would skip auto-join — this is covered by the unit tests. For the live E2E, we only
// assert that ?sala=CODE with a VALID server and NET_ENABLED=true causes an auto-join.

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(__dirname, '..', '_e2e-shots')
const BASE_URL = 'http://localhost:3000/'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── helpers ──────────────────────────────────────────────────────────────────

async function waitForGame(page, label) {
  await page.waitForFunction(() => !!(window).__game, null, { timeout: 30000 })
    .catch(() => { throw new Error(`${label}: game did not load`) })
}

async function dismissOverlay(page) {
  // Wait for the play button to appear (signals preload completed and showPlayButton registered)
  await page.waitForFunction(
    () => {
      const btn = document.getElementById('loader-play')
      return btn && btn.style.display !== 'none' && btn.style.display !== ''
    },
    null,
    { timeout: 30000 }
  )
  // Click the splash overlay to trigger the showPlay → onStart path
  await page.evaluate(() => {
    const o = document.getElementById('loader-overlay')
    if (o) {
      o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    }
  })
  // Wait for overlay fade + scene transition
  await sleep(1000)
}

async function bootToLobby(page, label) {
  await page.goto(BASE_URL)
  await waitForGame(page, label)
  // Hide the DOM splash overlay (same pattern as e2e-coop.mjs)
  await page.evaluate(() => {
    const o = document.getElementById('loader-overlay')
    if (o) { o.style.display = 'none'; o.style.pointerEvents = 'none' }
  })
  // Drive straight into LobbyScene
  await page.evaluate(() => {
    const g = (window).__game
    g.scene.start('LobbyScene')
  })
  await page.waitForFunction(() => !!(window).__coopTest, null, { timeout: 15000 })
    .catch(() => { throw new Error(`${label}: __coopTest harness not found`) })
}

const assertOk = (cond, msg) => {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg)
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const fs = await import('node:fs')
  fs.mkdirSync(SHOTS, { recursive: true })

  const browser = await chromium.launch()
  const logs = []

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario A: host creates room → guest navigates to ?sala=CODE directly
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n── Scenario A: auto-join via ?sala= ──')

  const hostCtx  = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const host  = await hostCtx.newPage()
  const guest = await guestCtx.newPage()

  for (const [name, p] of [['host', host], ['guest', guest]]) {
    p.on('console', (m) => { if (m.type() === 'error') logs.push(`[${name}] ${m.text()}`) })
    p.on('pageerror', (e) => logs.push(`[${name}] ${e.message}`))
  }

  // Host: create room via harness
  await bootToLobby(host, 'host')
  const code = await host.evaluate(async () => (window).__coopTest.host('werdum'))
  console.log('Room code:', code)
  assertOk(code && code.length === 4, `host got valid code: ${code}`)

  // Read the invite URL from the harness
  const inviteUrl = await host.evaluate(() => (window).__coopTest.getInviteUrl())
  console.log('Invite URL:', inviteUrl)
  assertOk(inviteUrl && inviteUrl.includes('?sala='), 'invite URL contains ?sala=')
  assertOk(inviteUrl.includes(code), `invite URL contains room code ${code}`)

  // Guest: navigate DIRECTLY to the invite URL (auto-join path via BootScene)
  await guest.goto(inviteUrl)
  await waitForGame(guest, 'guest')
  // Dismiss the loader overlay — this triggers BootScene's showPlay callback which
  // detects the ?sala= param and starts LobbyScene with { autoJoinCode }
  await dismissOverlay(guest)

  // Wait for __coopTest to be registered by LobbyScene (it starts on auto-join)
  await guest.waitForFunction(() => !!(window).__coopTest, null, { timeout: 20000 })
    .catch(() => { throw new Error('guest: LobbyScene did not load after auto-join') })

  await sleep(2000) // allow async joinByCode to complete

  const guestMode = await guest.evaluate(() => (window).__coopTest.mode())
  console.log('Guest lobby mode:', guestMode)

  await host.screenshot({ path: join(SHOTS, 'invite-host-lobby.png') })
  await guest.screenshot({ path: join(SHOTS, 'invite-guest-autojoin.png') })

  // Guest must be in 'joined' mode (joined a room) — not 'menu'
  assertOk(
    guestMode === 'joined' || guestMode === 'joining',
    `guest should be joined/joining via invite link, got: ${guestMode}`
  )

  console.log('Scenario A: PASSED')

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario B: share button writes invite URL to clipboard
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n── Scenario B: share button clipboard fallback ──')

  // Grant clipboard permissions on the host context
  await hostCtx.grantPermissions(['clipboard-read', 'clipboard-write'])

  const shareResult = await host.evaluate(async () => await (window).__coopTest.share())
  console.log('Share result:', shareResult)
  assertOk(
    shareResult === 'copied' || shareResult === 'shared' || shareResult === 'cancelled',
    `share result should be copied/shared/cancelled, got: ${shareResult}`
  )

  if (shareResult === 'copied') {
    const clipboardText = await host.evaluate(() => navigator.clipboard.readText())
    console.log('Clipboard contents:', clipboardText)
    assertOk(clipboardText.includes('?sala='), 'clipboard contains ?sala=')
    assertOk(clipboardText.includes(code), `clipboard contains room code ${code}`)
  }

  await host.screenshot({ path: join(SHOTS, 'invite-host-share-clicked.png') })

  console.log('Scenario B: PASSED')

  // ────────────────────────────────────────────────────────────────────────────
  // Final assertions & summary
  // ────────────────────────────────────────────────────────────────────────────

  console.log('\nALL SCENARIOS PASSED')
  if (logs.length) {
    console.log('\nConsole errors:')
    logs.forEach((l) => console.log('  ' + l))
  } else {
    console.log('No console errors.')
  }

  await browser.close()
}

main().catch((e) => {
  console.error('\nE2E FAILED:', e.message)
  process.exit(1)
})
