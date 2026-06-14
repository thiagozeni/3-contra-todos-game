import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { prepareIOSVideo, padInteractive, isNativeApp } from '../utils/iosVideo'
import { createDomVideoBackground, DomVideoBackground } from '../utils/domVideoBackground'
import { NET_ENABLED } from '../net/flags'
import { hex, primitive, FAMILY } from '../ui/ds'

export class TitleScene extends Phaser.Scene {
  private navigating = false
  private bgVideo: Phaser.GameObjects.Video | null = null
  private domBgVideo: DomVideoBackground | null = null

  constructor() {
    super({ key: 'TitleScene' })
  }

  create() {
    const { width, height } = this.scale
    this.navigating = false

    // Garante câmera visível — protege contra estado residual de transição de cena
    this.cameras.main.setAlpha(1)

    try { sound.startIntroMusic() } catch { /* noop — AudioContext pode estar suspenso */ }

    // Base + fallback estático até o vídeo real ficar pronto.
    const fallbackRect = this.add.rectangle(width / 2, height / 2, width, height, 0x111111).setDepth(-2)
    const fallbackImage = this.add.image(width / 2, height / 2, 'intro-bg')
      .setDisplaySize(width, height)
      .setDepth(-1)

    if (isNativeApp()) {
      this.domBgVideo = createDomVideoBackground('videos/intro.mp4', {
        onReady: () => {
          fallbackRect.setVisible(false)
          fallbackImage.setVisible(false)
        },
      })
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyDomVideo())
    } else {
      try {
        // Vídeo de fundo em loop. Começa invisível para não mostrar quadro preto
        // enquanto o WKWebView decodifica o primeiro frame — intro-bg cobre o fundo.
        this.bgVideo = this.add.video(width / 2, height / 2, 'intro-video')
        this.bgVideo.setDepth(0).setVisible(false)

        let videoReady = false
        const applyScaleAndShow = () => {
          if (videoReady || !this.bgVideo?.active) return
          videoReady = true
          const el = (this.bgVideo as unknown as { video?: HTMLVideoElement }).video
          if (el?.videoWidth) {
            const scale = Math.max(width / el.videoWidth, height / el.videoHeight)
            this.bgVideo!.setScale(scale)
          }
          this.bgVideo!.setVisible(true)
        }

        const wireNativeEvents = () => {
          const el = (this.bgVideo as unknown as { video?: HTMLVideoElement }).video
          if (!el) return
          ;['canplay', 'playing'].forEach(ev =>
            el.addEventListener(ev, applyScaleAndShow, { once: true })
          )
        }

        this.bgVideo.on('created', wireNativeEvents)
        this.bgVideo.on('play', () => this.time.delayedCall(200, applyScaleAndShow))
        wireNativeEvents()
        prepareIOSVideo(this.bgVideo)
        this.bgVideo.play(true)
      } catch {
        this.bgVideo = null
        // Vídeo falhou — intro-bg cobre o fundo.
      }
    }

    // Logo "3 Contra Todos" — frente de todos os elementos
    this.add.image(0, 0, 'logo-novo')
      .setOrigin(0, 0)
      .setPosition(550, -23)
      .setDisplaySize(820, 388)
      .setDepth(10)

    // Estrelas girando sobre a cabeça do Wand na intro
    this.createDizzyStars(width * 0.95 - 25, height * 0.40 - 45)

    // PRESS START (pisca) — fonte display pixel, dourado de marca
    const pressStart = this.add.text(960, 628, 'PRESS START', {
      fontSize: '42px', color: hex(primitive.gold),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black), strokeThickness: 14,
    }).setOrigin(0.5).setDepth(3)

    this.tweens.add({
      targets: pressStart, alpha: 0.1, duration: 600,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    // Subtítulo
    this.add.text(958, 700, 'AJUDE A SALVAR O WAND!', {
      fontSize: '26px', color: hex(primitive.white),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black), strokeThickness: 5,
    }).setOrigin(0.5).setDepth(3)

    // TOP 10 (mais espaçado para legibilidade)
    const top10 = this.add.text(960, 902, '🏆 TOP 10', {
      fontSize: '26px', color: hex(primitive.white),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black), strokeThickness: 5,
    }).setOrigin(0.5).setDepth(3)
    padInteractive(top10)
    top10.on('pointerover',  () => top10.setColor(hex(primitive.gold)))
    top10.on('pointerout',   () => top10.setColor(hex(primitive.white)))
    top10.on('pointerdown',  () => this.goToTopTen())

    // CO-OP ONLINE (only shown when NET_ENABLED flag is on)
    if (NET_ENABLED) {
      const coop = this.add.text(960, 838, '🌐 CO-OP ONLINE', {
        fontSize: '26px', color: hex(primitive.cyanHi),
        fontFamily: FAMILY.display,
        stroke: hex(primitive.black), strokeThickness: 5,
      }).setOrigin(0.5).setDepth(3)
      padInteractive(coop)
      coop.on('pointerover',  () => coop.setColor(hex(primitive.gold)))
      coop.on('pointerout',   () => coop.setColor(hex(primitive.cyanHi)))
      coop.on('pointerdown',  () => this.goToLobby())
    }

    // Créditos
    this.add.text(960, 975, 'CACHORRADAS ESTUDIOS', {
      fontSize: '20px', color: hex(primitive.gray20),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black), strokeThickness: 3,
    }).setOrigin(0.5).setDepth(3)

    // Anim test — acessível apenas via Shift+F12 (uso interno)
    this.input.keyboard!.on('keydown-F12', (event: KeyboardEvent) => {
      if (!event.shiftKey || this.navigating) return
      this.navigating = true
      this.cameras.main.fadeOut(300, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('AnimTestScene'))
    })

    // Inputs
    this.input.keyboard!.on('keydown-SPACE', () => this.goToSelect())
    this.input.keyboard!.on('keydown-ENTER', () => this.goToSelect())
    this.input.on('pointerdown', () => this.goToSelect())
  }

  private createDizzyStars(cx: number, cy: number) {
    const orbitX = 43
    const orbitY = 15
    const count  = 5
    const stars  = Array.from({ length: count }, () =>
      this.add.star(cx, cy, 5, 5, 10, 0xffe500).setDepth(5)
    )
    let angle = 0
    this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        angle += 0.045
        stars.forEach((star, i) => {
          const a = angle + (i / count) * Math.PI * 2
          star.setPosition(cx + Math.cos(a) * orbitX, cy + Math.sin(a) * orbitY)
          star.setAngle(star.angle + 4)
        })
      },
    })
  }

  private goToTopTen() {
    if (this.navigating) return
    this.navigating = true
    sound.select()
    this.bgVideo?.stop()
    this.destroyDomVideo()
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TopTenScene'))
  }

  private goToLobby() {
    if (this.navigating) return
    this.navigating = true
    sound.select()
    this.bgVideo?.stop()
    this.destroyDomVideo()
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('LobbyScene'))
  }

  private tryFullscreen() {
    // No Capacitor (app nativo), não chamar Fullscreen API — já roda em tela cheia
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
    this.bgVideo?.stop()
    this.destroyDomVideo()
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('HowToPlayScene'))
  }

  private destroyDomVideo() {
    this.domBgVideo?.destroy()
    this.domBgVideo = null
  }
}
