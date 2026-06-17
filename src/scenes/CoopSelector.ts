/**
 * CoopSelector — the arcade-style simultaneous character selector (FB3).
 *
 * Rendered inside LobbyScene once a player is in a room. Shows the 3 character portraits
 * (reusing SelectScene's *-perfil assets) in a row; under each, a live status line
 * (LIVRE / Pn / TRAVADO). Each connected player has a cursor drawn in their player color
 * (P1 azul, P2 vermelho, P3 verde) above the box their pick is on. A confirmed pick frames
 * the portrait in that player's color with a check mark.
 *
 * The component owns ONLY presentation — it renders from the authoritative player list
 * (state-driven, no local-only pick state). LobbyScene feeds it `render(...)` whenever the
 * room state changes and forwards my move/confirm intents to the server.
 */

import Phaser from 'phaser'
import { padInteractive } from '../utils/iosVideo'
import { playerColor } from '../net/playerColors'
import { resolveMySelection } from '../net/selectionState'
import { makeAngledPortrait } from '../ui/theme'
import { hex, semantic, FAMILY } from '../ui/ds'
import type { PlayerInfo } from '../net/NetClient'

// Cores/fonte derivam dos tokens do DS (Opção A). WHITE (#f8f7f7→#ffffff) e
// GREY (#8a8a8a→#888888) têm Δ visual mínimo; cores de jogador vêm de playerColor().
const FONT = FAMILY.display
const WHITE = hex(semantic.textPrimary)
const GREY = hex(semantic.textDisabled)
const FREE_BORDER = 0x4a4a55

/** Character order is fixed (matches the single-player SelectScene). */
export const SELECTOR_CHARS = [
  { key: 'werdum', name: 'WERDUM', perfil: 'werdum-perfil' },
  { key: 'dida', name: 'DIDA', perfil: 'dida-perfil' },
  { key: 'thor', name: 'THOR', perfil: 'thor-perfil' },
] as const

const BOX_W = 360
const BOX_H = 430
const GAP = 80
const ROW_Y = 560 // top of the portrait row

export interface SelectorView {
  /** sorted player list (stable order) so each player maps to a slot color. */
  players: PlayerInfo[]
  mySessionId: string | null
}

export class CoopSelector {
  private scene: Phaser.Scene
  private root: Phaser.GameObjects.Container
  private cardPortraits: ReturnType<typeof makeAngledPortrait>[] = []
  private wandPortrait?: ReturnType<typeof makeAngledPortrait>
  private statusTexts: Phaser.GameObjects.Text[] = []
  private checkMarks: Phaser.GameObjects.Text[] = []
  /** Cursor pool keyed by sessionId → its label + arrow text objects. */
  private cursors = new Map<string, { label: Phaser.GameObjects.Text; arrow: Phaser.GameObjects.Text }>()
  private hint!: Phaser.GameObjects.Text
  private boxCenters: number[] = []

  private onSelect: (charKey: string) => void
  private onConfirmToggle: (confirmed: boolean) => void

  /** My latest known confirmed state — used to decide confirm vs unconfirm on tap/enter. */
  private myConfirmed = false
  private myCursorCharKey = ''

  constructor(
    scene: Phaser.Scene,
    onSelect: (charKey: string) => void,
    onConfirmToggle: (confirmed: boolean) => void,
  ) {
    this.scene = scene
    this.onSelect = onSelect
    this.onConfirmToggle = onConfirmToggle
    this.root = scene.add.container(0, 0).setDepth(4)
    this.build()
    this.setVisible(false)
  }

  // ── Construction ─────────────────────────────────────────────────────────────

