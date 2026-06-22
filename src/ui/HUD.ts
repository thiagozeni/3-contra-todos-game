import Phaser from 'phaser'
import { playerColor } from '../net/playerColors'
import { allyStatus, allyStatusLabel, type AllyStatus } from '../net/allyStatus'
import { charDisplay } from '../core/charNames'
import { AngledBar, makeAngledPortrait, addScanlines, hex, primitive, semantic, FAMILY, STROKE } from './theme'
import { t } from '../i18n'

const D = 100

/**
 * Painel "scoreboard" — retângulo com os 4 cantos chanfrados (corner-cut) + borda
 * dupla (preta externa / cor interna). É a moldura do placar do conceito (game-play),
 * diferente do paralelogramo (skew) do resto do DS.
 */
function makeCutPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, cut: number, frame: number, depth: number) {
  const pts: [number, number][] = [
    [x + cut, y], [x + w - cut, y], [x + w, y + cut], [x + w, y + h - cut],
    [x + w - cut, y + h], [x + cut, y + h], [x, y + h - cut], [x, y + cut],
  ]
  const path = (g: Phaser.GameObjects.Graphics) => {
    g.beginPath()
    g.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1])
    g.closePath()
  }
  const g = scene.add.graphics().setDepth(depth).setScrollFactor(0)
  g.fillStyle(primitive.night, 0.9); path(g); g.fillPath()
  g.lineStyle(STROKE.heavy, primitive.black, 1); path(g); g.strokePath()
  g.lineStyle(STROKE.bold, frame, 1); path(g); g.strokePath()
  return g
}
// Player HP bar anchor — still used to center the knockdown badge under it.
// (Reposicionada à direita: os retratos de miniatura ficaram mais largos.)
const PLAYER_BAR_X = 214
const PLAYER_BAR_MAX_W = 552

// Miniaturas (retratos) — retangulares arredondados, mais largas (player/wand).
// O componente roundedPortrait faz cover internamente (sem override de displaySize).
const PORTRAIT_W = 168
const PORTRAIT_H = 140

// ── Ally HUD layout constants (FB9) ──────────────────────────────────────────
// Each ally row sits below the main player HUD block (portrait top at y=42,
// bar bottom at y=161), starting at y=ALLY_ROW_START_Y. Rows are 65% scale
// of the main bar dimensions; portrait 120×120, bar ~357×40; 70px row pitch.
const ALLY_ROW_X = 40                // same left margin as the player block
const ALLY_ROW_START_Y = 196         // below the player bar + dots
const ALLY_ROW_PITCH = 84            // vertical gap between row tops (px)
const ALLY_PORTRAIT_W = 88           // retrato arredondado pequeno (igual player/wand)
const ALLY_PORTRAIT_H = 66
const ALLY_BAR_OFFSET_X = 104        // portrait width + gap
const ALLY_BAR_W = 320
const ALLY_BAR_H = 26
const ALLY_NAME_SIZE = 16            // FB10: px font size
const ALLY_NAME_GAP = 8              // gap between name and HP bar
const ALLY_BADGE_SIZE = 14           // FB10: status badge ("DOWN"/"OFF") font size
const ALLY_BADGE_GAP = 16            // gap from bar right edge to badge

// FB10: status badge colors (CSS hex for Phaser Text)
const ALLY_BADGE_COLOR_DOWN = hex(semantic.hpLow) // red — player at 0 HP (enemy-red is fine here: this is an alert)
const ALLY_BADGE_COLOR_OFF = hex(semantic.textSecondary)  // #cccccc — disconnected / reconnecting

/** One ally HUD row (internal — not exported). */
interface AllyRow {
  sessionId: string
  charKey: string
  slotIndex: number
  status: AllyStatus
  scrim: Phaser.GameObjects.Rectangle
  portrait: ReturnType<typeof makeAngledPortrait>
  nameText: Phaser.GameObjects.Text
  bar: AngledBar
  statusText: Phaser.GameObjects.Text
  lastRatio: number
}

