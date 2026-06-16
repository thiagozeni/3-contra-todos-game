import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { NET_ENABLED } from '../net/flags'
import {
  dsText, makeOverlay, fillPara, strokePara, fillBands,
  SKEW, STROKE, primitive, semantic, hex, type OverlayHandle,
} from '../ui/ds'
import { mountSceneBg } from '../ui/sceneBg'

type IconKind = 'star' | 'globe' | 'trophy' | 'gear'

interface MenuItem {
  label: string
  kind: IconKind
  iconColor: number
  action: () => void
  g: Phaser.GameObjects.Graphics
  glow: Phaser.GameObjects.Graphics
  icon: Phaser.GameObjects.Graphics
  text: Phaser.GameObjects.Text
  x: number; y: number; w: number; h: number
}

// Menu vertical (@1920×1080) — todos os itens MESMO estilo; o item FOCADO mostra o
// estado selecionado (gold-fill + glow). Ícone à esquerda + texto à esquerda (mockup GPT).
const MENU_H = 66
const MENU_GAP = 14
const MENU_CX = 960
const MENU_TOP = 552
const MENU_TEXT_X = 96   // offset do texto (depois do ícone)
const MENU_PAD_R = 44    // respiro à direita do label mais longo

export class TitleScene extends Phaser.Scene {
  private navigating = false
  private optionsOverlay: OverlayHandle | null = null
  private items: MenuItem[] = []
  private focus = 0
  private glowTween?: Phaser.Tweens.Tween

  constructor() {
    super({ key: 'TitleScene' })
  }

  create() {
    this.navigating = false
    this.optionsOverlay = null
    this.items = []
    this.focus = 0
    this.cameras.main.setAlpha(1)

    try { sound.startIntroMusic() } catch { /* noop — AudioContext pode estar suspenso */ }

    // Fundo via camada DOM #scene-bg (cover responsivo, revela laterais em telas largas).
    mountSceneBg(this, 'imgs/cenario/intro-bg.png')

    const defs: { label: string; kind: IconKind; iconColor: number; action: () => void }[] = [
      { label: 'GAME START', kind: 'star',   iconColor: primitive.goldBrand, action: () => this.goToSelect() },
    ]
    if (NET_ENABLED) defs.push({ label: 'CO-OP ONLINE', kind: 'globe', iconColor: primitive.cyan, action: () => this.goToLobby() })
    defs.push({ label: 'TOP 10',  kind: 'trophy', iconColor: primitive.goldBrand, action: () => this.goToTopTen() })
    defs.push({ label: 'OPTIONS', kind: 'gear',   iconColor: primitive.steel,     action: () => this.openOptions() })

    const skew = Math.round(MENU_H * SKEW)
    // Largura dinâmica: cabe o label mais largo + respiro, sem sobrar nos curtos.
    const texts = defs.map((d) => dsText(this, 0, 0, d.label, {
      role: 'h3', color: 'textBrand', origin: [0, 0.5],
    }).setDepth(11).setScrollFactor(0))
    const menuW = Math.ceil(MENU_TEXT_X + Math.max(...texts.map((t) => t.width)) + MENU_PAD_R)
    const xLeft = MENU_CX - menuW / 2
    defs.forEach((d, i) => {
      const y = MENU_TOP + i * (MENU_H + MENU_GAP)
      const glow = this.add.graphics().setDepth(9).setScrollFactor(0)
      fillPara(glow, xLeft - 16, y - 16, menuW + 32, MENU_H + 32, skew, primitive.gold, 0.14)
      fillPara(glow, xLeft - 8,  y - 8,  menuW + 16, MENU_H + 16, skew, primitive.gold, 0.22)
      glow.setVisible(false)
      const g = this.add.graphics().setDepth(10).setScrollFactor(0)
      const icon = this.add.graphics().setDepth(11).setScrollFactor(0)
      const text = texts[i].setPosition(xLeft + MENU_TEXT_X, y + MENU_H / 2)
      const hit = this.add.rectangle(MENU_CX, y + MENU_H / 2, menuW, MENU_H, 0x000000, 0)
        .setDepth(12).setScrollFactor(0).setInteractive({ useHandCursor: true })
      hit.on('pointerover', () => this.setFocus(i))
      hit.on('pointerdown', () => this.activate(i))
      this.items.push({ ...d, g, glow, icon, text, x: xLeft, y, w: menuW, h: MENU_H })
    })

    dsText(this, MENU_CX, 992, '★  CACHORRADAS STUDIOS  ★', {
      role: 'small', color: 'textSecondary', origin: [0.5, 0.5],
    }).setDepth(11).setScrollFactor(0)

    this.setFocus(0, true)

    const kb = this.input.keyboard!
    kb.on('keydown-UP',    () => this.move(-1))
    kb.on('keydown-DOWN',  () => this.move(1))
    kb.on('keydown-W',     () => this.move(-1))
    kb.on('keydown-S',     () => this.move(1))
    kb.on('keydown-ENTER', () => this.activate(this.focus))
    kb.on('keydown-SPACE', () => this.activate(this.focus))
    kb.on('keydown-ESCAPE', () => this.closeOptions())
    kb.on('keydown-F12', (e: KeyboardEvent) => {
      if (!e.shiftKey || this.navigating) return
      this.navigating = true
      this.cameras.main.fadeOut(300, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('AnimTestScene'))
    })
  }

