// Asset manifest split into two phases (Codex #11 — boot was eager-loading ~150 assets
// before the PLAY gate, so time-to-title was dominated by gameplay-only sprites/audio).
//
//  • loadCriticalAssets  — intro + title + menu icons + Select art + How-to-Play.
//    Loaded in BootScene; gates the PLAY button. Small + fast.
//  • loadGameplayAssets  — every character/enemy/boss spritesheet, combat SFX, gameplay
//    backgrounds/video, HUD portraits and gameplay BGM. The bulk of the bytes. Loaded in
//    GameScene.preload (and AnimTestScene), so it no longer blocks reaching the title.
//
// Both are idempotent: each load is guarded by a cache-existence check, so calling a phase
// twice (or re-entering a scene) never re-fetches an already-cached asset.

import Phaser from 'phaser'
import { isNativeApp } from '../utils/iosVideo'

type Scene = Phaser.Scene

const img = (s: Scene, key: string, url: string) => {
  if (!s.textures.exists(key)) s.load.image(key, url)
}
const sheet = (
  s: Scene, key: string, url: string,
  cfg: Phaser.Types.Loader.FileTypes.ImageFrameConfig,
) => {
  if (!s.textures.exists(key)) s.load.spritesheet(key, url, cfg)
}
const audio = (s: Scene, key: string, url: string) => {
  if (!s.cache.audio.exists(key)) s.load.audio(key, url)
}
const video = (s: Scene, key: string, url: string) => {
  if (!s.cache.video.exists(key)) s.load.video(key, url, true)
}

/** Intro + title + menus. Gates PLAY. */
export function loadCriticalAssets(s: Scene): void {
  // No app nativo, vídeos de fundo usam <video> DOM real atrás do canvas.
  if (!isNativeApp()) video(s, 'intro-video', 'videos/intro.mp4')

  // Intro
  img(s, 'logo-novo', 'imgs/elementos/logo-novo.png')
  img(s, 'intro-bg',  'imgs/cenario/intro-bg.png')

  // How to Play (alcançável direto do título): arte completa do conceito.
  img(s, 'how-to-play-full', 'imgs/cenario/how-to-play-full.png')

  // Ícones premium de UI (consumidos pelos componentes DS em todos os menus).
  for (const k of [
    'shield', 'joystick', 'fist', 'boot', 'pause', 'speaker', 'globe', 'bolt', 'hourglass', 'lock',
    'trophy', 'star', 'gear', 'medal-gold', 'medal-silver', 'medal-bronze',
    'arrow-down',
  ] as const) {
    img(s, `ic-${k}`, `imgs/ui/ic-${k}.png`)
  }

  // Tela de título
  img(s, 'logo',      'imgs/elementos/logo.png')
  img(s, 'good-guys', 'imgs/elementos/good-guys.png')
  img(s, 'bad-guys',  'imgs/elementos/bad-guys.png')

  // Tela de seleção (perfis, rollovers, side-views, retrato do Wand).
  img(s, 'wand-portrait',   'imgs/personagens/wand-portrait.png')
  img(s, 'werdum-perfil',   'imgs/elementos/werdum-perfil.png')
  img(s, 'dida-perfil',     'imgs/elementos/dida-perfil.png')
  img(s, 'thor-perfil',     'imgs/elementos/thor-perfil.png')
  img(s, 'wand-perfil',     'imgs/elementos/wand-perfil.png')
  img(s, 'werdum-rollover', 'imgs/elementos/werdum-rollover.png')
  img(s, 'dida-rollover',   'imgs/elementos/dida-rollover.png')
  img(s, 'thor-rollover',   'imgs/elementos/thor-rollover.png')
  img(s, 'werdum-sv', 'imgs/personagens/werdum_sideview.png')
  img(s, 'dida-sv',   'imgs/personagens/dida-sideview.png')
  img(s, 'thor-sv',   'imgs/personagens/thor-sideview.png')

  // Música da intro
  audio(s, 'bgm-intro', 'audio/music/intro.mp3')
}

