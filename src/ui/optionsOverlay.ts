import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import {
  dsText, makeBackButton, makeIconTile, primitive, hex, semantic,
} from './ds'
import { t, getLocale, setLocale, type Locale } from '../i18n'

export interface OptionsOverlayHandle { destroy(): void }

interface Row {
  rowBg: Phaser.GameObjects.Rectangle
  labelText: Phaser.GameObjects.Text
  hit: Phaser.GameObjects.Rectangle
  /** ENTER / clique na row. */
  activate: () => void
  /** ←/→ na row focada (opcional). */
  onArrow?: (dir: 1 | -1) => void
  /** Toggle rows atualizam o chip ao mudar de estado. */
  refreshChip?: () => void
}

// Idiomas na ordem de exibição pedida: [EN][ES][PT].
const LANG_ORDER: Locale[] = ['en', 'es', 'pt']

/**
 * Tela OPTIONS — refeita no estilo das demais telas de menu (Top 10 / How to
 * Play): título dourado + estrelas no topo, botão VOLTAR animado no canto, rows
 * centrais maiores. Escopo: MÚSICA / EFEITOS / TELA CHEIA (switch verde ON / cinza
 * OFF) + IDIOMA (3 botões [EN][ES][PT] lado a lado; o ativo fica destacado, clicar
 * troca e reinicia a cena para re-renderizar todo o texto no novo idioma).
 *
 * Cobertura 100%: a Intro tem o fundo (vídeo/PNG) numa camada DOM full-viewport
 * ATRÁS do canvas. Em telas ultrawide o canvas fica letterboxed, então um scrim
 * só no canvas deixaria as laterais do vídeo visíveis. Escurecemos as camadas DOM
 * via filtro brightness (restaurado no destroy) + um scrim no canvas que fecha ao clique.
 *
 * Navegável por teclado (↑↓/W/S move rows; ENTER/SPACE ativa; ←/→ alterna toggle ou
 * troca idioma) e mouse. Gerencia seu próprio input e o remove no destroy.
 */
