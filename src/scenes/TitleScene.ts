import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { prepareIOSVideo, padInteractive, isMacCompat } from '../utils/iosVideo'

export class TitleScene extends Phaser.Scene {
  private navigating = false
  private bgVideo: Phaser.GameObjects.Video | null = null

  constructor() {
    super({ key: 'TitleScene' })
  }

  create() {
    const { width, height } = this.scale
    this.navigating = false

    // Garante câmera visível — protege contra estado residual de transição de cena
    this.cameras.main.setAlpha(1)

    try { sound.startIntroMusic() } catch { /* noop — AudioContext pode estar suspenso */ }

    // Base + fallback estático: no Mac rodando app iOS o vídeo é pulado, mas a
    // abertura ainda precisa ter cenário em vez de tela preta.
    this.add.rectangle(width / 2, height / 2, width, height, 0x111111).setDepth(-2)
    this.add.image(width / 2, height / 2, 'intro-bg')
      .setDisplaySize(width, height)
      .setDepth(-1)

    // Detecta Mac rodando app iOS em modo de compatibilidade.
    // isMacCompat() usa 'ontouchstart' in window (confiável) como critério principal —
    // maxTouchPoints === 0 era o check antigo mas falha em Macs com Magic Trackpad (reportam 5).
    if (!isMacCompat()) {
      try {
        // Vídeo de fundo em loop
        this.bgVideo = this.add.video(width / 2, height / 2, 'intro-video')
        this.bgVideo.setDepth(0)
        prepareIOSVideo(this.bgVideo)
        this.bgVideo.play(true)

        // Ajusta escala mantendo proporção — cobre a tela sem distorcer
        const applyScale = () => {
          const vid = this.bgVideo!.video
          if (vid?.videoWidth) {
            const scale = Math.max(width / vid.videoWidth, height / vid.videoHeight)
            this.bgVideo!.setScale(scale)
          }
        }
        this.bgVideo.on('created', applyScale)
        applyScale()
      } catch {
        this.bgVideo = null
        // Vídeo falhou — fundo preto já garantido pelo rectangle acima
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

    // PRESS START (pisca)
    const pressStart = this.add.text(960, 630, 'PRESS START', {
      fontSize: '42px', color: '#f3c204',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 14,
    }).setOrigin(0.5).setDepth(3)

    this.tweens.add({
      targets: pressStart, alpha: 0.1, duration: 600,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    // Subtítulo
    this.add.text(958, 702, 'AJUDE A SALVAR O WAND!', {
      fontSize: '28px', color: '#f8f7f7',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(3)

    // TOP 10
    const top10 = this.add.text(960, 900, '🏆 TOP 10', {
      fontSize: '30px', color: '#ffffff',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(3)
    padInteractive(top10)
    top10.on('pointerover',  () => top10.setColor('#f3c204'))
    top10.on('pointerout',   () => top10.setColor('#ffffff'))
    top10.on('pointerdown',  () => this.goToTopTen())

    // Créditos
    this.add.text(960, 979, 'CACHORRADAS ESTUDIOS', {
      fontSize: '24px', color: '#ffffff',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 3,
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
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TopTenScene'))
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
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('HowToPlayScene'))
  }
}
