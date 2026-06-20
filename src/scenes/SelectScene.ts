import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { padInteractive } from '../utils/iosVideo'
import { makeRoundedPortrait, makeIconTile, dsText, primitive } from '../ui/ds'
import { mountSceneBgVideo } from '../ui/sceneBg'

// stats são VISUAIS por ora (não afetam o gameplay — Thiago: "só visual primeiro").
// O jogável 'thor' é exibido como "THOR" (o boss 'coco-*' é outro personagem).
type StatKey = 'forca' | 'velocidade' | 'defesa'
// Stats VISUAIS coerentes com o gameplay (PLAYER_STATS em core/config/stats.ts):
//   velocidade ∝ speed (werdum 180 < dida 190 < thor 200 → THOR é o mais rápido)
//   defesa     ∝ maxHp (werdum 200 = thor 200 > dida 190) + alcance (werdum tem o maior)
//   forca      = arquétipo do especial (MARRETADA do Thor é o golpe mais pesado)
const CHARACTERS = [
  { key: 'werdum', name: 'WERDUM', sv: 'werdum-sv', perfil: 'werdum-perfil', previewY: 119, forca: 8, velocidade: 6, defesa: 9, especial: 'MATA-LEÃO' },
  { key: 'dida',   name: 'DIDA',   sv: 'dida-sv',   perfil: 'dida-perfil',   previewY: 149, forca: 7, velocidade: 7, defesa: 6, especial: 'GANCHO DUPLO' },
  { key: 'thor',   name: 'THOR',   sv: 'thor-sv',   perfil: 'thor-perfil',   previewY: 119, forca: 9, velocidade: 9, defesa: 8, especial: 'MARRETADA' },
]

// Fileira de cards VERTICAIS arredondados (conceito Select): 3 jogáveis + 1 bloqueado
// (WAND). Centros de slot fixos; o card SELECIONADO é maior (destaque), os demais no
// tamanho base — todos centrados verticalmente em CARD_CY. Recriados ao trocar seleção.
const SLOT_CX = [792, 1096, 1400]   // jogáveis
const WAND_CX = 1704                // bloqueado
const CARD_CY = 612                 // centro vertical comum dos cards
const CARD_BASE_W = 232, CARD_BASE_H = 432
const CARD_SEL_W = 280,  CARD_SEL_H = 500
const CARD_RADIUS = 20

export class SelectScene extends Phaser.Scene {
  private selectedIndex = 0
  private previewSprite!: Phaser.GameObjects.Image
  private previewName!: Phaser.GameObjects.Text
  private selector1P!: Phaser.GameObjects.Container
  private cardPortraits: ReturnType<typeof makeRoundedPortrait>[] = []
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
    mountSceneBgVideo(this, 'videos/select-loop.mp4', 'imgs/cenario/select-player-superwide.png')
    this.add.rectangle(width / 2, height / 2, width, height, primitive.black, 0.35).setDepth(1)

    // (Sem painel atrás dos cards — no conceito eles flutuam direto sobre a arena.)

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

    // Box de info no estilo dos boxes do CO-OP: banner (nome) + caixa central com
    // chevrons ("1P") + painel inferior (stats), cantos chanfrados + contorno dourado.
    this.drawInfoFrame()

    // Nome do personagem — no banner (h2: cabe com margem; h1 enchia o banner).
    this.previewName = dsText(this, 307, 738, 'WERDUM', {
      role: 'h2', color: 'textPrimary', align: 'center', origin: [0.5, 0.5],
    }).setDepth(3)

    // "1P" — na caixa central (entre os chevrons), como o código no co-op.
    dsText(this, 307, 804, '1P', {
      role: 'caption', color: 'textBrand', align: 'center', origin: [0.5, 0.5],
    }).setDepth(3)

    // Ficha de stats (visual) abaixo da placa do nome
    this.buildStatPanel()
    // Bloco esquerdo (preview + placas + stats) entra primeiro.
    revealSince(leftMark, 60)

    // Nomes ABAIXO de cada card (pedido do Thiago) + hit areas (fixos por slot). Os
    // portraits são (re)criados por buildPlayableCards conforme a seleção (selecionado
    // maior). NAME_Y abaixo da base do card MAIOR p/ o nome nunca cair dentro do card
    // selecionado.
    const NAME_Y = CARD_CY + CARD_SEL_H / 2 + 30
    SLOT_CX.forEach((cx, i) => {
      const nameTxt = dsText(this, cx, NAME_Y, CHARACTERS[i].name, {
        role: 'body', color: 'textPrimary', align: 'center', origin: [0.5, 0.5],
      }).setDepth(4)
      this.cardNameTexts.push(nameTxt)

      const hitArea = this.add.rectangle(cx, CARD_CY, CARD_SEL_W, CARD_SEL_H, 0x000000, 0)
        .setDepth(5).setInteractive({ useHandCursor: true })
      hitArea.on('pointerdown', () => {
        if (this.selectedIndex === i) this.confirmSelection()
        else this.selectChar(i)
      })
    })

