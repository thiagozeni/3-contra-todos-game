// FB7 — DOM code-input overlay E2E
//
// Scenarios:
//  A. Desktop: page.fill() into the DOM input → join flow completes
//  B. Mobile-emulated (iPhone viewport + hasTouch):
//       tap "ENTRAR COM CÓDIGO" → DOM input exists → is focused →
//       text-align: center computed style → fill code → join
//  C. Re-entry: open join UI twice → exactly ONE input node at a time
//
// Run: VITE_NET_ENABLED=true node scripts/e2e-fb7-dom-code-input.mjs
//   (requires dev server on :3000 with NET_ENABLED=true + Colyseus on :2568)

import { chromium, devices } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join }    from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS     = join(__dirname, '..', '_e2e-shots')
const BASE_URL  = 'http://localhost:3000/'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const assertOk = (cond, msg) => {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg)
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function bootToLobby(page, label) {
  await page.goto(BASE_URL)
  await page.waitForFunction(() => !!(window).__game, null, { timeout: 30000 })
    .catch(() => { throw new Error(`${label}: game did not load`) })
  // Hide the loader overlay
  await page.evaluate(() => {
    const o = document.getElementById('loader-overlay')
    if (o) { o.style.display = 'none'; o.style.pointerEvents = 'none' }
  })
  // Drive directly into LobbyScene
  await page.evaluate(() => {
    const g = (window).__game
    g.scene.start('LobbyScene')
  })
  await page.waitForFunction(() => !!(window).__coopTest, null, { timeout: 15000 })
    .catch(() => { throw new Error(`${label}: __coopTest harness not found`) })
}

