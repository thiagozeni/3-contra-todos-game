import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { padInteractive } from '../utils/iosVideo'
import { dsText, makeAngledPanel, makeMenuButton, primitive } from '../ui/ds'

/** A control row: a label + a left-to-right stream of tokens.
 *  `key` tokens render as an angled keycap; `text` tokens as plain dsText. */
type Token = { kind: 'key'; t: string } | { kind: 'text'; t: string }
const key = (t: string): Token => ({ kind: 'key', t })
const txt = (t: string): Token => ({ kind: 'text', t })

const CONTROLS: { label: string; tokens: Token[] }[] = [
  { label: 'MOVER',    tokens: [key('WASD'), key('SETAS'), txt('JOYSTICK')] },
  { label: 'SOCO',     tokens: [key('J'), txt('BOTÃO J')] },
  { label: 'CHUTE',    tokens: [key('K'), txt('BOTÃO K')] },
  { label: 'BLOQUEAR', tokens: [key('L'), txt('BOTÃO 🛡')] },
  { label: 'PAUSA',    tokens: [key('ESC')] },
  { label: 'MUTE',     tokens: [key('M')] },
]

// Layout (@1920×1080)
const PANEL_X = 360
const PANEL_Y = 180
const PANEL_W = 1200
const PANEL_H = 560
const LABEL_RIGHT_X = 820   // labels right-aligned here
const TOKENS_START_X = 868  // token stream begins here
const ROW_START_Y = 252
const ROW_STEP = 80
const CHIP_H = 52
const CHIP_PAD_X = 18
const TOKEN_GAP = 16

export class HowToPlayScene extends Phaser.Scene {
  private navigating = false

  constructor() {
    super({ key: 'HowToPlayScene' })
  }

  create() {
    this.navigating = false
    const { width, height } = this.scale

    this.cameras.main.fadeIn(300, 0, 0, 0)

    this.add.image(width / 2, height / 2, 'sem-crowd').setDisplaySize(width, height).setDepth(0)
    this.add.rectangle(width / 2, height / 2, width, height, primitive.black, 0.80).setDepth(1)

    // Título
    dsText(this, width / 2, 72, 'HOW TO PLAY', {
      role: 'display', color: 'textBrand', origin: [0.5, 0],
    }).setDepth(2)

    // Painel angulado de fundo enquadrando os controles
    makeAngledPanel(this, { x: PANEL_X, y: PANEL_Y, w: PANEL_W, h: PANEL_H, variant: 'outline', depth: 2 })

    CONTROLS.forEach(({ label, tokens }, i) => {
      const cy = ROW_START_Y + i * ROW_STEP
      dsText(this, LABEL_RIGHT_X, cy, label, { role: 'h3', color: 'textBrand', origin: [1, 0.5] }).setDepth(3)

      let cx = TOKENS_START_X
      for (const tok of tokens) {
        cx += this.placeToken(cx, cy, tok) + TOKEN_GAP
      }
    })

    // Objetivo
    dsText(this, width / 2, 800, '⚡  PROTEJA O WAND DOS INIMIGOS!  ⚡', {
      role: 'h3', color: 'textBrand', origin: [0.5, 0],
    }).setDepth(2)

    // Press start
    const skip = dsText(this, width / 2, 905, 'PRESS START', {
      role: 'h2', color: 'accentDamageHi', origin: [0.5, 0.5],
    }).setDepth(2)
    padInteractive(skip)

    this.tweens.add({ targets: skip, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 })
    skip.on('pointerdown', (_p: any, _lx: number, _ly: number, event: any) => {
      event.stopPropagation()
      this.go()
    })

    // Botão VOLTAR (link do DS)
    makeMenuButton(this, {
      x: 60, y: 60, label: '< VOLTAR', variant: 'link', role: 'h3', depth: 2,
      onClick: () => this.goBack(),
    })

    this.time.delayedCall(300, () => {
      this.input.keyboard!.on('keydown-SPACE',  () => this.go())
      this.input.keyboard!.on('keydown-ENTER',  () => this.go())
      this.input.keyboard!.on('keydown-ESCAPE', () => this.goBack())
      this.input.on('pointerdown', () => this.go())
    })
  }

  /** Draws a token at left edge cx (vertically centered on cy). Returns its width. */
  private placeToken(cx: number, cy: number, tok: Token): number {
    if (tok.kind === 'text') {
      const t = dsText(this, cx, cy, tok.t, { role: 'body', color: 'textPrimary', origin: [0, 0.5] }).setDepth(3)
      return Math.ceil(t.width)
    }
    // keycap: angled panel sized to the key text + a centered label on top
    const label = dsText(this, 0, 0, tok.t, { role: 'body', color: 'textBrand', origin: [0.5, 0.5] }).setDepth(4)
    const w = Math.ceil(label.width) + CHIP_PAD_X * 2
    makeAngledPanel(this, { x: cx, y: cy - CHIP_H / 2, w, h: CHIP_H, variant: 'filled', depth: 3 })
    label.setPosition(cx + w / 2, cy)
    return w
  }

  private go() {
    if (this.navigating) return
    this.navigating = true
    sound.select()
    this.cameras.main.fadeOut(300, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('SelectScene'))
  }

  private goBack() {
    if (this.navigating) return
    this.navigating = true
    sound.select()
    this.cameras.main.fadeOut(300, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TitleScene'))
  }
}
