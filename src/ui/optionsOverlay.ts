import type Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { dsText, makeAngledPanel, primitive, overlayAlpha, hex, semantic, type SemanticColorId } from './ds'

export interface OptionsOverlayHandle { destroy(): void }

interface ToggleRow {
  label: string
  get: () => boolean
  toggle: () => void
  labelText: Phaser.GameObjects.Text
  valueText: Phaser.GameObjects.Text
  hit: Phaser.GameObjects.Rectangle
}

/**
 * Tela OPTIONS interativa (escopo: MÚSICA / EFEITOS / TELA CHEIA). Música e SFX
 * persistem em localStorage via SoundManager; tela cheia usa o ScaleManager do
 * Phaser. Navegável por teclado (↑↓/W/S, ENTER/SPACE/←/→ alterna) e mouse
 * (hover foca, clique alterna; clique no scrim fecha). Gerencia seu próprio
 * input e o remove no destroy. `onClose` é disparado por clique no scrim — o
 * ESC continua sendo tratado pela cena dona (TitleScene).
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

  const pw = 820
  const ph = 470
  objs.push(makeAngledPanel(scene, {
    x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph, variant: 'filled', depth: depth + 1,
  }))

  objs.push(
    dsText(scene, cx, cy - ph / 2 + 64, 'OPTIONS', { role: 'title', color: 'textBrand', origin: [0.5, 0.5] })
      .setDepth(depth + 2).setScrollFactor(0),
  )

  let focus = 0
  const ROW_PITCH = 78
  const ROW_TOP = cy - 70
  const LABEL_X = cx - 280
  const VALUE_X = cx + 280

  const defs: { label: string; get: () => boolean; set: (v: boolean) => void }[] = [
    { label: 'MÚSICA',     get: () => sound.isMusicEnabled(), set: (v) => sound.setMusicEnabled(v) },
    { label: 'EFEITOS',    get: () => sound.isSfxEnabled(),   set: (v) => sound.setSfxEnabled(v) },
    { label: 'TELA CHEIA', get: () => scene.scale.isFullscreen, set: () => { try { scene.scale.toggleFullscreen() } catch { /* fullscreen indisponível */ } } },
  ]

  const rows: ToggleRow[] = defs.map((d, i) => {
    const y = ROW_TOP + i * ROW_PITCH
    const labelText = dsText(scene, LABEL_X, y, d.label, { role: 'h3', color: 'textPrimary', origin: [0, 0.5] })
      .setDepth(depth + 2).setScrollFactor(0)
    const valueText = dsText(scene, VALUE_X, y, '', { role: 'h3', color: 'textPrimary', origin: [1, 0.5] })
      .setDepth(depth + 2).setScrollFactor(0)
    const hit = scene.add.rectangle(cx, y, pw - 120, ROW_PITCH - 12, 0x000000, 0)
      .setDepth(depth + 2).setScrollFactor(0).setInteractive({ useHandCursor: true })
    objs.push(labelText, valueText, hit)
    const row: ToggleRow = {
      label: d.label,
      get: d.get,
      toggle: () => { d.set(!d.get()); refresh() },
      labelText, valueText, hit,
    }
    hit.on('pointerover', () => setFocus(i))
    hit.on('pointerdown', () => { setFocus(i); row.toggle(); sound.select() })
    return row
  })

  objs.push(
    dsText(scene, cx, cy + ph / 2 - 44, '↑↓ navegar   ENTER alterna   ESC voltar', {
      role: 'caption', color: 'textSecondary', origin: [0.5, 0.5],
    }).setDepth(depth + 2).setScrollFactor(0),
  )

  function refresh(): void {
    rows.forEach((r, i) => {
      const focused = i === focus
      const on = r.get()
      const labelColor: SemanticColorId = focused ? 'textBrand' : 'textPrimary'
      const valueColor: SemanticColorId = on ? 'feedbackOk' : 'textMuted'
      r.labelText.setText(focused ? `▸ ${r.label}` : r.label).setColor(colorHex(labelColor))
      r.valueText.setText(on ? 'ON' : 'OFF').setColor(colorHex(valueColor))
    })
  }

  function setFocus(i: number): void {
    if (i === focus) return
    focus = i
    sound.hover()
    refresh()
  }

  // dsText sets color via semantic id; for live re-color we resolve the same
  // semantic token to a CSS hex string (Phaser's Text.setColor needs a string).
  function colorHex(id: SemanticColorId): string {
    return hex(semantic[id])
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
