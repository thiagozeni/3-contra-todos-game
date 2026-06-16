import Phaser from 'phaser'
import {
  primitive, semantic, ROLES, TYPE, SPACE, hex,
  dsText, AngledBar, makeAngledPortrait, makeAngledPanel, makeMenuButton,
  makeListRow, makeStatLine, makeStatusBadge, makeOverlay, makeIconTile,
} from '../ui/ds'

type Destroyable = { destroy(): void }

/** Hidden DS reference scene — renders all tokens + components in the real engine.
 *  4 pages, switch with ←/→ (or window.__sgTest.go(n) for capture). Started via the
 *  capture script or `__game.scene.start('StyleGuideScene')` in the dev console. */
export class StyleGuideScene extends Phaser.Scene {
  private page = 1
  private readonly pages = 5
  private items: Destroyable[] = []

  constructor() { super({ key: 'StyleGuideScene' }) }

  create() {
    this.cameras.main.setBackgroundColor(primitive.night)
    const params = new URLSearchParams(window.location.search)
    const p = parseInt(params.get('sgpage') ?? '1', 10)
    if (p >= 1 && p <= this.pages) this.page = p
    this.input.keyboard?.on('keydown-LEFT', () => this.go(this.page - 1))
    this.input.keyboard?.on('keydown-RIGHT', () => this.go(this.page + 1))
    ;(window as unknown as Record<string, unknown>).__sgTest = {
      go: (n: number) => this.go(n),
    }
    this.render()
  }

  private go(n: number) {
    this.page = ((n - 1 + this.pages) % this.pages) + 1
    this.render()
  }

  private track<T extends Destroyable>(o: T): T { this.items.push(o); return o }

  private render() {
    this.items.forEach((i) => i.destroy())
    this.items = []
    const titles = ['CORES', 'TIPOGRAFIA + ESPAÇO', 'COMPONENTES', 'OVERLAY', 'ÍCONES']
    this.track(dsText(this, 48, 32, `DS · ${this.page}/${this.pages} · ${titles[this.page - 1]}   (← →)`,
      { role: 'small', color: 'textSecondary' }))
    if (this.page === 1) this.buildColors()
    else if (this.page === 2) this.buildType()
    else if (this.page === 3) this.buildComponents()
    else if (this.page === 4) this.buildOverlay()
    else this.buildIcons()
  }

  private grid(entries: [string, number][], x0: number, y0: number) {
    const cw = 300, ch = 96, perRow = 6
    entries.forEach(([name, value], i) => {
      const col = i % perRow, row = Math.floor(i / perRow)
      const x = x0 + col * cw, y = y0 + row * ch
      this.track(this.add.rectangle(x, y, 150, 56, value).setOrigin(0, 0).setStrokeStyle(2, primitive.black))
      this.track(dsText(this, x, y + 62, name, { role: 'caption', color: 'textPrimary' }))
      this.track(dsText(this, x + 162, y + 18, hex(value), { role: 'caption', color: 'textSecondary' }))
    })
  }

  private buildColors() {
    this.track(dsText(this, 48, 88, 'PRIMITIVE', { role: 'h3', color: 'textBrand' }))
    this.grid(Object.entries(primitive) as [string, number][], 48, 136)
    const rows = Math.ceil(Object.keys(primitive).length / 6)
    const semY = 136 + rows * 96 + 40
    this.track(dsText(this, 48, semY, 'SEMANTIC', { role: 'h3', color: 'textBrand' }))
    this.grid(Object.entries(semantic) as [string, number][], 48, semY + 48)
  }

  private buildType() {
    let y = 96
    for (const role of ROLES) {
      const px = TYPE[role].px
      this.track(dsText(this, 48, y + px / 2, role, { role: 'caption', color: 'textSecondary', origin: [0, 0.5] }))
      this.track(dsText(this, 220, y + px / 2, `${px}px`, { role: 'caption', color: 'textSecondary', origin: [0, 0.5] }))
      this.track(dsText(this, 360, y, 'ABC 012', { role, color: 'textPrimary' }))
      y += px + 14
    }
    this.track(dsText(this, 360, y, '12:45 · 28.900 · x9', { role: 'h1', color: 'textBrand', family: 'numeric' }))

    this.track(dsText(this, 1320, 88, 'ESPAÇO (base 4)', { role: 'h3', color: 'textBrand' }))
    let sy = 150
    for (const [k, v] of Object.entries(SPACE) as [string, number][]) {
      this.track(this.add.rectangle(1320, sy, v, 24, primitive.goldBrand).setOrigin(0, 0).setStrokeStyle(2, primitive.black))
      this.track(dsText(this, 1320 + 110, sy, `${k} = ${v}`, { role: 'caption', color: 'textSecondary' }))
      sy += 42
    }
  }