export class HUD {
  private scene: Phaser.Scene

  // Player (Fatia V: angled portrait + angled HP bar)
  playerPortraitSprite!: Phaser.GameObjects.Sprite
  private playerPortrait!: ReturnType<typeof makeAngledPortrait>
  private playerNameText!: Phaser.GameObjects.Text
  private playerBar!: AngledBar
  private playerHPPct!: Phaser.GameObjects.Text

  // Wand
  wandPortraitImg!: Phaser.GameObjects.Sprite
  private wandPortrait!: ReturnType<typeof makeAngledPortrait>
  private wandBar!: AngledBar
  private wandHPPct!: Phaser.GameObjects.Text
  private wandKO = false
  // Wand-critical alert (playtest #9): pulse the wand portrait + screen when the
  // protected fighter is about to die, so players learn to peel back and defend.
  private wandCritical = false
  private wandAlertTween?: Phaser.Tweens.Tween
  // One-shot onboarding tip (playtest #2): teach "defend the fighter + block".
  private tipText?: Phaser.GameObjects.Text

  // Centro
  private waveText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private enemyCountText!: Phaser.GameObjects.Text

  // Extras
  private comboText!: Phaser.GameObjects.Text
  private damageFlash!: Phaser.GameObjects.Rectangle
  private knockdownBadge!: Phaser.GameObjects.Text
  // Co-op "you are down" overlay — only shown in net mode when MY player goes down.
  private downBadge?: Phaser.GameObjects.Text

