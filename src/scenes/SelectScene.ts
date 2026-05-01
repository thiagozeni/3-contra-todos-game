import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { getHighScore } from '../systems/HighScore'
import { padInteractive } from '../utils/iosVideo'

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
  private boxBorders: Phaser.GameObjects.Rectangle[] = []
  private isConfirming = false

  constructor() {
    super({ key: 'SelectScene' })
  }

  create() {
    this.isConfirming = false
    this.selectedIndex = 0
    this.boxBorders = []
    this.cameras.main.setAlpha(1)
    this.cameras.main.fadeIn(250, 0, 0, 0)
    try { sound.startIntroMusic() } catch { /* Audio falhou — mantém seleção jogável */ }

    const { width, height } = this.scale

    // Fundo
    this.add.image(width / 2, height / 2, 'select-player-bg').setDisplaySize(width, height).setDepth(0)
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.35).setDepth(1)

    // "SELECT PLAYER"
    this.add.text(648, 123, 'SELECT PLAYER', {
      fontSize: '64px', color: '#f3c204',
      fontFamily: '"Press Start 2P", monospace',
    }).setOrigin(0, 0).setDepth(2)

    // High score
    const hs = getHighScore(this.registry)
    if (hs > 0) {
      this.add.text(960, 68, `BEST SCORE: ${hs.toLocaleString()}`, {
        fontSize: '18px', color: '#aaddff', fontFamily: '"Press Start 2P", monospace',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(2)
    }

    // Preview sideview (esquerda — sobrepõe borda esquerda)
    this.previewSprite = this.add.image(-159, 119, 'werdum-sv')
      .setDisplaySize(930, 1382)
      .setOrigin(0, 0)
      .setDepth(2)

    // Nome do personagem
    this.previewName = this.add.text(306, 710, 'WERDUM', {
      fontSize: '56px', color: '#f8f7f7',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 12,
    }).setOrigin(0.5, 0).setDepth(2)

    // Boxes dos 3 personagens
    BOXES.forEach((box, i) => {
      const cx = box.x + box.w / 2
      const cy = BOX_Y + box.h / 2

      // Fundo do box
      this.add.rectangle(box.x, BOX_Y, box.w, box.h, 0x181c21)
        .setOrigin(0, 0).setDepth(2)

      // Imagem do personagem
      this.add.image(cx, cy, CHARACTERS[i].perfil)
        .setDisplaySize(box.w, box.h)
        .setOrigin(0.5, 0.5)
        .setDepth(3)

      // Borda (acima da imagem, será atualizada pelo selectChar)
      const border = this.add.rectangle(cx, cy, box.w - 4, box.h - 4, 0x000000, 0)
        .setStrokeStyle(8, 0xa79ca0).setDepth(4)
      this.boxBorders.push(border)

      // Interativo
      const hitArea = this.add.rectangle(cx, cy, box.w, box.h, 0x000000, 0)
        .setDepth(5).setInteractive({ useHandCursor: true })
      hitArea.on('pointerdown', () => {
        if (this.selectedIndex === i) this.confirmSelection()
        else this.selectChar(i)
      })
    })

    // Box do Wand (KNOCKED OUT, não selecionável)
    const wandX = 1548, wandW = 280, wandH = 315
    const wandCx = wandX + wandW / 2
    const wandCy = BOX_Y + wandH / 2
    this.add.rectangle(wandX, BOX_Y, wandW, wandH, 0x181c21).setOrigin(0, 0).setDepth(2)
    this.add.rectangle(wandCx, wandCy, wandW, wandH, 0x000000, 0)
      .setStrokeStyle(5, 0xa79ca0).setDepth(3)
    this.add.image(wandCx, wandCy, 'wand-perfil')
      .setDisplaySize(wandW, wandH)
      .setOrigin(0.5, 0.5)
      .setDepth(3)
      .setTint(0xaaaacc)
    this.add.text(wandCx, wandCy - 20, 'KNOCKED\nOUT', {
      fontSize: '24px', color: '#cdcdcd', fontFamily: '"Press Start 2P", monospace',
      align: 'center', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0.7).setAngle(-45).setDepth(4)

    // Cursor "1P" e seta
    this.selector1P = this.add.text(756, 502, '1P', {
      fontSize: '54px', color: '#f3c204',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5, 0).setDepth(4)

    this.selectorArrow = this.add.text(813, 552, '▼', {
      fontSize: '36px', color: '#f3c204',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(4)

    // Botão VOLTAR
    const back = this.add.text(60, 60, '< VOLTAR', {
      fontSize: '28px', color: '#ffffff',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5).setAlpha(0.7).setDepth(2)
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

    // Atualiza bordas
    this.boxBorders.forEach((border, i) => {
      if (i === index) {
        border.setStrokeStyle(12, 0xf3c204)
      } else {
        border.setStrokeStyle(8, 0xa79ca0)
      }
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