  private drawItem(it: MenuItem, focused: boolean) {
    const skew = Math.round(it.h * SKEW)
    it.g.clear()
    if (focused) {
      fillBands(it.g, it.x, it.y, it.w, it.h, skew, primitive.goldHi, primitive.goldBrand, primitive.goldLo)
      strokePara(it.g, it.x, it.y, it.w, it.h, skew, STROKE.heavy, primitive.black, 1)
      strokePara(it.g, it.x + 1, it.y + 1, it.w - 2, it.h - 2, skew, STROKE.bold, primitive.goldHi, 1)
      it.text.setColor(hex(semantic.ink))
    } else {
      fillPara(it.g, it.x, it.y, it.w, it.h, skew, primitive.night, 0.6)
      strokePara(it.g, it.x, it.y, it.w, it.h, skew, STROKE.heavy, primitive.black, 1)
      strokePara(it.g, it.x + 1, it.y + 1, it.w - 2, it.h - 2, skew, STROKE.bold, primitive.goldBrand, 1)
      it.text.setColor(hex(semantic.textPrimary))
    }
    this.drawIcon(it, focused ? primitive.black : it.iconColor)
    it.glow.setVisible(focused)
  }

  /** Desenha o line-icon do item (recolore conforme o estado). */
  private drawIcon(it: MenuItem, color: number) {
    const cx = it.x + 50, cy = it.y + it.h / 2
    const g = it.icon
    g.clear()
    g.lineStyle(3, color, 1)
    g.fillStyle(color, 1)
    if (it.kind === 'star') {
      g.beginPath()
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 17 : 7
        const a = (Math.PI / 5) * i - Math.PI / 2
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
      }
      g.closePath(); g.fillPath()
    } else if (it.kind === 'globe') {
      g.strokeCircle(cx, cy, 16)
      g.strokeEllipse(cx, cy, 16, 32)
      g.beginPath(); g.moveTo(cx - 16, cy); g.lineTo(cx + 16, cy); g.strokePath()
      g.beginPath(); g.moveTo(cx - 13, cy - 9); g.lineTo(cx + 13, cy - 9); g.strokePath()
      g.beginPath(); g.moveTo(cx - 13, cy + 9); g.lineTo(cx + 13, cy + 9); g.strokePath()
    } else if (it.kind === 'trophy') {
      g.beginPath(); g.moveTo(cx - 12, cy - 13); g.lineTo(cx + 12, cy - 13)
      g.lineTo(cx + 10, cy - 2); g.arc(cx, cy - 2, 10, 0, Math.PI); g.lineTo(cx - 12, cy - 13)
      g.closePath(); g.strokePath()
      g.strokeCircle(cx - 14, cy - 9, 4); g.strokeCircle(cx + 14, cy - 9, 4)  // alças
      g.beginPath(); g.moveTo(cx, cy + 8); g.lineTo(cx, cy + 13); g.strokePath()  // haste
      g.beginPath(); g.moveTo(cx - 9, cy + 15); g.lineTo(cx + 9, cy + 15); g.strokePath()  // base
    } else {
      // gear
      g.strokeCircle(cx, cy, 9)
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i
        g.beginPath()
        g.moveTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9)
        g.lineTo(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16)
        g.strokePath()
      }
    }
  }

  private setFocus(i: number, silent = false) {
    if (this.navigating || this.optionsOverlay) return
    this.focus = i
    this.items.forEach((it, idx) => this.drawItem(it, idx === i))
    this.glowTween?.stop()
    const gl = this.items[i].glow
    gl.setAlpha(0.9)
    this.glowTween = this.tweens.add({
      targets: gl, alpha: 0.35, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    if (!silent) sound.hover()
  }

  private move(dir: number) {
    if (this.navigating || this.optionsOverlay) return
    const n = this.items.length
    this.setFocus((this.focus + dir + n) % n)
  }

  private activate(i: number) {
    if (this.navigating || this.optionsOverlay) return
    this.setFocus(i, true)
    this.items[i].action()
  }

  private openOptions() {
    if (this.navigating || this.optionsOverlay) return
    sound.select()
    this.optionsOverlay = makeOverlay(this, {
      title: 'OPTIONS', titleColor: 'textBrand',
      lines: [{ text: 'em breve', role: 'body', color: 'textSecondary' }],
      footer: 'toque ou ESC para voltar', depth: 6000,
    })
    this.time.delayedCall(50, () => this.input.once('pointerdown', () => this.closeOptions()))
  }

  private closeOptions() {
    if (!this.optionsOverlay) return
    this.optionsOverlay.destroy()
    this.optionsOverlay = null
  }

  private goToTopTen() {
    if (this.navigating) return
    this.navigating = true
    sound.select()
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TopTenScene'))
  }

  private goToLobby() {
    if (this.navigating) return
    this.navigating = true
    sound.select()
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('LobbyScene'))
  }

  private tryFullscreen() {
    const cap = (window as any).Capacitor
    if (cap?.isNativePlatform?.()) return
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1
    if (!isMobile) return
    if (document.fullscreenElement) return
    const el = document.documentElement as any
    try {
      const p = el.requestFullscreen ? el.requestFullscreen()
              : el.webkitRequestFullscreen ? el.webkitRequestFullscreen()
              : null
      if (p?.then) {
        p.then(() => {
          const ori = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
          if (ori?.lock) ori.lock('landscape').catch(() => {})
        }).catch(() => {})
      }
    } catch (_) {}
  }

  private goToSelect() {
    if (this.navigating) return
    this.navigating = true
    this.tryFullscreen()
    sound.select()
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('HowToPlayScene'))
  }
}