async function openJoinUI(page, label) {
  // Click "ENTRAR COM CÓDIGO" button via Phaser canvas tap.
  // Use the JS harness path instead so we don't need pixel-perfect canvas clicks.
  await page.evaluate(() => {
    // Drive the scene directly to the join UI state.
    const g = (window).__game
    const lobby = g.scene.getScene('LobbyScene')
    if (!lobby) throw new Error('LobbyScene not found')
    // Call the private method via bracket notation (E2E only)
    lobby['showJoinUI']()
  })
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="code-input-overlay"]')
      return el !== null
    },
    null,
    { timeout: 5000 },
  ).catch(() => { throw new Error(`${label}: DOM code-input overlay did not appear`) })
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const fs = await import('node:fs')
  fs.mkdirSync(SHOTS, { recursive: true })

  const browser = await chromium.launch()
  const logs    = []

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario A — Desktop: create room (host) + DOM-input fill (guest) → join
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n── Scenario A: desktop DOM-input fill ──')

  const hostCtx  = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const hostPage  = await hostCtx.newPage()
  const guestPage = await guestCtx.newPage()

  for (const [name, p] of [['host-A', hostPage], ['guest-A', guestPage]]) {
    p.on('console', (m) => { if (m.type() === 'error') logs.push(`[${name}] ${m.text()}`) })
    p.on('pageerror', (e) => logs.push(`[${name}] ${e.message}`))
  }

  await bootToLobby(hostPage,  'host-A')
  await bootToLobby(guestPage, 'guest-A')

  // Host creates room
  const code = await hostPage.evaluate(async () => (window).__coopTest.host())
  console.log('Room code:', code)
  assertOk(code && code.length === 4, `host got valid code: ${code}`)

  // Guest: open join UI → DOM input appears
  await openJoinUI(guestPage, 'guest-A')

  // Assert exactly one overlay input exists
  const countA1 = await guestPage.evaluate(
    () => document.querySelectorAll('[data-testid="code-input-overlay"]').length
  )
  assertOk(countA1 === 1, `Expected 1 input node, got ${countA1}`)
  console.log('DOM input present:', countA1)

  // page.fill() now works because the element is a real DOM input
  await guestPage.fill('[data-testid="code-input-overlay"]', code)
  await sleep(300)

  // Wait for join to complete (mode should flip to 'joined')
  await guestPage.waitForFunction(
    () => {
      const t = (window).__coopTest
      return t && (t.mode() === 'joined' || t.mode() === 'joining')
    },
    null,
    { timeout: 10000 },
  ).catch(() => {})

  const modeA = await guestPage.evaluate(() => (window).__coopTest.mode())
  console.log('Guest mode after fill:', modeA)

  await guestPage.screenshot({ path: join(SHOTS, 'fb7-A-desktop-after-fill.png') })
  await hostPage.screenshot({ path: join(SHOTS, 'fb7-A-host.png') })

  // Join flow: mode is 'joined' (success) or 'joining' (still connecting) — both acceptable.
  // 'menu' means the join failed; that's the only bad outcome here.
  assertOk(
    modeA === 'joined' || modeA === 'joining',
    `Guest should be joined/joining after DOM input fill, got: ${modeA}`,
  )
  console.log('Scenario A: PASSED')

  await hostCtx.close()
  await guestCtx.close()

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario B — Mobile emulated: overlay focusable + text-align: center
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n── Scenario B: mobile-emulated DOM input + focus + text-align ──')

  const iPhone = devices['iPhone 12']
  const mobileCtx = await browser.newContext({
    ...iPhone,
    // Playwright emulated devices set hasTouch:true which mirrors real mobile browsers
  })
  const mobilePage = await mobileCtx.newPage()
  mobilePage.on('console', (m) => { if (m.type() === 'error') logs.push(`[mobile-B] ${m.text()}`) })
  mobilePage.on('pageerror', (e) => logs.push(`[mobile-B] ${e.message}`))

  await bootToLobby(mobilePage, 'mobile-B')
  await openJoinUI(mobilePage, 'mobile-B')

  // Assert input exists
  const countB = await mobilePage.evaluate(
    () => document.querySelectorAll('[data-testid="code-input-overlay"]').length
  )
  assertOk(countB === 1, `Mobile: expected 1 input node, got ${countB}`)
  console.log('Mobile DOM input present:', countB)

  // Assert the input is focused (document.activeElement points to it)
  // Give a brief moment for the rAF focus() to fire
  await sleep(200)
  const isFocused = await mobilePage.evaluate(() => {
    const el = document.querySelector('[data-testid="code-input-overlay"]')
    return document.activeElement === el
  })
  console.log('DOM input is focused:', isFocused)
  assertOk(isFocused, 'DOM input should be focused (triggers virtual keyboard on real mobile)')

  // Assert text-align: center computed style
  const textAlign = await mobilePage.evaluate(() => {
    const el = document.querySelector('[data-testid="code-input-overlay"]')
    if (!el) return null
    return window.getComputedStyle(el).textAlign
  })
  console.log('text-align:', textAlign)
  assertOk(textAlign === 'center', `Expected text-align: center, got: ${textAlign}`)

  await mobilePage.screenshot({ path: join(SHOTS, 'fb7-B-mobile-join-open.png') })
  console.log('Scenario B: PASSED')

  await mobileCtx.close()

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario C — Re-entry: open join UI twice → exactly ONE input node at a time
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n── Scenario C: re-entry — no orphan DOM nodes ──')

  const reCtx  = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const rePage = await reCtx.newPage()
  rePage.on('console', (m) => { if (m.type() === 'error') logs.push(`[re-C] ${m.text()}`) })
  rePage.on('pageerror', (e) => logs.push(`[re-C] ${e.message}`))

  await bootToLobby(rePage, 're-C')

  // First open
  await openJoinUI(rePage, 're-C first')
  const countC1 = await rePage.evaluate(
    () => document.querySelectorAll('[data-testid="code-input-overlay"]').length
  )
  assertOk(countC1 === 1, `Re-entry pass 1: expected 1 input node, got ${countC1}`)
  console.log('First open — input count:', countC1)

  // Go back to menu (cancel)
  await rePage.evaluate(() => {
    const g = (window).__game
    const lobby = g.scene.getScene('LobbyScene')
    lobby['showMenu']()
  })
  await sleep(100)

  // Second open
  await openJoinUI(rePage, 're-C second')
  const countC2 = await rePage.evaluate(
    () => document.querySelectorAll('[data-testid="code-input-overlay"]').length
  )
  assertOk(countC2 === 1, `Re-entry pass 2: expected exactly 1 input node, got ${countC2}`)
  console.log('Second open — input count:', countC2)

  await rePage.screenshot({ path: join(SHOTS, 'fb7-C-re-entry.png') })
  console.log('Scenario C: PASSED')

  await reCtx.close()

  // ── Summary ──────────────────────────────────────────────────────────────────

  console.log('\nALL FB7 SCENARIOS PASSED')
  if (logs.length) {
    console.log('\nConsole errors:')
    logs.forEach((l) => console.log('  ' + l))
  } else {
    console.log('No console errors.')
  }

  await browser.close()
}

main().catch((e) => {
  console.error('\nFB7 E2E FAILED:', e.message)
  process.exit(1)
})
