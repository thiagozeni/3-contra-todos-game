import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { gameCenter } from '../systems/GameCenterBridge'
import { isNativeApp } from '../utils/iosVideo'
import { NET_ENABLED } from '../net/flags'
import { ADS_ENABLED } from '../ads/buildFlavor'
import { createAdService } from '../ads/AdService'
import { initialCadenceState } from '../ads/interstitialCadence'
import { parseInviteCode } from '../net/inviteLink'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    // Atualiza barra de progresso HTML
    const loaderBar = document.getElementById('loader-bar')
    const loaderPct = document.getElementById('loader-pct')
    this.load.on('progress', (v: number) => {
      const pct = Math.round(v * 100)
      if (loaderBar) loaderBar.style.width = `${pct}%`
      if (loaderPct) loaderPct.textContent = `${pct}%`
    })

    // No app nativo, vídeos de fundo usam <video> DOM real atrás do canvas.
    // Carregamos Phaser Video apenas na web, evitando a rota WebGL instável no WKWebView.
    if (!isNativeApp()) this.load.video('intro-video', 'videos/intro.mp4', true)

    // Logo da intro
    this.load.image('logo-novo', 'imgs/elementos/logo-novo.png')

    // Cenários
    this.load.image('intro-bg',         'imgs/cenario/intro-bg.png')
    this.load.image('arena',            'imgs/cenario/real.png')
    this.load.image('sem-crowd',        'imgs/cenario/sem-crowd.png')
    this.load.image('bg-cachorradas',   'imgs/cenario/cachorradas.png')
    this.load.image('game-bg',          'imgs/cenario/game-bg.png')
    this.load.image('game-bg-ringue',   'imgs/cenario/bg-ringue.png')
    this.load.image('game-cordas',      'imgs/cenario/cenario-cordas.png')
    if (!isNativeApp()) this.load.video('game-bg-video', 'videos/br-ringue.mp4', true)
    // Arena premium v2 (conceito GPT): #arena-bg (fundo+ringue) segue via DOM/CSS no GameScene;
    // a camada de câmeras (frente, profundidade) vira sprite Phaser p/ ficar ABAIXO do HUD.
    this.load.image('arena-cameras', 'imgs/cenario/arena-premium-front.png')

    // How to Play: arte completa do conceito (painéis + ícones + keycaps + missão).
    this.load.image('how-to-play-full', 'imgs/cenario/how-to-play-full.png')
    // 'arena-still'/'select-player-bg' (texturas Phaser) removidas: as telas de menu agora
    // usam a camada DOM #scene-bg (carrega os PNGs por HTTP, não pelo loader do Phaser).

    // Assets da tela de título
    this.load.image('logo',            'imgs/elementos/logo.png')
    this.load.image('good-guys',       'imgs/elementos/good-guys.png')
    this.load.image('bad-guys',        'imgs/elementos/bad-guys.png')
    // 'good-guys-loose'/'good-guys-win' removidos: as artes game-over/you-win
    // superwide já trazem os personagens embutidos (#scene-bg).

    // Retratos usados no HUD
    this.load.image('hud-werdum',  'imgs/personagens/hud-werdum.png')
    this.load.image('hud-dida',    'imgs/personagens/hud-dida.png')
    this.load.image('hud-thor',    'imgs/personagens/hud-thor.png')
    this.load.image('hud-wand',    'imgs/personagens/hud-wand.png')
    this.load.image('wand-portrait', 'imgs/personagens/wand-portrait.png')

    // Perfis e rollovers — tela de seleção
    this.load.image('werdum-perfil',   'imgs/elementos/werdum-perfil.png')
    this.load.image('dida-perfil',     'imgs/elementos/dida-perfil.png')
    this.load.image('thor-perfil',     'imgs/elementos/thor-perfil.png')
    this.load.image('wand-perfil',     'imgs/elementos/wand-perfil.png')
    this.load.image('werdum-rollover', 'imgs/elementos/werdum-rollover.png')
    this.load.image('dida-rollover',   'imgs/elementos/dida-rollover.png')
    this.load.image('thor-rollover',   'imgs/elementos/thor-rollover.png')

    // Side-views para a tela de seleção (preview grande à esquerda)
    this.load.image('werdum-sv', 'imgs/personagens/werdum_sideview.png')
    this.load.image('dida-sv',   'imgs/personagens/dida-sideview.png')
    this.load.image('thor-sv',   'imgs/personagens/thor-sideview.png')

    // Spritesheets animados do Werdum
    this.load.spritesheet('werdum-idle-sheet',      'sprites/werdum/werdum-idle-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 7  })
    this.load.spritesheet('werdum-walk-sheet',       'sprites/werdum/werdum-walk-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('werdum-punch-sheet',     'sprites/werdum/werdum-punch-sheet.png',     { frameWidth: 320, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('werdum-kick-sheet',      'sprites/werdum/werdum-kick-sheet.png',      { frameWidth: 384, frameHeight: 240, endFrame: 13 })
    this.load.spritesheet('werdum-hit-sheet',       'sprites/werdum/werdum-hit-sheet.png',       { frameWidth: 224, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('werdum-block-sheet',     'sprites/werdum/werdum-block-padded-sheet.png', { frameWidth: 192, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('werdum-knockdown-sheet', 'sprites/werdum/werdum-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

    // Spritesheets animados do Dida
    this.load.spritesheet('dida-idle-sheet',      'sprites/dida/dida-idle-sheet.png',      { frameWidth: 128, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('dida-walk-sheet',      'sprites/dida/dida-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('dida-punch-sheet',     'sprites/dida/dida-punch-sheet.png',     { frameWidth: 160, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('dida-kick-sheet',      'sprites/dida/dida-kick-sheet.png',      { frameWidth: 192, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('dida-hit-sheet',       'sprites/dida/dida-hit-sheet.png',       { frameWidth: 224, frameHeight: 240, endFrame: 15 })
    this.load.spritesheet('dida-block-sheet',     'sprites/dida/dida-block-sheet.png',     { frameWidth: 96,  frameHeight: 240, endFrame: 8  })
    this.load.spritesheet('dida-knockdown-sheet', 'sprites/dida/dida-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

    // Wand
    this.load.image('wand',    'imgs/personagens/wand.png')
    this.load.image('wand-ko', 'imgs/personagens/wand-knockedout.png')

    // Spritesheets animados — bad-guy1
    this.load.spritesheet('bad-guy1-idle-sheet',    'sprites/enemies/bad-guy1-idle-sheet.png',    { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('bad-guy1-walk-sheet',    'sprites/enemies/bad-guy1-walk-sheet.png',    { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('bad-guy1-punch-sheet',   'sprites/enemies/bad-guy1-punch-sheet.png',   { frameWidth: 192, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy1-kick-sheet',    'sprites/enemies/bad-guy1-kick-sheet.png',    { frameWidth: 224, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('bad-guy1-hit-sheet',       'sprites/enemies/bad-guy1-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy1-knockdown-sheet', 'sprites/enemies/bad-guy1-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

    // Spritesheets animados — bad-guy2
    this.load.spritesheet('bad-guy2-idle-sheet',    'sprites/enemies/bad-guy2-idle-sheet.png',    { frameWidth: 160, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy2-walk-sheet',    'sprites/enemies/bad-guy2-walk-sheet.png',    { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('bad-guy2-punch-sheet',   'sprites/enemies/bad-guy2-punch-sheet.png',   { frameWidth: 192, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy2-kick-sheet',    'sprites/enemies/bad-guy2-kick-sheet.png',    { frameWidth: 224, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy2-hit-sheet',       'sprites/enemies/bad-guy2-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy2-knockdown-sheet', 'sprites/enemies/bad-guy2-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

    // Spritesheets animados — bad-guy3
    this.load.spritesheet('bad-guy3-idle-sheet',      'sprites/enemies/bad-guy3-idle-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy3-walk-sheet',      'sprites/enemies/bad-guy3-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('bad-guy3-punch-sheet',     'sprites/enemies/bad-guy3-punch-sheet.png',     { frameWidth: 192, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy3-kick-sheet',      'sprites/enemies/bad-guy3-kick-sheet.png',      { frameWidth: 224, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy3-hit-sheet',       'sprites/enemies/bad-guy3-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('bad-guy3-knockdown-sheet', 'sprites/enemies/bad-guy3-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

    // Spritesheets animados — bad-guy-fat
    this.load.spritesheet('bad-guy-fat-idle-sheet',      'sprites/enemies/bad-guy-fat-idle-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy-fat-walk-sheet',      'sprites/enemies/bad-guy-fat-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('bad-guy-fat-punch-sheet',     'sprites/enemies/bad-guy-fat-punch-sheet.png',     { frameWidth: 192, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy-fat-kick-sheet',      'sprites/enemies/bad-guy-fat-kick-sheet.png',      { frameWidth: 224, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy-fat-hit-sheet',       'sprites/enemies/bad-guy-fat-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy-fat-knockdown-sheet', 'sprites/enemies/bad-guy-fat-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

    // Spritesheets animados — bad-guy-strong
    this.load.spritesheet('bad-guy-strong-idle-sheet',      'sprites/enemies/bad-guy-strong-idle-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('bad-guy-strong-walk-sheet',      'sprites/enemies/bad-guy-strong-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('bad-guy-strong-punch-sheet',     'sprites/enemies/bad-guy-strong-punch-sheet.png',     { frameWidth: 192, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy-strong-kick-sheet',      'sprites/enemies/bad-guy-strong-kick-sheet.png',      { frameWidth: 224, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy-strong-hit-sheet',       'sprites/enemies/bad-guy-strong-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('bad-guy-strong-knockdown-sheet', 'sprites/enemies/bad-guy-strong-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

    // Spritesheets animados — bad-guy-chair
    this.load.spritesheet('bad-guy-chair-idle-sheet',      'sprites/enemies/bad-guy-chair-idle-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('bad-guy-chair-walk-sheet',      'sprites/enemies/bad-guy-chair-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('bad-guy-chair-punch-sheet',     'sprites/enemies/bad-guy-chair-punch-sheet.png',     { frameWidth: 320, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy-chair-kick-sheet',      'sprites/enemies/bad-guy-chair-kick-sheet.png',      { frameWidth: 256, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('bad-guy-chair-knockdown-sheet', 'sprites/enemies/bad-guy-chair-knockdown-sheet.png', { frameWidth: 224, frameHeight: 240, endFrame: 24 })

    // Spritesheets animados — coco
    this.load.spritesheet('coco-idle-sheet',      'sprites/bosses/coco-idle-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('coco-walk-sheet',      'sprites/bosses/coco-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('coco-punch-sheet',     'sprites/bosses/coco-punch-sheet.png',     { frameWidth: 160, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('coco-kick-sheet',      'sprites/bosses/coco-kick-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('coco-hit-sheet',       'sprites/bosses/coco-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('coco-knockdown-sheet', 'sprites/bosses/coco-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

    // Spritesheets animados — son
    this.load.spritesheet('son-idle-sheet',  'sprites/bosses/son-idle-sheet.png',  { frameWidth: 160, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('son-walk-sheet',  'sprites/bosses/son-walk-sheet.png',  { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('son-punch-sheet', 'sprites/bosses/son-punch-sheet.png', { frameWidth: 192, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('son-kick-sheet',  'sprites/bosses/son-kick-sheet.png',  { frameWidth: 224, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('son-hit-sheet',       'sprites/bosses/son-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('son-knockdown-sheet', 'sprites/bosses/son-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

    // Spritesheets animados — coach
    this.load.spritesheet('coach-idle-sheet',  'sprites/bosses/coach-idle-sheet.png',  { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('coach-walk-sheet',  'sprites/bosses/coach-walk-sheet.png',  { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('coach-punch-sheet', 'sprites/bosses/coach-punch-sheet.png', { frameWidth: 192, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('coach-kick-sheet',  'sprites/bosses/coach-kick-sheet.png',  { frameWidth: 224, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('coach-hit-sheet',       'sprites/bosses/coach-hit-sheet.png',       { frameWidth: 160, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('coach-knockdown-sheet', 'sprites/bosses/coach-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

    // Spritesheets animados — Thor
    this.load.spritesheet('thor-idle-sheet',      'sprites/thor/thor-idle-sheet.png',      { frameWidth: 128, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('thor-walk-sheet',      'sprites/thor/thor-walk-sheet.png',      { frameWidth: 160, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('thor-punch-sheet',     'sprites/thor/thor-punch-sheet.png',     { frameWidth: 192, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('thor-kick-sheet',      'sprites/thor/thor-kick-sheet.png',      { frameWidth: 224, frameHeight: 240, endFrame: 24 })
    this.load.spritesheet('thor-hit-sheet',       'sprites/thor/thor-hit-sheet.png',       { frameWidth: 224, frameHeight: 240, endFrame: 35 })
    this.load.spritesheet('thor-block-sheet',     'sprites/thor/thor-block-sheet.png',     { frameWidth: 160, frameHeight: 240, endFrame: 15 })
    this.load.spritesheet('thor-knockdown-sheet', 'sprites/thor/thor-knockdown-sheet.png', { frameWidth: 160, frameHeight: 240, endFrame: 35 })

    // ── Sons de combate — free-sfx (OpenGameArt CC0) ─────────────────────

    // Whooshes de soco — curtíssimos (0.19–0.28s), sensação de velocidade
    this.load.audio('sfx-punch-1', 'audio/free-sfx/swoosh-09.wav')  // 0.186s
    this.load.audio('sfx-punch-2', 'audio/free-sfx/swoosh-02.wav')  // 0.202s
    this.load.audio('sfx-punch-3', 'audio/free-sfx/swoosh-04.wav')  // 0.256s
    this.load.audio('sfx-punch-4', 'audio/free-sfx/swoosh-25.wav')  // 0.256s

    // Whooshes de chute — médios (0.33–0.38s), mais peso que o soco
    this.load.audio('sfx-kick-1', 'audio/free-sfx/swoosh-07.wav')   // 0.330s
    this.load.audio('sfx-kick-2', 'audio/free-sfx/swoosh-21.wav')   // 0.330s
    this.load.audio('sfx-kick-3', 'audio/free-sfx/swoosh-12.wav')   // 0.372s
    this.load.audio('sfx-kick-4', 'audio/free-sfx/swoosh-17.wav')   // 0.383s

    // Impactos leves — 18 variações (0.37–0.54s) para hitEnemy e block
    this.load.audio('sfx-impact-01', 'audio/free-sfx/impact-01.ogg')
    this.load.audio('sfx-impact-02', 'audio/free-sfx/impact-02.ogg')
    this.load.audio('sfx-impact-03', 'audio/free-sfx/impact-03.ogg')
    this.load.audio('sfx-impact-04', 'audio/free-sfx/impact-04.ogg')
    this.load.audio('sfx-impact-05', 'audio/free-sfx/impact-05.ogg')
    this.load.audio('sfx-impact-06', 'audio/free-sfx/impact-06.ogg')
    this.load.audio('sfx-impact-07', 'audio/free-sfx/impact-07.ogg')
    this.load.audio('sfx-impact-08', 'audio/free-sfx/impact-08.ogg')
    this.load.audio('sfx-impact-09', 'audio/free-sfx/impact-09.ogg')
    this.load.audio('sfx-impact-10', 'audio/free-sfx/impact-10.ogg')
    this.load.audio('sfx-impact-11', 'audio/free-sfx/impact-11.ogg')
    this.load.audio('sfx-impact-12', 'audio/free-sfx/impact-12.ogg')
    this.load.audio('sfx-impact-13', 'audio/free-sfx/impact-13.ogg')
    this.load.audio('sfx-impact-14', 'audio/free-sfx/impact-14.ogg')
    this.load.audio('sfx-impact-15', 'audio/free-sfx/impact-15.ogg')
    this.load.audio('sfx-impact-16', 'audio/free-sfx/impact-16.ogg')
    this.load.audio('sfx-impact-17', 'audio/free-sfx/impact-17.ogg')
    this.load.audio('sfx-impact-18', 'audio/free-sfx/impact-18.ogg')

    // Impactos médios — playerHit (0.60–0.79s)
    this.load.audio('sfx-phit-1', 'audio/free-sfx/hit-09.wav')  // 0.602s
    this.load.audio('sfx-phit-2', 'audio/free-sfx/hit-32.wav')  // 0.680s
    this.load.audio('sfx-phit-3', 'audio/free-sfx/hit-25.wav')  // 0.732s
    this.load.audio('sfx-phit-4', 'audio/free-sfx/hit-37.wav')  // 0.759s
    this.load.audio('sfx-phit-5', 'audio/free-sfx/hit-12.wav')  // 0.785s

    // Impactos pesados — enemyDeath (0.83–0.87s)
    this.load.audio('sfx-edeath-1', 'audio/free-sfx/hit-23.wav')  // 0.837s
    this.load.audio('sfx-edeath-2', 'audio/free-sfx/hit-26.wav')  // 0.837s
    this.load.audio('sfx-edeath-3', 'audio/free-sfx/hit-31.wav')  // 0.837s
    this.load.audio('sfx-edeath-4', 'audio/free-sfx/hit-36.wav')  // 0.863s

    // Impactos Boss — bossDeath (1.0–1.1s)
    this.load.audio('sfx-bdeath-1', 'audio/free-sfx/hit-01.wav')  // 1.046s
    this.load.audio('sfx-bdeath-2', 'audio/free-sfx/hit-03.wav')  // 1.072s
    this.load.audio('sfx-bdeath-3', 'audio/free-sfx/hit-07.wav')  // 1.124s

    // KO / Knockdown
    this.load.audio('sfx-ko',   'audio/free-sfx/hit-08.wav')   // 1.542s — o mais pesado
    this.load.audio('sfx-fall', 'audio/free-sfx/fall.wav')     // 0.764s — corpo caindo

    // ── Especiais Deadly Kombat (uso futuro: ataques especiais, inimigos com arma) ──
    this.load.audio('sfx-fire-punch',   'audio/fire_punch_02.wav')
    this.load.audio('sfx-fire-fin',     'audio/fire_punch_finisher_06.wav')
    this.load.audio('sfx-metal-punch',  'audio/metal_punch_06.wav')
    this.load.audio('sfx-metal-fin',    'audio/metal_punch_finisher_07.wav')
    this.load.audio('sfx-wood-bat-1',   'audio/wood_bat_finisher_01.wav')
    this.load.audio('sfx-wood-bat-2',   'audio/wood_bat_finisher_05.wav')
    this.load.audio('sfx-blade-1',      'audio/blade_hit_07.wav')
    this.load.audio('sfx-blade-2',      'audio/blade_hit_08.wav')
    this.load.audio('sfx-somersault-1', 'audio/somersault_01.wav')
    this.load.audio('sfx-somersault-2', 'audio/somersault_10.wav')

    // ── Músicas de fundo ──────────────────────────────────────────────────
    this.load.audio('bgm-intro',    'audio/music/intro.mp3')
    this.load.audio('bgm-gameplay', 'audio/music/game-play.mp3')

  }

  create() {
    // Inicializa referência Phaser no SoundManager (uma única vez para o jogo todo)
    sound.init(this)
    const win = window as unknown as Record<string, unknown>
    win.__unlockGameAudio = () => {
      sound.unlockAudio().catch(() => { /* noop */ })
      sound.startIntroMusic()
    }

    // ── Ad service singleton ──────────────────────────────────────────────────
    // createAdService picks NoopAdService on web/premium or AdMobService on
    // free-native. The instance is stored in the Phaser data registry so every
    // scene can retrieve it via this.registry.get('adService').
    const adService = createAdService({
      adsEnabled: ADS_ENABLED,
      isNative: isNativeApp(),
    })
    // Expose a controllable stub for E2E test harnesses (overridden in tests only)
    win.__adsTest = win.__adsTest ?? adService
    this.registry.set('adService', adService)

    // Initialise the interstitial cadence state (immutable counter stored in registry)
    this.registry.set('interstitialCadence', initialCadenceState())

    // Init the ad SDK (ATT on iOS + AdMob.initialize). No-op on web/premium. Never throws.
    adService.init().catch(() => { /* init failure is non-fatal */ })

    // Tenta sign-in no Game Center (no-op em Android/web)
    if (gameCenter.isAvailable()) {
      gameCenter.signIn().catch(() => { /* silencioso */ })
    }

    // Gerar textura de partícula em tempo de execução
    const gfx = this.add.graphics()
    gfx.fillStyle(0xffffff, 1)
    gfx.fillCircle(4, 4, 4)
    gfx.generateTexture('spark', 8, 8)
    gfx.destroy()

    // Detect invite link: ?sala=CODE  —  only when co-op is enabled
    const autoJoinCode = NET_ENABLED
      ? parseInviteCode(window.location.href)
      : null

    // Mostra botão JOGAR — o overlay some e o jogo inicia após clique do usuário
    const showPlay = (window as unknown as Record<string, unknown>)['showPlayButton'] as ((cb: () => void) => void) | undefined
    if (showPlay) {
      showPlay(() => {
        this.cameras.main.fadeIn(300, 0, 0, 0)
        this.cameras.main.once('camerafadeincomplete', () => {
          if (autoJoinCode) {
            this.scene.start('LobbyScene', { autoJoinCode })
          } else {
            this.scene.start('TitleScene')
          }
        })
      })
    } else {
      // Fallback: sem overlay, inicia direto
      this.cameras.main.fadeIn(300, 0, 0, 0)
      this.cameras.main.once('camerafadeincomplete', () => {
        if (autoJoinCode) {
          this.scene.start('LobbyScene', { autoJoinCode })
        } else {
          this.scene.start('TitleScene')
        }
      })
    }
  }
}
