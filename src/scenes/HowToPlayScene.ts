import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { dsText, makeAngledPanel, makeMenuButton, primitive, hex, semantic } from '../ui/ds'
import { mountSceneBg } from '../ui/sceneBg'

// Painel central (@1920×1080) dividido em 4 quadrantes (mockup GPT).
const PANEL = { x: 290, y: 168, w: 1340, h: 566 }
const MID_X = PANEL.x + PANEL.w / 2   // 960
const MID_Y = PANEL.y + PANEL.h / 2   // 451
const CHIP_H = 50
const CHIP_PAD = 16
const CHIP_GAP = 12

export class HowToPlayScene extends Phaser.Scene {
  private navigating = false

  constructor() {
    super({ key: 'HowToPlayScene' })
  }

  create() {
    this.navigating = false
    const { width, height } = this.scale

    this.cameras.main.fadeIn(300, 0, 0, 0)

    // Fundo dark premium (camada DOM #scene-bg, cover responsivo) + escurecimento p/ legibilidade
    mountSceneBg(this, 'imgs/cenario/arena-premium-bg.png')
    this.add.rectangle(width / 2, height / 2, width, height, primitive.black, 0.62).setDepth(1)

    // Título
    dsText(this, width / 2, 64, '★  HOW TO PLAY  ★', {
      role: 'display', color: 'textBrand', origin: [0.5, 0],
    }).setDepth(3)

    // Painel central (outline) + divisórias dos quadrantes
    makeAngledPanel(this, { x: PANEL.x, y: PANEL.y, w: PANEL.w, h: PANEL.h, variant: 'outline', depth: 2 })
    this.add.rectangle(MID_X, MID_Y, 2, PANEL.h - 60, primitive.steel, 0.5).setDepth(3)
    this.add.rectangle(MID_X, MID_Y, PANEL.w - 80, 2, primitive.steel, 0.5).setDepth(3)

    // ── Quadrantes ──────────────────────────────────────────────────────────
    // Inputs com keycaps limpos (diretriz do DS: sem ícones decorativos — só teclas).
    // MOVIMENTO (top-left)
    this.groupTitle(625, 214, 'MOVIMENTO')
    this.iconRow(505, 300, ['WASD', 'SETAS'])
    dsText(this, 625, 360, 'JOYSTICK', { role: 'small', color: 'textSecondary', origin: [0.5, 0.5] }).setDepth(4)

    // ATAQUE (top-right)
    this.groupTitle(1295, 214, 'ATAQUE')
    this.iconRow(1180, 290, ['J'], 'SOCO')
    this.iconRow(1180, 360, ['K'], 'CHUTE')

    // DEFESA (bottom-left)
    this.groupTitle(625, 480, 'DEFESA')
    this.iconRow(545, 560, ['L'], 'BLOQUEAR')

    // SISTEMA (bottom-right)
    this.groupTitle(1295, 480, 'SISTEMA')
    this.iconRow(1165, 550, ['ESC'], 'PAUSA')
    this.iconRow(1165, 620, ['M'], 'MUTE')

    // Rodapé — MISSÃO em moldura dourada
    makeAngledPanel(this, { x: PANEL.x, y: 762, w: PANEL.w, h: 78, variant: 'filled', frame: primitive.goldBrand, depth: 2 })
    dsText(this, width / 2, 801, '⚡  MISSÃO: PROTEJA O WAND DOS INIMIGOS!  ⚡', {
      role: 'h3', color: 'textBrand', origin: [0.5, 0.5],
    }).setDepth(3)

    // VOLTAR
    makeMenuButton(this, {
      x: 60, y: 60, label: '< VOLTAR', variant: 'link', role: 'h3', depth: 3, onClick: () => this.goBack(),
    })

    // Continuar (discreto) + navegação
    const hint = dsText(this, width / 2, 905, '▶  TOQUE PARA CONTINUAR', {
      role: 'small', color: 'accentDamageHi', origin: [0.5, 0.5],
    }).setDepth(3)
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 })

    this.time.delayedCall(300, () => {
      this.input.keyboard!.on('keydown-SPACE',  () => this.go())
      this.input.keyboard!.on('keydown-ENTER',  () => this.go())
      this.input.keyboard!.on('keydown-ESCAPE', () => this.goBack())
      this.input.on('pointerdown', () => this.go())
    })
  }

  /** Título dourado de um grupo, centralizado em (cx, y). */
  private groupTitle(cx: number, y: number, label: string) {
    dsText(this, cx, y, label, { role: 'h3', color: 'textBrand', origin: [0.5, 0] }).setDepth(4)
  }

  /** 1..n keycaps + rótulo opcional, ancorado em x (esquerda), centrado em y. */
  private iconRow(x: number, y: number, keys: string[], label?: string) {
    let cx = x
    for (const k of keys) {
      cx += this.keycap(cx, y, k) + CHIP_GAP
    }
    if (label) {
      dsText(this, cx + 4, y, label, { role: 'body', color: 'textPrimary', origin: [0, 0.5] }).setDepth(4)
    }
  }

  /** Keycap angular (painel dourado preenchido + tecla). Retorna a largura. */
  private keycap(cx: number, cy: number, label: string): number {
    const t = dsText(this, 0, 0, label, { role: 'body', color: 'ink', origin: [0.5, 0.5] }).setDepth(5)
    const w = Math.ceil(t.width) + CHIP_PAD * 2
    makeAngledPanel(this, { x: cx, y: cy - CHIP_H / 2, w, h: CHIP_H, variant: 'filled', frame: primitive.goldBrand, depth: 4 })
    // o painel filled usa bgPanel escuro — tecla fica clara p/ contraste
    t.setColor(hex(semantic.textBrand)).setPosition(cx + w / 2, cy)
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