  private buildComponents() {
    this.track(dsText(this, 48, 86, 'AngledBar (full/mid/low)', { role: 'caption', color: 'textSecondary' }))
    const b1 = new AngledBar(this, { x: 48, y: 124, w: 360, h: 40, depth: 1 }); b1.redraw(1.0, semantic.hpFull); this.track(b1)
    const b2 = new AngledBar(this, { x: 48, y: 178, w: 360, h: 40, depth: 1 }); b2.redraw(0.5, semantic.hpMid); this.track(b2)
    const b3 = new AngledBar(this, { x: 48, y: 232, w: 360, h: 40, depth: 1 }); b3.redraw(0.2, semantic.hpLow); this.track(b3)

    this.track(dsText(this, 48, 300, 'AngledPortrait (selected/idle/muted)', { role: 'caption', color: 'textSecondary' }))
    this.track(makeAngledPortrait(this, { x: 48, y: 340, w: 150, h: 180, texture: 'werdum-perfil', frameColor: primitive.gold, depth: 1, zoom: 1.0 }))
    this.track(makeAngledPortrait(this, { x: 220, y: 340, w: 150, h: 180, texture: 'dida-perfil', frameColor: primitive.steel, depth: 1, zoom: 1.0 }))
    const muted = makeAngledPortrait(this, { x: 392, y: 340, w: 150, h: 180, texture: 'thor-perfil', frameColor: primitive.steel, depth: 1, zoom: 1.0 }); muted.setAlpha(0.5); this.track(muted)

    this.track(dsText(this, 640, 86, 'MenuButton', { role: 'caption', color: 'textSecondary' }))
    this.track(makeMenuButton(this, { x: 640, y: 124, w: 260, h: 64, label: 'PRIMARY', variant: 'primary', onClick: () => {}, depth: 1 }))
    this.track(makeMenuButton(this, { x: 640, y: 204, w: 260, h: 64, label: 'GHOST', variant: 'ghost', onClick: () => {}, depth: 1 }))
    this.track(makeMenuButton(this, { x: 640, y: 290, label: '< LINK', variant: 'link', onClick: () => {}, depth: 1 }))
    const dis = makeMenuButton(this, { x: 640, y: 336, w: 260, h: 64, label: 'DISABLED', variant: 'primary', onClick: () => {}, depth: 1 }); dis.setEnabled(false); this.track(dis)

    this.track(dsText(this, 980, 86, 'AngledPanel (filled/outline)', { role: 'caption', color: 'textSecondary' }))
    this.track(makeAngledPanel(this, { x: 980, y: 124, w: 300, h: 110, variant: 'filled', depth: 1 }))
    this.track(makeAngledPanel(this, { x: 980, y: 264, w: 300, h: 110, variant: 'outline', depth: 1 }))

    this.track(dsText(this, 1360, 86, 'StatusBadge', { role: 'caption', color: 'textSecondary' }))
    this.track(makeStatusBadge(this, 1360, 124, 'down', 1))
    this.track(makeStatusBadge(this, 1360, 168, 'off', 1))
    this.track(dsText(this, 1360, 240, 'StatLine', { role: 'caption', color: 'textSecondary' }))
    this.track(makeStatLine(this, { x: 1480, y: 286, label: 'SCORE', value: '28.900', valueNumeric: true, depth: 1 }))

    this.track(dsText(this, 48, 560, 'ListRow (highlight / normal)', { role: 'caption', color: 'textSecondary' }))
    const cols: [number, number, number, number, number, number] = [0, 90, 470, 800, 980, 1230]
    this.track(makeListRow(this, { x: 48, y: 620, w: 1500, cols, highlight: true, depth: 1,
      data: { rank: '1.', name: 'WAND', character: 'WERDUM', continues: '2', time: '12:45', score: '28.900' } }))
    this.track(makeListRow(this, { x: 48, y: 688, w: 1500, cols, highlight: false, depth: 1,
      data: { rank: '2.', name: 'DIDA', character: 'DIDA', continues: '4', time: '10:02', score: '21.300' } }))
  }

