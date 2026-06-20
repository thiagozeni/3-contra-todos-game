/**
 * CoopSelector — the arcade-style simultaneous character selector (FB3).
 *
 * Rendered inside LobbyScene once a player is in a room. Shows the 3 character portraits
 * (reusing SelectScene's *-perfil assets) in a row of ROUNDED cards (same DNA as the
 * single-player SelectScene); under each, the name + a live status line (LIVRE / Pn /
 * TRAVADO). MY current pick is drawn BIGGER (the "1P" highlight of the concept). Each
 * connected player has a cursor drawn in their player color (P1 azul, P2 vermelho, P3
 * verde) above the card their pick is on. A confirmed pick frames the portrait in that
 * player's color with a check mark. The 4th slot is the "AGUARDANDO JOGADOR" placeholder
 * (dark + padlock) — a free seat, not a character.
 *
 * The component owns ONLY presentation — it renders from the authoritative player list
 * (state-driven, no local-only pick state). LobbyScene feeds it `render(...)` whenever the
 * room state changes and forwards my move/confirm intents to the server.
 */

import Phaser from 'phaser'
import { padInteractive } from '../utils/iosVideo'
import { playerColor } from '../net/playerColors'
import { resolveMySelection } from '../net/selectionState'
import { makeRoundedPortrait, makeIconTile, hex, semantic, primitive, FAMILY } from '../ui/ds'
import type { PlayerInfo } from '../net/NetClient'

// Cores/fonte derivam dos tokens do DS (Opção A). WHITE (#f8f7f7→#ffffff) e
// GREY (#8a8a8a→#888888) têm Δ visual mínimo; cores de jogador vêm de playerColor().
const FONT = FAMILY.display
const WHITE = hex(semantic.textPrimary)
const GREY = hex(semantic.textDisabled)
const FREE_BORDER = primitive.steel

/** Character order is fixed (matches the single-player SelectScene). */
export const SELECTOR_CHARS = [
  { key: 'werdum', name: 'WERDUM', perfil: 'werdum-perfil' },
  { key: 'dida', name: 'DIDA', perfil: 'dida-perfil' },
  { key: 'thor', name: 'THOR', perfil: 'thor-perfil' },
] as const

// Fileira de 4 cards arredondados, deslocada à direita (o painel de código fica à
// esquerda, como no conceito). 3 jogáveis + 1 slot "AGUARDANDO JOGADOR".
const SLOT_CX = [620, 940, 1260, 1580]   // centros fixos dos 4 slots
const CARD_CY = 522                       // centro vertical comum dos cards (subido 30px — round 2)
const CARD_BASE_W = 232, CARD_BASE_H = 432
const CARD_SEL_W = 300,  CARD_SEL_H = 500
const CARD_RADIUS = 20
const NAME_Y = CARD_CY + CARD_SEL_H / 2 + 28   // nomes ABAIXO dos cards (conceito)
const STATUS_Y = NAME_Y + 36
const CURSOR_Y = CARD_CY - CARD_SEL_H / 2 - 58  // cursores acima do card mais alto

export interface SelectorView {
  /** sorted player list (stable order) so each player maps to a slot color. */
  players: PlayerInfo[]
  mySessionId: string | null
}

