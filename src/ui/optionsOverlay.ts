import type Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { dsText, makeAngledPanel, primitive, overlayAlpha, hex, semantic } from './ds'

export interface OptionsOverlayHandle { destroy(): void }

interface ToggleRow {
  label: string
  get: () => boolean
  toggle: () => void
  rowBg: Phaser.GameObjects.Rectangle
  labelText: Phaser.GameObjects.Text
  chip: Phaser.GameObjects.Rectangle
  chipText: Phaser.GameObjects.Text
  hit: Phaser.GameObjects.Rectangle
}

/**
 * Tela OPTIONS interativa (escopo: MÚSICA / EFEITOS / TELA CHEIA). Música e SFX
 * persistem em localStorage via SoundManager; tela cheia usa o ScaleManager do
 * Phaser. Cada opção é uma row emoldurada com um switch (chip verde ON / cinza
 * OFF). Navegável por teclado (↑↓/W/S, ENTER/SPACE/←/→ alterna) e mouse (hover
 * foca, clique alterna; clique no scrim fecha). Gerencia seu próprio input e o
 * remove no destroy. `onClose` é por clique no scrim — o ESC é tratado pela cena.
 */
export function makeOptionsOverlay(
  scene: Phaser.Scene,
  opts: { onClose: () => void; depth?: number },
): OptionsOverlayHandle {
  const { width, height } = scene.scale
  const cx = width / 2
  const cy = height / 2
  const depth = opts.depth ?? 6000
  const objs: Array<{ destroy(): void }> = []

  const scrim = scene.add.rectangle(cx, cy, width, height, primitive.black, overlayAlpha)
    .setScrollFactor(0).setDepth(depth).setInteractive()
  scrim.on('pointerdown', () => opts.onClose())
  objs.push(scrim)

  const pw = 840
  const ph = 500
  objs.push(makeAngledPanel(scene, {
    x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph, variant: 'filled', frame: primitive.goldBrand, depth: depth + 1,
  }))

  objs.push(
    dsText(scene, cx, cy - ph / 2 + 60, '★  OPTIONS  ★', { role: 'title', color: 'textBrand', origin: [0.5, 0.5] })
      .setDepth(depth + 2).setScrollFactor(0),
  )

  let focus = 0
  const ROW_W = 680
  const ROW_H = 64
  const ROW_PITCH = 84
  const ROW_TOP = cy - 64
  const LABEL_X = cx - ROW_W / 2 + 28
  const CHIP_X = cx + ROW_W / 2 - 80
  const CHIP_W = 96
  const CHIP_H = 44

  const defs: { label: string; get: () => boolean; set: (v: boolean) => void }[] = [
    { label: 'MÚSICA',     get: () => sound.isMusicEnabled(), set: (v) => sound.setMusicEnabled(v) },
    { label: 'EFEITOS',    get: () => sound.isSfxEnabled(),   set: (v) => sound.setSfxEnabled(v) },
    { label: 'TELA CHEIA', get: () => scene.scale.isFullscreen, set: () => { try { scene.scale.toggleFullscreen() } catch { /* fullscreen indisponível */ } } },
  ]

  const rows: ToggleRow[] = defs.map((d, i) => {
    const y = ROW_TOP + i * ROW_PITCH
    const rowBg = scene.add.rectangle(cx, y, ROW_W, ROW_H, primitive.black, 0.35)
      .setStrokeStyle(2, primitive.steel, 0.6).setDepth(depth + 2).setScrollFactor(0)
    const labelText = dsText(scene, LABEL_X, y, d.label, { role: 'h3', color: 'textPrimary', origin: [0, 0.5] })
      .setDepth(depth + 3).setScrollFactor(0)
    const chip = scene.add.rectangle(CHIP_X, y, CHIP_W, CHIP_H, primitive.gray33)
      .setStrokeStyle(3, primitive.black).setDepth(depth + 3).setScrollFactor(0)
    const chipText = dsText(scene, CHIP_X, y, 'OFF', { role: 'small', color: 'ink', origin: [0.5, 0.5] })
      .setDepth(depth + 4).setScrollFactor(0)
    const hit = scene.add.rectangle(cx, y, ROW_W, ROW_H, 0x000000, 0)
      .setDepth(depth + 4).setScrollFactor(0).setInteractive({ useHandCursor: true })
    objs.push(rowBg, labelText, chip, chipText, hit)
    const row: ToggleRow = {
      label: d.label, get: d.get,
      toggle: () => { d.set(!d.get()); refresh() },
      rowBg, labelText, chip, chipText, hit,
    }
    hit.on('pointerover', () => setFocus(i))
    hit.on('pointerdown', () => { setFocus(i); row.toggle(); sound.select() })
    return row
  })

  objs.push(
    dsText(scene, cx, cy + ph / 2 - 40, '↑↓ navegar   ENTER alterna   ESC voltar', {
      role: 'caption', color: 'textSecondary', origin: [0.5, 0.5],
    }).setDepth(depth + 3).setScrollFactor(0),
  )

  function refresh(): void {
    rows.forEach((r, i) => {
      const focused = i === focus
      const on = r.get()
      // foco: moldura dourada + label dourado; senão steel/branco.
      r.rowBg.setStrokeStyle(focused ? 3 : 2, focused ? primitive.goldBrand : primitive.steel, focused ? 1 : 0.6)
      r.labelText.setColor(hex(focused ? semantic.textBrand : semantic.textPrimary))
      // switch: verde (ON) / cinza (OFF), texto escuro p/ contraste.
      r.chip.setFillStyle(on ? primitive.greenOk : primitive.gray33)
      r.chipText.setText(on ? 'ON' : 'OFF').setColor(hex(semantic.ink))
    })
  }

  function setFocus(i: number): void {
    if (i === focus) return
    focus = i
    sound.hover()
    refresh()
  }

  // Keyboard — registered here, removed on destroy.
  const kb = scene.input.keyboard
  const onUp = () => setFocus((focus + rows.length - 1) % rows.length)
  const onDown = () => setFocus((focus + 1) % rows.length)
  const onToggle = () => { rows[focus].toggle(); sound.select() }
  kb?.on('keydown-UP', onUp); kb?.on('keydown-W', onUp)
  kb?.on('keydown-DOWN', onDown); kb?.on('keydown-S', onDown)
  kb?.on('keydown-ENTER', onToggle); kb?.on('keydown-SPACE', onToggle)
  kb?.on('keydown-LEFT', onToggle); kb?.on('keydown-RIGHT', onToggle)

  refresh()

  return {
    destroy: () => {
      kb?.off('keydown-UP', onUp); kb?.off('keydown-W', onUp)
      kb?.off('keydown-DOWN', onDown); kb?.off('keydown-S', onDown)
      kb?.off('keydown-ENTER', onToggle); kb?.off('keydown-SPACE', onToggle)
      kb?.off('keydown-LEFT', onToggle); kb?.off('keydown-RIGHT', onToggle)
      objs.forEach((ob) => ob.destroy())
    },
  }
}
