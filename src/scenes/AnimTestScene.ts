import Phaser from 'phaser'
import { loadGameplayAssets } from './assetManifest'

// ── Definição completa de todos os personagens e suas animações ──────────────

interface AnimDef { sheet: string; start: number; end: number; fps: number }

interface CharDef {
  key: string
  label: string
  scaleH: number
  anims: Record<string, AnimDef>
}

const CHAR_DEFS: CharDef[] = [
  {
    key: 'werdum', label: 'Werdum', scaleH: 1.0,
    anims: {
      idle:           { sheet: 'werdum-idle-sheet',      start: 0, end: 7,  fps: 10 },
      walk:           { sheet: 'werdum-walk-sheet',       start: 0, end: 35, fps: 14 },
      punch:          { sheet: 'werdum-punch-sheet',     start: 0, end: 9,  fps: 26 },
      'punch-combo':  { sheet: 'werdum-punch-sheet',     start: 0, end: 24, fps: 26 },
      kick:           { sheet: 'werdum-kick-sheet',      start: 0, end: 24, fps: 22 },
      hit:            { sheet: 'werdum-hit-sheet',       start: 0, end: 24, fps: 22 },
      block:          { sheet: 'werdum-block-sheet',     start: 8, end: 18, fps: 28 },
      knockdown:      { sheet: 'werdum-knockdown-sheet', start: 0, end: 35, fps: 14 },
    },
  },
  {
    key: 'dida', label: 'Dida', scaleH: 1.0,
    anims: {
      idle:           { sheet: 'dida-idle-sheet',      start: 0, end: 35, fps: 10 },
      walk:           { sheet: 'dida-walk-sheet',      start: 0, end: 24, fps: 14 },
      punch:          { sheet: 'dida-punch-sheet',     start: 0, end: 7,  fps: 21 },
      'punch-combo':  { sheet: 'dida-punch-sheet',     start: 0, end: 24, fps: 21 },
      kick:           { sheet: 'dida-kick-sheet',      start: 0, end: 24, fps: 22 },
      hit:            { sheet: 'dida-hit-sheet',       start: 0, end: 15, fps: 22 },
      block:          { sheet: 'dida-block-sheet',     start: 0, end: 8,  fps: 28 },
      knockdown:      { sheet: 'dida-knockdown-sheet', start: 0, end: 35, fps: 14 },
    },
  },
  {
    key: 'thor', label: 'Thor', scaleH: 1.0,
    anims: {
      idle:           { sheet: 'thor-idle-sheet',      start: 0, end: 35, fps: 10 },
      walk:           { sheet: 'thor-walk-sheet',      start: 0, end: 35, fps: 14 },
      punch:          { sheet: 'thor-punch-sheet',     start: 0, end: 8,  fps: 26 },
      'punch-combo':  { sheet: 'thor-punch-sheet',     start: 0, end: 24, fps: 26 },
      kick:           { sheet: 'thor-kick-sheet',      start: 0, end: 24, fps: 22 },
      hit:            { sheet: 'thor-hit-sheet',       start: 0, end: 35, fps: 22 },
      block:          { sheet: 'thor-block-sheet',     start: 0, end: 15, fps: 28 },
      knockdown:      { sheet: 'thor-knockdown-sheet', start: 0, end: 35, fps: 14 },
    },
  },
  {
    key: 'bad-guy1', label: 'Bad Guy 1', scaleH: 1.0,
    anims: {
      idle:      { sheet: 'bad-guy1-idle-sheet',      start: 0, end: 35, fps: 10 },
      walk:      { sheet: 'bad-guy1-walk-sheet',      start: 0, end: 35, fps: 14 },
      punch:     { sheet: 'bad-guy1-punch-sheet',     start: 0, end: 24, fps: 22 },
      kick:      { sheet: 'bad-guy1-kick-sheet',      start: 0, end: 35, fps: 22 },
      hit:       { sheet: 'bad-guy1-hit-sheet',       start: 0, end: 24, fps: 22 },
      knockdown: { sheet: 'bad-guy1-knockdown-sheet', start: 0, end: 35, fps: 14 },
    },
  },
  {
    key: 'bad-guy2', label: 'Bad Guy 2', scaleH: 1.0,
    anims: {
      idle:      { sheet: 'bad-guy2-idle-sheet',      start: 0, end: 24, fps: 10 },
      walk:      { sheet: 'bad-guy2-walk-sheet',      start: 0, end: 35, fps: 14 },
      punch:     { sheet: 'bad-guy2-punch-sheet',     start: 0, end: 24, fps: 22 },
      kick:      { sheet: 'bad-guy2-kick-sheet',      start: 0, end: 24, fps: 22 },
      hit:       { sheet: 'bad-guy2-hit-sheet',       start: 0, end: 24, fps: 22 },
      knockdown: { sheet: 'bad-guy2-knockdown-sheet', start: 0, end: 35, fps: 14 },
    },
  },
  {
    key: 'bad-guy3', label: 'Bad Guy 3', scaleH: 1.0,
    anims: {
      idle:      { sheet: 'bad-guy3-idle-sheet',      start: 0, end: 24, fps: 10 },
      walk:      { sheet: 'bad-guy3-walk-sheet',      start: 0, end: 35, fps: 14 },
      punch:     { sheet: 'bad-guy3-punch-sheet',     start: 0, end: 24, fps: 22 },
      kick:      { sheet: 'bad-guy3-kick-sheet',      start: 0, end: 24, fps: 22 },
      hit:       { sheet: 'bad-guy3-hit-sheet',       start: 0, end: 35, fps: 22 },
      knockdown: { sheet: 'bad-guy3-knockdown-sheet', start: 0, end: 35, fps: 14 },
    },
  },
  {
    key: 'bad-guy-fat', label: 'Fat', scaleH: 1.0,
    anims: {
      idle:      { sheet: 'bad-guy-fat-idle-sheet',      start: 0, end: 24, fps: 10 },
      walk:      { sheet: 'bad-guy-fat-walk-sheet',      start: 0, end: 35, fps: 14 },
      punch:     { sheet: 'bad-guy-fat-punch-sheet',     start: 0, end: 24, fps: 18 },
      kick:      { sheet: 'bad-guy-fat-kick-sheet',      start: 0, end: 24, fps: 18 },
      hit:       { sheet: 'bad-guy-fat-hit-sheet',       start: 0, end: 24, fps: 22 },
      knockdown: { sheet: 'bad-guy-fat-knockdown-sheet', start: 0, end: 35, fps: 14 },
    },
  },
  {
    key: 'bad-guy-strong', label: 'Strong', scaleH: 1.0,
    anims: {
      idle:      { sheet: 'bad-guy-strong-idle-sheet',      start: 0, end: 35, fps: 10 },
      walk:      { sheet: 'bad-guy-strong-walk-sheet',      start: 0, end: 35, fps: 14 },
      punch:     { sheet: 'bad-guy-strong-punch-sheet',     start: 0, end: 24, fps: 22 },
      kick:      { sheet: 'bad-guy-strong-kick-sheet',      start: 0, end: 24, fps: 22 },
      hit:       { sheet: 'bad-guy-strong-hit-sheet',       start: 0, end: 35, fps: 22 },
      knockdown: { sheet: 'bad-guy-strong-knockdown-sheet', start: 0, end: 35, fps: 14 },
    },
  },
  {
    key: 'bad-guy-chair', label: 'Chair', scaleH: 1.0,
    anims: {
      idle:      { sheet: 'bad-guy-chair-idle-sheet',      start: 0, end: 35, fps: 10 },
      walk:      { sheet: 'bad-guy-chair-walk-sheet',      start: 0, end: 35, fps: 14 },
      punch:     { sheet: 'bad-guy-chair-punch-sheet',     start: 0, end: 24, fps: 18 },
      kick:      { sheet: 'bad-guy-chair-kick-sheet',      start: 0, end: 24, fps: 18 },
      knockdown: { sheet: 'bad-guy-chair-knockdown-sheet', start: 0, end: 24, fps: 14 },
    },
  },
  {
    key: 'coco', label: 'Coco', scaleH: 1.0,
    anims: {
      idle:      { sheet: 'coco-idle-sheet',      start: 0, end: 24, fps: 10 },
      walk:      { sheet: 'coco-walk-sheet',      start: 0, end: 35, fps: 14 },
      punch:     { sheet: 'coco-punch-sheet',     start: 0, end: 24, fps: 22 },
      kick:      { sheet: 'coco-kick-sheet',      start: 0, end: 24, fps: 22 },
      hit:       { sheet: 'coco-hit-sheet',       start: 0, end: 35, fps: 22 },
      knockdown: { sheet: 'coco-knockdown-sheet', start: 0, end: 35, fps: 14 },
    },
  },
  {
    key: 'son', label: 'Popo Son', scaleH: 1.0,
    anims: {
      idle:      { sheet: 'son-idle-sheet',      start: 0, end: 24, fps: 10 },
      walk:      { sheet: 'son-walk-sheet',      start: 0, end: 35, fps: 14 },
      punch:     { sheet: 'son-punch-sheet',     start: 0, end: 24, fps: 22 },
      kick:      { sheet: 'son-kick-sheet',      start: 0, end: 35, fps: 22 },
      hit:       { sheet: 'son-hit-sheet',       start: 0, end: 35, fps: 22 },
      knockdown: { sheet: 'son-knockdown-sheet', start: 0, end: 35, fps: 14 },
    },
  },
  {
    key: 'coach', label: 'Popo Coach', scaleH: 1.0,
    anims: {
      idle:      { sheet: 'coach-idle-sheet',      start: 0, end: 35, fps: 10 },
      walk:      { sheet: 'coach-walk-sheet',      start: 0, end: 35, fps: 14 },
      punch:     { sheet: 'coach-punch-sheet',     start: 0, end: 24, fps: 22 },
      kick:      { sheet: 'coach-kick-sheet',      start: 0, end: 24, fps: 22 },
      hit:       { sheet: 'coach-hit-sheet',       start: 0, end: 24, fps: 22 },
      knockdown: { sheet: 'coach-knockdown-sheet', start: 0, end: 35, fps: 14 },
    },
  },
]