export class CoopSelector {
  private scene: Phaser.Scene
  private root: Phaser.GameObjects.Container
  private cardPortraits: ReturnType<typeof makeRoundedPortrait>[] = []
  private statusTexts: Phaser.GameObjects.Text[] = []
  private nameTexts: Phaser.GameObjects.Text[] = []
  private checkMarks: Phaser.GameObjects.Text[] = []
  /** Cursor pool keyed by sessionId → its label + arrow text objects. */
  private cursors = new Map<string, { label: Phaser.GameObjects.Text; arrow: Phaser.GameObjects.Text }>()
  private hint!: Phaser.GameObjects.Text
  private decorIcons: ReturnType<typeof makeIconTile>[] = []
  /** 4º slot: card do Wand "KNOCKED OUT" (não selecionável, igual ao single-player). */
  private wandPortrait?: ReturnType<typeof makeRoundedPortrait>
  private wandOverlay: Phaser.GameObjects.GameObject[] = []
  private boxCenters: number[] = []
  /** Index of MY current pick the cards were last (re)built for (-1 = none bigger). */
  private builtSelIdx = -2
  private visible = false

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
    // Depth 7: ACIMA do frame dos cards (5) e do overlay do wand (6), p/ os cursores
    // (seta + VOCÊ) não ficarem atrás do card ampliado. Nomes/checks do container não
    // cobrem as faces (nomes ficam abaixo dos cards; checks nos cantos).
    this.root = scene.add.container(0, 0).setDepth(7)
    this.build()
    this.setVisible(false)
  }

  // ── Construction ─────────────────────────────────────────────────────────────

  private build(): void {
    const { width } = this.scene.scale

    SELECTOR_CHARS.forEach((char, i) => {
      const cx = SLOT_CX[i]
      const cy = CARD_CY
      this.boxCenters[i] = cx

      // Nome ABAIXO do card (conceito co-op).
      const name = this.scene.add.text(cx, NAME_Y, char.name, {
        fontSize: '26px', color: WHITE, fontFamily: FONT,
        stroke: hex(semantic.ink), strokeThickness: 4,
      }).setOrigin(0.5, 0)
      this.nameTexts[i] = name

      const status = this.scene.add.text(cx, STATUS_Y, 'LIVRE', {
        fontSize: '18px', color: GREY, fontFamily: FONT,
        stroke: hex(semantic.ink), strokeThickness: 3, align: 'center',
      }).setOrigin(0.5, 0)
      this.statusTexts[i] = status

      // Confirmed check mark (hidden until that box is confirmed by someone).
      // Reposicionado em buildCards() conforme o tamanho do card (base/selecionado).
      const check = this.scene.add.text(cx + CARD_BASE_W / 2 - 14, CARD_CY - CARD_BASE_H / 2 + 10, '✓', {
        fontSize: '44px', color: hex(semantic.feedbackOk), fontFamily: FONT,
        stroke: hex(semantic.ink), strokeThickness: 5,
      }).setOrigin(1, 0).setVisible(false)
      this.checkMarks[i] = check

      // Interactive: tap a card to move my cursor there; tap again to confirm.
      const hit = this.scene.add.rectangle(cx, cy, CARD_SEL_W, CARD_SEL_H, 0x000000, 0).setInteractive({ useHandCursor: true })
      padInteractive(hit)
      hit.on('pointerdown', () => this.onBoxTap(char.key))

      this.root.add([name, status, check, hit])
    })

    // 4º slot — card do WAND "KNOCKED OUT" (IDÊNTICO ao single-player Select): foto do
    // Wand em DORSO (zoom 2.6, +30%), PRETO E BRANCO e SEM transparência (o "bloqueado"
    // vem do P&B + selo/cadeado), NÃO selecionável (sem hit area).
    const waitCx = SLOT_CX[3]
    const ww = CARD_BASE_W, wh = CARD_BASE_H
    const wx = waitCx - ww / 2, wy = CARD_CY - wh / 2
    this.wandPortrait = makeRoundedPortrait(this.scene, {
      x: wx, y: wy, w: ww, h: wh, texture: 'wand-portrait', frameColor: FREE_BORDER,
      depth: 3, radius: CARD_RADIUS, zoom: 2.86, anchorTop: true, grayscale: 0.6, tint: 0xb2bcd2,
    })
    const wandSeal = this.scene.add.text(waitCx, CARD_CY - 24, 'KNOCKED\nOUT', {
      fontSize: '24px', color: hex(semantic.textSecondary), fontFamily: FONT, align: 'center',
      stroke: hex(semantic.ink), strokeThickness: 5,
    }).setOrigin(0.5, 0.5).setDepth(6)
    this.wandOverlay = [wandSeal]
    if (this.scene.textures.exists('ic-lock')) {
      this.wandOverlay.push(this.scene.add.image(waitCx, CARD_CY + 64, 'ic-lock').setDisplaySize(56, 56).setDepth(6).setAlpha(0.9))
    }

    // Rodapé — "ESCOLHA SEU LUTADOR" + estrelas (igual ao SelectScene single-player).
    // Subido p/ descolar da margem inferior (hint logo abaixo).
    const FOOTER_Y = 956
    const footer = this.scene.add.text(width / 2, FOOTER_Y, 'ESCOLHA SEU LUTADOR', {
      fontSize: '30px', color: hex(semantic.textBrand), fontFamily: FONT,
      stroke: hex(semantic.ink), strokeThickness: 6,
    }).setOrigin(0.5, 0.5)
    this.root.add(footer)
    // Estrelas do rodapé — gerenciam profundidade/glow próprios (IconTile); visibilidade
    // controlada via setVisible() (não vão para o container por causa do glow clone).
    const fStarGap = footer.width / 2 + 40
    for (const sx of [width / 2 - fStarGap, width / 2 + fStarGap]) {
      if (this.scene.textures.exists('ic-star')) {
        const star = makeIconTile(this.scene, { x: sx, y: FOOTER_Y, texture: 'ic-star', size: 28, depth: 4, glow: true })
        star.setVisible(false)
        this.decorIcons.push(star)
      }
    }

    this.hint = this.scene.add.text(width / 2, 1002, '← → mover    ENTER confirmar', {
      fontSize: '18px', color: GREY, fontFamily: FONT,
    }).setOrigin(0.5, 0.5)
    this.root.add(this.hint)

    // Cria os portraits jogáveis (nenhum maior ainda).
    this.buildCards(-1)
  }

  /** (Re)cria os 3 portraits jogáveis; o do MEU pick fica maior (destaque "1P"). */
  private buildCards(selIdx: number): void {
    this.cardPortraits.forEach(p => p.destroy())
    this.cardPortraits = SELECTOR_CHARS.map((char, i) => {
      const seld = i === selIdx
      const w = seld ? CARD_SEL_W : CARD_BASE_W
      const h = seld ? CARD_SEL_H : CARD_BASE_H
      const cx = SLOT_CX[i]
      const p = makeRoundedPortrait(this.scene, {
        x: cx - w / 2, y: CARD_CY - h / 2, w, h,
        texture: char.perfil, frameColor: FREE_BORDER,
        depth: 3, radius: CARD_RADIUS, zoom: seld ? 1.04 : 1.08, anchorTop: true,
      })
      p.setVisible(this.visible)
      // Reposiciona o check no topo-direito do card no tamanho atual.
      this.checkMarks[i]?.setPosition(cx + w / 2 - 14, CARD_CY - h / 2 + 10)
      return p
    })
    this.builtSelIdx = selIdx
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

    // Recria os cards SÓ quando o meu pick muda (render roda ~20Hz; recriar todo
    // patch causaria flicker e custo). O selecionado fica maior.
    const selIdx = this.myCursorCharKey ? SELECTOR_CHARS.findIndex(c => c.key === this.myCursorCharKey) : -1
    if (selIdx !== this.builtSelIdx) this.buildCards(selIdx)

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

    // Agrupa os cursores por box p/ posicioná-los SIMÉTRICOS (centrados no card):
    // 1 cursor → centro do card; N cursores → leque simétrico em torno do centro.
    const byBox = new Map<number, PlayerInfo[]>()
    for (const p of players) {
      if (!p.connected || !p.selectedChar) continue
      const boxIdx = SELECTOR_CHARS.findIndex(c => c.key === p.selectedChar)
      if (boxIdx < 0) continue
      const list = byBox.get(boxIdx) ?? []
      list.push(p)
      byBox.set(boxIdx, list)
    }

    const SPACING = 70
    for (const [boxIdx, list] of byBox) {
      const cx = this.boxCenters[boxIdx]
      const n = list.length
      list.forEach((p, i) => {
        seen.add(p.sessionId)
        const slot = slotOf.get(p.sessionId) ?? 0
        const color = playerColor(slot)
        const isMe = p.sessionId === mySessionId
        const x = cx + (i - (n - 1) / 2) * SPACING  // centrado horizontalmente no card

        let cur = this.cursors.get(p.sessionId)
        if (!cur) {
          const label = this.scene.add.text(x, CURSOR_Y, isMe ? 'VOCÊ' : color.label, {
            fontSize: isMe ? '28px' : '24px', color: color.css, fontFamily: FONT,
            stroke: hex(semantic.ink), strokeThickness: 5,
          }).setOrigin(0.5, 0)
          const arrow = this.scene.add.text(x, CURSOR_Y + 34, '▼', {
            fontSize: '30px', color: color.css, fontFamily: FONT,
            stroke: hex(semantic.ink), strokeThickness: 4,
          }).setOrigin(0.5, 0)
          this.root.add([label, arrow])
          cur = { label, arrow }
          this.cursors.set(p.sessionId, cur)
        }
        cur.label.setText(isMe ? 'VOCÊ' : color.label).setColor(color.css)
          .setX(x).setY(CURSOR_Y).setVisible(this.visible)
        cur.arrow.setColor(color.css).setX(x).setY(CURSOR_Y + 34).setVisible(this.visible)
      })
    }

    // Hide cursors for players no longer present / without a pick.
    for (const [sid, cur] of this.cursors) {
      if (!seen.has(sid)) { cur.label.setVisible(false); cur.arrow.setVisible(false) }
    }
  }

  // ── Visibility / teardown ────────────────────────────────────────────────────

  setVisible(v: boolean): void {
    this.visible = v
    this.root.setVisible(v)
    this.cardPortraits.forEach(p => p.setVisible(v))
    this.wandPortrait?.setVisible(v)
    this.wandOverlay.forEach(o => (o as Phaser.GameObjects.GameObject & { setVisible: (b: boolean) => void }).setVisible(v))
    this.decorIcons.forEach(s => s.setVisible(v))
    // Cursores ficam fora do fluxo do container quando escondidos — re-render ajusta.
    if (!v) for (const cur of this.cursors.values()) { cur.label.setVisible(false); cur.arrow.setVisible(false) }
  }

  destroy(): void {
    this.cardPortraits.forEach(p => p.destroy())
    this.cardPortraits = []
    this.wandPortrait?.destroy()
    this.wandPortrait = undefined
    this.wandOverlay.forEach(o => o.destroy())
    this.wandOverlay = []
    this.decorIcons.forEach(s => s.destroy())
    this.decorIcons = []
    this.root.destroy(true)
    this.cursors.clear()
  }
}
