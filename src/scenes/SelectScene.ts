import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { padInteractive } from '../utils/iosVideo'
import { makeAngledPortrait, makeAngledPanel, makeIconTile, dsText, primitive } from '../ui/ds'
import { mountSceneBg } from '../ui/sceneBg'

// stats são VISUAIS por ora (não afetam o gameplay — Thiago: "só visual primeiro").
// O jogável 'thor' é exibido como "THOR" (o boss 'coco-*' é outro personagem).
type StatKey = 'forca' | 'velocidade' | 'defesa'
const CHARACTERS = [
  { key: 'werdum', name: 'WERDUM', sv: 'werdum-sv', perfil: 'werdum-perfil', previewY: 119, forca: 8, velocidade: 6, defesa: 9, especial: 'MATA-LEÃO' },
  { key: 'dida',   name: 'DIDA',   sv: 'dida-sv',   perfil: 'dida-perfil',   previewY: 149, forca: 7, velocidade: 8, defesa: 6, especial: 'GANCHO DUPLO' },
  { key: 'thor',   name: 'THOR',   sv: 'thor-sv',   perfil: 'thor-perfil',   previewY: 119, forca: 9, velocidade: 5, defesa: 8, especial: 'MARRETADA' },
]

// Fileira de cards: 3 jogáveis + 1 bloqueado (WAND). Centros de slot fixos; o card
// SELECIONADO é desenhado maior (destaque do conceito), os demais no tamanho base —
// todos alinhados pela base. Os portraits são recriados ao trocar de seleção.
const SLOT_CX = [788, 1088, 1388]   // jogáveis
const WAND_CX = 1688                // bloqueado
const CARD_BOTTOM = 923             // base comum dos cards
const CARD_BASE_W = 250, CARD_BASE_H = 300
const CARD_SEL_W = 292,  CARD_SEL_H = 360

export class SelectScene extends Phaser.Scene {
  private selectedIndex = 0
  private previewSprite!: Phaser.GameObjects.Image
  private previewName!: Phaser.GameObjects.Text
  private selector1P!: Phaser.GameObjects.Container
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
    // (BEST SCORE removido desta tela — não faz parte do conceito.)

    // Reveal helper (cascata) — fade + leve slide; preserva o alpha-alvo.
    const reveal = (objs: Array<Phaser.GameObjects.GameObject | undefined>, delay: number, dy = 18) => {
      objs.forEach((o) => {
        if (!o) return
        const go = o as Phaser.GameObjects.GameObject & { alpha?: number; y?: number; setAlpha?: (a: number) => void; __a?: number; __y?: number }
        go.__a = go.alpha ?? 1
        go.setAlpha?.(0)
        if (typeof go.y === 'number' && dy) { go.__y = go.y; go.y = go.y + dy }
      })
      objs.forEach((o) => {
        if (!o) return
        const go = o as Phaser.GameObjects.GameObject & { __a?: number; __y?: number; y?: number }
        this.tweens.add({ targets: go, alpha: go.__a ?? 1, y: go.__y ?? (go as { y?: number }).y, duration: 320, delay, ease: 'Back.Out' })
      })
    }
    const revealSince = (mark: number, delay: number) =>
      reveal(this.children.list.slice(mark) as Phaser.GameObjects.GameObject[], delay, 0)
    const leftMark = this.children.list.length

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
    // Bloco esquerdo (preview + placas + stats) entra primeiro.
    revealSince(leftMark, 60)

    // Nomes ACIMA de cada card + hit areas (fixos por slot). Os portraits em si
    // são (re)criados por buildPlayableCards conforme a seleção (o selecionado fica maior).
    const NAME_Y = CARD_BOTTOM - CARD_BASE_H - 26
    SLOT_CX.forEach((cx, i) => {
      const nameTxt = dsText(this, cx, NAME_Y, CHARACTERS[i].name, {
        role: 'body', color: 'textPrimary', align: 'center', origin: [0.5, 0.5],
      }).setDepth(4)
      this.cardNameTexts.push(nameTxt)

      const hitArea = this.add.rectangle(cx, CARD_BOTTOM - CARD_SEL_H / 2, CARD_SEL_W, CARD_SEL_H, 0x000000, 0)
        .setDepth(5).setInteractive({ useHandCursor: true })
      hitArea.on('pointerdown', () => {
        if (this.selectedIndex === i) this.confirmSelection()
        else this.selectChar(i)
      })
    })