// Ordem dos botões na tela
const BUTTON_ANIMS = [
  'idle', 'walk', 'punch', 'punch-combo', 'kick',
  'hit', 'block', 'knockdown',
]

// Config inicial (valores já ajustados manualmente para o Werdum)
const DEFAULT_SCALE_H: Record<string, number> = {
  'werdum-idle-sheet':      0.72,
  'werdum-walk-sheet':       0.72,
  'werdum-punch-sheet':     0.61,
  'werdum-kick-sheet':      0.65,
  'werdum-hit-sheet':       0.63,
  'werdum-block-sheet':     0.72,
  'werdum-knockdown-sheet': 0.72,
}

const DEFAULT_ORIGIN_X: Record<string, number> = {
  'werdum-punch-sheet': 174 / 320,
  'werdum-kick-sheet':  217 / 384,
}

// sizeScale por personagem — corresponde ao STATS do jogo
const DEFAULT_SIZE_SCALE: Record<string, number> = {
  'werdum': 0.75,
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface SpriteEntry {
  sprite: Phaser.GameObjects.Sprite
  def: CharDef
  baseScaleY: number  // mutável — recalculado ao ajustar sizeScale
  highlight: Phaser.GameObjects.Rectangle
}

interface AnimConfig {
  scaleH: number   // proporção horizontal (X apenas)
  originX: number
}

// ── Cena ─────────────────────────────────────────────────────────────────────

export class AnimTestScene extends Phaser.Scene {
  private entries: SpriteEntry[] = []
  private activeAnim = 'idle'
  private selectedIdx = -1

  // Config editável em runtime: charKey -> animName -> AnimConfig
  private editConfig = new Map<string, Record<string, AnimConfig>>()

  // sizeScale editável por personagem
  private charSizeScale = new Map<string, number>()

  // Botões de animação
  private btnRefs = new Map<string, { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>()

  // Painel do editor
  private panelCharLabel!: Phaser.GameObjects.Text
  private panelAnimLabel!: Phaser.GameObjects.Text
  private panelSizeScaleVal!: Phaser.GameObjects.Text
  private panelScaleHVal!: Phaser.GameObjects.Text
  private panelOriginXVal!: Phaser.GameObjects.Text
  private panelEmpty!: Phaser.GameObjects.Text
  private panelControls!: Phaser.GameObjects.Container

  constructor() { super({ key: 'AnimTestScene' }) }

  // Dev scene reached via a hidden Title shortcut; spritesheets were moved out of the
  // eager boot load (Codex #11), so pull them in here too (idempotent).
  preload() {
    loadGameplayAssets(this)
  }

  create() {
    const { width, height } = this.scale
    this.entries = []
    this.btnRefs = new Map()
    this.editConfig = new Map()
    this.activeAnim = 'idle'
    this.selectedIdx = -1

    // Inicializa config editável a partir dos defaults
    for (const def of CHAR_DEFS) {
      const charCfg: Record<string, AnimConfig> = {}
      for (const [animName, animDef] of Object.entries(def.anims)) {
        charCfg[animName] = {
          scaleH:  DEFAULT_SCALE_H[animDef.sheet]  ?? def.scaleH,
          originX: DEFAULT_ORIGIN_X[animDef.sheet] ?? 0.5,
        }
      }
      this.editConfig.set(def.key, charCfg)
    }

    // Inicializa sizeScale por personagem
    this.charSizeScale = new Map()
    for (const def of CHAR_DEFS) {
      this.charSizeScale.set(def.key, DEFAULT_SIZE_SCALE[def.key] ?? 1.0)
    }

    // Fundo
    this.add.rectangle(width / 2, height / 2, width, height, 0x0d0d1a)

    // Título
    this.add.text(width / 2 - 150, 28, 'TESTE DE ANIMAÇÕES', {
      fontSize: '26px', color: '#ffdd00', fontFamily: 'monospace',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 0)

    // Botão voltar
    const back = this.add.text(40, 28, '< VOLTAR', {
      fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0).setInteractive({ useHandCursor: true })
    back.on('pointerover', () => back.setColor('#ffffff'))
    back.on('pointerout',  () => back.setColor('#aaccff'))
    back.on('pointerdown', () => this.goBack())

    this.input.keyboard!.on('keydown-ESC', () => this.goBack())

    // Registra todas as animações de teste
    this.registerAnimations()

    // Grid 4×3 de sprites (deixa 320px à direita para o painel)
    const COLS  = 4
    const COL_W = (width - 320) / COLS
    const ROW_Y = [270, 530, 790]

    CHAR_DEFS.forEach((def, i) => {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const x   = COL_W * col + COL_W / 2
      const y   = ROW_Y[row]

      // Highlight de seleção (fica atrás do sprite)
      const highlight = this.add.rectangle(x, y - 115, 180, 245, 0xffdd00, 0)
        .setStrokeStyle(3, 0xffdd00, 0)

      const sprite = this.add.sprite(x, y, `${def.key}-idle-sheet`, 0)
      sprite.setOrigin(0.5, 1.0)

      // baseScaleY reflete a escala real do jogo para mid-ring: dispH = 312 * sizeScale
      const sizeScale = this.charSizeScale.get(def.key) ?? 1.0
      const baseScaleY = (312 * sizeScale) / sprite.height

      // Barra de referência: altura do ringue = 457px de jogo
      // Em pixels do editor: ringH_editor = 457 * baseScaleY
      const ringH_editor = Math.round(457 * baseScaleY)
      const barX = x + 80  // à direita do sprite
      this.add.rectangle(barX, y - ringH_editor / 2, 4, ringH_editor, 0x334455, 0.7)
      this.add.text(barX + 6, y - ringH_editor, '↕ ringue', {
        fontSize: '10px', color: '#445566', fontFamily: 'monospace',
      })

      const cfg = this.editConfig.get(def.key)?.['idle']
      sprite.setScale(baseScaleY * (cfg?.scaleH ?? def.scaleH), baseScaleY)
      sprite.setOrigin(cfg?.originX ?? 0.5, 1.0)

      this.add.text(x, y + 10, def.label, {
        fontSize: '15px', color: '#bbbbbb', fontFamily: 'monospace',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0)

      sprite.play(`t-${def.key}-idle`)

      // Área clicável sobre o sprite
      const hitArea = this.add.rectangle(x, y - 115, 180, 245, 0xffffff, 0)
        .setInteractive({ useHandCursor: true })

      hitArea.on('pointerdown', () => this.selectChar(i))
      hitArea.on('pointerover', () => {
        if (this.selectedIdx !== i) highlight.setStrokeStyle(3, 0xffdd00, 0.3)
      })
      hitArea.on('pointerout', () => {
        if (this.selectedIdx !== i) highlight.setStrokeStyle(3, 0xffdd00, 0)
      })

      this.entries.push({ sprite, def, baseScaleY, highlight })
    })

    // Botões de animação
    this.buildButtons()

    // Painel editor (lado direito)
    this.buildEditorPanel(width, height)

    this.cameras.main.fadeIn(300, 0, 0, 0)
  }

  // ── Animações ─────────────────────────────────────────────────────────────

  private registerAnimations() {
    const ac = this.anims
    for (const def of CHAR_DEFS) {
      for (const [animName, cfg] of Object.entries(def.anims)) {
        const key = `t-${def.key}-${animName}`
        if (!ac.exists(key)) {
          ac.create({
            key,
            frames: ac.generateFrameNumbers(cfg.sheet, { start: cfg.start, end: cfg.end }),
            frameRate: cfg.fps,
            repeat: -1,
          })
        }
      }
    }
  }

  // ── Botões de animação ────────────────────────────────────────────────────

  private buildButtons() {
    const BTN_W   = 178
    const BTN_H   = 46
    const GAP     = 8
    const START_X = 20
    const START_Y = 858

    const ROW_SIZE = 5
    for (let ri = 0; ri < BUTTON_ANIMS.length; ri += ROW_SIZE) {
      const row = BUTTON_ANIMS.slice(ri, ri + ROW_SIZE)
      const cy  = START_Y + Math.floor(ri / ROW_SIZE) * (BTN_H + GAP) + BTN_H / 2

      row.forEach((animName, ci) => {
        const cx = START_X + ci * (BTN_W + GAP) + BTN_W / 2

        const bg = this.add.rectangle(cx, cy, BTN_W, BTN_H, 0x1e1e3a)
          .setStrokeStyle(2, 0x4455aa)
          .setInteractive({ useHandCursor: true })

        const label = this.add.text(cx, cy, animName.toUpperCase(), {
          fontSize: '16px', color: '#ffdd00', fontFamily: 'monospace',
          stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5)

        bg.on('pointerover',  () => { bg.setFillStyle(0x2a2a55); label.setColor('#ffffff') })
        bg.on('pointerout',   () => this.refreshButton(animName))
        bg.on('pointerdown',  () => this.playAll(animName))

        this.btnRefs.set(animName, { bg, label })
      })
    }

    this.refreshAllButtons()
  }

  private playAll(animName: string) {
    this.activeAnim = animName

    for (const entry of this.entries) {
      const { sprite, def, baseScaleY } = entry
      const key     = `t-${def.key}-${animName}`
      const hasAnim = this.anims.exists(key)
      sprite.play(hasAnim ? key : `t-${def.key}-idle`)

      const resolvedAnim = hasAnim ? animName : 'idle'
      const cfg = this.editConfig.get(def.key)?.[resolvedAnim]
      if (cfg) {
        sprite.setScale(baseScaleY * cfg.scaleH, baseScaleY)
        sprite.setOrigin(cfg.originX, 1.0)
      }
    }

    this.refreshAllButtons()
    this.refreshPanel()
  }

  private refreshButton(animName: string) {
    const ref    = this.btnRefs.get(animName)
    if (!ref) return
    const active = animName === this.activeAnim
    ref.bg.setFillStyle(active ? 0x1a3311 : 0x1e1e3a)
    ref.bg.setStrokeStyle(2, active ? 0x55cc44 : 0x4455aa)
    ref.label.setColor(active ? '#88ff66' : '#ffdd00')
  }

  private refreshAllButtons() {
    for (const name of this.btnRefs.keys()) this.refreshButton(name)
  }

  // ── Seleção de personagem ─────────────────────────────────────────────────

  private selectChar(idx: number) {
    // Remove highlight anterior
    if (this.selectedIdx >= 0 && this.selectedIdx < this.entries.length) {
      this.entries[this.selectedIdx].highlight.setStrokeStyle(3, 0xffdd00, 0)
    }

    if (this.selectedIdx === idx) {
      // Clique no mesmo → deseleciona
      this.selectedIdx = -1
      this.refreshPanel()
      return
    }

    this.selectedIdx = idx
    this.entries[idx].highlight.setStrokeStyle(3, 0xffdd00, 1)
    this.refreshPanel()
  }

  // ── Painel editor ─────────────────────────────────────────────────────────

  private buildEditorPanel(width: number, _height: number) {
    const PX = width - 310
    const PY = 50
    const PW = 295
    const PH = 980

    // Fundo do painel
    this.add.rectangle(PX + PW / 2, PY + PH / 2, PW, PH, 0x111128)
      .setStrokeStyle(2, 0x334466)

    // Título do painel
    this.add.text(PX + PW / 2, PY + 14, 'EDITOR DE SPRITES', {
      fontSize: '14px', color: '#aaccff', fontFamily: 'monospace',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0)

    // Linha separadora
    this.add.rectangle(PX + PW / 2, PY + 36, PW - 20, 1, 0x334466)

    // Mensagem "nenhum selecionado"
    this.panelEmpty = this.add.text(PX + PW / 2, PY + PH / 2, '← clique em um\n   personagem', {
      fontSize: '15px', color: '#556688', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5)

    // Container com os controles (esconde quando nada selecionado)
    const controls: Phaser.GameObjects.GameObject[] = []

    // Labels do personagem/animação
    this.panelCharLabel = this.add.text(PX + 12, PY + 48, '', {
      fontSize: '16px', color: '#ffdd00', fontFamily: 'monospace',
      stroke: '#000', strokeThickness: 2,
    })
    this.panelAnimLabel = this.add.text(PX + 12, PY + 68, '', {
      fontSize: '13px', color: '#88aacc', fontFamily: 'monospace',
    })

    controls.push(this.panelCharLabel, this.panelAnimLabel)

    // ── Escala no jogo (sizeScale) ────────────────────────────────────────
    this.add.text(PX + 12, PY + 96, 'Escala no jogo  (sizeScale):', {
      fontSize: '13px', color: '#ffcc66', fontFamily: 'monospace',
    })

    const ssMinus = this.makeAdjBtn(PX + 18,  PY + 116, '◀', () => this.adjustSizeScale(-0.05))
    const ssPlus  = this.makeAdjBtn(PX + 242, PY + 116, '▶', () => this.adjustSizeScale(+0.05))
    this.panelSizeScaleVal = this.add.text(PX + PW / 2, PY + 116, '1.00', {
      fontSize: '20px', color: '#ffcc66', fontFamily: 'monospace',
    }).setOrigin(0.5, 0)

    controls.push(ssMinus, ssPlus, this.panelSizeScaleVal)

    // ── Controle Proporção X (só horizontal) ─────────────────────────────
    this.add.text(PX + 12, PY + 162, 'Proporção X  (só largura):', {
      fontSize: '13px', color: '#cccccc', fontFamily: 'monospace',
    })

    const scaleHMinus = this.makeAdjBtn(PX + 18,  PY + 182, '◀', () => this.adjust('scaleH', -0.01))
    const scaleHPlus  = this.makeAdjBtn(PX + 242, PY + 182, '▶', () => this.adjust('scaleH', +0.01))
    this.panelScaleHVal = this.add.text(PX + PW / 2, PY + 182, '0.000', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5, 0)

    controls.push(scaleHMinus, scaleHPlus, this.panelScaleHVal)

    // ── Controle originX ─────────────────────────────────────────────────
    this.add.text(PX + 12, PY + 222, 'Pivot X  (centralização):', {
      fontSize: '13px', color: '#cccccc', fontFamily: 'monospace',
    })

    const originMinus = this.makeAdjBtn(PX + 18,  PY + 242, '◀', () => this.adjust('originX', -0.005))
    const originPlus  = this.makeAdjBtn(PX + 242, PY + 242, '▶', () => this.adjust('originX', +0.005))
    this.panelOriginXVal = this.add.text(PX + PW / 2, PY + 242, '0.000', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5, 0)

    controls.push(originMinus, originPlus, this.panelOriginXVal)

    // ── Dica de passo ────────────────────────────────────────────────────
    this.add.text(PX + PW / 2, PY + 282, 'passo: escala=0.05  proporção/pivot=0.01/0.005', {
      fontSize: '10px', color: '#445566', fontFamily: 'monospace',
    }).setOrigin(0.5, 0)

    // ── Botão RESETAR animação ────────────────────────────────────────────
    const resetBtn = this.add.rectangle(PX + PW / 2, PY + 320, 200, 38, 0x2a1a00)
      .setStrokeStyle(2, 0xaa6600)
      .setInteractive({ useHandCursor: true })
    const resetLbl = this.add.text(PX + PW / 2, PY + 320, 'RESETAR ANIMAÇÃO', {
      fontSize: '13px', color: '#ffaa44', fontFamily: 'monospace',
    }).setOrigin(0.5)
    resetBtn.on('pointerover',  () => resetBtn.setFillStyle(0x3d2800))
    resetBtn.on('pointerout',   () => resetBtn.setFillStyle(0x2a1a00))
    resetBtn.on('pointerdown',  () => this.resetCurrentAnim())
    controls.push(resetBtn, resetLbl)

    // ── Separador ─────────────────────────────────────────────────────────
    this.add.rectangle(PX + PW / 2, PY + 358, PW - 20, 1, 0x223344)

    // ── Botão EXPORTAR ────────────────────────────────────────────────────
    const exportBtn = this.add.rectangle(PX + PW / 2, PY + 396, 240, 44, 0x002211)
      .setStrokeStyle(2, 0x44aa66)
      .setInteractive({ useHandCursor: true })
    this.add.text(PX + PW / 2, PY + 396, 'EXPORTAR CONFIG', {
      fontSize: '14px', color: '#44cc88', fontFamily: 'monospace',
    }).setOrigin(0.5)
    exportBtn.on('pointerover',  () => exportBtn.setFillStyle(0x003322))
    exportBtn.on('pointerout',   () => exportBtn.setFillStyle(0x002211))
    exportBtn.on('pointerdown',  () => this.exportConfig())
    this.add.text(PX + PW / 2, PY + 424, '(abre console do navegador)', {
      fontSize: '10px', color: '#335544', fontFamily: 'monospace',
    }).setOrigin(0.5, 0)

    this.panelControls = this.add.container(0, 0, controls)
    this.panelControls.setVisible(false)
  }

  private makeAdjBtn(x: number, y: number, label: string, fn: () => void): Phaser.GameObjects.Text {
    const btn = this.add.text(x, y, label, {
      fontSize: '22px', color: '#aaccff', fontFamily: 'monospace',
      stroke: '#000', strokeThickness: 2,
    }).setInteractive({ useHandCursor: true })
    btn.on('pointerover', () => btn.setColor('#ffffff'))
    btn.on('pointerout',  () => btn.setColor('#aaccff'))
    btn.on('pointerdown', fn)
    return btn
  }

  private refreshPanel() {
    const hasSelection = this.selectedIdx >= 0 && this.selectedIdx < this.entries.length

    this.panelEmpty.setVisible(!hasSelection)
    this.panelControls.setVisible(hasSelection)

    if (!hasSelection) return

    const { def } = this.entries[this.selectedIdx]
    const resolvedAnim = this.anims.exists(`t-${def.key}-${this.activeAnim}`) ? this.activeAnim : 'idle'
    const cfg = this.editConfig.get(def.key)?.[resolvedAnim]

    this.panelCharLabel.setText(def.label.toUpperCase())
    this.panelAnimLabel.setText(`animação: ${resolvedAnim}`)

    const ss = this.charSizeScale.get(def.key) ?? 1.0
    this.panelSizeScaleVal.setText(ss.toFixed(2))

    this.panelScaleHVal.setText(cfg ? cfg.scaleH.toFixed(3) : '—')
    this.panelOriginXVal.setText(cfg ? cfg.originX.toFixed(3) : '—')
  }

  private adjust(prop: 'scaleH' | 'originX', delta: number) {
    if (this.selectedIdx < 0) return
    const { def, sprite, baseScaleY } = this.entries[this.selectedIdx]
    const resolvedAnim = this.anims.exists(`t-${def.key}-${this.activeAnim}`) ? this.activeAnim : 'idle'
    const charCfg = this.editConfig.get(def.key)
    if (!charCfg) return
    const cfg = charCfg[resolvedAnim]
    if (!cfg) return

    if (prop === 'scaleH') {
      cfg.scaleH = +Math.max(0.1, Math.min(3.0, cfg.scaleH + delta)).toFixed(3)
    } else {
      cfg.originX = +Math.max(0.0, Math.min(1.0, cfg.originX + delta)).toFixed(4)
    }

    sprite.setScale(baseScaleY * cfg.scaleH, baseScaleY)
    sprite.setOrigin(cfg.originX, 1.0)
    this.refreshPanel()
  }

  private adjustSizeScale(delta: number) {
    if (this.selectedIdx < 0) return
    const { def, sprite } = this.entries[this.selectedIdx]
    const current = this.charSizeScale.get(def.key) ?? 1.0
    const next = +Math.max(0.1, Math.min(3.0, current + delta)).toFixed(2)
    this.charSizeScale.set(def.key, next)

    // Recalcular baseScaleY para este sprite
    const newBaseScaleY = (312 * next) / sprite.height
    // Atualizar no entries array (baseScaleY é mutável)
    ;(this.entries[this.selectedIdx] as { baseScaleY: number }).baseScaleY = newBaseScaleY

    // Re-aplicar scale com config atual
    const resolvedAnim = this.anims.exists(`t-${def.key}-${this.activeAnim}`) ? this.activeAnim : 'idle'
    const cfg = this.editConfig.get(def.key)?.[resolvedAnim]
    if (cfg) {
      sprite.setScale(newBaseScaleY * cfg.scaleH, newBaseScaleY)
    }

    this.refreshPanel()
  }

  private resetCurrentAnim() {
    if (this.selectedIdx < 0) return
    const { def, sprite, baseScaleY } = this.entries[this.selectedIdx]
    const resolvedAnim = this.anims.exists(`t-${def.key}-${this.activeAnim}`) ? this.activeAnim : 'idle'
    const charCfg = this.editConfig.get(def.key)
    if (!charCfg) return

    const animDef = def.anims[resolvedAnim]
    if (!animDef) return

    charCfg[resolvedAnim] = {
      scaleH:  DEFAULT_SCALE_H[animDef.sheet]  ?? def.scaleH,
      originX: DEFAULT_ORIGIN_X[animDef.sheet] ?? 0.5,
    }
    const cfg = charCfg[resolvedAnim]
    sprite.setScale(baseScaleY * cfg.scaleH, baseScaleY)
    sprite.setOrigin(cfg.originX, 1.0)
    this.refreshPanel()
  }

  // ── Exportação ────────────────────────────────────────────────────────────

  private exportConfig() {
    // Gera config agrupada por sheet (como Player.ts e Ally.ts esperam)
    const scaleHByAnim: Record<string, number> = {}
    const originXByAnim: Record<string, number> = {}

    for (const def of CHAR_DEFS) {
      const charCfg = this.editConfig.get(def.key)
      if (!charCfg) continue
      for (const [animName, cfg] of Object.entries(charCfg)) {
        const key = `${def.key}-${animName}`
        scaleHByAnim[key] = cfg.scaleH
        if (Math.abs(cfg.originX - 0.5) > 0.001) originXByAnim[key] = cfg.originX
      }
    }

    const lines: string[] = [
      '╔══════════════════════════════════════════════════════════════╗',
      '  SPRITE EDITOR CONFIG — copie para Player.ts / Ally.ts',
      '╚══════════════════════════════════════════════════════════════╝',
      '',
      '// Player.ts — ANIM_SCALE_H (proporção horizontal por animação):',
      'private static readonly ANIM_SCALE_H: Record<string, number> = {',
      ...Object.entries(scaleHByAnim).map(([k, v]) => `  '${k}': ${v.toFixed(3)},`),
      '}',
      '',
      '// Player.ts — ANIM_ORIGIN_X (só os não-centrados):',
      'private static readonly ANIM_ORIGIN_X: Record<string, number> = {',
      ...Object.entries(originXByAnim).map(([k, v]) => `  '${k}': ${v.toFixed(4)},`),
      '}',
    ]

    // Exporta sizeScale dos personagens que diferem de 1.0
    const sizeScaleLines: string[] = []
    for (const def of CHAR_DEFS) {
      const ss = this.charSizeScale.get(def.key) ?? 1.0
      if (Math.abs(ss - 1.0) > 0.01) {
        sizeScaleLines.push(`  ${def.key}: { ..., sizeScale: ${ss.toFixed(2)} },`)
      }
    }
    if (sizeScaleLines.length > 0) {
      lines.push('', '// Player.ts / Ally.ts — STATS sizeScale:', ...sizeScaleLines)
    }

    const output = lines.join('\n')
    console.log(output)

    // Tenta copiar para clipboard
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(output).then(() => {
        console.log('Config copiada para o clipboard!')
      }).catch(() => {
        console.log('(não foi possível copiar automaticamente — selecione o texto acima)')
      })
    }
  }

  // ── Navegação ─────────────────────────────────────────────────────────────

  private goBack() {
    this.cameras.main.fadeOut(300, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TitleScene'))
  }
}
