import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { getHighScore } from '../systems/HighScore'
import { padInteractive } from '../utils/iosVideo'
import { makeAngledPortrait, makeAngledPanel, dsText, primitive } from '../ui/ds'

const CHARACTERS = [
  { key: 'werdum', name: 'WERDUM', sv: 'werdum-sv', perfil: 'werdum-perfil', previewY: 119 },
  { key: 'dida',   name: 'DIDA',   sv: 'dida-sv',   perfil: 'dida-perfil',   previewY: 149 },
  { key: 'thor',   name: 'THOR',   sv: 'thor-sv',   perfil: 'thor-perfil',   previewY: 119 },
]

// Posições dos boxes (Figma)
const BOX_Y = 608
const BOXES = [
  { x: 648,  w: 280, h: 315 },
  { x: 948,  w: 281, h: 315 },
  { x: 1248, w: 280, h: 315 },
]

export class SelectScene extends Phaser.Scene {
  private selectedIndex = 0
  private previewSprite!: Phaser.GameObjects.Image
  private previewName!: Phaser.GameObjects.Text
  private selectorArrow!: Phaser.GameObjects.Text
  private selector1P!: Phaser.GameObjects.Text
  private cardPortraits: ReturnType<typeof makeAngledPortrait>[] = []
  private isConfirming = false

  constructor() {
    super({ key: 'SelectScene' })
  }

