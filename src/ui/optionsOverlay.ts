import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import {
  dsText, makeBackButton, makeIconTile, primitive, hex, semantic,
} from './ds'

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
 * Tela OPTIONS — refeita no estilo das demais telas de menu (Top 10 / How to
 * Play): título dourado + estrelas no topo, botão VOLTAR animado no canto, rows
 * centrais maiores com switch (verde ON / cinza OFF). Escopo: MÚSICA / EFEITOS /
 * TELA CHEIA (persistem via SoundManager / ScaleManager).
 *
 * Cobertura 100%: a Intro tem o fundo (vídeo/PNG) numa camada DOM full-viewport
 * ATRÁS do canvas. Em telas ultrawide o canvas fica letterboxed, então um scrim
 * só no canvas deixaria as laterais do vídeo visíveis. Usamos DOIS scrims: um
 * `<div>` DOM full-viewport (cobre laterais + fundo) + um rectangle no canvas
 * (escurece o menu da Intro, que vive no canvas). Ambos fecham ao clique.
 *
 * Navegável por teclado (↑↓/W/S, ENTER/SPACE/←/→ alterna) e mouse. Gerencia seu
 * próprio input e o remove no destroy. `onClose` fecha (scrim, VOLTAR ou ESC da cena).
 */
export function makeOptionsOverlay(
  scene: Phaser.Scene,
  opts: { onClose: () => void; depth?: number },
): OptionsOverlayHandle {
  const { width, height } = scene.scale
  const cx = width / 2
  const depth = opts.depth ?? 6000
  const objs: Array<{ destroy(): void }> = []

  // ── Véu de 100%: escurece as camadas DOM de fundo (full-viewport, cobrem 16:9
  // até ultrawide) diretamente via filtro brightness — uniforme e sem depender de
  // stacking de scrim sobre o canvas letterboxed. Restaurado no destroy. ──
  const bgLayerIds = ['scene-bg', 'intro-bg-video']
  const bgSaved = bgLayerIds.map((id) => {
    const el = document.getElementById(id)
    const prev = el?.style.filter ?? ''
    if (el) el.style.filter = 'brightness(0.12)'
    return { el, prev }
  })

  // ── Captador de clique no canvas (transparente) — fecha ao clicar fora do painel.
  // A cena oculta o menu da Intro enquanto Options está aberto. ──
  const scrim = scene.add.rectangle(cx, height / 2, width, height, primitive.black, 0)
    .setScrollFactor(0).setDepth(depth).setInteractive()
  scrim.on('pointerdown', () => opts.onClose())
  objs.push(scrim)

  // ── Título "OPTIONS" + estrelas (mesmo padrão do Top 10) ──
  const title = dsText(scene, cx, 84, 'OPTIONS', { role: 'title', color: 'textBrand', origin: [0.5, 0] })
    .setDepth(depth + 2).setScrollFactor(0)
  objs.push(title)
  const titleGlow = dsText(scene, cx, 84, 'OPTIONS', { role: 'title', color: 'textBrand', origin: [0.5, 0] })
    .setDepth(depth + 1).setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0)
  scene.tweens.add({ targets: titleGlow, alpha: 0.45, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
  objs.push(titleGlow)
  const titleCY = 84 + title.height / 2
  const starGap = title.width / 2 + 46
  for (const sx of [cx - starGap, cx + starGap]) {
    if (scene.textures.exists('ic-star')) {
      objs.push(makeIconTile(scene, { x: sx, y: titleCY, texture: 'ic-star', size: 40, depth: depth + 2, glow: true }))
    }
  }

  // ── Botão VOLTAR animado (canto superior esquerdo) ──
  const backBtn = makeBackButton(scene, {
    x: 64, y: 64, label: 'VOLTAR', role: 'h3', depth: depth + 2,
    onClick: () => opts.onClose(),
  })
  objs.push(backBtn)

  // ── Rows (MÚSICA / EFEITOS / TELA CHEIA) centradas ──
  let focus = 0
  const ROW_W = 760
  const ROW_H = 84
  const ROW_PITCH = 112
  const ROW_TOP = height / 2 - ROW_PITCH   // 3 rows centradas verticalmente
  const LABEL_X = cx - ROW_W / 2 + 36
  const CHIP_X = cx + ROW_W / 2 - 92
  const CHIP_W = 112
  const CHIP_H = 52

  const defs: { label: string; get: () => boolean; set: (v: boolean) => void }[] = [
    { label: 'MÚSICA',     get: () => sound.isMusicEnabled(), set: (v) => sound.setMusicEnabled(v) },
    { label: 'EFEITOS',    get: () => sound.isSfxEnabled(),   set: (v) => sound.setSfxEnabled(v) },
    { label: 'TELA CHEIA', get: () => scene.scale.isFullscreen, set: () => { try { scene.scale.toggleFullscreen() } catch { /* fullscreen indisponível */ } } },
  ]

  const rows: ToggleRow[] = defs.map((d, i) => {
    const y = ROW_TOP + i * ROW_PITCH
    const rowBg = scene.add.rectangle(cx, y, ROW_W, ROW_H, primitive.night, 0.62)
      .setStrokeStyle(3, primitive.goldBrand, 1).setDepth(depth + 2).setScrollFactor(0)
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
    dsText(scene, cx, ROW_TOP + 2 * ROW_PITCH + 96, '↑↓ navegar    ENTER alterna    ESC voltar', {
      role: 'caption', color: 'textSecondary', origin: [0.5, 0.5],
    }).setDepth(depth + 3).setScrollFactor(0),
  )

  function refresh(): void {
    rows.forEach((r, i) => {
      const focused = i === focus
      const on = r.get()
      r.rowBg.setStrokeStyle(focused ? 4 : 3, focused ? primitive.goldHi : primitive.goldBrand, 1)
      r.labelText.setColor(hex(focused ? semantic.textBrand : semantic.textPrimary))
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
      bgSaved.forEach(({ el, prev }) => { if (el) el.style.filter = prev })
      objs.forEach((ob) => ob.destroy())
    },
  }
}
