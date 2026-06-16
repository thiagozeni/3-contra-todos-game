import Phaser from 'phaser'
import { playerColor } from '../net/playerColors'
import { allyStatus, allyStatusLabel, type AllyStatus } from '../net/allyStatus'
import { AngledBar, makeAngledPortrait, makeAngledPanel, drawDot, addScanlines, hex, primitive, semantic, FAMILY } from './theme'

const D = 100
// Player HP bar anchor — still used to center the knockdown badge under it.
const PLAYER_BAR_X = 178
const PLAYER_BAR_MAX_W = 588

// ── Ally HUD layout constants (FB9) ──────────────────────────────────────────
// Each ally row sits below the main player HUD block (portrait top at y=42,
// bar bottom at y=161), starting at y=ALLY_ROW_START_Y. Rows are 65% scale
// of the main bar dimensions; portrait 120×120, bar ~357×40; 70px row pitch.
const ALLY_ROW_X = 40                // same left margin as the player block
const ALLY_ROW_START_Y = 196         // below the player bar + dots
const ALLY_ROW_PITCH = 84            // vertical gap between row tops (px)
const ALLY_PORTRAIT_SIZE = 64        // small angled portrait
const ALLY_BAR_OFFSET_X = 78         // portrait width + gap
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
}

export class HUD {
  private scene: Phaser.Scene

  // Player (Fatia V: angled portrait + angled HP bar)
  playerPortraitSprite!: Phaser.GameObjects.Sprite
  private playerPortrait!: ReturnType<typeof makeAngledPortrait>
  private playerNameText!: Phaser.GameObjects.Text
  private playerScoreText!: Phaser.GameObjects.Text
  private playerBar!: AngledBar
  private playerHPPct!: Phaser.GameObjects.Text

  // Wand
  wandPortraitImg!: Phaser.GameObjects.Sprite
  private wandPortrait!: ReturnType<typeof makeAngledPortrait>
  private wandBar!: AngledBar
  private wandHPPct!: Phaser.GameObjects.Text
  private wandKO = false

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

    // ── Player: angled portrait (moldura dourada) + 1P + nome + score + barra (mockup GPT) ──
    this.playerPortrait = makeAngledPortrait(this.scene, {
      x: 40, y: 42, size: 130, texture: 'hud-werdum', frameColor: primitive.goldBrand, depth: D + 1,
    })
    this.playerPortraitSprite = this.playerPortrait.sprite

    // "1P" acima do retrato
    this.scene.add.text(48, 14, '1P', {
      fontSize: '22px', color: hex(primitive.goldBrand), fontFamily: FAMILY.display,
      stroke: hex(primitive.black), strokeThickness: 5,
    }).setOrigin(0, 0).setDepth(D + 3).setScrollFactor(0)

    // Nome (afastado da ponta diagonal do retrato)
    this.playerNameText = this.scene.add.text(184, 48, 'WERDUM', {
      fontSize: '30px',
      color: hex(primitive.white),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 6,
    }).setOrigin(0, 0).setDepth(D + 2).setScrollFactor(0)

    // Score do player (numérico dourado, à direita do nome — destaque tipo mockup "1250")
    this.playerScoreText = this.scene.add.text(760, 50, '0', {
      fontSize: '30px', color: hex(primitive.goldBrand), fontFamily: FAMILY.numeric,
      stroke: hex(primitive.black), strokeThickness: 6,
    }).setOrigin(1, 0).setDepth(D + 2).setScrollFactor(0)

    // Barra de HP angulada — encostada no retrato (como no mockup)
    this.playerBar = new AngledBar(this.scene, { x: 178, y: 102, w: 588, h: 46, anchor: 'left', depth: D + 1 })

    // HP% (oculto — a mockup usa só a barra; mantido p/ não quebrar updatePlayerHP)
    this.playerHPPct = this.scene.add.text(760, 125, '100%', {
      fontSize: '18px',
      color: hex(primitive.white),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 4,
    }).setOrigin(1, 0.5).setDepth(D + 3).setScrollFactor(0).setVisible(false)