  private buildIcons() {
    const keys = ['shield', 'joystick', 'fist', 'boot', 'pause', 'speaker', 'globe', 'bolt', 'hourglass', 'lock'] as const
    const aigen = ['trophy', 'star', 'gear', 'medal-gold', 'medal-silver', 'medal-bronze'] as const

    // Linha 1 — estáticos (sprite premium, alpha limpo). Legenda por baixo.
    this.track(dsText(this, 48, 92, 'IconTile · 10 ícones premium (rembg + connected-components)', { role: 'caption', color: 'textSecondary' }))
    keys.forEach((k, i) => {
      const x = 90 + i * 150
      if (!this.textures.exists(`ic-${k}`)) return
      this.track(makeIconTile(this, { x, y: 170, texture: `ic-${k}`, size: 64, fixed: false, depth: 1 }))
      this.track(dsText(this, x, 220, k, { role: 'small', color: 'textMuted', origin: [0.5, 0] }))
    })

    // Linha 2 — float (bob idle contínuo)
    this.track(dsText(this, 48, 300, 'float (bob idle)', { role: 'caption', color: 'textSecondary' }))
    keys.forEach((k, i) => {
      const x = 90 + i * 150
      if (!this.textures.exists(`ic-${k}`)) return
      this.track(makeIconTile(this, { x, y: 360, texture: `ic-${k}`, size: 64, fixed: false, float: true, depth: 1 }))
    })

    // Linha 3 — glow contínuo (halo aditivo dourado pulsando)
    this.track(dsText(this, 48, 470, 'glow (halo aditivo)', { role: 'caption', color: 'textSecondary' }))
    keys.forEach((k, i) => {
      const x = 90 + i * 150
      if (!this.textures.exists(`ic-${k}`)) return
      this.track(makeIconTile(this, { x, y: 530, texture: `ic-${k}`, size: 64, fixed: false, glow: true, depth: 1 }))
    })

    // Linha 4 — plate (keycap dourado) + interativo (hover/press + glow). Pulso ao clicar.
    // Resolve o contraste dos ícones monocromáticos (pause/lock/…) sobre fundo escuro.
    this.track(dsText(this, 48, 640, 'plate keycap + interativo (hover / press + glow) — clique p/ pulse', { role: 'caption', color: 'textSecondary' }))
    keys.forEach((k, i) => {
      const x = 90 + i * 150
      if (!this.textures.exists(`ic-${k}`)) return
      const tile = makeIconTile(this, { x, y: 700, texture: `ic-${k}`, size: 56, fixed: false, depth: 1, plate: true, onClick: () => tile.pulse() })
      this.track(tile)
    })

    // Linha 5 — ícones gerados via IA (nano_banana_pro), casando a pixel-art. float+glow.
    this.track(dsText(this, 48, 790, 'gerados via IA (nano_banana_pro) — trophy / star / gear / medalhas', { role: 'caption', color: 'textSecondary' }))
    aigen.forEach((k, i) => {
      const x = 110 + i * 150
      if (!this.textures.exists(`ic-${k}`)) return
      this.track(makeIconTile(this, { x, y: 860, texture: `ic-${k}`, size: 76, fixed: false, float: true, glow: true, depth: 1 }))
    })
  }

  private buildOverlay() {
    this.track(makeOverlay(this, {
      title: 'GAME OVER',
      titleColor: 'hpLow',
      lines: [
        { text: 'TODOS CAÍRAM', role: 'h3', color: 'textPrimary' },
        { text: 'WAVE 5/12', role: 'body', color: 'accentCombo', numeric: true },
        { text: '12.450 PTS', role: 'body', color: 'accentCombo', numeric: true },
      ],
      footer: 'voltando ao início...',
    }))
  }
}