  create() {
    this.isConfirming = false
    this.selectedIndex = 0
    this.cardPortraits = []
    this.cameras.main.setAlpha(1)
    this.cameras.main.fadeIn(250, 0, 0, 0)
    try { sound.startIntroMusic() } catch { /* Audio falhou — mantém seleção jogável */ }

    const { width, height } = this.scale

    // Fundo
    this.add.image(width / 2, height / 2, 'select-player-bg').setDisplaySize(width, height).setDepth(0)
    this.add.rectangle(width / 2, height / 2, width, height, primitive.black, 0.35).setDepth(1)

    // Painel angulado emoldurando a fileira de cards (DS)
    makeAngledPanel(this, { x: 600, y: 560, w: 1290, h: 410, variant: 'filled', frame: primitive.steel, depth: 1 })

    // "SELECT PLAYER"
    dsText(this, 648, 123, 'SELECT PLAYER', { role: 'h1', color: 'textBrand', origin: [0, 0] }).setDepth(2)

    // High score
    const hs = getHighScore(this.registry)
    if (hs > 0) {
      dsText(this, 960, 68, `BEST SCORE: ${hs.toLocaleString()}`, {
        role: 'small', color: 'accentDamageHi', origin: [0.5, 0.5],
      }).setDepth(2)
    }

    // Preview sideview (esquerda — sobrepõe borda esquerda)
    this.previewSprite = this.add.image(-159, 119, 'werdum-sv')
      .setDisplaySize(930, 1382)
      .setOrigin(0, 0)
      .setDepth(2)

    // Nome do personagem — placa angulada (DS) + nome
    makeAngledPanel(this, { x: 116, y: 706, w: 380, h: 84, variant: 'filled', frame: primitive.goldBrand, depth: 2 })
    this.previewName = dsText(this, 306, 748, 'WERDUM', {
      role: 'h1', color: 'textPrimary', align: 'center', origin: [0.5, 0.5],
    }).setDepth(3)

    // Boxes dos 3 personagens — cards angulados (design system, igual ao HUD)
    BOXES.forEach((box, i) => {
      const cx = box.x + box.w / 2
      const cy = BOX_Y + box.h / 2

      const portrait = makeAngledPortrait(this, {
        x: box.x, y: BOX_Y, w: box.w, h: box.h,
        texture: CHARACTERS[i].perfil, frameColor: primitive.steel, depth: 2, zoom: 1.0,
      })
      this.cardPortraits.push(portrait)

      // Interativo
      const hitArea = this.add.rectangle(cx, cy, box.w, box.h, 0x000000, 0)
        .setDepth(5).setInteractive({ useHandCursor: true })
      hitArea.on('pointerdown', () => {
        if (this.selectedIndex === i) this.confirmSelection()
        else this.selectChar(i)
      })
    })

    // Card do Wand (KNOCKED OUT, não selecionável) — angulado, escurecido
    const wandX = 1548, wandW = 280, wandH = 315
    const wandCx = wandX + wandW / 2
    const wandCy = BOX_Y + wandH / 2
    const wandPortrait = makeAngledPortrait(this, {
      x: wandX, y: BOX_Y, w: wandW, h: wandH, texture: 'wand-perfil', frameColor: primitive.steel, depth: 2, zoom: 1.0,
    })
    wandPortrait.setAlpha(0.5)
    dsText(this, wandCx, wandCy - 20, 'KNOCKED\nOUT', {
      role: 'body', color: 'textSecondary', align: 'center', origin: [0.5, 0.5],
    }).setAlpha(0.7).setAngle(-45).setDepth(4)

    // Cursor "1P" e seta
    this.selector1P = dsText(this, 756, 502, '1P', {
      role: 'h1', color: 'textBrand', origin: [0.5, 0],
    }).setDepth(4)

    this.selectorArrow = dsText(this, 813, 552, '▼', {
      role: 'h3', color: 'textBrand', origin: [0.5, 0],
    }).setDepth(4)

    // Botão VOLTAR
    const back = dsText(this, 60, 60, '< VOLTAR', {
      role: 'body', color: 'textPrimary', origin: [0, 0.5],
    }).setAlpha(0.7).setDepth(2)
    padInteractive(back)
    back.on('pointerdown',  (_p: any, _lx: number, _ly: number, event: any) => {
      event.stopPropagation()
      this.goBack()
    })

    // Controles
    this.input.keyboard!.off('keydown-LEFT')
    this.input.keyboard!.off('keydown-RIGHT')
    this.input.keyboard!.off('keydown-A')
    this.input.keyboard!.off('keydown-D')
    this.input.keyboard!.off('keydown-SPACE')
    this.input.keyboard!.off('keydown-ENTER')
    this.input.keyboard!.off('keydown-ESCAPE')
    this.input.keyboard!.on('keydown-LEFT',  () => this.selectChar((this.selectedIndex - 1 + CHARACTERS.length) % CHARACTERS.length))
    this.input.keyboard!.on('keydown-RIGHT', () => this.selectChar((this.selectedIndex + 1) % CHARACTERS.length))
    this.input.keyboard!.on('keydown-A',     () => this.selectChar((this.selectedIndex - 1 + CHARACTERS.length) % CHARACTERS.length))
    this.input.keyboard!.on('keydown-D',     () => this.selectChar((this.selectedIndex + 1) % CHARACTERS.length))
    this.input.keyboard!.on('keydown-SPACE', () => this.confirmSelection())
    this.input.keyboard!.on('keydown-ENTER', () => this.confirmSelection())
    this.input.keyboard!.on('keydown-ESCAPE', () => this.goBack())

    this.selectChar(0)
  }

  private selectChar(index: number) {
    if (this.isConfirming) return
    sound.hover()
    this.selectedIndex = index
    const char = CHARACTERS[index]

    // Atualiza preview sideview e nome
    this.previewSprite.setTexture(char.sv)
    this.previewSprite.setDisplaySize(930, 1382)
    this.previewSprite.setY(char.previewY)
    this.previewName.setText(char.name)

    // Destaca o card selecionado pela cor da moldura (dourado vs aço)
    this.cardPortraits.forEach((p, i) => {
      p.setFrameColor(i === index ? primitive.gold : primitive.steel)
    })

    // Move cursor 1P/seta — centralizado no box selecionado
    const boxCx = BOXES[index].x + BOXES[index].w / 2
    this.selector1P.setX(boxCx)
    this.selectorArrow.setX(boxCx)
  }

  private confirmSelection() {
    if (this.isConfirming) return
    this.isConfirming = true
    sound.select()
    try { sound.startBgMusic() } catch { /* Audio falhou — GameScene tenta novamente */ }
    const char = CHARACTERS[this.selectedIndex]
    this.registry.set('selectedChar', char.key)
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene'))
  }

  private goBack() {
    if (this.isConfirming) return
    this.isConfirming = true
    sound.select()
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('HowToPlayScene'))
  }
}