    // ════════════════════════════════════════════════════════════════════
    // CENTRO — Wave + Timer
    // ════════════════════════════════════════════════════════════════════

    // Painel do placar (timer) — moldura dourada estilo placar eletrônico
    makeAngledPanel(this.scene, {
      x: 812, y: 16, w: 296, h: 92, variant: 'filled', frame: primitive.goldBrand, depth: D,
    }).graphics.setScrollFactor(0)
    // Painel da info (wave/score/inimigos) abaixo do placar
    makeAngledPanel(this.scene, {
      x: 824, y: 118, w: 272, h: 92, variant: 'filled', frame: primitive.steel, depth: D,
    }).graphics.setScrollFactor(0)

    // Timer (destaque pixel display, dourado, dentro do placar)
    this.timerText = this.scene.add.text(960, 40, '00:00', {
      fontSize: '56px',
      color: hex(primitive.gold),
      fontFamily: FAMILY.numeric,
      stroke: hex(primitive.black),
      strokeThickness: 8,
    }).setOrigin(0.5, 0).setDepth(D + 1).setScrollFactor(0)

    // Wave (ciano)
    this.waveText = this.scene.add.text(960, 112, 'WAVE 1 / 1', {
      fontSize: '20px',
      color: hex(primitive.cyanHi),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 5,
    }).setOrigin(0.5, 0).setDepth(D + 1).setScrollFactor(0)

