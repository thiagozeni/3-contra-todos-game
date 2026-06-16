import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { NET_ENABLED } from '../net/flags'
import { dsText, makeMenuButton, makeOverlay, type MenuButtonHandle, type OverlayHandle } from '../ui/ds'

// Layout do menu vertical (@1920×1080) — calibrado contra docs/fatia-v/mockups/gpt-target/home.png
const MENU_CX = 960          // centro horizontal do menu
const BTN_W = 400
const PRESS_W = 446
const BTN_H = 64
const PRESS_H = 78
const PRESS_Y = 556          // topo do botão PRESS START
const ITEM_GAP = 12          // gap vertical entre os botões ghost
const FOOTER_Y = 992

export class TitleScene extends Phaser.Scene {
  private navigating = false
  private buttons: MenuButtonHandle[] = []
  private optionsOverlay: OverlayHandle | null = null

  constructor() {
    super({ key: 'TitleScene' })
  }

  create() {
    const { width, height } = this.scale
    this.navigating = false
    this.buttons = []
    this.optionsOverlay = null
    this.cameras.main.setAlpha(1)

    try { sound.startIntroMusic() } catch { /* noop — AudioContext pode estar suspenso */ }

    // Fundo: arte premium dark fight-night (elenco + arena + logo embutidos).
    this.add.image(width / 2, height / 2, 'intro-bg').setDisplaySize(width, height).setDepth(0)

    // Menu vertical (DS). PRESS START em destaque (primary), demais ghost.
    const pressLeft = MENU_CX - PRESS_W / 2
    const ghostLeft = MENU_CX - BTN_W / 2
    let y = PRESS_Y

    this.buttons.push(makeMenuButton(this, {
      x: pressLeft, y, w: PRESS_W, h: PRESS_H, label: '★ PRESS START ★',
      variant: 'primary', role: 'h3', depth: 10, onClick: () => this.goToSelect(),
    }))
    y += PRESS_H + ITEM_GAP + 6

    if (NET_ENABLED) {
      this.buttons.push(makeMenuButton(this, {
        x: ghostLeft, y, w: BTN_W, h: BTN_H, label: '🌐  CO-OP ONLINE',
        variant: 'ghost', role: 'h3', depth: 10, onClick: () => this.goToLobby(),
      }))
      y += BTN_H + ITEM_GAP
    }

    this.buttons.push(makeMenuButton(this, {
      x: ghostLeft, y, w: BTN_W, h: BTN_H, label: '🏆  TOP 10',
      variant: 'ghost', role: 'h3', depth: 10, onClick: () => this.goToTopTen(),
    }))
    y += BTN_H + ITEM_GAP

    this.buttons.push(makeMenuButton(this, {
      x: ghostLeft, y, w: BTN_W, h: BTN_H, label: '⚙  OPTIONS',
      variant: 'ghost', role: 'h3', depth: 10, onClick: () => this.openOptions(),
    }))

    // Assinatura
    dsText(this, MENU_CX, FOOTER_Y, '★  CACHORRADAS STUDIOS  ★', {
      role: 'small', color: 'textSecondary', origin: [0.5, 0.5],
    }).setDepth(10).setScrollFactor(0)

    // Atalho interno: anim test (Shift+F12)
    this.input.keyboard!.on('keydown-F12', (event: KeyboardEvent) => {
      if (!event.shiftKey || this.navigating) return
      this.navigating = true
      this.cameras.main.fadeOut(300, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('AnimTestScene'))
    })

    // Teclas: SPACE/ENTER = começar. ESC fecha o overlay de Options se aberto.
    this.input.keyboard!.on('keydown-SPACE', () => this.goToSelect())
    this.input.keyboard!.on('keydown-ENTER', () => this.goToSelect())
    this.input.keyboard!.on('keydown-ESCAPE', () => this.closeOptions())
  }

  /** OPTIONS — placeholder via overlay do DS até a tela real existir. */
  private openOptions() {
    if (this.navigating || this.optionsOverlay) return
    sound.select()
    this.buttons.forEach((b) => b.setEnabled(false))
    this.optionsOverlay = makeOverlay(this, {
      title: 'OPTIONS',
      titleColor: 'textBrand',
      lines: [{ text: 'em breve', role: 'body', color: 'textSecondary' }],
      footer: 'toque ou ESC para voltar',
      depth: 6000,
    })
    // Fecha ao tocar em qualquer lugar (um tick depois, p/ não capturar o próprio clique)
    this.time.delayedCall(50, () => this.input.once('pointerdown', () => this.closeOptions()))
  }

  private closeOptions() {
    if (!this.optionsOverlay) return
    this.optionsOverlay.destroy()
    this.optionsOverlay = null
    this.buttons.forEach((b) => b.setEnabled(true))
  }

  private goToTopTen() {
    if (this.navigating || this.optionsOverlay) return
    this.navigating = true
    sound.select()
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TopTenScene'))
  }

  private goToLobby() {
    if (this.navigating || this.optionsOverlay) return
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
    if (this.navigating || this.optionsOverlay) return
    this.navigating = true
    this.tryFullscreen()
    sound.select()
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('HowToPlayScene'))
  }
}
