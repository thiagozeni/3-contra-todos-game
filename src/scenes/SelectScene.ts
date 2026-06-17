import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { getHighScore } from '../systems/HighScore'
import { padInteractive } from '../utils/iosVideo'
import { makeAngledPortrait, makeAngledPanel, dsText, primitive } from '../ui/ds'
import { mountSceneBg } from '../ui/sceneBg'

// stats são VISUAIS por ora (não afetam o gameplay — Thiago: "só visual primeiro").
// O jogável 'thor' é exibido como "THOR" (o boss 'coco-*' é outro personagem).
type StatKey = 'forca' | 'velocidade' | 'defesa'
const CHARACTERS = [
  { key: 'werdum', name: 'WERDUM', sv: 'werdum-sv', perfil: 'werdum-perfil', previewY: 119, forca: 8, velocidade: 6, defesa: 9, especial: 'MATA-LEÃO' },
  { key: 'dida',   name: 'DIDA',   sv: 'dida-sv',   perfil: 'dida-perfil',   previewY: 149, forca: 7, velocidade: 8, defesa: 6, especial: 'GANCHO DUPLO' },
  { key: 'thor',   name: 'THOR',   sv: 'thor-sv',   perfil: 'thor-perfil',   previewY: 119, forca: 9, velocidade: 5, defesa: 8, especial: 'MARRETADA' },
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
  private selector1P!: Phaser.GameObjects.Text
  private cardPortraits: ReturnType<typeof makeAngledPortrait>[] = []
  private cardNameTexts: Phaser.GameObjects.Text[] = []
  private statSegs: Record<StatKey, Phaser.GameObjects.Rectangle[]> = { forca: [], velocidade: [], defesa: [] }
  private statNums: Partial<Record<StatKey, Phaser.GameObjects.Text>> = {}
  private especialText!: Phaser.GameObjects.Text
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

    // Fundo (camada DOM #scene-bg, cover responsivo até ultrawide) — master superwide própria da tela
    mountSceneBg(this, 'imgs/cenario/select-player-superwide.png')
    this.add.rectangle(width / 2, height / 2, width, height, primitive.black, 0.35).setDepth(1)

    // Painel angulado emoldurando a fileira de cards (DS)
    makeAngledPanel(this, { x: 600, y: 560, w: 1290, h: 410, variant: 'filled', frame: primitive.steel, depth: 1 })

    // "SELECT PLAYER" já vem embutido na arte de fundo (conceito GPT).

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
    makeAngledPanel(this, { x: 116, y: 700, w: 380, h: 80, variant: 'filled', frame: primitive.goldBrand, depth: 2 })
    this.previewName = dsText(this, 306, 740, 'WERDUM', {
      role: 'h1', color: 'textPrimary', align: 'center', origin: [0.5, 0.5],
    }).setDepth(3)

    // "1P" — subplaca dourada logo abaixo do nome (conceito).
    makeAngledPanel(this, { x: 236, y: 786, w: 140, h: 32, variant: 'filled', frame: primitive.goldBrand, depth: 2 })
    dsText(this, 306, 802, '1P', {
      role: 'caption', color: 'textBrand', align: 'center', origin: [0.5, 0.5],
    }).setDepth(3)

    // Ficha de stats (visual) abaixo da placa do nome
    this.buildStatPanel()

    // Boxes dos 3 personagens — cards angulados (design system, igual ao HUD)
    BOXES.forEach((box, i) => {
      const cx = box.x + box.w / 2
      const cy = BOX_Y + box.h / 2

      const portrait = makeAngledPortrait(this, {
        x: box.x, y: BOX_Y, w: box.w, h: box.h,
        texture: CHARACTERS[i].perfil, frameColor: primitive.steel, depth: 2, zoom: 1.5,
      })
      this.cardPortraits.push(portrait)

      // Nome do lutador ACIMA do card (conceito). No selecionado vira "1P".
      const nameTxt = dsText(this, cx, BOX_Y - 30, CHARACTERS[i].name, {
        role: 'body', color: 'textPrimary', align: 'center', origin: [0.5, 0.5],
      }).setDepth(4)
      this.cardNameTexts.push(nameTxt)

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
    // 'wand-portrait' é a arte LIMPA (a 'wand-perfil' tem "KNOCKED OUT" diagonal
    // embutido — duplicava com o texto+cadeado abaixo).
    const wandPortrait = makeAngledPortrait(this, {
      x: wandX, y: BOX_Y, w: wandW, h: wandH, texture: 'wand-portrait', frameColor: primitive.steel, depth: 2, zoom: 1.2,
    })
    wandPortrait.setAlpha(0.28)
    // "KNOCKED YOU OUT" limpo (sem rotação) + cadeado — como no conceito.
    dsText(this, wandCx, wandCy - 34, 'KNOCKED\nYOU OUT', {
      role: 'caption', color: 'textSecondary', align: 'center', origin: [0.5, 0.5],
    }).setDepth(4)
    if (this.textures.exists('ic-lock')) {
      this.add.image(wandCx, wandCy + 44, 'ic-lock').setDisplaySize(46, 46).setDepth(4).setAlpha(0.9)
    }

    // Rodapé — "ESCOLHA SEU LUTADOR" (como no conceito)
    dsText(this, 960, 1014, '★  ESCOLHA SEU LUTADOR  ★', {
      role: 'h3', color: 'textBrand', align: 'center', origin: [0.5, 0.5],
    }).setDepth(3)

    // Cursor "1P" — sobre o card selecionado (no lugar do nome). Conceito.
    this.selector1P = dsText(this, BOXES[0].x + BOXES[0].w / 2, BOX_Y - 30, '1P', {
      role: 'body', color: 'textBrand', origin: [0.5, 0.5],
    }).setDepth(5)

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

  /** Ficha de stats (visual) — painel + 3 barras segmentadas + ESPECIAL. */
  private buildStatPanel() {
    const px = 116, py = 828, pw = 380, ph = 188
    makeAngledPanel(this, { x: px, y: py, w: pw, h: ph, variant: 'filled', frame: primitive.steel, depth: 2 })

    const rows: { key: StatKey; label: string }[] = [
      { key: 'forca', label: 'FORÇA' },
      { key: 'velocidade', label: 'VELOCIDADE' },
      { key: 'defesa', label: 'DEFESA' },
    ]
    const segW = 13, segH = 18, gap = 3, segX0 = px + 162
    rows.forEach((row, i) => {
      const y = py + 28 + i * 42
      dsText(this, px + 22, y, row.label, { role: 'caption', color: 'textPrimary', origin: [0, 0.5] }).setDepth(3)
      for (let s = 0; s < 10; s++) {
        const r = this.add.rectangle(segX0 + s * (segW + gap), y, segW, segH, primitive.gold)
          .setOrigin(0, 0.5).setDepth(3).setScrollFactor(0).setStrokeStyle(2, primitive.black)
        this.statSegs[row.key].push(r)
      }
      // número à direita das barras (maior — destaque do conceito)
      this.statNums[row.key] = dsText(this, segX0 + 10 * (segW + gap) + 14, y, '0', {
        role: 'h3', color: 'textBrand', family: 'numeric', origin: [0, 0.5],
      }).setDepth(3)
    })

    const ey = py + 28 + 3 * 42
    dsText(this, px + 22, ey, 'ESPECIAL', { role: 'caption', color: 'textBrand', origin: [0, 0.5] }).setDepth(3)
    this.especialText = dsText(this, px + 162, ey, '', { role: 'caption', color: 'textPrimary', origin: [0, 0.5] }).setDepth(3)
  }

  /** Recolore as barras + ESPECIAL conforme o personagem selecionado. */
  private updateStatPanel(char: typeof CHARACTERS[number]) {
    const fill = (key: StatKey, val: number) => {
      this.statSegs[key].forEach((r, s) => r.setFillStyle(s < val ? primitive.gold : primitive.panel))
      this.statNums[key]?.setText(String(val))
    }
    fill('forca', char.forca)
    fill('velocidade', char.velocidade)
    fill('defesa', char.defesa)
    this.especialText.setText(char.especial)
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
    this.updateStatPanel(char)

    // Destaca o card selecionado pela cor da moldura (dourado vs aço)
    this.cardPortraits.forEach((p, i) => {
      p.setFrameColor(i === index ? primitive.gold : primitive.steel)
    })

    // Nome do selecionado some (dá lugar ao "1P"); os demais mostram o nome.
    this.cardNameTexts.forEach((t, i) => t.setVisible(i !== index))

    // Move cursor 1P — centralizado no box selecionado
    const boxCx = BOXES[index].x + BOXES[index].w / 2
    this.selector1P.setX(boxCx)
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
