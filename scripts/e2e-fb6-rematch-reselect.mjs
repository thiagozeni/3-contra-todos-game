// FB6 E2E — after a finished co-op match, creating a NEW match must let the player pick
// a DIFFERENT character. The lobby is a pooled Phaser scene; a stale mySessionId + an
// un-left room used to leave the new selector "stuck on the previous pick" (and crashed
// the rebuilt lobby's Text). This drives the full flow: match 1 (werdum) → game over →
// Title → Lobby → create a NEW room → selector is free → pick dida (a different char).
//
// Run: node scripts/e2e-fb6-rematch-reselect.mjs  (dev client :3000 + server :2568)
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

  const assertOk = (cond, msg) => { if (!cond) throw new Error('ASSERT FAIL: ' + msg) }

  await bootToLobby(page)

  // ── Match 1: host, pick WERDUM, confirm → auto-start ──────────────────────
  await page.evaluate(async () => (window).__coopTest.host())
  await sleep(600)
  await page.evaluate(() => (window).__coopTest.select('werdum'))
  await sleep(300)
  await page.evaluate(() => (window).__coopTest.confirm())
  await page.waitForFunction(() => { const d = (window).__netDebug; return d && d.status === 'playing' }, null, { timeout: 20000 })
  const m1Char = await page.evaluate(() => {
    const d = (window).__netDebug
    return d.players[d.sessionId]?.charKey
  })
  console.log('M1 character:', m1Char)
  assertOk(m1Char === 'werdum', 'match 1 used werdum')

  // ── End match 1 (real net game-over path) ─────────────────────────────────
  await page.evaluate(() => (window).__game.scene.getScene('GameScene').netGameOver())
  await page.waitForFunction(() => {
    const keys = (window).__game.scene.getScenes(true).map(s => s.scene.key)
    return keys.includes('TitleScene') && !keys.includes('GameScene')
  }, null, { timeout: 15000 })
  await sleep(600)
  const pickAfterOver = await page.evaluate(() => (window).__game.registry.get('selectedChar'))
  console.log("registry.selectedChar after game over (should be cleared):", pickAfterOver)
  assertOk(pickAfterOver === undefined || pickAfterOver === '', 'FB6: stale pick cleared on net game over')

  // ── Back to lobby via real Title nav → create a NEW room ──────────────────
  await page.evaluate(() => (window).__game.scene.getScene('TitleScene').goToLobby())
  await page.waitForFunction(() => !!(window).__coopTest, null, { timeout: 15000 })
  await sleep(400)
  const m2code = await page.evaluate(async () => await (window).__coopTest.host())
  console.log('M2 room code:', m2code)
  assertOk(!!m2code && m2code.length === 4, 'M2 got a fresh room code')
  await sleep(700)

  // The fresh selector must show ME free (no carried-over pick), with a NEW session id.
  const fresh = await page.evaluate(() => (window).__coopTest.selection())
  console.log('M2 fresh selection:', JSON.stringify(fresh))
  assertOk(!!fresh.mySessionId, 'M2 has a (fresh) session id — lobby identity reset')
  assertOk(fresh.selectedChar === '', 'M2 selector shows MY pick as FREE (no carryover)')
  assertOk(fresh.confirmed === false, 'M2 is not pre-confirmed')
  // ALL characters must be free in the new room (single player → none taken).
  const anyTaken = fresh.players.some(p => p.selectedChar)
  assertOk(!anyTaken, 'M2 selector: all characters free')

  await page.screenshot({ path: join(SHOTS, 'fb6-new-lobby-free.png') })

  // ── Pick a DIFFERENT character (dida) — must register ─────────────────────
  await page.evaluate(() => (window).__coopTest.select('dida'))
  await sleep(400)
  const afterPick = await page.evaluate(() => (window).__coopTest.selection())
  console.log('M2 after selecting dida:', JSON.stringify(afterPick))
  assertOk(afterPick.selectedChar === 'dida', 'FB6: a DIFFERENT character (dida) was picked in the new match')
  assertOk(afterPick.selectedChar !== m1Char, 'FB6: the new pick differs from the previous match (werdum)')

  // Confirm + auto-start to prove the new pick carries all the way into the match.
  await page.evaluate(() => (window).__coopTest.confirm())
  await sleep(300)
  const preStart = await page.evaluate(() => {
    const lobby = (window).__game.scene.getScene('LobbyScene')
    const st = lobby.netClient?.getRoomState?.()
    const out = {}
    st?.players?.forEach?.((p, sid) => { out[sid] = { selectedChar: p.selectedChar, charKey: p.charKey, confirmed: p.confirmed } })
    return { status: st?.status, players: out }
  })
  console.log('M2 server state just after confirm:', JSON.stringify(preStart))
  // Wait for M2 GameScene to become active with M2's session id — NOT the stale M1 netDebug.
  // M1's __netDebug still has status:'playing'; we must wait for the new sessionId to appear.
  const m2SessionId = fresh.mySessionId
  await page.waitForFunction((sid) => {
    const d = (window).__netDebug
    return d && d.status === 'playing' && d.sessionId === sid
  }, m2SessionId, { timeout: 20000 })
  await sleep(800)
  const m2Dbg = await page.evaluate(() => {
    const d = (window).__netDebug
    const gs = (window).__game.scene.getScene('GameScene')
    const rs = gs.net?.getRoomState?.()
    const players = {}
    rs?.players?.forEach?.((p, sid) => { players[sid] = p.charKey })
    return {
      sid: d.sessionId, player: d.players[d.sessionId],
      gsNetRoom: gs.net?.getRoomCode?.(), gsNetSid: gs.net?.getSessionId?.(),
      gsRoomPlayers: players,
    }
  })
  console.log('M2 in-game debug:', JSON.stringify(m2Dbg))
  const m2Char = m2Dbg.player?.charKey
  assertOk(m2Char === 'dida', 'FB6: match 2 actually runs as dida (the newly chosen character)')

  assertOk(errors.length === 0, 'no console errors: ' + errors.join(' | '))
  console.log('FB6 REMATCH-RESELECT OK')
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
