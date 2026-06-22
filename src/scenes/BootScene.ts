import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { gameCenter } from '../systems/GameCenterBridge'
import { isNativeApp } from '../utils/iosVideo'
import { NET_ENABLED } from '../net/flags'
import { ADS_ENABLED, WEB_AD_SIM, WEB_ADSENSE } from '../ads/buildFlavor'
import { createAdService } from '../ads/AdService'
import { initialCadenceState } from '../ads/interstitialCadence'
import { parseInviteCode } from '../net/inviteLink'
import { loadCriticalAssets } from './assetManifest'

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

    // Só o crítico (intro + título + menus) destrava o botão PLAY. Os assets de
    // gameplay (≈100 spritesheets + SFX + fundos de jogo + HUD) carregam depois, no
    // GameScene.preload — antes carregavam todos aqui e seguravam o boot (Codex #11).
    // Ver src/scenes/assetManifest.ts.
    loadCriticalAssets(this)
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
      webAdSense: WEB_ADSENSE,
      webAdSim: WEB_AD_SIM,
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
