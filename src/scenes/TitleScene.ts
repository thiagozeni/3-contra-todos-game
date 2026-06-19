import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { NET_ENABLED } from '../net/flags'
import {
  dsText, STROKE, primitive, semantic, hex,
} from '../ui/ds'
import { mountIntroBackdrop } from '../ui/introBackdrop'
import { makeOptionsOverlay, type OptionsOverlayHandle } from '../ui/optionsOverlay'

type IconKind = 'star' | 'globe' | 'trophy' | 'gear'

interface MenuItem {
  label: string
  kind: IconKind
  action: () => void
  /** O container do botão (escala como unidade no foco/blink). */
  container: Phaser.GameObjects.Container
  bg: Phaser.GameObjects.Graphics
  glow: Phaser.GameObjects.Graphics
  icon?: Phaser.GameObjects.Sprite       // itens de opção (CO-OP/TOP 10/OPTIONS)
  stars?: Phaser.GameObjects.Sprite[]    // só o item PRESS START (estrelas ladeando)
  text: Phaser.GameObjects.Text
  w: number; h: number; cy: number
}

// Menu vertical (@1920×1080) — botões arredondados (mockup GPT). O item PRESS START
// (índice 0) é o CTA: "★ PRESS START ★" centralizado, sem ícone. Os demais: ícone +
// label à esquerda. O FOCADO ganha gold-fill + glow + leve scale; confirmar pisca.
const MENU_H = 84       // mais alto — alvo de toque maior no mobile
const MENU_GAP = 26     // mais respiro entre botões
const MENU_CX = 960
const MENU_TOP = 500    // sobe p/ caber os botões maiores
const MENU_TEXT_X = 78  // offset do texto a partir da borda esquerda (depois do ícone)
const MENU_PAD_R = 48   // respiro à direita do label mais longo
const MENU_RADIUS = 16
const FOCUS_SCALE = 1.05

export class TitleScene extends Phaser.Scene {
  private navigating = false
  private confirming = false
  private optionsOverlay: OptionsOverlayHandle | null = null
  private items: MenuItem[] = []
  private focus = 0
  private glowTween?: Phaser.Tweens.Tween
  /** Objetos do menu ocultados enquanto Options está aberto (fundo fica uniforme). */
  private menuLayer: Phaser.GameObjects.GameObject[] = []

  constructor() {
    super({ key: 'TitleScene' })
  }