  private build(): void {
    const { width } = this.scene.scale
    // 4 slots: 3 jogáveis + o card do WAND nocauteado (protegido, não selecionável).
    const SLOTS = SELECTOR_CHARS.length + 1
    const totalW = SLOTS * BOX_W + (SLOTS - 1) * GAP
    const startX = (width - totalW) / 2

    const title = this.scene.add.text(width / 2, ROW_Y - 90, 'ESCOLHA SEU LUTADOR', {
      fontSize: '34px', color: hex(semantic.textBrand), fontFamily: FONT,
      stroke: hex(semantic.ink), strokeThickness: 6,
    }).setOrigin(0.5, 0)
    this.root.add(title)

    SELECTOR_CHARS.forEach((char, i) => {
      const x = startX + i * (BOX_W + GAP)
      const cx = x + BOX_W / 2
      const cy = ROW_Y + BOX_H / 2
      this.boxCenters[i] = cx

      // Card angulado (igual ao HUD / SelectScene) — fora do container por causa
      // da máscara; visibilidade gerida manualmente em setVisible().
      const portrait = makeAngledPortrait(this.scene, {
        x, y: ROW_Y, w: BOX_W, h: BOX_H, texture: char.perfil, frameColor: FREE_BORDER, depth: 3, zoom: 1.5,
      })
      this.cardPortraits[i] = portrait

      const name = this.scene.add.text(cx, ROW_Y + BOX_H + 14, char.name, {
        fontSize: '26px', color: WHITE, fontFamily: FONT,
        stroke: hex(semantic.ink), strokeThickness: 4,
      }).setOrigin(0.5, 0)

      const status = this.scene.add.text(cx, ROW_Y + BOX_H + 56, 'LIVRE', {
        fontSize: '18px', color: GREY, fontFamily: FONT,
        stroke: hex(semantic.ink), strokeThickness: 3, align: 'center',
      }).setOrigin(0.5, 0)
      this.statusTexts[i] = status

      // Confirmed check mark (hidden until that box is confirmed by someone).
      const check = this.scene.add.text(x + BOX_W - 14, ROW_Y + 10, '✓', {
        fontSize: '44px', color: hex(semantic.feedbackOk), fontFamily: FONT,
        stroke: hex(semantic.ink), strokeThickness: 5,
      }).setOrigin(1, 0).setVisible(false)
      this.checkMarks[i] = check

      // Interactive: tap a box to move my cursor there; tap again to confirm.
      const hit = this.scene.add.rectangle(cx, cy, BOX_W, BOX_H, 0x000000, 0).setInteractive({ useHandCursor: true })
      padInteractive(hit)
      hit.on('pointerdown', () => this.onBoxTap(char.key))

      this.root.add([name, status, check, hit])
    })

    // 4º slot — WAND nocauteado: o protegido, NÃO selecionável (sem área interativa).
    // Card escurecido + selo "KNOCKED OUT" girado, como no SelectScene single-player.
    const wandX = startX + SELECTOR_CHARS.length * (BOX_W + GAP)
    const wandCx = wandX + BOX_W / 2
    // 'wand-portrait' é a arte LIMPA ('wand-perfil' tem "KNOCKED OUT" diagonal embutido,
    // que duplicava com o selo abaixo). Espelha o card bloqueado do SelectScene.
    this.wandPortrait = makeAngledPortrait(this.scene, {
      x: wandX, y: ROW_Y, w: BOX_W, h: BOX_H, texture: 'wand-portrait', frameColor: FREE_BORDER, depth: 3, zoom: 1.5,
    })
    this.wandPortrait.setAlpha(0.28)
    const wandStatus = this.scene.add.text(wandCx, ROW_Y + BOX_H + 56, 'PROTEGIDO', {
      fontSize: '18px', color: hex(semantic.textBrand), fontFamily: FONT, stroke: hex(semantic.ink), strokeThickness: 3,
    }).setOrigin(0.5, 0)
    // Selo "KNOCKED YOU OUT" horizontal (sem rotação) + cadeado — como no SelectScene.
    const wandSeal = this.scene.add.text(wandCx, ROW_Y + BOX_H / 2 - 30, 'KNOCKED\nYOU OUT', {
      fontSize: '24px', color: hex(semantic.textSecondary), fontFamily: FONT, align: 'center',
      stroke: hex(semantic.ink), strokeThickness: 5,
    }).setOrigin(0.5, 0.5)
    const els: Phaser.GameObjects.GameObject[] = [wandStatus, wandSeal]
    if (this.scene.textures.exists('ic-lock')) {
      els.push(this.scene.add.image(wandCx, ROW_Y + BOX_H / 2 + 50, 'ic-lock').setDisplaySize(48, 48).setAlpha(0.9))
    }
    this.root.add(els)

    this.hint = this.scene.add.text(width / 2, ROW_Y + BOX_H + 96, '← → mover    ENTER confirmar', {
      fontSize: '18px', color: GREY, fontFamily: FONT,
    }).setOrigin(0.5, 0)
    this.root.add(this.hint)
  }