    // Score
    this.scoreText = this.scene.add.text(960, 148, 'SCORE 0', {
      fontSize: '16px',
      color: hex(primitive.white),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(D + 1).setScrollFactor(0)

    // Enemy count
    this.enemyCountText = this.scene.add.text(960, 178, '', {
      fontSize: '14px',
      color: hex(primitive.red),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(D + 1).setScrollFactor(0)

    // ════════════════════════════════════════════════════════════════════
    // LADO DIREITO — Wand
    // ════════════════════════════════════════════════════════════════════

    // ── Wand: angled portrait + angled HP bar (espelhado à direita) ──
    this.wandPortrait = makeAngledPortrait(this.scene, {
      x: 1750, y: 42, size: 130, texture: 'hud-wand', frameColor: primitive.red, depth: D + 1,
    })
    this.wandPortraitImg = this.wandPortrait.sprite

    // Nome (right-aligned, afastado da ponta do retrato)
    this.scene.add.text(1742, 48, 'PROTEGIDO', {
      fontSize: '26px',
      color: hex(primitive.gold),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 6,
    }).setOrigin(1, 0).setDepth(D + 2).setScrollFactor(0)

    // Barra de HP angulada — âncora na direita, encostada no retrato
    this.wandBar = new AngledBar(this.scene, { x: 1154, y: 102, w: 588, h: 46, anchor: 'right', depth: D + 1 })

    // Wand HP% (oculto — mockup usa só a barra; mantido p/ não quebrar updateWandHP)
    this.wandHPPct = this.scene.add.text(1162, 125, '100%', {
      fontSize: '18px',
      color: hex(primitive.white),
      fontFamily: FAMILY.display,
      stroke: hex(primitive.black),
      strokeThickness: 4,
    }).setOrigin(0, 0.5).setDepth(D + 3).setScrollFactor(0).setVisible(false)

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
    this.knockdownBadge = this.scene.add.text(PLAYER_BAR_X + PLAYER_BAR_MAX_W / 2, 174, '⚠ RECUPERANDO...', {
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
    const drawSide = (startX: number, labelX: number, labelOrigin: number) => {
      this.scene.add.text(labelX, y - 30, 'SPECIAL', {
        fontSize: '18px', color: hex(primitive.goldBrand), fontFamily: FAMILY.display,
        stroke: hex(primitive.black), strokeThickness: 4,
      }).setOrigin(labelOrigin, 0).setDepth(SP_DEPTH).setScrollFactor(0)
      for (let i = 0; i < SEG; i++) {
        const x = startX + i * (segW + gap)
        this.scene.add.rectangle(x, y, segW, segH, primitive.goldBrand)
          .setOrigin(0, 0).setDepth(SP_DEPTH).setScrollFactor(0)
          .setStrokeStyle(3, primitive.black)
      }
    }
    // Esquerda (alinhada à margem)
    drawSide(40, 40, 0)
    // Direita (espelhada — segmentos terminam na margem direita)
    const totalW = SEG * segW + (SEG - 1) * gap
    drawSide(1880 - totalW, 1880, 1)
  }

  /**
   * Fatia V: round dots under each HP bar (aligned to the bar's leading edge,
   * recessed for the wand side by Δy·tan16 because the bars are slanted) + a
   * subtle CRT scanline band over the top HUD strip.
   */
  private buildChrome() {
    const dotY = 156, s = 18, gap = 26

    // player dots — left-aligned to the start of its bar
    drawDot(this.scene, 182, dotY, s, true, D + 2)
    drawDot(this.scene, 182 + gap, dotY, s, true, D + 2)
    drawDot(this.scene, 182 + gap * 2, dotY, s, false, D + 2)

    // wand dots — right-aligned, recessed ~12px (Δy·tan16) for the angled bar
    const wandRight = 1730
    drawDot(this.scene, wandRight - s, dotY, s, true, D + 2)
    drawDot(this.scene, wandRight - s - gap, dotY, s, true, D + 2)
    drawDot(this.scene, wandRight - s - gap * 2, dotY, s, true, D + 2)

    // CRT scanlines over the top band
    addScanlines(this.scene, 0, 0, 1920, 220, D + 6)
  }

  // ── API pública ──────────────────────────────────────────────────────

  updatePlayerHP(current: number, max: number) {
    const r = Math.max(0, current / max)
    // Tekken-style: gold bar that empties (width shrinks); width is the feedback.
    this.playerBar.redraw(r)
    this.playerHPPct.setText(`${Math.ceil(r * 100)}%`)
  }

  updateWandHP(current: number, max: number, flash = true) {
    const r = Math.max(0, current / max)
    this.wandBar.redraw(r)
    this.wandHPPct.setText(`${Math.ceil(r * 100)}%`)
    if (flash) {
      this.damageFlash.setAlpha(0.3)
      this.scene.tweens.add({ targets: this.damageFlash, alpha: 0, duration: 350 })
    }
    if (current <= 0) this.setWandKO()
  }

  setWandKO() {
    if (this.wandKO) return
    this.wandKO = true
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
      this.downBadge = this.scene.add.text(width / 2, 360, 'VOCÊ CAIU\naguarde o fim da partida', {
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
    this.scoreText.setText(`SCORE: ${score.toLocaleString()}`)
    this.playerScoreText.setText(score.toLocaleString())
  }

  updateEnemyCount(count: number) {
    this.enemyCountText.setText(count > 0 ? `${count} INIMIGOS` : '')
  }

  updateTime(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    const mm = String(m).padStart(2, '0')
    const ss = String(s).padStart(2, '0')
    this.timerText.setText(`${mm}:${ss}`)
  }

  setPlayerName(name: string) {
    this.playerNameText.setText(name.toUpperCase())
    const textureKey = `hud-${name}`
    if (this.scene.textures.exists(textureKey)) {
      this.playerPortraitSprite.setTexture(textureKey)
    } else {
      this.playerPortraitSprite.setTexture('wand-portrait')
    }
    this.playerPortraitSprite.setDisplaySize(185, 185)
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
    const txt = this.scene.add.text(width / 2, height / 2 - 40, '✓ WAVE COMPLETA!', {
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
    const txt = this.scene.add.text(width / 2, height / 2, muted ? 'SOM DESLIGADO' : 'SOM LIGADO', {
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
        ALLY_BAR_OFFSET_X + ALLY_BAR_W + 26, ALLY_PORTRAIT_SIZE + 16,
        primitive.night, 0.62,
      ).setOrigin(0, 0).setDepth(D).setScrollFactor(0)

      // Angled portrait (slot-colored frame) — same DNA as the player block
      const portrait = makeAngledPortrait(this.scene, {
        x: ALLY_ROW_X, y: rowY, size: ALLY_PORTRAIT_SIZE, texture: textureKey, frameColor: color.num, depth: D + 1,
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