/** Tudo que só é usado no gameplay (GameScene/AnimTest). O grosso dos bytes. */
export function loadGameplayAssets(s: Scene): void {
  // ── Cenários de jogo ──────────────────────────────────────────────────────────
  img(s, 'arena',          'imgs/cenario/real.png')
  img(s, 'sem-crowd',      'imgs/cenario/sem-crowd.png')
  img(s, 'bg-cachorradas', 'imgs/cenario/cachorradas.png')
  img(s, 'game-bg',        'imgs/cenario/game-bg.png')
  img(s, 'game-bg-ringue', 'imgs/cenario/bg-ringue.png')
  img(s, 'game-cordas',    'imgs/cenario/cenario-cordas.png')
  if (!isNativeApp()) video(s, 'game-bg-video', 'videos/br-ringue.mp4')
  img(s, 'arena-cameras',  'imgs/cenario/arena-premium-front.png')
  img(s, 'cam-left-sheet',  'imgs/cenario/cam-left-sheet.png')
  img(s, 'cam-right-sheet', 'imgs/cenario/cam-right-sheet.png')

  // ── Retratos do HUD ─────────────────────────────────────────────────────────
  img(s, 'hud-werdum', 'imgs/personagens/hud-werdum.png')
  img(s, 'hud-dida',   'imgs/personagens/hud-dida.png')
  img(s, 'hud-thor',   'imgs/personagens/hud-thor.png')
  img(s, 'hud-wand',   'imgs/personagens/hud-wand.png')

  // ── Werdum ────────────────────────────────────────────────────────────────────
  sheet(s, 'werdum-idle-sheet',      'sprites/werdum/werdum-idle-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 7  })
  sheet(s, 'werdum-walk-sheet',       'sprites/werdum/werdum-walk-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'werdum-punch-sheet',     'sprites/werdum/werdum-punch-sheet.png',     { frameWidth: 320, frameHeight: 240, endFrame: 24 })
  sheet(s, 'werdum-kick-sheet',      'sprites/werdum/werdum-kick-sheet.png',      { frameWidth: 384, frameHeight: 240, endFrame: 13 })
  sheet(s, 'werdum-hit-sheet',       'sprites/werdum/werdum-hit-sheet.png',       { frameWidth: 224, frameHeight: 240, endFrame: 24 })
  sheet(s, 'werdum-block-sheet',     'sprites/werdum/werdum-block-padded-sheet.png', { frameWidth: 192, frameHeight: 240, endFrame: 24 })
  sheet(s, 'werdum-knockdown-sheet', 'sprites/werdum/werdum-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

  // ── Dida ────────────────────────────────────────────────────────────────────
  sheet(s, 'dida-idle-sheet',      'sprites/dida/dida-idle-sheet.png',      { frameWidth: 128, frameHeight: 240, endFrame: 35 })
  sheet(s, 'dida-walk-sheet',      'sprites/dida/dida-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 24 })
  sheet(s, 'dida-punch-sheet',     'sprites/dida/dida-punch-sheet.png',     { frameWidth: 160, frameHeight: 240, endFrame: 24 })
  sheet(s, 'dida-kick-sheet',      'sprites/dida/dida-kick-sheet.png',      { frameWidth: 192, frameHeight: 240, endFrame: 24 })
  sheet(s, 'dida-hit-sheet',       'sprites/dida/dida-hit-sheet.png',       { frameWidth: 224, frameHeight: 240, endFrame: 15 })
  sheet(s, 'dida-block-sheet',     'sprites/dida/dida-block-sheet.png',     { frameWidth: 96,  frameHeight: 240, endFrame: 8  })
  sheet(s, 'dida-knockdown-sheet', 'sprites/dida/dida-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

  // ── Wand ────────────────────────────────────────────────────────────────────
  img(s, 'wand',    'imgs/personagens/wand.png')
  img(s, 'wand-ko', 'imgs/personagens/wand-knockedout.png')

  // ── bad-guy1 ────────────────────────────────────────────────────────────────
  sheet(s, 'bad-guy1-idle-sheet',    'sprites/enemies/bad-guy1-idle-sheet.png',    { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'bad-guy1-walk-sheet',    'sprites/enemies/bad-guy1-walk-sheet.png',    { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'bad-guy1-punch-sheet',   'sprites/enemies/bad-guy1-punch-sheet.png',   { frameWidth: 192, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy1-kick-sheet',    'sprites/enemies/bad-guy1-kick-sheet.png',    { frameWidth: 224, frameHeight: 240, endFrame: 35 })
  sheet(s, 'bad-guy1-hit-sheet',       'sprites/enemies/bad-guy1-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy1-knockdown-sheet', 'sprites/enemies/bad-guy1-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

  // ── bad-guy2 ────────────────────────────────────────────────────────────────
  sheet(s, 'bad-guy2-idle-sheet',    'sprites/enemies/bad-guy2-idle-sheet.png',    { frameWidth: 160, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy2-walk-sheet',    'sprites/enemies/bad-guy2-walk-sheet.png',    { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'bad-guy2-punch-sheet',   'sprites/enemies/bad-guy2-punch-sheet.png',   { frameWidth: 192, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy2-kick-sheet',    'sprites/enemies/bad-guy2-kick-sheet.png',    { frameWidth: 224, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy2-hit-sheet',       'sprites/enemies/bad-guy2-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy2-knockdown-sheet', 'sprites/enemies/bad-guy2-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

  // ── bad-guy3 ────────────────────────────────────────────────────────────────
  sheet(s, 'bad-guy3-idle-sheet',      'sprites/enemies/bad-guy3-idle-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy3-walk-sheet',      'sprites/enemies/bad-guy3-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'bad-guy3-punch-sheet',     'sprites/enemies/bad-guy3-punch-sheet.png',     { frameWidth: 192, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy3-kick-sheet',      'sprites/enemies/bad-guy3-kick-sheet.png',      { frameWidth: 224, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy3-hit-sheet',       'sprites/enemies/bad-guy3-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'bad-guy3-knockdown-sheet', 'sprites/enemies/bad-guy3-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

  // ── bad-guy-fat ───────────────────────────────────────────────────────────────
  sheet(s, 'bad-guy-fat-idle-sheet',      'sprites/enemies/bad-guy-fat-idle-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy-fat-walk-sheet',      'sprites/enemies/bad-guy-fat-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'bad-guy-fat-punch-sheet',     'sprites/enemies/bad-guy-fat-punch-sheet.png',     { frameWidth: 192, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy-fat-kick-sheet',      'sprites/enemies/bad-guy-fat-kick-sheet.png',      { frameWidth: 224, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy-fat-hit-sheet',       'sprites/enemies/bad-guy-fat-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy-fat-knockdown-sheet', 'sprites/enemies/bad-guy-fat-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

  // ── bad-guy-strong ──────────────────────────────────────────────────────────
  sheet(s, 'bad-guy-strong-idle-sheet',      'sprites/enemies/bad-guy-strong-idle-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'bad-guy-strong-walk-sheet',      'sprites/enemies/bad-guy-strong-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'bad-guy-strong-punch-sheet',     'sprites/enemies/bad-guy-strong-punch-sheet.png',     { frameWidth: 192, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy-strong-kick-sheet',      'sprites/enemies/bad-guy-strong-kick-sheet.png',      { frameWidth: 224, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy-strong-hit-sheet',       'sprites/enemies/bad-guy-strong-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'bad-guy-strong-knockdown-sheet', 'sprites/enemies/bad-guy-strong-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

  // ── bad-guy-chair ─────────────────────────────────────────────────────────────
  sheet(s, 'bad-guy-chair-idle-sheet',      'sprites/enemies/bad-guy-chair-idle-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'bad-guy-chair-walk-sheet',      'sprites/enemies/bad-guy-chair-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'bad-guy-chair-punch-sheet',     'sprites/enemies/bad-guy-chair-punch-sheet.png',     { frameWidth: 320, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy-chair-kick-sheet',      'sprites/enemies/bad-guy-chair-kick-sheet.png',      { frameWidth: 256, frameHeight: 240, endFrame: 24 })
  sheet(s, 'bad-guy-chair-knockdown-sheet', 'sprites/enemies/bad-guy-chair-knockdown-sheet.png', { frameWidth: 224, frameHeight: 240, endFrame: 24 })

  // ── coco ──────────────────────────────────────────────────────────────────────
  sheet(s, 'coco-idle-sheet',      'sprites/bosses/coco-idle-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 24 })
  sheet(s, 'coco-walk-sheet',      'sprites/bosses/coco-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'coco-punch-sheet',     'sprites/bosses/coco-punch-sheet.png',     { frameWidth: 160, frameHeight: 240, endFrame: 24 })
  sheet(s, 'coco-kick-sheet',      'sprites/bosses/coco-kick-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 24 })
  sheet(s, 'coco-hit-sheet',       'sprites/bosses/coco-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'coco-knockdown-sheet', 'sprites/bosses/coco-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

  // ── son ───────────────────────────────────────────────────────────────────────
  sheet(s, 'son-idle-sheet',  'sprites/bosses/son-idle-sheet.png',  { frameWidth: 160, frameHeight: 240, endFrame: 24 })
  sheet(s, 'son-walk-sheet',  'sprites/bosses/son-walk-sheet.png',  { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'son-punch-sheet', 'sprites/bosses/son-punch-sheet.png', { frameWidth: 192, frameHeight: 240, endFrame: 24 })
  sheet(s, 'son-kick-sheet',  'sprites/bosses/son-kick-sheet.png',  { frameWidth: 224, frameHeight: 240, endFrame: 35 })
  sheet(s, 'son-hit-sheet',       'sprites/bosses/son-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'son-knockdown-sheet', 'sprites/bosses/son-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

  // ── coach ───────────────────────────────────────────────────────────────────
  sheet(s, 'coach-idle-sheet',  'sprites/bosses/coach-idle-sheet.png',  { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'coach-walk-sheet',  'sprites/bosses/coach-walk-sheet.png',  { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'coach-punch-sheet', 'sprites/bosses/coach-punch-sheet.png', { frameWidth: 192, frameHeight: 240, endFrame: 24 })
  sheet(s, 'coach-kick-sheet',  'sprites/bosses/coach-kick-sheet.png',  { frameWidth: 224, frameHeight: 240, endFrame: 24 })
  sheet(s, 'coach-hit-sheet',       'sprites/bosses/coach-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 24 })
  sheet(s, 'coach-knockdown-sheet', 'sprites/bosses/coach-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

  // ── Thor ────────────────────────────────────────────────────────────────────
  sheet(s, 'thor-idle-sheet',      'sprites/thor/thor-idle-sheet.png',      { frameWidth: 128, frameHeight: 240, endFrame: 35 })
  sheet(s, 'thor-walk-sheet',      'sprites/thor/thor-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
  sheet(s, 'thor-punch-sheet',     'sprites/thor/thor-punch-sheet.png',     { frameWidth: 192, frameHeight: 240, endFrame: 24 })
  sheet(s, 'thor-kick-sheet',      'sprites/thor/thor-kick-sheet.png',      { frameWidth: 224, frameHeight: 240, endFrame: 24 })
  sheet(s, 'thor-hit-sheet',       'sprites/thor/thor-hit-sheet.png',       { frameWidth: 224, frameHeight: 240, endFrame: 35 })
  sheet(s, 'thor-block-sheet',     'sprites/thor/thor-block-sheet.png',     { frameWidth: 160, frameHeight: 240, endFrame: 15 })
  sheet(s, 'thor-knockdown-sheet', 'sprites/thor/thor-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

  // ── Sons de combate — free-sfx (OpenGameArt CC0) ─────────────────────
  audio(s, 'sfx-punch-1', 'audio/free-sfx/swoosh-09.wav')
  audio(s, 'sfx-punch-2', 'audio/free-sfx/swoosh-02.wav')
  audio(s, 'sfx-punch-3', 'audio/free-sfx/swoosh-04.wav')
  audio(s, 'sfx-punch-4', 'audio/free-sfx/swoosh-25.wav')
  audio(s, 'sfx-kick-1', 'audio/free-sfx/swoosh-07.wav')
  audio(s, 'sfx-kick-2', 'audio/free-sfx/swoosh-21.wav')
  audio(s, 'sfx-kick-3', 'audio/free-sfx/swoosh-12.wav')
  audio(s, 'sfx-kick-4', 'audio/free-sfx/swoosh-17.wav')
  for (let i = 1; i <= 18; i++) {
    const n = String(i).padStart(2, '0')
    audio(s, `sfx-impact-${n}`, `audio/free-sfx/impact-${n}.ogg`)
  }
  audio(s, 'sfx-phit-1', 'audio/free-sfx/hit-09.wav')
  audio(s, 'sfx-phit-2', 'audio/free-sfx/hit-32.wav')
  audio(s, 'sfx-phit-3', 'audio/free-sfx/hit-25.wav')
  audio(s, 'sfx-phit-4', 'audio/free-sfx/hit-37.wav')
  audio(s, 'sfx-phit-5', 'audio/free-sfx/hit-12.wav')
  audio(s, 'sfx-edeath-1', 'audio/free-sfx/hit-23.wav')
  audio(s, 'sfx-edeath-2', 'audio/free-sfx/hit-26.wav')
  audio(s, 'sfx-edeath-3', 'audio/free-sfx/hit-31.wav')
  audio(s, 'sfx-edeath-4', 'audio/free-sfx/hit-36.wav')
  audio(s, 'sfx-bdeath-1', 'audio/free-sfx/hit-01.wav')
  audio(s, 'sfx-bdeath-2', 'audio/free-sfx/hit-03.wav')
  audio(s, 'sfx-bdeath-3', 'audio/free-sfx/hit-07.wav')
  audio(s, 'sfx-ko',   'audio/free-sfx/hit-08.wav')
  audio(s, 'sfx-fall', 'audio/free-sfx/fall.wav')

  // ── Especiais Deadly Kombat (uso futuro) ──
  audio(s, 'sfx-fire-punch',   'audio/fire_punch_02.wav')
  audio(s, 'sfx-fire-fin',     'audio/fire_punch_finisher_06.wav')
  audio(s, 'sfx-metal-punch',  'audio/metal_punch_06.wav')
  audio(s, 'sfx-metal-fin',    'audio/metal_punch_finisher_07.wav')
  audio(s, 'sfx-wood-bat-1',   'audio/wood_bat_finisher_01.wav')
  audio(s, 'sfx-wood-bat-2',   'audio/wood_bat_finisher_05.wav')
  audio(s, 'sfx-blade-1',      'audio/blade_hit_07.wav')
  audio(s, 'sfx-blade-2',      'audio/blade_hit_08.wav')
  audio(s, 'sfx-somersault-1', 'audio/somersault_01.wav')
  audio(s, 'sfx-somersault-2', 'audio/somersault_10.wav')

  // ── Música de gameplay ──
  audio(s, 'bgm-gameplay', 'audio/music/game-play.mp3')
}
