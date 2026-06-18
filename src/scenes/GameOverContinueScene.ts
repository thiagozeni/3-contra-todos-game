import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { padInteractive } from '../utils/iosVideo'
import { hex, primitive, semantic, FAMILY, makeResultPanel } from '../ui/ds'
import { mountSceneBg } from '../ui/sceneBg'
import { FREE_BUILD } from '../ads/buildFlavor'
import type { AdService } from '../ads/AdService'
import {
  nextCadence,
  resolveContinue,
  initialCadenceState,
  type CadenceState,
} from '../ads/interstitialCadence'

export class GameOverContinueScene extends Phaser.Scene {
  private navigating = false
  private selectedIndex = 0 // 0=YES 1=NO
  private cursorArrow!: Phaser.GameObjects.Text
  private yesText!: Phaser.GameObjects.Text
  private noText!: Phaser.GameObjects.Text

  // Toast text for "ad not completed" feedback (free build only)
  private toastText: Phaser.GameObjects.Text | null = null

  constructor() {
    super({ key: 'GameOverContinueScene' })
  }

  create() {
    this.navigating = false
    this.selectedIndex = 0
    this.toastText = null
    const { width, height } = this.scale

    this.cameras.main.fadeIn(400, 0, 0, 0)

    // Fundo próprio da tela (#scene-bg cover) — "GAME OVER" + personagens já vêm
    // embutidos na arte; o Phaser só sobrepõe o dinâmico (stats, CONTINUE).
    mountSceneBg(this, 'imgs/cenario/game-over-superwide.png')
    // Overlay leve só p/ legibilidade do painel à esquerda (arte respira).
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.3).setDepth(1)

    // Reveal helper (cascata) — fade + leve slide; preserva o alpha-alvo.
    const reveal = (objs: Array<Phaser.GameObjects.GameObject | undefined>, delay: number, dy = 20) => {
      objs.forEach((o) => {
        if (!o) return
        const go = o as Phaser.GameObjects.GameObject & { alpha?: number; y?: number; setAlpha?: (a: number) => void; __a?: number; __y?: number }
        go.__a = go.alpha ?? 1
        go.setAlpha?.(0)
        if (typeof go.y === 'number' && dy) { go.__y = go.y; go.y = go.y + dy }
      })
      objs.forEach((o) => {
        if (!o) return
        const go = o as Phaser.GameObjects.GameObject & { __a?: number; __y?: number; y?: number }
        this.tweens.add({ targets: go, alpha: go.__a ?? 1, y: go.__y ?? (go as { y?: number }).y, duration: 320, delay, ease: 'Back.Out' })
      })
    }

    // Painel de RESULTADO — entra em cascata (fundo → título → linhas).
    const panelMark = this.children.list.length
    this.buildStatsPanel()
    this.children.list.slice(panelMark).forEach((o, i) => reveal([o as Phaser.GameObjects.GameObject], 120 + i * 45))

    // CONTINUE?
    const continueText = this.add.text(159, 628, 'CONTINUE?', {
      fontSize: '60px', color: hex(semantic.textPrimary),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 10,
    }).setOrigin(0, 0).setDepth(2)
    reveal([continueText], 640)

    // YES — label changes to "VER ANÚNCIO" in the free build so the player
    // knows a rewarded ad is required. Premium/web (Noop) resolves instantly,
    // so we only show ad-flavored copy when FREE_BUILD is true.
    const yesLabel = FREE_BUILD ? 'VER AD' : 'YES'
    this.yesText = this.add.text(324, 742, yesLabel, {
      fontSize: '40px', color: hex(semantic.textBrand),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 10,
    }).setOrigin(0.5).setDepth(2)
    padInteractive(this.yesText)

    // NO
    this.noText = this.add.text(542, 742, 'NO', {
      fontSize: '40px', color: hex(semantic.textPrimary),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 10,
    }).setOrigin(0.5).setDepth(2)
    padInteractive(this.noText)