    // Card do Wand (KNOCKED YOU OUT, bloqueado) — base, bem escurecido + cadeado grande.
    const wandMark = this.children.list.length
    const wandW = CARD_BASE_W, wandH = CARD_BASE_H
    const wandX = WAND_CX - wandW / 2, wandY = CARD_BOTTOM - wandH
    const wandPortrait = makeAngledPortrait(this, {
      x: wandX, y: wandY, w: wandW, h: wandH, texture: 'wand-portrait', frameColor: primitive.steel, depth: 2, zoom: 1.3,
    })
    wandPortrait.setAlpha(0.2)
    dsText(this, WAND_CX, CARD_BOTTOM - wandH / 2 - 40, 'KNOCKED\nYOU OUT', {
      role: 'caption', color: 'textSecondary', align: 'center', origin: [0.5, 0.5],
    }).setDepth(4)
    if (this.textures.exists('ic-lock')) {
      this.add.image(WAND_CX, CARD_BOTTOM - wandH / 2 + 46, 'ic-lock').setDisplaySize(64, 64).setDepth(4).setAlpha(0.95)
    }

    // Rodapé — "ESCOLHA SEU LUTADOR" + estrelas sprite (alinhadas ao centro vertical
    // do texto, em vez de ★ Unicode que sobe acima da baseline).
    const footer = dsText(this, 960, 1014, 'ESCOLHA SEU LUTADOR', {
      role: 'h3', color: 'textBrand', align: 'center', origin: [0.5, 0.5],
    }).setDepth(3)
    const fStarGap = footer.width / 2 + 40
    for (const sx of [960 - fStarGap, 960 + fStarGap]) {
      if (this.textures.exists('ic-star')) {
        makeIconTile(this, { x: sx, y: 1014, texture: 'ic-star', size: 30, depth: 3, glow: true })
      }
    }

    // Cursor "1P" + seta apontando pro card selecionado (acima do card maior). Conceito.
    const cursorY = CARD_BOTTOM - CARD_SEL_H - 30
    const p1Label = dsText(this, 0, -12, '1P', { role: 'h3', color: 'textBrand', origin: [0.5, 0.5] })
    const p1Arrow = dsText(this, 0, 16, '▼', { role: 'body', color: 'textBrand', origin: [0.5, 0.5] })
    this.selector1P = this.add.container(SLOT_CX[0], cursorY, [p1Label, p1Arrow]).setDepth(5)
    // Bob sutil da seta (chama atenção pro card ativo).
    this.tweens.add({ targets: p1Arrow, y: 22, duration: 560, yoyo: true, repeat: -1, ease: 'Sine.InOut' })

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

    const preMark = this.children.list.length
    this.selectChar(0)

    // ── Cascata de entrada ──
    // wand + rodapé + cursor + VOLTAR (criados entre wandMark e preMark).
    reveal(this.children.list.slice(wandMark, preMark) as Phaser.GameObjects.GameObject[], 560, 0)
    // Cards (recriados pelo selectChar(0)) entram da esquerda pra direita via proxy de alpha.
    this.cardPortraits.forEach((p, i) => {
      p.setAlpha(0)
      const prox = { a: 0 }
      this.tweens.add({ targets: prox, a: 1, duration: 320, delay: 240 + i * 120, ease: 'Back.Out', onUpdate: () => p.setAlpha(prox.a) })
    })
    // Nomes acima dos cards entram junto.
    this.cardNameTexts.forEach((t, i) => {
      const a = t.alpha
      t.setAlpha(0)
      this.tweens.add({ targets: t, alpha: a, duration: 300, delay: 260 + i * 120 })
    })
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

    // Recria os cards com o selecionado MAIOR (destaque do conceito).
    this.buildPlayableCards(index)

    // Nome do selecionado some (dá lugar ao "1P"); os demais mostram o nome.
    this.cardNameTexts.forEach((t, i) => t.setVisible(i !== index))

    // Move cursor 1P + seta — centralizado no slot selecionado.
    this.selector1P.setX(SLOT_CX[index])
  }

  /** (Re)cria os 3 portraits jogáveis; o selecionado fica maior (alinhados pela base). */
  private buildPlayableCards(sel: number) {
    this.cardPortraits.forEach((p) => p.destroy())
    this.cardPortraits = SLOT_CX.map((cx, i) => {
      const seld = i === sel
      const w = seld ? CARD_SEL_W : CARD_BASE_W
      const h = seld ? CARD_SEL_H : CARD_BASE_H
      return makeAngledPortrait(this, {
        x: cx - w / 2, y: CARD_BOTTOM - h, w, h,
        texture: CHARACTERS[i].perfil,
        frameColor: seld ? primitive.gold : primitive.steel,
        depth: 2, zoom: seld ? 1.2 : 1.4,
      })
    })
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