  // FB9: ally HUD rows (net mode only — created/cleared by GameScene).
  private allyRows: AllyRow[] = []

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.build()
  }

  private build() {
    const { width, height } = this.scene.scale

    // ── Overlay escuro no topo ────────────────────────────────────────────
    this.scene.add.rectangle(960, 0, 1920, 200, 0x000000)
      .setAlpha(0.55)
      .setDepth(D - 1)
      .setOrigin(0.5, 0)
      .setScrollFactor(0)

    // ════════════════════════════════════════════════════════════════════
    // LADO ESQUERDO — Player
    // ════════════════════════════════════════════════════════════════════

    // ── Player: retrato em PARALELOGRAMO (mesmo ângulo/skew das barras de life) +
    // 1P + nome + score + barra. (Antes era rounded; o conceito game-play usa a thumb
    // angulada na diagonal, igual às barras.)
    this.playerPortrait = makeAngledPortrait(this.scene, {
      x: 36, y: 40, w: PORTRAIT_W, h: PORTRAIT_H, texture: 'hud-werdum', frameColor: primitive.goldBrand,
      depth: D + 1, zoom: 1.18,
    })
    this.playerPortraitSprite = this.playerPortrait.sprite

    // "1P" acima do retrato
    this.scene.add.text(48, 14, '1P', {
      fontSize: '22px', color: hex(primitive.goldBrand), fontFamily: FAMILY.display,
      stroke: hex(primitive.black), strokeThickness: 5,
    }).setOrigin(0, 0).setDepth(D + 3).setScrollFactor(0)

    // Nome (afastado da ponta diagonal do retrato — mais largo agora)
    this.playerNameText = this.scene.add.text(PLAYER_BAR_X, 48, 'WERDUM', {
      fontSize: '30px',
      color: hex(primitive.white),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 6,
    }).setOrigin(0, 0).setDepth(D + 2).setScrollFactor(0)

    // (Pontos do player REMOVIDOS daqui — o SCORE já vive no scoreboard central.)

    // Barra de HP angulada — encostada no retrato (como no mockup)
    this.playerBar = new AngledBar(this.scene, { x: PLAYER_BAR_X, y: 102, w: PLAYER_BAR_MAX_W, h: 46, anchor: 'left', depth: D + 1 })
    this.playerBar.enableShine()

    // Percentual de vida no canto INTERNO (direito, voltado ao centro da tela).
    this.playerHPPct = this.scene.add.text(PLAYER_BAR_X + PLAYER_BAR_MAX_W - 16, 125, '100%', {
      fontSize: '20px',
      color: hex(primitive.white),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 5,
    }).setOrigin(1, 0.5).setDepth(D + 3).setScrollFactor(0)

    // ════════════════════════════════════════════════════════════════════
    // CENTRO — Wave + Timer
    // ════════════════════════════════════════════════════════════════════

    // Placar (timer) — caixa scoreboard chanfrada dourada (conceito game-play).
    makeCutPanel(this.scene, 812, 16, 296, 92, 18, primitive.goldBrand, D)
    // Info (wave/score/inimigos) — caixa chanfrada abaixo, aço.
    makeCutPanel(this.scene, 824, 118, 272, 92, 12, primitive.steel, D)

    // Timer (destaque pixel display, dourado) — centralizado na caixa dourada (16–108).
    this.timerText = this.scene.add.text(960, 62, '00:00', {
      fontSize: '56px',
      color: hex(primitive.gold),
      fontFamily: FAMILY.numeric,
      stroke: hex(primitive.black),
      strokeThickness: 8,
    }).setOrigin(0.5, 0.5).setDepth(D + 1).setScrollFactor(0)

    // Wave / Score / Inimigos — 3 linhas centradas na caixa de info (118–210).
    this.waveText = this.scene.add.text(960, 142, 'WAVE 1 / 1', {
      fontSize: '22px',
      color: hex(primitive.white),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 5,
    }).setOrigin(0.5, 0.5).setDepth(D + 1).setScrollFactor(0)

    this.scoreText = this.scene.add.text(960, 167, 'SCORE 0', {
      fontSize: '18px',
      color: hex(primitive.white),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 4,
    }).setOrigin(0.5, 0.5).setDepth(D + 1).setScrollFactor(0)

    this.enemyCountText = this.scene.add.text(960, 191, '', {
      fontSize: '16px',
      color: hex(primitive.red),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 4,
    }).setOrigin(0.5, 0.5).setDepth(D + 1).setScrollFactor(0)

    // ════════════════════════════════════════════════════════════════════
    // LADO DIREITO — Wand
    // ════════════════════════════════════════════════════════════════════

    // ── Wand: retrato em PARALELOGRAMO (espelhado à direita, mesmo skew das barras) ──
    this.wandPortrait = makeAngledPortrait(this.scene, {
      x: 1884 - PORTRAIT_W, y: 40, w: PORTRAIT_W, h: PORTRAIT_H, texture: 'hud-wand', frameColor: primitive.red,
      depth: D + 1, zoom: 1.18,
    })
    this.wandPortraitImg = this.wandPortrait.sprite

    // Nome (right-aligned, afastado da ponta do retrato) — o protegido é o WANDERLEI.
    this.scene.add.text(1704, 48, 'WANDERLEI', {
      fontSize: '26px',
      color: hex(primitive.gold),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 6,
    }).setOrigin(1, 0).setDepth(D + 2).setScrollFactor(0)

    // Barra de HP angulada — âncora na direita, encostada no retrato
    this.wandBar = new AngledBar(this.scene, { x: 1154, y: 102, w: 552, h: 46, anchor: 'right', depth: D + 1 })
    this.wandBar.enableShine(850, 3100)  // gap maior p/ dessincronizar do player

    // Percentual de vida no canto INTERNO (esquerdo, voltado ao centro da tela).
    // Barra do wand: 1154..1706.
    this.wandHPPct = this.scene.add.text(1154 + 16, 125, '100%', {
      fontSize: '20px',
      color: hex(primitive.white),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 5,
    }).setOrigin(0, 0.5).setDepth(D + 3).setScrollFactor(0)

    // ════════════════════════════════════════════════════════════════════
    // EXTRAS
    // ════════════════════════════════════════════════════════════════════

    // Combo (centro da tela). Cor é VFX de gameplay (rampa em showCombo()),
    // deliberadamente fora dos tokens de cor do DS (chrome) — ver showCombo/showWaveAnnouncement.
    this.comboText = this.scene.add.text(width / 2, 300, '', {
      fontSize: '52px',
      color: '#ff8800',
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink),
      strokeThickness: 8,
    }).setDepth(2000).setOrigin(0.5, 0.5).setScrollFactor(0).setAlpha(0)

    // Flash de dano (tela inteira)
    this.damageFlash = this.scene.add.rectangle(width / 2, height / 2, width, height, 0xff0000, 0)
      .setDepth(D - 1)
      .setScrollFactor(0)

    // Badge de knockdown (abaixo da barra de HP do player)
    this.knockdownBadge = this.scene.add.text(PLAYER_BAR_X + PLAYER_BAR_MAX_W / 2, 174, t('hud.recovering'), {
      fontSize: '22px',
      color: hex(semantic.feedbackWarn),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink),
      strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(D + 3).setScrollFactor(0).setAlpha(0)

    this.scene.tweens.add({
      targets: this.knockdownBadge,
      alpha: 0.2,
      duration: 400,
      yoyo: true,
      repeat: -1,
      paused: true,
    })

    this.buildSpecialBars()
    this.buildChrome()
  }

  /**
   * SPECIAL meters no rodapé (mockup GPT) — label + 5 segmentos, esquerda e direita.
   * Decorativo por ora (cheio): o jogo ainda não tem mecânica de special ligada ao HUD.
   */
  private buildSpecialBars() {
    // Depth acima da camada de câmeras (sprite @1400 no GameScene) p/ não ficar coberta.
    const SP_DEPTH = 1500
    const SEG = 5, segW = 38, segH = 18, gap = 7, y = 1008
    const drawSide = (startX: number, labelX: number, labelOrigin: number): Phaser.GameObjects.Rectangle[] => {
      this.scene.add.text(labelX, y - 30, t('hud.special'), {
        fontSize: '18px', color: hex(primitive.goldBrand), fontFamily: FAMILY.display,
        stroke: hex(primitive.black), strokeThickness: 4,
      }).setOrigin(labelOrigin, 0).setDepth(SP_DEPTH).setScrollFactor(0)
      const segs: Phaser.GameObjects.Rectangle[] = []
      for (let i = 0; i < SEG; i++) {
        const x = startX + i * (segW + gap)
        segs.push(
          this.scene.add.rectangle(x, y, segW, segH, primitive.goldBrand)
            .setOrigin(0, 0).setDepth(SP_DEPTH).setScrollFactor(0)
            .setStrokeStyle(3, primitive.black),
        )
      }
      return segs
    }
    // Recuadas p/ DENTRO (ao lado dos cinegrafistas, não atrás): os cinegrafistas
    // ficam colados nos cantos inferiores; as barras entram ~300px da borda.
    const INNER = 300
    const totalW = SEG * segW + (SEG - 1) * gap
    // Esquerda
    const leftSegs = drawSide(INNER, INNER, 0)
    // Direita (espelhada — segmentos terminam em 1920-INNER)
    const rightSegs = drawSide(1920 - INNER - totalW, 1920 - INNER, 1)

    // Shimmer "carregado" — onda de brilho percorrendo os segmentos (energia pronta).
    // Decorativo (a barra ainda é sempre cheia); puro feedback premium, pixel-safe.
    ;[...leftSegs, ...rightSegs].forEach((seg, idx) => {
      this.scene.tweens.add({
        targets: seg,
        alpha: 0.5,
        duration: 620,
        yoyo: true,
        repeat: -1,
        delay: (idx % SEG) * 120,
        ease: 'Sine.InOut',
      })
    })
  }

  /**
   * Fatia V: round dots under each HP bar (aligned to the bar's leading edge,
   * recessed for the wand side by Δy·tan16 because the bars are slanted) + a
   * subtle CRT scanline band over the top HUD strip.
   */
  private buildChrome() {
    // Dots decorativos abaixo das barras REMOVIDOS (eram puramente cosméticos, sem
    // função de gameplay — pedido do Thiago). Mantém só as scanlines CRT no topo.
    addScanlines(this.scene, 0, 0, 1920, 220, D + 6)
  }

  // ── API pública ──────────────────────────────────────────────────────

  private playerLastRatio = 1
  private wandLastRatio = 1

  updatePlayerHP(current: number, max: number) {
    const r = Math.max(0, current / max)
    // Tekken-style: gold bar that empties (width shrinks); width is the feedback.
    this.playerBar.redraw(r)
    this.playerHPPct.setText(`${Math.ceil(r * 100)}%`)
    // Pisca vermelho a cada dano recebido (queda de HP).
    if (r < this.playerLastRatio - 0.0001) this.playerBar.flashDamage()
    this.playerLastRatio = r
  }

  updateWandHP(current: number, max: number, flash = true) {
    const r = Math.max(0, current / max)
    this.wandBar.redraw(r)
    this.wandHPPct.setText(`${Math.ceil(r * 100)}%`)
    if (r < this.wandLastRatio - 0.0001) this.wandBar.flashDamage()
    this.wandLastRatio = r
    if (flash) {
      this.damageFlash.setAlpha(0.3)
      this.scene.tweens.add({ targets: this.damageFlash, alpha: 0, duration: 350 })
    }
    this.updateWandAlert(r, current)
    if (current <= 0) this.setWandKO()
  }

  /**
   * Wand-critical alert (playtest #9): when the protected fighter drops below 30%
   * HP, pulse its portrait red so the player learns to peel off and defend it (81%
   * of losses are the wand dying — yet nothing told the player it was in danger).
   * Toggles on the threshold crossing only, so it isn't restarted every tick.
   */
  private updateWandAlert(r: number, current: number) {
    if (this.wandKO) return
    const critical = current > 0 && r < 0.30
    if (critical === this.wandCritical) return
    this.wandCritical = critical
    if (critical) {
      this.wandPortraitImg.setTint(0xff5555)
      this.wandAlertTween = this.scene.tweens.add({
        targets: this.wandPortraitImg,
        alpha: { from: 1, to: 0.45 },
        duration: 400, yoyo: true, repeat: -1,
      })
    } else {
      this.wandAlertTween?.stop()
      this.wandAlertTween = undefined
      this.wandPortraitImg.clearTint().setAlpha(1)
    }
  }

  /**
   * One-shot onboarding banner (playtest #2): the engine's whole skill — defend the
   * downed fighter, BLOCK incoming hits (1 chip + staggers the attacker) — was never
   * taught, so novices wash out at wave 2–4. Shown once, early, then fades.
   */
  showTip(text: string) {
    if (this.tipText) return
    const { width } = this.scene.scale
    this.tipText = this.scene.add.text(width / 2, 560, text, {
      fontSize: '26px',
      color: hex(semantic.feedbackWarn),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink),
      strokeThickness: 6,
      align: 'center',
      wordWrap: { width: 1200 },
    }).setOrigin(0.5, 0.5).setDepth(2001).setScrollFactor(0).setAlpha(0)
    this.scene.tweens.add({ targets: this.tipText, alpha: 1, duration: 400 })
    this.scene.tweens.add({
      targets: this.tipText, alpha: 0, delay: 5200, duration: 700,
      onComplete: () => { this.tipText?.destroy(); this.tipText = undefined },
    })
  }

  setWandKO() {
    if (this.wandKO) return
    this.wandKO = true
    // KO overrides the critical pulse cleanly.
    this.wandAlertTween?.stop()
    this.wandAlertTween = undefined
    this.wandCritical = false
    this.wandPortraitImg.clearTint().setAlpha(1)
    this.scene.tweens.add({
      targets: this.wandPortraitImg,
      alpha: 0.3,
      duration: 300,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.wandPortraitImg.setAlpha(0.35).setTint(0xff6666)
      },
    })
  }

  showKnockdownStatus(active: boolean) {
    const tween = this.scene.tweens.getTweensOf(this.knockdownBadge)[0]
    if (active) {
      this.knockdownBadge.setAlpha(1)
      tween?.resume()
    } else {
      tween?.pause()
      this.knockdownBadge.setAlpha(0)
    }
  }

  /**
   * Co-op only: show/hide the persistent "VOCÊ CAIU" overlay for the local player
   * once they are down (inert) for the rest of the match. Built lazily so the
   * single-player HUD never creates it. Hiding the knockdown badge is the caller's
   * job (a downed player is past the recovering state).
   */
  showDownStatus(active: boolean) {
    if (!active) {
      this.downBadge?.setAlpha(0)
      return
    }
    if (!this.downBadge) {
      const { width } = this.scene.scale
      this.downBadge = this.scene.add.text(width / 2, 360, `${t('hud.downTitle')}\n${t('hud.downSub')}`, {
        fontSize: '30px',
        align: 'center',
        color: hex(semantic.hpLow),
        fontFamily: FAMILY.display,
        stroke: hex(semantic.ink),
        strokeThickness: 6,
        lineSpacing: 14,
      })
        .setOrigin(0.5, 0.5)
        .setDepth(D + 5)
        .setScrollFactor(0)
    }
    // Hide the recovering badge — being down supersedes it.
    this.showKnockdownStatus(false)
    this.downBadge.setAlpha(1)
  }

  updateWave(wave: number, total: number) {
    this.waveText.setText(`WAVE ${wave} / ${total}`)
  }

  updateScore(score: number) {
    // SCORE só no scoreboard central (o número dourado acima da barra foi removido).
    this.scoreText.setText(`SCORE: ${score.toLocaleString()}`)
  }

  updateEnemyCount(count: number) {
    this.enemyCountText.setText(count > 0 ? `${count} ${t('hud.enemies')}` : '')
  }

  updateTime(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    const mm = String(m).padStart(2, '0')
    const ss = String(s).padStart(2, '0')
    this.timerText.setText(`${mm}:${ss}`)
  }

  setPlayerName(name: string) {
    this.playerNameText.setText(charDisplay(name))
    const textureKey = this.scene.textures.exists(`hud-${name}`) ? `hud-${name}` : 'wand-portrait'
    // setTexture do rounded portrait reaplica o cover automaticamente.
    this.playerPortrait.setTexture(textureKey)
  }

  showCombo(count: number) {
    if (count < 2) {
      this.comboText.setAlpha(0)
      return
    }
    const colors = ['#ff8800', '#ff5500', '#ff2200', '#ff0000', '#ff00ff']
    const color = colors[Math.min(count - 2, colors.length - 1)]
    const scale = 1 + Math.min(count * 0.06, 0.5)
    this.comboText.setText(`x${count} COMBO!`).setColor(color)
    this.scene.tweens.killTweensOf(this.comboText)
    this.comboText.setAlpha(1).setScale(scale * 1.3)
    this.scene.tweens.add({ targets: this.comboText, scale, duration: 100 })
    this.scene.tweens.add({ targets: this.comboText, alpha: 0, duration: 400, delay: 1400 })
  }

  showWaveAnnouncement(wave: number, isBoss = false) {
    const { width, height } = this.scene.scale
    const label = isBoss ? '⚠  BOSS WAVE!' : `— WAVE ${wave} —`
    const color = isBoss ? '#ff3300' : '#ffdd00'
    const size = isBoss ? '80px' : '72px'

    const txt = this.scene.add.text(width / 2, height / 2 - 40, label, {
      fontSize: size,
      color,
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink),
      strokeThickness: 10,
    }).setDepth(2000).setOrigin(0.5).setScrollFactor(0).setAlpha(0).setScale(0.6)

    this.scene.tweens.add({ targets: txt, alpha: 1, scale: 1, duration: 220, ease: 'Back.Out' })
    this.scene.tweens.add({
      targets: txt,
      alpha: 0,
      scale: 0.8,
      duration: 280,
      delay: isBoss ? 1100 : 700,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    })

    if (isBoss) this.scene.cameras.main.shake(300, 0.01)
  }

  showWaveComplete() {
    const { width, height } = this.scene.scale
    const txt = this.scene.add.text(width / 2, height / 2 - 40, t('hud.waveComplete'), {
      fontSize: '56px',
      color: hex(semantic.feedbackOk),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink),
      strokeThickness: 8,
    }).setDepth(2000).setOrigin(0.5).setScrollFactor(0).setAlpha(0).setScale(0.7)

    this.scene.tweens.add({ targets: txt, alpha: 1, scale: 1, duration: 200, ease: 'Back.Out' })
    this.scene.tweens.add({
      targets: txt,
      alpha: 0,
      y: height / 2 - 80,
      duration: 300,
      delay: 900,
      onComplete: () => txt.destroy(),
    })
  }

  showMuteStatus(muted: boolean) {
    const { width, height } = this.scene.scale
    const txt = this.scene.add.text(width / 2, height / 2, muted ? t('hud.soundOff') : t('hud.soundOn'), {
      fontSize: '36px',
      color: hex(semantic.textBrand),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink),
      strokeThickness: 8,
    }).setDepth(2000).setOrigin(0.5).setScrollFactor(0)

    this.scene.tweens.add({
      targets: txt,
      alpha: 0,
      duration: 400,
      delay: 900,
      onComplete: () => txt.destroy(),
    })
  }

  // ── FB9: Ally HUD rows (net mode only) ──────────────────────────────────────

  /**
   * Create ally rows for OTHER human players (not the local player).
   * Call once at match start in net mode; rows stack below the main HUD block.
   * Ally rows are ignored entirely in single-player (GameScene never calls this).
   *
   * @param allies  Array of {sessionId, charKey, slotIndex} for each remote human.
   */
  setupAllyHuds(allies: { sessionId: string; charKey: string; slotIndex: number }[]): void {
    this.clearAllyHuds()
    allies.forEach((ally, idx) => {
      const rowY = ALLY_ROW_START_Y + idx * ALLY_ROW_PITCH
      const color = playerColor(ally.slotIndex)
      const textureKey = this.scene.textures.exists(`hud-${ally.charKey}`) ? `hud-${ally.charKey}` : 'hud-wand'

      // Scrim escuro atrás da row — garante legibilidade sobre o ringue claro
      // (o logo do chão "vazava" atrás das barras dos aliados).
      const scrim = this.scene.add.rectangle(
        ALLY_ROW_X - 10, rowY - 8,
        ALLY_BAR_OFFSET_X + ALLY_BAR_W + 26, ALLY_PORTRAIT_H + 16,
        primitive.night, 0.62,
      ).setOrigin(0, 0).setDepth(D).setScrollFactor(0)

      // Retrato em paralelogramo (moldura na cor do slot) — mesma DNA do player.
      const portrait = makeAngledPortrait(this.scene, {
        x: ALLY_ROW_X, y: rowY, w: ALLY_PORTRAIT_W, h: ALLY_PORTRAIT_H, texture: textureKey, frameColor: color.num,
        depth: D + 1, zoom: 1.18,
      })

      const barX = ALLY_ROW_X + ALLY_BAR_OFFSET_X

      // Name label (player color)
      const nameText = this.scene.add.text(barX, rowY, ally.charKey.toUpperCase(), {
        fontSize: `${ALLY_NAME_SIZE}px`,
        color: color.css,
        fontFamily: FAMILY.display,
        stroke: hex(primitive.black),
        strokeThickness: 4,
      }).setOrigin(0, 0).setDepth(D + 2).setScrollFactor(0)

      // Angled HP bar
      const barY = rowY + ALLY_NAME_SIZE + ALLY_NAME_GAP
      const bar = new AngledBar(this.scene, { x: barX, y: barY, w: ALLY_BAR_W, h: ALLY_BAR_H, anchor: 'left', depth: D + 1 })

      // FB10: status badge ("DOWN"/"OFF") — to the right of the bar
      const statusText = this.scene.add.text(
        barX + ALLY_BAR_W + ALLY_BADGE_GAP, barY + ALLY_BAR_H / 2,
        '',
        {
          fontSize: `${ALLY_BADGE_SIZE}px`,
          color: ALLY_BADGE_COLOR_OFF,
          fontFamily: FAMILY.display,
          stroke: hex(primitive.black),
          strokeThickness: 4,
        }
      ).setOrigin(0, 0.5).setDepth(D + 3).setScrollFactor(0).setVisible(false)

      this.allyRows.push({
        sessionId: ally.sessionId,
        charKey: ally.charKey,
        slotIndex: ally.slotIndex,
        status: 'ok',
        scrim,
        portrait,
        nameText,
        bar,
        statusText,
        lastRatio: 1,
      })
    })
  }

  /**
   * Update an ally row from authoritative per-player fields. Call every frame
   * from updateNetHud. Derives the status badge (FB10) and dims the whole row
   * when the player is down or disconnected.
   *
   * @param sessionId  The ally's Colyseus sessionId.
   * @param hp         Current HP (authoritative).
   * @param maxHp      Max HP.
   * @param fsm        The ally's FSM state ('down' → "DOWN" badge).
   * @param connected  False while the socket is dropped ('off' → "OFF" badge).
   */
  updateAllyHud(
    sessionId: string,
    hp: number,
    maxHp: number,
    fsm?: string,
    connected?: boolean,
  ): void {
    const row = this.allyRows.find(r => r.sessionId === sessionId)
    if (!row) return

    const ratio = maxHp > 0 ? Math.max(0, hp / maxHp) : 0
    row.bar.redraw(ratio)
    if (ratio < row.lastRatio - 0.0001) row.bar.flashDamage()
    row.lastRatio = ratio

    // FB10: derive status → badge text + color; dim the whole row when not 'ok'.
    const status = allyStatus(fsm, connected)
    row.status = status
    const label = allyStatusLabel(status)
    if (label) {
      row.statusText
        .setText(label)
        .setColor(status === 'down' ? ALLY_BADGE_COLOR_DOWN : ALLY_BADGE_COLOR_OFF)
        .setVisible(true)
    } else {
      row.statusText.setVisible(false)
    }

    const alpha = status === 'ok' ? 1 : 0.5
    row.portrait.setAlpha(alpha)
    row.nameText.setAlpha(alpha)
    row.bar.setAlpha(alpha)
    // Badge itself stays full opacity (it is the alert), only shown when relevant.
  }

  /**
   * Destroy all ally HUD rows. Call on scene exit or when switching to single-player.
   */
  clearAllyHuds(): void {
    for (const row of this.allyRows) {
      row.scrim.destroy()
      row.portrait.destroy()
      row.nameText.destroy()
      row.bar.destroy()
      row.statusText.destroy()
    }
    this.allyRows = []
  }

  /**
   * Returns a read-only snapshot of current ally rows for E2E inspection.
   * Exposed via __netDebug in GameScene. Includes FB10 status ('ok'|'down'|'off').
   */
  getAllyRowsDebug(): ReadonlyArray<{ sessionId: string; charKey: string; slotIndex: number; status: AllyStatus }> {
    return this.allyRows.map(r => ({
      sessionId: r.sessionId,
      charKey: r.charKey,
      slotIndex: r.slotIndex,
      status: r.status,
    }))
  }
}
