import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { dsText, makeBackButton, makeIconTile, primitive, STROKE } from '../ui/ds'
import { mountSceneBg } from '../ui/sceneBg'

/**
 * How to Play — reconstruída a partir de elementos (não mais arte achatada), para
 * que cada bloco de informação entre em cascata e a missão possa pulsar. Fiel ao
 * conceito (gpt-target/howtoplay.png): título + 4 painéis (MOVIMENTO / ATAQUE /
 * DEFESA / SISTEMA) numa grade 2×2 + barra de MISSÃO. Fundo = ringue superwide
 * limpo (#scene-bg cover, cobre de 16:9 até ultrawide).
 */
const PANEL_W = 680
const PANEL_H = 244
const COL1_X = 250
const COL2_X = COL1_X + PANEL_W + 60
const ROW1_Y = 232
const ROW2_Y = ROW1_Y + PANEL_H + 44

export class HowToPlayScene extends Phaser.Scene {
  private navigating = false

  constructor() {
    super({ key: 'HowToPlayScene' })
  }

  create() {
    this.navigating = false
    const { width, height } = this.scale

    this.cameras.main.fadeIn(300, 0, 0, 0)

    // Ringue superwide limpo (preenche ultrawide; sem painéis embutidos).
    mountSceneBg(this, 'imgs/cenario/how-to-play-bg-superwide.png')
    this.add.rectangle(width / 2, height / 2, width, height, primitive.black, 0.55).setDepth(0)

    // Botão VOLTAR — rollover animado (seta + leve apoio), igual às demais telas.
    const back = makeBackButton(this, {
      x: 64, y: 60, label: 'VOLTAR', role: 'h3', depth: 6,
      onClick: () => this.goBack(),
    })

    // Título + estrelas (centro vertical do título).
    const title = dsText(this, width / 2, 64, 'HOW TO PLAY', { role: 'title', color: 'textBrand', origin: [0.5, 0] }).setDepth(5)
    const titleCY = 64 + title.height / 2
    const tGlow = dsText(this, width / 2, 64, 'HOW TO PLAY', { role: 'title', color: 'textBrand', origin: [0.5, 0] })
      .setDepth(4).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0)
    this.tweens.add({ targets: tGlow, alpha: 0.4, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    const tGap = title.width / 2 + 46
    for (const sx of [width / 2 - tGap, width / 2 + tGap]) {
      if (this.textures.exists('ic-star')) makeIconTile(this, { x: sx, y: titleCY, texture: 'ic-star', size: 40, depth: 5, glow: true })
    }

    // ── 4 painéis (cada um um container → entra em cascata) ──
    const panels = [
      this.buildMovementPanel(COL1_X, ROW1_Y),
      this.buildAttackPanel(COL2_X, ROW1_Y),
      this.buildDefensePanel(COL1_X, ROW2_Y),
      this.buildSystemPanel(COL2_X, ROW2_Y),
    ]

    // ── Barra de MISSÃO (pulsa) ──
    const mission = this.buildMissionBar(COL1_X, ROW2_Y + PANEL_H + 36, COL2_X + PANEL_W - COL1_X, 72)

    // ── "TOQUE PARA CONTINUAR" — seta centralizada verticalmente com o texto ──
    const hint = this.add.container(width / 2, 1042).setDepth(5)
    const hintTxt = dsText(this, 0, 0, 'TOQUE PARA CONTINUAR', { role: 'small', color: 'accentDamageHi', origin: [0, 0.5] })
    const hintArrow = dsText(this, 0, 0, '▶', { role: 'small', color: 'accentDamageHi', origin: [0, 0.5] })
    // Centraliza o conjunto: seta + gap + texto.
    const gap = 14
    const totalW = hintArrow.width + gap + hintTxt.width
    hintArrow.setX(-totalW / 2)
    hintTxt.setX(-totalW / 2 + hintArrow.width + gap)
    hint.add([hintArrow, hintTxt])
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' })

    // ── Cascata de entrada ──
    const enter = (obj: Phaser.GameObjects.Container, delay: number) => {
      obj.setAlpha(0)
      obj.y += 26
      this.tweens.add({ targets: obj, alpha: 1, y: obj.y - 26, duration: 360, delay, ease: 'Back.Out' })
    }
    panels.forEach((p, i) => enter(p, 120 + i * 130))
    enter(mission, 120 + panels.length * 130)
    back.container.setAlpha(0)
    this.tweens.add({ targets: back.container, alpha: 1, duration: 300, delay: 60 })

    // ── Navegação ──
    const advance = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(2)
    advance.on('pointerdown', () => this.go())

    this.time.delayedCall(300, () => {
      this.input.keyboard!.on('keydown-SPACE',  () => this.go())
      this.input.keyboard!.on('keydown-ENTER',  () => this.go())
      this.input.keyboard!.on('keydown-ESCAPE', () => this.goBack())
    })
  }

  // ── Helpers de construção ──────────────────────────────────────────────────

  /** Moldura de painel (rounded rect, borda dourada dupla) num container. */
  private panelBase(x: number, y: number, title: string): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(3)
    const g = this.add.graphics()
    g.fillStyle(primitive.night, 0.92).fillRoundedRect(0, 0, PANEL_W, PANEL_H, 16)
    g.lineStyle(STROKE.heavy, primitive.black, 1).strokeRoundedRect(0, 0, PANEL_W, PANEL_H, 16)
    g.lineStyle(STROKE.bold, primitive.goldBrand, 1).strokeRoundedRect(2, 2, PANEL_W - 4, PANEL_H - 4, 15)
    const t = dsText(this, PANEL_W / 2, 34, title, { role: 'h3', color: 'textBrand', origin: [0.5, 0.5] })
    c.add([g, t])
    return c
  }