    // Cursor ">"
    this.cursorArrow = this.add.text(210, 742, '>', {
      fontSize: '44px', color: hex(semantic.textBrand),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 5,
    }).setOrigin(0.5).setDepth(2)

    // YES / NO / cursor fecham a cascata.
    reveal([this.yesText, this.noText, this.cursorArrow], 780)

    // Inputs
    this.input.keyboard!.off('keydown-LEFT')
    this.input.keyboard!.off('keydown-RIGHT')
    this.input.keyboard!.off('keydown-A')
    this.input.keyboard!.off('keydown-D')
    this.input.keyboard!.off('keydown-Y')
    this.input.keyboard!.off('keydown-N')
    this.input.keyboard!.off('keydown-SPACE')
    this.input.keyboard!.off('keydown-ENTER')
    this.input.keyboard!.on('keydown-LEFT',  () => this.moveCursor(0))
    this.input.keyboard!.on('keydown-RIGHT', () => this.moveCursor(1))
    this.input.keyboard!.on('keydown-A',     () => this.moveCursor(0))
    this.input.keyboard!.on('keydown-D',     () => this.moveCursor(1))
    this.input.keyboard!.on('keydown-Y',     () => { this.moveCursor(0); this.confirmSelection() })
    this.input.keyboard!.on('keydown-N',     () => { this.moveCursor(1); this.confirmSelection() })
    this.input.keyboard!.on('keydown-SPACE', () => this.confirmSelection())
    this.input.keyboard!.on('keydown-ENTER', () => this.confirmSelection())

    this.yesText.on('pointerdown', () => { this.moveCursor(0); this.confirmSelection() })
    this.noText.on('pointerdown',  () => { this.moveCursor(1); this.confirmSelection() })