  // ── Input intents ──────────────────────────────────────────────────────────────

  /** Tap a box: if it's already my cursor, toggle confirm; else move my cursor there. */
  private onBoxTap(charKey: string): void {
    if (this.myCursorCharKey === charKey) {
      this.toggleConfirm()
    } else {
      this.onSelect(charKey)
    }
  }

  /** Move my cursor one step left/right through the character row, skipping locked ones. */
  moveCursor(dir: -1 | 1, lockedForMe: Set<string>): void {
    if (this.myConfirmed) return // can't move while locked in
    const n = SELECTOR_CHARS.length
    const cur = SELECTOR_CHARS.findIndex(c => c.key === this.myCursorCharKey)
    let idx = cur < 0 ? (dir === 1 ? 0 : n - 1) : cur
    for (let step = 0; step < n; step++) {
      idx = (idx + dir + n) % n
      const key = SELECTOR_CHARS[idx].key
      if (!lockedForMe.has(key)) { this.onSelect(key); return }
    }
  }

  /** Confirm if I have a pick and am not confirmed; otherwise unconfirm. */
  toggleConfirm(): void {
    if (!this.myConfirmed && !this.myCursorCharKey) return // nothing to confirm
    this.onConfirmToggle(!this.myConfirmed)
  }

  // ── Rendering (state-driven) ─────────────────────────────────────────────────

  /**
   * Render the selector from the authoritative player list. Each player's `slotIndex`
   * (assigned by the server at join time) is used as the stable color slot so the
   * lobby cursor colors always match the in-game P1/P2/P3 indicators.
   */
  render(view: SelectorView): void {
    const { players, mySessionId } = view

    // Map sessionId → slot index using the server-authoritative slotIndex.
    // Fall back to array position only if slotIndex is not yet set (-1), which
    // should not happen in normal operation after the FB4 join-time assignment.
    const slotOf = new Map<string, number>()
    players.forEach((p, i) => slotOf.set(p.sessionId, p.slotIndex >= 0 ? p.slotIndex : i))

    // FB6: resolve "me" via the shared helper — a stale/absent session id yields an
    // empty, unconfirmed selection (never a leftover pick).
    const mine = resolveMySelection(players, mySessionId)
    this.myConfirmed = mine.confirmed
    this.myCursorCharKey = mine.selectedChar

    // Who picked / confirmed each character?
    const pickerBySid: Record<string, PlayerInfo> = {}
    for (const p of players) if (p.selectedChar) pickerBySid[p.selectedChar] = p

    SELECTOR_CHARS.forEach((char, i) => {
      const picker = pickerBySid[char.key]
      const status = this.statusTexts[i]
      const portrait = this.cardPortraits[i]
      const check = this.checkMarks[i]

      if (!picker) {
        status.setText('LIVRE').setColor(GREY)
        portrait.setFrameColor(FREE_BORDER)
        check.setVisible(false)
      } else {
        const slot = slotOf.get(picker.sessionId) ?? 0
        const color = playerColor(slot)
        const isMe = picker.sessionId === mySessionId
        const who = isMe ? 'VOCÊ' : color.label
        if (picker.confirmed) {
          status.setText(`${who} ✓`).setColor(color.css)
          portrait.setFrameColor(color.num)
          check.setColor(color.css).setVisible(true)
        } else {
          // Picked but not confirmed: for OTHERS this means the char is locked to me.
          status.setText(isMe ? who : `${color.label} (travado)`).setColor(color.css)
          portrait.setFrameColor(color.num)
          check.setVisible(false)
        }
      }
    })

    this.renderCursors(players, mySessionId, slotOf)

    // Hint reflects my state.
    if (this.myConfirmed) {
      this.hint.setText('PRONTO! aguardando os outros…    ENTER cancelar').setColor(hex(semantic.feedbackOk))
    } else if (this.myCursorCharKey) {
      this.hint.setText('← → mover    ENTER confirmar').setColor(WHITE)
    } else {
      this.hint.setText('← → escolha um lutador    ENTER confirmar').setColor(GREY)
    }
  }