  /** Keycap (quadradinho escuro com borda dourada + letra). Retorna os objetos. */
  private keycap(x: number, y: number, label: string, w = 46): Phaser.GameObjects.GameObject[] {
    const h = 46
    const g = this.add.graphics()
    g.fillStyle(primitive.black, 0.85).fillRoundedRect(x - w / 2, y - h / 2, w, h, 8)
    g.lineStyle(STROKE.bold, primitive.steel, 1).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8)
    g.lineStyle(2, primitive.goldBrand, 1).strokeRoundedRect(x - w / 2 + 2, y - h / 2 + 2, w - 4, h - 4, 7)
    const t = dsText(this, x, y, label, { role: 'caption', color: 'textPrimary', origin: [0.5, 0.5] })
    return [g, t]
  }

  private icon(x: number, y: number, key: string, size: number): Phaser.GameObjects.Image {
    const src = this.textures.get(key).getSourceImage() as { width: number; height: number }
    const ar = src.width > 0 && src.height > 0 ? src.width / src.height : 1
    return this.add.image(x, y, key).setDisplaySize(Math.round(size * ar), size)
  }

  private buildMovementPanel(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.panelBase(x, y, 'MOVIMENTO')
    c.add(this.icon(108, 128, 'ic-joystick', 100))
    c.add(dsText(this, 108, 206, 'JOYSTICK', { role: 'caption', color: 'textSecondary', origin: [0.5, 0.5] }))
    // WASD
    c.add(this.keycap(300, 104, 'W'))
    c.add(this.keycap(252, 160, 'A'))
    c.add(this.keycap(300, 160, 'S'))
    c.add(this.keycap(348, 160, 'D'))
    // Setas
    c.add(this.keycap(508, 104, '↑'))
    c.add(this.keycap(460, 160, '←'))
    c.add(this.keycap(508, 160, '↓'))
    c.add(this.keycap(556, 160, '→'))
    return c
  }

  private buildAttackPanel(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.panelBase(x, y, 'ATAQUE')
    c.add(this.icon(110, 130, 'ic-fist', 104))
    c.add(this.keycap(258, 110, 'J'))
    c.add(dsText(this, 312, 110, 'SOCO', { role: 'body', color: 'textPrimary', origin: [0, 0.5] }))
    c.add(this.keycap(258, 174, 'K'))
    c.add(dsText(this, 312, 174, 'CHUTE', { role: 'body', color: 'textPrimary', origin: [0, 0.5] }))
    c.add(this.icon(540, 150, 'ic-boot', 78))
    return c
  }

  private buildDefensePanel(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.panelBase(x, y, 'DEFESA')
    c.add(this.icon(112, 138, 'ic-shield', 106))
    c.add(this.keycap(262, 138, 'L'))
    c.add(dsText(this, 318, 138, 'BLOQUEAR', { role: 'body', color: 'textPrimary', origin: [0, 0.5] }))
    return c
  }

  private buildSystemPanel(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.panelBase(x, y, 'SISTEMA')
    // PAUSA
    c.add(this.icon(96, 110, 'ic-pause', 48))
    c.add(this.keycap(176, 110, 'ESC', 78))
    c.add(dsText(this, 240, 110, 'PAUSA', { role: 'body', color: 'textPrimary', origin: [0, 0.5] }))
    // MUTE
    c.add(this.icon(96, 174, 'ic-speaker', 48))
    c.add(this.keycap(176, 174, 'M'))
    c.add(dsText(this, 240, 174, 'MUTE', { role: 'body', color: 'textPrimary', origin: [0, 0.5] }))
    return c
  }

  private buildMissionBar(x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(4)
    const g = this.add.graphics()
    g.fillStyle(primitive.night, 0.94).fillRoundedRect(0, 0, w, h, 14)
    g.lineStyle(STROKE.heavy, primitive.black, 1).strokeRoundedRect(0, 0, w, h, 14)
    g.lineStyle(STROKE.bold, primitive.goldBrand, 1).strokeRoundedRect(2, 2, w - 4, h - 4, 13)
    c.add(g)
    const label = dsText(this, w / 2, h / 2, 'MISSÃO: PROTEJA O WAND DOS INIMIGOS!', {
      role: 'h3', color: 'textBrand', origin: [0.5, 0.5],
    })
    c.add(label)
    // Raios ladeando.
    const bGap = label.width / 2 + 40
    for (const bx of [w / 2 - bGap, w / 2 + bGap]) {
      if (this.textures.exists('ic-bolt')) c.add(this.icon(bx, h / 2, 'ic-bolt', 36))
    }
    // Pulsa (chama atenção pra missão).
    this.tweens.add({ targets: label, scale: 1.04, duration: 760, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    return c
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