    // Card do Wand (KNOCKED YOU OUT, bloqueado) — base, bem escurecido + cadeado grande.
    const wandMark = this.children.list.length
    const wandW = CARD_BASE_W, wandH = CARD_BASE_H
    const wandX = WAND_CX - wandW / 2, wandY = CARD_CY - wandH / 2
    // wand-portrait é corpo inteiro (Wanderlei em pé). Zoom alto (2.0) + anchorTop p/
    // enquadrar só o DORSO (cabeça+tronco), igual ao busto dos demais cards.
    const wandPortrait = makeRoundedPortrait(this, {
      x: wandX, y: wandY, w: wandW, h: wandH, texture: 'wand-portrait', frameColor: primitive.steel, depth: 2, radius: CARD_RADIUS, zoom: 2.0, anchorTop: true,
    })
    wandPortrait.setAlpha(0.22)
    dsText(this, WAND_CX, CARD_CY - 30, 'KNOCKED\nOUT', {
      role: 'caption', color: 'textSecondary', align: 'center', origin: [0.5, 0.5],
    }).setDepth(4)
    if (this.textures.exists('ic-lock')) {
      this.add.image(WAND_CX, CARD_CY + 70, 'ic-lock').setDisplaySize(64, 64).setDepth(4).setAlpha(0.95)
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
    const cursorY = CARD_CY - CARD_SEL_H / 2 - 30
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

  /**
   * Box de info do personagem no MESMO estilo dos boxes do CO-OP (lobby): banner
   * (nome) + caixa central flanqueada por chevrons ("1P") + painel inferior (stats).
   * Cantos chanfrados (corner-cut), fundo translúcido + contorno dourado — vetor (nítido).
   */
  private drawInfoFrame() {
    const g = this.add.graphics().setDepth(2)
    const gold = primitive.goldBrand, dark = primitive.night, black = primitive.black

    const cutPanel = (x: number, y: number, w: number, h: number, cut: number) => {
      const p: [number, number][] = [
        [x + cut, y], [x + w - cut, y], [x + w, y + cut], [x + w, y + h - cut],
        [x + w - cut, y + h], [x + cut, y + h], [x, y + h - cut], [x, y + cut],
      ]
      const trace = () => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath() }
      g.fillStyle(dark, 0.66); trace(); g.fillPath()
      g.lineStyle(6, black, 1); trace(); g.strokePath()
      g.lineStyle(3, gold, 1); trace(); g.strokePath()
    }

    cutPanel(106, 702, 402, 74, 16)   // banner (nome)
    cutPanel(242, 784, 130, 40, 9)    // caixa central (1P)
    cutPanel(106, 830, 402, 184, 18)  // painel inferior (stats)

    // Chevrons dourados flanqueando a caixa central (242..372).
    const chevron = (cx: number, cy: number, dir: 1 | -1) => {
      const s = 10
      g.lineStyle(4, gold, 1)
      g.beginPath()
      g.moveTo(cx - dir * s, cy - s); g.lineTo(cx, cy); g.lineTo(cx - dir * s, cy + s)
      g.strokePath()
    }
    chevron(232, 804, 1)
    chevron(382, 804, -1)
  }

  /** Ficha de stats (visual) — 3 barras segmentadas + ESPECIAL (sobre o painel inferior
   *  do box). Layout fiel ao conceito: label à esquerda (fonte menor, sem sobrepor as
   *  barras), coluna de barras no meio, número à DIREITA EXTREMA. */
  private buildStatPanel() {
    // O painel é desenhado por drawInfoFrame() (painel inferior do box estilo co-op);
    // aqui só vão as linhas de stats por cima.
    const px = 116, py = 828, pw = 384
    const labelX = px + 22
    const numX = px + pw - 22       // números/valor: alinhados à DIREITA extrema
    const segX0 = px + 200          // início da coluna de barras (limpa o VELOCIDADE)
    const rows: { key: StatKey; label: string }[] = [
      { key: 'forca', label: 'FORÇA' },
      { key: 'velocidade', label: 'VELOCIDADE' },
      { key: 'defesa', label: 'DEFESA' },
    ]
    const segW = 11, segH = 18, gap = 2
    rows.forEach((row, i) => {
      const y = py + 30 + i * 40
      // label 'caption' (16px) p/ VELOCIDADE não invadir as barras.
      dsText(this, labelX, y, row.label, { role: 'caption', color: 'textPrimary', origin: [0, 0.5] }).setDepth(3)
      for (let s = 0; s < 10; s++) {
        const r = this.add.rectangle(segX0 + s * (segW + gap), y, segW, segH, primitive.gold)
          .setOrigin(0, 0.5).setDepth(3).setScrollFactor(0).setStrokeStyle(2, primitive.black)
        this.statSegs[row.key].push(r)
      }
      // número à DIREITA extrema (alinhado à direita), dourado. Fonte 'display'
      // (Press Start 2P) p/ casar com a pixel-art do jogo (a 'numeric'/Pixelify Sans é
      // arredondada, destoava do padrão pixel).
      this.statNums[row.key] = dsText(this, numX, y, '0', {
        role: 'h3', color: 'textBrand', family: 'display', origin: [1, 0.5],
      }).setDepth(3)
    })

    const ey = py + 30 + 3 * 40
    dsText(this, labelX, ey, 'ESPECIAL', { role: 'caption', color: 'textPrimary', origin: [0, 0.5] }).setDepth(3)
    // MATA-LEÃO na coluna direita (alinhado à direita), igual ao conceito.
    this.especialText = dsText(this, numX, ey, '', { role: 'caption', color: 'textBrand', origin: [1, 0.5] }).setDepth(3)
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

    // Nomes ficam ABAIXO de todos os cards (inclusive o selecionado) — o "1P" acima
    // do card maior é o indicador do jogador.
    this.cardNameTexts.forEach((t) => t.setVisible(true))

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
      return makeRoundedPortrait(this, {
        x: cx - w / 2, y: CARD_CY - h / 2, w, h,
        texture: CHARACTERS[i].perfil,
        frameColor: seld ? primitive.gold : primitive.steel,
        depth: 2, radius: CARD_RADIUS, zoom: seld ? 1.04 : 1.08, anchorTop: true,
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