  /** Draw/update one cursor per player above the box of their current pick. */
  private renderCursors(players: PlayerInfo[], mySessionId: string | null, slotOf: Map<string, number>): void {
    const seen = new Set<string>()
    let stack = new Map<number, number>() // per-box index → how many cursors already stacked

    for (const p of players) {
      if (!p.connected) continue
      if (!p.selectedChar) {
        // No pick: park the cursor offscreen (hide) but keep the object.
        this.cursors.get(p.sessionId)?.label.setVisible(false)
        this.cursors.get(p.sessionId)?.arrow.setVisible(false)
        continue
      }
      const boxIdx = SELECTOR_CHARS.findIndex(c => c.key === p.selectedChar)
      if (boxIdx < 0) continue
      seen.add(p.sessionId)

      const slot = slotOf.get(p.sessionId) ?? 0
      const color = playerColor(slot)
      const stackN = stack.get(boxIdx) ?? 0
      stack.set(boxIdx, stackN + 1)

      const cx = this.boxCenters[boxIdx]
      const labelY = ROW_Y - 56 + stackN * 0 // single row above the box
      const xOffset = (stackN - 0) * 70 // fan multiple cursors horizontally
      const lx = cx - 35 + xOffset

      let cur = this.cursors.get(p.sessionId)
      if (!cur) {
        const isMe = p.sessionId === mySessionId
        const label = this.scene.add.text(lx, labelY, isMe ? 'VOCÊ' : color.label, {
          fontSize: isMe ? '28px' : '24px', color: color.css, fontFamily: FONT,
          stroke: hex(semantic.ink), strokeThickness: 5,
        }).setOrigin(0.5, 0)
        const arrow = this.scene.add.text(cx + xOffset - 35, labelY + 34, '▼', {
          fontSize: '30px', color: color.css, fontFamily: FONT,
          stroke: hex(semantic.ink), strokeThickness: 4,
        }).setOrigin(0.5, 0)
        this.root.add([label, arrow])
        cur = { label, arrow }
        this.cursors.set(p.sessionId, cur)
      }
      const isMe = p.sessionId === mySessionId
      cur.label.setText(isMe ? 'VOCÊ' : color.label).setColor(color.css)
        .setX(lx).setY(labelY).setVisible(true)
      cur.arrow.setColor(color.css).setX(cx + xOffset - 35).setY(labelY + 34).setVisible(true)
    }

    // Hide cursors for players no longer present / without a pick.
    for (const [sid, cur] of this.cursors) {
      if (!seen.has(sid)) { cur.label.setVisible(false); cur.arrow.setVisible(false) }
    }
  }

  // ── Visibility / teardown ────────────────────────────────────────────────────

  setVisible(v: boolean): void {
    this.root.setVisible(v)
    this.cardPortraits.forEach(p => p.setVisible(v))
    this.wandPortrait?.setVisible(v)
  }

  destroy(): void {
    this.cardPortraits.forEach(p => p.destroy())
    this.cardPortraits = []
    this.wandPortrait?.destroy()
    this.wandPortrait = undefined
    this.root.destroy(true)
    this.cursors.clear()
  }
}