  create() {
    this.navigating = false
    this.optionsOverlay = null
    this.items = []
    this.focus = 0
    this.menuLayer = []
    this.cameras.main.setAlpha(1)

    try { sound.startIntroMusic() } catch { /* noop — AudioContext pode estar suspenso */ }

    // Fundo premium: vídeo de loop (logo em chamas + lutadores) com fallback PNG,
    // + VFX em tempo real (brasas flutuando + holofotes varrendo). Ver introBackdrop.
    mountIntroBackdrop(this)

    const defs: { label: string; kind: IconKind; action: () => void }[] = [
      { label: 'PRESS START', kind: 'star',   action: () => this.goToSelect() },
    ]
    if (NET_ENABLED) defs.push({ label: 'CO-OP ONLINE', kind: 'globe', action: () => this.goToLobby() })
    defs.push({ label: 'TOP 10',  kind: 'trophy', action: () => this.goToTopTen() })
    defs.push({ label: 'OPTIONS', kind: 'gear',   action: () => this.openOptions() })

    // Largura dinâmica: cabe o label mais largo + ícone + respiro, igual em todos.
    const probe = defs.map((d) => dsText(this, 0, 0, d.label, { role: 'h2', origin: [0, 0.5] }))
    const menuW = Math.ceil(MENU_TEXT_X + Math.max(...probe.map((t) => t.width)) + MENU_PAD_R)
    probe.forEach((t) => t.destroy())
    const halfW = menuW / 2
    const iconH = 44

    defs.forEach((d, i) => {
      const cy = MENU_TOP + i * (MENU_H + MENU_GAP) + MENU_H / 2
      const isStart = i === 0

      // Glow (atrás, fora do container — pulsa sem escalar com o blink).
      const glow = this.add.graphics().setDepth(9).setScrollFactor(0)
      glow.fillStyle(primitive.gold, 0.14).fillRoundedRect(MENU_CX - halfW - 16, cy - MENU_H / 2 - 16, menuW + 32, MENU_H + 32, MENU_RADIUS + 6)
      glow.fillStyle(primitive.gold, 0.22).fillRoundedRect(MENU_CX - halfW - 8, cy - MENU_H / 2 - 8, menuW + 16, MENU_H + 16, MENU_RADIUS + 4)
      glow.setVisible(false)

      // Container do botão (coords relativas ao centro) — escala como unidade.
      const container = this.add.container(MENU_CX, cy).setDepth(10).setScrollFactor(0)
      const bg = this.add.graphics()
      container.add(bg)

      let icon: Phaser.GameObjects.Sprite | undefined
      let stars: Phaser.GameObjects.Sprite[] | undefined
      let text: Phaser.GameObjects.Text

      if (isStart) {
        // CTA: "PRESS START" centralizado + estrelas ladeando (sem ícone à esquerda).
        text = dsText(this, 0, 0, d.label, { role: 'h2', color: 'ink', origin: [0.5, 0.5] })
        const star = this.textures.get('ic-star').getSourceImage() as { width: number; height: number }
        const sar = star.width > 0 && star.height > 0 ? star.width / star.height : 1
        const sx = text.width / 2 + 34
        stars = [-1, 1].map((s) => this.add.sprite(s * sx, 0, 'ic-star').setDisplaySize(Math.round(32 * sar), 32))
        container.add([text, ...stars])
      } else {
        // Opção: ícone premium à esquerda + label à esquerda.
        const src = this.textures.get(`ic-${d.kind}`).getSourceImage() as { width: number; height: number }
        const ar = src.width > 0 && src.height > 0 ? src.width / src.height : 1
        icon = this.add.sprite(-halfW + 38, 0, `ic-${d.kind}`).setDisplaySize(Math.round(iconH * ar), iconH)
        text = dsText(this, -halfW + MENU_TEXT_X, 0, d.label, { role: 'h2', color: 'textPrimary', origin: [0, 0.5] })
        container.add([icon, text])
      }

      const hit = this.add.rectangle(MENU_CX, cy, menuW, MENU_H, 0x000000, 0)
        .setDepth(12).setScrollFactor(0).setInteractive({ useHandCursor: true })
      hit.on('pointerover', () => this.setFocus(i))
      hit.on('pointerdown', () => this.activate(i))

      this.items.push({ ...d, container, bg, glow, icon, stars, text, w: menuW, h: MENU_H, cy })
      this.menuLayer.push(container, glow)
    })

    const credit = dsText(this, MENU_CX, 992, '★  CACHORRADAS STUDIOS  ★', {
      role: 'small', color: 'textSecondary', origin: [0.5, 0.5],
    }).setDepth(11).setScrollFactor(0)
    this.menuLayer.push(credit)

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
    // Coords relativas ao centro do container.
    const w = it.w, h = it.h, r = MENU_RADIUS
    const x = -w / 2, y = -h / 2
    const g = it.bg
    g.clear()
    // Estrutura SEMPRE igual (painel escuro + borda dourada) — o foco NÃO inverte
    // para fundo dourado/texto preto. O rollover é só: scale (setFocus) + texto
    // dourado + glow. Os ícones mantêm a cor original em qualquer estado.
    g.fillStyle(primitive.night, 0.62).fillRoundedRect(x, y, w, h, r)
    g.lineStyle(STROKE.heavy, primitive.black, 1).strokeRoundedRect(x, y, w, h, r)
    g.lineStyle(STROKE.bold, focused ? primitive.goldHi : primitive.goldBrand, 1).strokeRoundedRect(x + 2, y + 2, w - 4, h - 4, r - 1)
    it.text.setColor(hex(focused ? semantic.textBrand : semantic.textPrimary))
    it.icon?.clearTint()
    it.stars?.forEach((s) => s.clearTint())
    it.glow.setVisible(focused)
  }

  private setFocus(i: number, silent = false) {
    if (this.navigating || this.optionsOverlay || this.confirming) return
    this.focus = i
    this.items.forEach((it, idx) => {
      const on = idx === i
      this.drawItem(it, on)
      // Rollover: leve scale-up no item focado (botão "salta" — pedido do conceito).
      this.tweens.add({ targets: it.container, scale: on ? FOCUS_SCALE : 1, duration: 150, ease: 'Back.Out' })
    })
    this.glowTween?.stop()
    const gl = this.items[i].glow
    gl.setAlpha(0.9)
    this.glowTween = this.tweens.add({
      targets: gl, alpha: 0.35, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    if (!silent) sound.hover()
  }

  private move(dir: number) {
    if (this.navigating || this.optionsOverlay || this.confirming) return
    const n = this.items.length
    this.setFocus((this.focus + dir + n) % n)
  }

  /** Confirmação: o botão PISCA algumas vezes antes de disparar a ação (CTA arcade). */
  private activate(i: number) {
    if (this.navigating || this.optionsOverlay || this.confirming) return
    this.confirming = true
    this.setFocus(i, true)
    sound.select()
    const it = this.items[i]
    this.tweens.killTweensOf(it.container)
    it.container.setScale(FOCUS_SCALE)
    this.tweens.add({
      targets: it.container, alpha: 0.25, duration: 85, yoyo: true, repeat: 3, ease: 'Linear',
      onComplete: () => {
        it.container.setAlpha(1)
        this.confirming = false
        it.action()
      },
    })
  }

  private openOptions() {
    if (this.navigating || this.optionsOverlay) return
    sound.select()
    // Oculta o menu para o véu do Options ficar uniforme (sem re-escurecer o canvas).
    this.menuLayer.forEach((o) => (o as unknown as { setVisible: (v: boolean) => void }).setVisible(false))
    this.optionsOverlay = makeOptionsOverlay(this, { onClose: () => this.closeOptions() })
  }

  private closeOptions() {
    if (!this.optionsOverlay) return
    this.optionsOverlay.destroy()
    this.optionsOverlay = null
    this.menuLayer.forEach((o) => (o as unknown as { setVisible: (v: boolean) => void }).setVisible(true))
    // O glow só deve reaparecer no item focado — redesenha o estado.
    this.setFocus(this.focus, true)
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
