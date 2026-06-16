import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { dsText } from '../ui/ds'
import { mountSceneBg } from '../ui/sceneBg'

/**
 * How to Play — tela estática e informativa. A arte do conceito (`how-to-play.png`)
 * já traz TUDO embutido (painéis, ícones grandes joystick/luva/bota/escudo,
 * keycaps individuais, missão), então usamos a arte completa como a tela (mesma
 * filosofia de Game Over / You Win) e só sobrepomos o que é funcional: a área de
 * VOLTAR e o "toque para continuar". O `#scene-bg` superwide cobre as laterais em
 * telas ultrawide (a arte 16:9 fica centrada no canvas via Scale.FIT).
 */
export class HowToPlayScene extends Phaser.Scene {
  private navigating = false

  constructor() {
    super({ key: 'HowToPlayScene' })
  }

  create() {
    this.navigating = false
    const { width, height } = this.scale

    this.cameras.main.fadeIn(300, 0, 0, 0)

    // Ringue superwide atrás (preenche ultrawide; em 16:9 fica coberto pela arte).
    mountSceneBg(this, 'imgs/cenario/how-to-play-bg-superwide.png')
    // Arte completa do conceito (16:9) — cobre o canvas inteiro.
    this.add.image(width / 2, height / 2, 'how-to-play-full').setDisplaySize(width, height).setDepth(1)

    // "toque para continuar" discreto (a arte não traz) — a tela toda avança.
    const hint = dsText(this, width / 2, 1042, '▶  TOQUE PARA CONTINUAR', {
      role: 'small', color: 'accentDamageHi', origin: [0.5, 0.5],
    }).setDepth(4)
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 })

    // Toda a tela avança (depth 2). O VOLTAR (depth 5, canto sup-esq) tem prioridade.
    const advance = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(2)
    advance.on('pointerdown', () => this.go())

    const back = this.add.rectangle(160, 60, 300, 96, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(5)
    back.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation()
      this.goBack()
    })

    this.time.delayedCall(300, () => {
      this.input.keyboard!.on('keydown-SPACE',  () => this.go())
      this.input.keyboard!.on('keydown-ENTER',  () => this.go())
      this.input.keyboard!.on('keydown-ESCAPE', () => this.goBack())
    })
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
