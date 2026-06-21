import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { dsText, makeBackButton, makeIconTile, primitive } from '../ui/ds'
import { pixelPanel } from '../ui/ds/components/para'
import { mountSceneBgVideo } from '../ui/sceneBg'
import { t } from '../i18n'

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

    // Ringue superwide — vídeo-loop (luzes varrendo) com fallback PNG.
    mountSceneBgVideo(this, 'videos/howtoplay-loop.mp4', 'imgs/cenario/how-to-play-bg-superwide.png')
    this.add.rectangle(width / 2, height / 2, width, height, primitive.black, 0.55).setDepth(0)

    // Botão VOLTAR — rollover animado (seta + leve apoio), igual às demais telas.
    const back = makeBackButton(this, {
      x: 64, y: 60, label: t('common.back'), role: 'h3', depth: 6,
      onClick: () => this.goBack(),
    })

    // Título + estrelas (centro vertical do título).
    const title = dsText(this, width / 2, 64, t('howto.title'), { role: 'title', color: 'textBrand', origin: [0.5, 0] }).setDepth(5)
    const titleCY = 64 + title.height / 2
    const tGlow = dsText(this, width / 2, 64, t('howto.title'), { role: 'title', color: 'textBrand', origin: [0.5, 0] })
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

    // ── "TOQUE PARA CONTINUAR" — centralizada verticalmente entre a barra de MISSÃO
    // (base ~872) e a margem inferior da tela (1080) → ~976. Seta alinhada ao texto.
    const missionBottom = (ROW2_Y + PANEL_H + 36) + 72
    const hintY = Math.round((missionBottom + height) / 2)
    const hint = this.add.container(width / 2, hintY).setDepth(5)
    const hintTxt = dsText(this, 0, 0, t('howto.touchToContinue'), { role: 'small', color: 'accentDamageHi', origin: [0, 0.5] })
    // Seta como triângulo desenhado (glyph ▶ da fonte pixel não centra na baseline) —
    // garante alinhamento vertical exato com o texto.
    const ah = hintTxt.height * 0.62
    const hintArrow = this.add.triangle(0, 0, 0, 0, 0, ah, ah * 0.9, ah / 2, primitive.cyanHi)
      .setOrigin(0, 0.5)
    // Centraliza o conjunto: seta + gap + texto.
    const gap = 16
    const totalW = hintArrow.width + gap + hintTxt.width
    hintArrow.setX(-totalW / 2).setY(0)
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
    pixelPanel(g, 0, 0, PANEL_W, PANEL_H, 16, 4, primitive.night, 0.92, primitive.black, primitive.goldBrand, 3, 3)
    const t = dsText(this, PANEL_W / 2, 34, title, { role: 'h3', color: 'textBrand', origin: [0.5, 0.5] })
    c.add([g, t])
    return c
  }

  /** Keycap (quadradinho escuro com borda dourada + letra). Retorna os objetos. */
  private keycap(x: number, y: number, label: string, w = 46): Phaser.GameObjects.GameObject[] {
    const h = 46
    const g = this.add.graphics()
    pixelPanel(g, x - w / 2, y - h / 2, w, h, 8, 3, primitive.black, 0.85, primitive.steel, primitive.goldBrand, 2, 2)
    const t = dsText(this, x, y, label, { role: 'caption', color: 'textPrimary', origin: [0.5, 0.5] })
    return [g, t]
  }

  /**
   * Keycap de SETA. Na fonte pixel, os glyphs ← → são finos e destoam do ↑ ↓
   * (preenchidos). Por isso a seta aqui é SEMPRE o glyph '↑' (mesmo peso de cima/
   * baixo) ROTACIONADO para a direção pedida — assim as 4 setas são idênticas.
   */
  private keycapArrow(x: number, y: number, dir: 'up' | 'down' | 'left' | 'right', w = 46): Phaser.GameObjects.GameObject[] {
    const h = 46
    const g = this.add.graphics()
    pixelPanel(g, x - w / 2, y - h / 2, w, h, 8, 3, primitive.black, 0.85, primitive.steel, primitive.goldBrand, 2, 2)
    const angle = dir === 'up' ? 0 : dir === 'right' ? 90 : dir === 'down' ? 180 : -90
    const t = dsText(this, x, y, '↑', { role: 'caption', color: 'textPrimary', origin: [0.5, 0.5] }).setAngle(angle)
    return [g, t]
  }

  private icon(x: number, y: number, key: string, size: number): Phaser.GameObjects.Image {
    const src = this.textures.get(key).getSourceImage() as { width: number; height: number }
    const ar = src.width > 0 && src.height > 0 ? src.width / src.height : 1
    return this.add.image(x, y, key).setDisplaySize(Math.round(size * ar), size)
  }

  private buildMovementPanel(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.panelBase(x, y, t('howto.movement'))
    c.add(this.icon(108, 128, 'ic-joystick', 100))
    c.add(dsText(this, 108, 206, t('howto.joystick'), { role: 'caption', color: 'textSecondary', origin: [0.5, 0.5] }))
    // WASD
    c.add(this.keycap(300, 104, 'W'))
    c.add(this.keycap(252, 160, 'A'))
    c.add(this.keycap(300, 160, 'S'))
    c.add(this.keycap(348, 160, 'D'))
    // Setas — todas derivadas do mesmo glyph '↑' rotacionado (peso visual uniforme).
    c.add(this.keycapArrow(508, 104, 'up'))
    c.add(this.keycapArrow(460, 160, 'left'))
    c.add(this.keycapArrow(508, 160, 'down'))
    c.add(this.keycapArrow(556, 160, 'right'))
    return c
  }

  private buildAttackPanel(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.panelBase(x, y, t('howto.attack'))
    c.add(this.icon(110, 130, 'ic-fist', 104))
    c.add(this.keycap(258, 110, 'J'))
    c.add(dsText(this, 312, 110, t('howto.punch'), { role: 'body', color: 'textPrimary', origin: [0, 0.5] }))
    c.add(this.keycap(258, 174, 'K'))
    c.add(dsText(this, 312, 174, t('howto.kick'), { role: 'body', color: 'textPrimary', origin: [0, 0.5] }))
    c.add(this.icon(540, 150, 'ic-boot', 78))
    return c
  }

  private buildDefensePanel(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.panelBase(x, y, t('howto.defense'))
    c.add(this.icon(112, 138, 'ic-shield', 106))
    c.add(this.keycap(262, 138, 'L'))
    c.add(dsText(this, 318, 138, t('howto.block'), { role: 'body', color: 'textPrimary', origin: [0, 0.5] }))
    return c
  }

  private buildSystemPanel(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.panelBase(x, y, t('howto.system'))
    // PAUSA
    c.add(this.icon(96, 110, 'ic-pause', 48))
    c.add(this.keycap(176, 110, 'ESC', 78))
    c.add(dsText(this, 240, 110, t('howto.pause'), { role: 'body', color: 'textPrimary', origin: [0, 0.5] }))
    // MUTE
    c.add(this.icon(96, 174, 'ic-speaker', 48))
    c.add(this.keycap(176, 174, 'M'))
    c.add(dsText(this, 240, 174, t('howto.mute'), { role: 'body', color: 'textPrimary', origin: [0, 0.5] }))
    return c
  }

  private buildMissionBar(x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(4)
    const g = this.add.graphics()
    pixelPanel(g, 0, 0, w, h, 14, 4, primitive.night, 0.94, primitive.black, primitive.goldBrand, 3, 3)
    c.add(g)
    const label = dsText(this, w / 2, h / 2, t('howto.mission'), {
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