    this.updateCursor()
  }

  /**
   * Painel de resultado — fiel ao conceito: caixa arredondada + 4 linhas com ícone
   * (troféu/caveira/relógio/coração). Componente DS makeResultPanel (sem o título
   * "RESULTADO", que não existe no conceito). Capturado para a cascata de entrada.
   */
  private buildStatsPanel() {
    const score     = (this.registry.get('gameOverScore')  as number) ?? 0
    const kills     = (this.registry.get('gameOverKills')  as number) ?? 0
    const timeMs    = (this.registry.get('gameOverTime')   as number) ?? 0
    const continues = (this.registry.get('continueCount')  as number) ?? 0
    const mm = String(Math.floor(timeMs / 60000)).padStart(2, '0')
    const ss = String(Math.floor((timeMs % 60000) / 1000)).padStart(2, '0')

    makeResultPanel(this, {
      x: 96, y: 300, w: 488, depth: 2,
      rows: [
        { kind: 'score',     label: 'SCORE',     value: score.toLocaleString() },
        { kind: 'kills',     label: 'INIMIGOS',  value: String(kills) },
        { kind: 'time',      label: 'TEMPO',     value: `${mm}:${ss}` },
        { kind: 'continues', label: 'CONTINUES', value: String(continues) },
      ],
    })
  }

  private moveCursor(index: number) {
    if (this.navigating) return
    if (this.selectedIndex !== index) sound.hover()
    this.selectedIndex = index
    this.updateCursor()
  }

  private updateCursor() {
    if (this.selectedIndex === 0) {
      this.cursorArrow.setX(210)
      this.yesText.setColor(hex(semantic.textBrand))
      this.noText.setColor(hex(semantic.textPrimary))
    } else {
      this.cursorArrow.setX(428)
      this.yesText.setColor(hex(semantic.textPrimary))
      this.noText.setColor(hex(semantic.textBrand))
    }
  }

  // ── Ad service helpers ──────────────────────────────────────────────────────

  /** Retrieve the AdService singleton stored by BootScene in the data registry. */
  private getAdService(): AdService | null {
    try {
      return (this.registry.get('adService') as AdService) ?? null
    } catch {
      return null
    }
  }

  /** Read + advance the interstitial cadence state from the registry. */
  private tickInterstitialCadence(): boolean {
    try {
      const cadence = (this.registry.get('interstitialCadence') as CadenceState | undefined)
        ?? initialCadenceState()
      // GameOverContinueScene is only reached in single-player (net game-over goes
      // directly from GameScene to TitleScene), so isNet is always false here.
      const { show, nextState } = nextCadence(cadence, 'gameOver', {
        nowMs: Date.now(),
        isNet: false,
      })
      this.registry.set('interstitialCadence', nextState)
      return show
    } catch {
      return false
    }
  }

  // ── Toast for ad-not-completed feedback ─────────────────────────────────────

  private showAdFailedToast() {
    if (this.toastText) {
      try { this.toastText.destroy() } catch { /* noop */ }
    }
    const { width, height } = this.scale
    this.toastText = this.add.text(width / 2, height - 180, 'Anúncio não concluído', {
      fontSize: '28px', color: hex(primitive.orange),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 6,
    }).setOrigin(0.5).setDepth(10).setAlpha(1)

    // Fade out after 2.5 s
    this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      duration: 800,
      delay: 1700,
      onComplete: () => {
        try { this.toastText?.destroy() } catch { /* noop */ }
        this.toastText = null
      },
    })
  }

  // ── Interstitial before scene exit ─────────────────────────────────────────

  /**
   * Optionally show an interstitial ad before transitioning away from the game-over
   * screen (only on single-player, only when cadence permits).
   * All errors are swallowed — ad failure NEVER blocks game flow.
   */
  private async maybeShowInterstitial(): Promise<void> {
    const shouldShow = this.tickInterstitialCadence()
    if (!shouldShow) return
    const adService = this.getAdService()
    if (!adService) return
    try {
      await adService.showInterstitial()
    } catch {
      // Ad failure is non-fatal — continue scene transition regardless
    }
  }

  // ── Confirm selection ───────────────────────────────────────────────────────

  private confirmSelection() {
    if (this.navigating) return
    this.navigating = true
    sound.select()

    if (this.selectedIndex === 0) {
      // YES branch
      void this.handleYes()
    } else {
      // NO branch
      void this.handleNo()
    }
  }

  /**
   * YES: in the free build, show a rewarded ad first.
   * Premium / web (NoopAdService): resolves {granted:true} instantly — no ad shown,
   * no ad-flavored copy, behaviour identical to the original YES path.
   */
  private async handleYes(): Promise<void> {
    const adService = this.getAdService()

    let granted: boolean
    try {
      const result = adService
        ? await adService.showRewarded()
        : { granted: true }
      granted = resolveContinue(FREE_BUILD, result)
    } catch {
      // Ad failure is non-fatal — treat as not-granted in free build, granted in premium
      granted = !FREE_BUILD
    }

    if (granted) {
      // Continue: increment counter and resume game
      const prev = (this.registry.get('continueCount') as number) ?? 0
      this.registry.set('continueCount', prev + 1)
      this.registry.set('continueFromWave', this.registry.get('gameOverWave'))
      this.cameras.main.fadeOut(300, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene'))
    } else {
      // Ad was dismissed or failed — stay on the continue screen, show friendly feedback
      this.navigating = false
      this.showAdFailedToast()
    }
  }

  /**
   * NO: player declined to continue. Check cadence and optionally show an
   * interstitial before transitioning to TitleScene.
   */
  private async handleNo(): Promise<void> {
    this.registry.remove('continueFromWave')
    this.registry.remove('gameOverWave')
    this.registry.remove('gameOverScore')
    this.registry.remove('gameOverTime')

    // Interstitial check — fire before the scene transition (single-player only)
    await this.maybeShowInterstitial()

    this.cameras.main.fadeOut(300, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TitleScene'))
  }
}