export function makeOptionsOverlay(
  scene: Phaser.Scene,
  opts: { onClose: () => void; depth?: number },
): OptionsOverlayHandle {
  const { width, height } = scene.scale
  const cx = width / 2
  const depth = opts.depth ?? 6000
  const objs: Array<{ destroy(): void }> = []

  // ── Véu de 100%: escurece as camadas DOM de fundo (full-viewport). Restaurado no destroy. ──
  const bgLayerIds = ['scene-bg', 'intro-bg-video']
  const bgSaved = bgLayerIds.map((id) => {
    const el = document.getElementById(id)
    const prev = el?.style.filter ?? ''
    if (el) el.style.filter = 'brightness(0.12)'
    return { el, prev }
  })

  // ── Captador de clique no canvas (transparente) — fecha ao clicar fora do painel. ──
  const scrim = scene.add.rectangle(cx, height / 2, width, height, primitive.black, 0)
    .setScrollFactor(0).setDepth(depth).setInteractive()
  scrim.on('pointerdown', () => opts.onClose())
  objs.push(scrim)

  // ── Título "OPTIONS" + estrelas ──
  const title = dsText(scene, cx, 84, t('menu.options'), { role: 'title', color: 'textBrand', origin: [0.5, 0] })
    .setDepth(depth + 2).setScrollFactor(0)
  objs.push(title)
  const titleGlow = dsText(scene, cx, 84, t('menu.options'), { role: 'title', color: 'textBrand', origin: [0.5, 0] })
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

  // ── Botão VOLTAR animado ──
  const backBtn = makeBackButton(scene, {
    x: 64, y: 64, label: t('common.back'), role: 'h3', depth: depth + 2,
    onClick: () => opts.onClose(),
  })
  objs.push(backBtn)

  // ── Aplica um idioma: persiste + reinicia a cena (rebuild no novo idioma). Clicar
  // no idioma já ativo é no-op (só feedback). O onClose restaura o filtro antes do restart. ──
  function applyLocale(loc: Locale): void {
    if (loc === getLocale()) { sound.hover(); return }
    setLocale(loc)
    sound.select()
    opts.onClose()
    scene.scene.restart()
  }
  function stepLocale(dir: 1 | -1): void {
    const idx = LANG_ORDER.indexOf(getLocale())
    applyLocale(LANG_ORDER[(idx + dir + LANG_ORDER.length) % LANG_ORDER.length])
  }

  // ── Layout das rows ──
  let focus = 0
  const ROW_W = 760
  const ROW_H = 84
  const ROW_PITCH = 108
  const LABEL_X = cx - ROW_W / 2 + 36
  const CHIP_X = cx + ROW_W / 2 - 92
  const CHIP_W = 112
  const CHIP_H = 52

  const N_ROWS = 4
  const ROW_TOP = height / 2 - ((N_ROWS - 1) / 2) * ROW_PITCH

  const rows: Row[] = []

  // Fundo + label + hit comuns de uma row.
  function makeRowBase(i: number, label: string) {
    const y = ROW_TOP + i * ROW_PITCH
    const rowBg = scene.add.rectangle(cx, y, ROW_W, ROW_H, primitive.night, 0.62)
      .setStrokeStyle(3, primitive.goldBrand, 1).setDepth(depth + 2).setScrollFactor(0)
    const labelText = dsText(scene, LABEL_X, y, label, { role: 'h3', color: 'textPrimary', origin: [0, 0.5] })
      .setDepth(depth + 3).setScrollFactor(0)
    const hit = scene.add.rectangle(cx, y, ROW_W, ROW_H, 0x000000, 0)
      .setDepth(depth + 4).setScrollFactor(0).setInteractive({ useHandCursor: true })
    objs.push(rowBg, labelText, hit)
    return { y, rowBg, labelText, hit }
  }

  // ── 3 toggle rows (MÚSICA / EFEITOS / TELA CHEIA) ──
  const toggleDefs: { label: string; isOn: () => boolean; toggle: () => void }[] = [
    { label: t('options.music'), isOn: () => sound.isMusicEnabled(), toggle: () => sound.setMusicEnabled(!sound.isMusicEnabled()) },
    { label: t('options.sfx'), isOn: () => sound.isSfxEnabled(), toggle: () => sound.setSfxEnabled(!sound.isSfxEnabled()) },
    { label: t('options.fullscreen'), isOn: () => scene.scale.isFullscreen, toggle: () => { try { scene.scale.toggleFullscreen() } catch { /* indisponível */ } } },
  ]
  toggleDefs.forEach((d, i) => {
    const { y, rowBg, labelText, hit } = makeRowBase(i, d.label)
    const chip = scene.add.rectangle(CHIP_X, y, CHIP_W, CHIP_H, primitive.gray33)
      .setStrokeStyle(3, primitive.black).setDepth(depth + 3).setScrollFactor(0)
    const chipText = dsText(scene, CHIP_X, y, d.isOn() ? t('options.on') : t('options.off'), { role: 'small', color: 'ink', origin: [0.5, 0.5] })
      .setDepth(depth + 4).setScrollFactor(0)
    objs.push(chip, chipText)
    const refreshChip = () => {
      chip.setFillStyle(d.isOn() ? primitive.greenOk : primitive.gray33)
      chipText.setText(d.isOn() ? t('options.on') : t('options.off')).setColor(hex(semantic.ink))
    }
    const activate = () => { d.toggle(); sound.select(); refreshChip() }
    hit.on('pointerover', () => setFocus(i))
    hit.on('pointerdown', () => { setFocus(i); activate() })
    rows.push({ rowBg, labelText, hit, activate, onArrow: activate, refreshChip })
  })

  // ── Row de IDIOMA: 3 botões [EN][ES][PT] lado a lado, destacando o ativo ──
  {
    const i = 3
    const { y, rowBg, labelText, hit } = makeRowBase(i, t('options.language'))
    hit.on('pointerover', () => setFocus(i))   // a row só capta foco; o clique é nos botões

    const LANG_BW = 78, LANG_BH = 52, LANG_GAP = 12
    const groupW = LANG_ORDER.length * LANG_BW + (LANG_ORDER.length - 1) * LANG_GAP
    const groupLeft = (cx + ROW_W / 2 - 36) - groupW
    LANG_ORDER.forEach((loc, k) => {
      const bx = groupLeft + LANG_BW / 2 + k * (LANG_BW + LANG_GAP)
      const active = loc === getLocale()
      const bg = scene.add.rectangle(bx, y, LANG_BW, LANG_BH, active ? primitive.goldBrand : primitive.night, active ? 1 : 0.9)
        .setStrokeStyle(active ? 3 : 2, active ? primitive.goldHi : primitive.steel)
        .setDepth(depth + 3).setScrollFactor(0)
      const txt = dsText(scene, bx, y, loc.toUpperCase(), { role: 'small', color: active ? 'ink' : 'textSecondary', origin: [0.5, 0.5] })
        .setDepth(depth + 4).setScrollFactor(0)
      const bhit = scene.add.rectangle(bx, y, LANG_BW, LANG_BH, 0x000000, 0)
        .setDepth(depth + 5).setScrollFactor(0).setInteractive({ useHandCursor: true })
      bhit.on('pointerover', () => { setFocus(i); if (!active) bg.setStrokeStyle(3, primitive.goldHi) })
      bhit.on('pointerout', () => { if (!active) bg.setStrokeStyle(2, primitive.steel) })
      bhit.on('pointerdown', () => { setFocus(i); applyLocale(loc) })
      objs.push(bg, txt, bhit)
    })

    rows.push({ rowBg, labelText, hit, activate: () => stepLocale(1), onArrow: (dir) => stepLocale(dir) })
  }

  // ── Hint de navegação ──
  objs.push(
    dsText(scene, cx, ROW_TOP + N_ROWS * ROW_PITCH - 12, t('options.navHint'), {
      role: 'caption', color: 'textSecondary', origin: [0.5, 0.5],
    }).setDepth(depth + 3).setScrollFactor(0),
  )

  function refresh(): void {
    rows.forEach((r, i) => {
      const focused = i === focus
      r.rowBg.setStrokeStyle(focused ? 4 : 3, focused ? primitive.goldHi : primitive.goldBrand, 1)
      r.labelText.setColor(hex(focused ? semantic.textBrand : semantic.textPrimary))
      r.refreshChip?.()
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
  const onEnter = () => rows[focus].activate()
  const onLeft = () => rows[focus].onArrow?.(-1)
  const onRight = () => rows[focus].onArrow?.(1)
  kb?.on('keydown-UP', onUp); kb?.on('keydown-W', onUp)
  kb?.on('keydown-DOWN', onDown); kb?.on('keydown-S', onDown)
  kb?.on('keydown-ENTER', onEnter); kb?.on('keydown-SPACE', onEnter)
  kb?.on('keydown-LEFT', onLeft); kb?.on('keydown-RIGHT', onRight)

  refresh()

  return {
    destroy: () => {
      kb?.off('keydown-UP', onUp); kb?.off('keydown-W', onUp)
      kb?.off('keydown-DOWN', onDown); kb?.off('keydown-S', onDown)
      kb?.off('keydown-ENTER', onEnter); kb?.off('keydown-SPACE', onEnter)
      kb?.off('keydown-LEFT', onLeft); kb?.off('keydown-RIGHT', onRight)
      bgSaved.forEach(({ el, prev }) => { if (el) el.style.filter = prev })
      objs.forEach((ob) => ob.destroy())
    },
  }
}
