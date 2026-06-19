import Phaser from 'phaser'
import { RING, CHAR_SCALE } from '../core/config/ring'
import { PLAYER_STATS } from '../core/config/stats'
import { sound } from '../systems/SoundManager'
import type { PlayerState as CorePlayerState, PlayerFsm } from '../core/types'
import { playerColor } from '../net/playerColors'
import { allyStatus, allyStatusLabel } from '../net/allyStatus'
import { isFallenPose, mayPlayIdleOrRun } from './playerPose'

const STATS = PLAYER_STATS

// Personagens com spritesheets de animação prontos
const ANIMATED = new Set(['werdum', 'dida', 'thor'])

/**
 * Player — VIEW over the PlayerState owned by the core Simulation.
 *
 * The sim owns all physical state (position, FSM, cooldowns, hp). This view keeps
 * the rich animation machinery (punch-combo queue, block hold/release, kick lock)
 * but drives it from syncFromState(ps) (FSM mirror) and the play-* helpers
 * (triggered by SimEvents). It NEVER mutates game state.
 */
export class Player extends Phaser.GameObjects.Sprite {
  public readonly charKey: string
  public readonly maxHp: number
  private fsm: PlayerFsm = 'normal'

  // FB5: true while the player is frozen in the fallen knockdown pose ('down' state,
  // or a co-op 'knockdown' that should hold). While set, syncFromState must NEVER
  // switch the sprite back to idle/run — the character lies on the ground until the
  // sim leaves the down/knockdown state (e.g. single-player recover → 'normal').
  private _holdingDown = false

  // Bloqueio
  public isBlocking = false
  private blockAnimStarted = false
  private blockUpdateHandler: ((anim: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => void) | null = null

  // Escala horizontal por animação — normaliza corpo visual para mesma largura em todos os frames
  private static readonly ANIM_SCALE_H: Record<string, number> = {
    'werdum-idle':        0.75,
    'werdum-run':         1.23,
    'werdum-punch':       0.72,
    'werdum-punch-combo': 0.72,
    'werdum-kick':        0.65,
    'werdum-hit':         0.63,
    'werdum-block':       0.735,
    'werdum-knockdown':   0.75,
    'dida-idle':          0.98,
    'dida-run':           0.80,
    'dida-block':         1.10,
    'thor-idle':          0.94,
    'thor-run':           0.89,
  }

  private static readonly ANIM_SCALE_V: Record<string, number> = {
    'werdum-run':   1.04,
    'werdum-block': 1.078,
  }

  private static readonly ANIM_ORIGIN_X: Record<string, number> = {
    'werdum-punch':       174 / 320,
    'werdum-punch-combo': 174 / 320,
    'werdum-kick':        217 / 384,
  }

  private static readonly ANIM_ORIGIN_Y: Record<string, number> = {
    'werdum-run': 0.969,
  }

  private static readonly BLOCK_MID_IDX: Record<string, number> = {
    werdum: 5,
    dida:   4,
    thor:   7,
  }

  // Animações
  private readonly hasAnims: boolean
  private animLocked = false
  private punchComboQueued = false
  private kickAnimLocked = false
  private prevX = 0
  private prevGroundY = 0

  // Posição lógica no ringue (sem offset de pulo)
  private _groundY = 0
  private readonly frameH: number
  private _lastScaleGroundY = -Infinity
  private _lastScaleAnimKey = ''

  constructor(scene: Phaser.Scene, x: number, y: number, key: string) {
    const textureKey = ANIMATED.has(key) ? `${key}-idle-sheet` : key
    super(scene, x, y, textureKey, 0)

    this.charKey   = key
    this._groundY  = y
    this.prevX     = x
    this.prevGroundY = y

    const stats = STATS[key] ?? STATS['werdum']
    this.maxHp = stats.maxHp

    this.frameH = this.height

    this.hasAnims = ANIMATED.has(key)
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject)
    this.setOrigin(0.5, 1.0)
    this.applyPerspectiveScale()
    this.setDepth(y)

    if (this.hasAnims) {
      this.createAnimations()
      this.play(`${key}-idle`)
      this.on('animationcomplete', (anim: Phaser.Animations.Animation) => {
        if (anim.key === `${key}-kick`) {
          this.kickAnimLocked = false
          this.animLocked = false
        }
        if (anim.key === `${key}-punch`) {
          if (this.punchComboQueued) {
            this.scene.time.delayedCall(0, () => {
              this.punchComboQueued = false
              sound.punch()
              this.play(`${key}-punch-combo`)
            })
          } else {
            this.animLocked = false
          }
        }
        if (anim.key === `${key}-punch-combo` || anim.key === `${key}-hit` || anim.key === `${key}-knockdown`) {
          this.animLocked = false
        }
        if (anim.key === `${key}-block`) {
          this.blockAnimStarted = false
        }
      })
    }
  }

  private applyOriginForAnim(animKey: string) {
    const ox = Player.ANIM_ORIGIN_X[animKey] ?? 0.5
    const oy = Player.ANIM_ORIGIN_Y[animKey] ?? 1.0
    this.setOrigin(ox, oy)
  }

  private applyPerspectiveScale() {
    const currentAnim = this.anims.currentAnim?.key ?? `${this.charKey}-idle`
    if (this._groundY === this._lastScaleGroundY && currentAnim === this._lastScaleAnimKey) return
    this._lastScaleGroundY = this._groundY
    this._lastScaleAnimKey = currentAnim
    const stats  = STATS[this.charKey] ?? STATS['werdum']
    const t      = Phaser.Math.Clamp(
      (this._groundY - RING.top) / (RING.bottom - RING.top), 0, 1,
    )
    const dispH  = Phaser.Math.Linear(204, 420, t) * stats.sizeScale * CHAR_SCALE
    const scaleY = dispH / this.frameH
    const scaleH = Player.ANIM_SCALE_H[currentAnim] ?? stats.scaleH
    const scaleV = Player.ANIM_SCALE_V[currentAnim] ?? 1.0
    this.setScale(scaleY * scaleH, scaleY * scaleV)
  }

  private createAnimations() {
    const k  = this.charKey
    const ac = this.scene.anims
    if (ac.exists(`${k}-idle`)) return

    const ANIM_CFG: Record<string, { idleEnd: number; moveEnd: number; moveSheet: string }> = {
      werdum: { idleEnd: 7,  moveEnd: 35, moveSheet: 'werdum-walk-sheet'  },
      dida:   { idleEnd: 35, moveEnd: 24, moveSheet: 'dida-walk-sheet'   },
      thor:   { idleEnd: 35, moveEnd: 35, moveSheet: 'thor-walk-sheet'   },
    }
    const cfg = ANIM_CFG[k] ?? { idleEnd: 7, moveEnd: 35, moveSheet: `${k}-run-sheet` }

    ac.create({ key: `${k}-idle`, frames: ac.generateFrameNumbers(`${k}-idle-sheet`, { start: 0, end: cfg.idleEnd }), frameRate: 10, repeat: -1 })
    ac.create({ key: `${k}-run`,  frames: ac.generateFrameNumbers(cfg.moveSheet,     { start: 0, end: cfg.moveEnd }), frameRate: 14, repeat: -1 })

    const COMBAT_CFG: Record<string, { hitEnd: number; blockStart: number; blockEnd: number; punchFps: number; jabEnd: number; kickEnd: number; knockdownEnd: number }> = {
      werdum: { hitEnd: 24, blockStart: 8,  blockEnd: 18, punchFps: 26, jabEnd: 9, kickEnd: 12, knockdownEnd: 35 },
      dida:   { hitEnd: 15, blockStart: 0,  blockEnd: 8,  punchFps: 21, jabEnd: 7, kickEnd: 24, knockdownEnd: 35 },
      thor:   { hitEnd: 35, blockStart: 0,  blockEnd: 15, punchFps: 26, jabEnd: 8, kickEnd: 24, knockdownEnd: 35 },
    }
    const cc = COMBAT_CFG[k] ?? COMBAT_CFG['werdum']

    if (this.scene.textures.exists(`${k}-punch-sheet`)) {
      ac.create({ key: `${k}-punch`,       frames: ac.generateFrameNumbers(`${k}-punch-sheet`, { start: 0, end: cc.jabEnd }), frameRate: cc.punchFps, repeat: 0 })
      ac.create({ key: `${k}-punch-combo`, frames: ac.generateFrameNumbers(`${k}-punch-sheet`, { start: 0, end: 24       }), frameRate: cc.punchFps, repeat: 0 })
    }
    if (this.scene.textures.exists(`${k}-kick-sheet`))
      ac.create({ key: `${k}-kick`,      frames: ac.generateFrameNumbers(`${k}-kick-sheet`,      { start: 0, end: cc.kickEnd  }), frameRate: 22, repeat: 0  })
    if (this.scene.textures.exists(`${k}-hit-sheet`))
      ac.create({ key: `${k}-hit`,       frames: ac.generateFrameNumbers(`${k}-hit-sheet`,       { start: 0, end: cc.hitEnd   }), frameRate: 22, repeat: 0  })
    if (this.scene.textures.exists(`${k}-block-sheet`))
      ac.create({ key: `${k}-block`, frames: ac.generateFrameNumbers(`${k}-block-sheet`, { start: cc.blockStart, end: cc.blockEnd }), frameRate: 28, repeat: 0 })
    if (this.scene.textures.exists(`${k}-knockdown-sheet`))
      ac.create({ key: `${k}-knockdown`, frames: ac.generateFrameNumbers(`${k}-knockdown-sheet`, { start: 0, end: cc.knockdownEnd }), frameRate: 14, repeat: 0  })
  }

  /** Dispara animação de soco — toca o som exatamente quando cada animação começa */
  playPunchAnim() {
    if (this._holdingDown) return // FB5: a fallen player never acts
    if (!this.hasAnims) {
      sound.punch()
      return
    }
    if (this.animLocked) {
      if (this.anims.currentAnim?.key === `${this.charKey}-punch`) {
        this.punchComboQueued = true
      }
      return
    }
    this.animLocked = true
    this.punchComboQueued = false
    sound.punch()
    this.play(`${this.charKey}-punch`)
    this.applyOriginForAnim(`${this.charKey}-punch`)
  }

  /** Dispara animação de chute — toca o som exatamente quando a animação começa */
  playKickAnim() {
    if (this._holdingDown) return // FB5: a fallen player never acts
    if (!this.hasAnims || this.kickAnimLocked || this.animLocked) return
    this.kickAnimLocked = true
    this.animLocked = true
    sound.kick()
    this.play(`${this.charKey}-kick`)
    this.applyOriginForAnim(`${this.charKey}-kick`)
  }

  /** Dispara animação de dano (chamado pelo evento playerDamaged) */
  playHitAnim() {
    if (this._holdingDown) return // FB5: a fallen player stays on the ground (no hit reaction)
    if (!this.hasAnims) return
    this.kickAnimLocked = false
    this.punchComboQueued = false
    this.animLocked = true
    if (this.blockUpdateHandler) {
      this.off('animationupdate', this.blockUpdateHandler)
      this.blockUpdateHandler = null
    }
    this.blockAnimStarted = false
    this.play(`${this.charKey}-hit`)
    this.applyOriginForAnim(`${this.charKey}-hit`)
  }

  /**
   * Animação de knockdown — disparada pelo evento playerKnockdown (sem mutar estado).
   *
   * FB5: in co-op, a lethal hit fires BOTH `playerKnockdown` and `playerDown` on the
   * same tick, so this can be called twice. It is idempotent: if the knockdown anim is
   * already playing we don't restart it (no flicker / no replayed sound). `hold` marks
   * the player as down so the per-frame syncFromState freezes the fallen pose instead
   * of falling back to idle — see syncFromState.
   */
  playKnockdownAnim(hold = false) {
    if (hold) this._holdingDown = true

    const knockdownKey = `${this.charKey}-knockdown`
    // Idempotent: a second call (lethal-hit double-trigger) while the anim is already
    // running — or already frozen on its last frame — must not restart it.
    if (this.hasAnims && (this.anims.currentAnim?.key === knockdownKey)) {
      this.animLocked = true
      return
    }

    this.clearTint()
    this.setAngle(0)
    this.animLocked = true
    this.kickAnimLocked = false
    this.punchComboQueued = false
    this.isBlocking = false
    if (this.blockUpdateHandler) {
      this.off('animationupdate', this.blockUpdateHandler)
      this.blockUpdateHandler = null
    }
    this.blockAnimStarted = false
    if (this.hasAnims) {
      this.play(knockdownKey)
      this.applyOriginForAnim(knockdownKey)
    }
    sound.playerKnockdown()
  }

  private startBlockAnim() {
    if (this.blockAnimStarted) return
    this.blockAnimStarted = true
    this.animLocked = false
    this.kickAnimLocked = false
    this.punchComboQueued = false
    const animKey = `${this.charKey}-block`
    const midIdx  = Player.BLOCK_MID_IDX[this.charKey] ?? 4

    if (this.blockUpdateHandler) {
      this.off('animationupdate', this.blockUpdateHandler)
      this.blockUpdateHandler = null
    }

    this.play(animKey)
    this.applyOriginForAnim(animKey)

    this.blockUpdateHandler = (_anim: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => {
      if (frame.index >= midIdx) {
        this.anims.pause()
        if (this.blockUpdateHandler) {
          this.off('animationupdate', this.blockUpdateHandler)
          this.blockUpdateHandler = null
        }
      }
    }
    this.on('animationupdate', this.blockUpdateHandler)
  }

  private releaseBlockAnim() {
    if (!this.blockAnimStarted) return
    this.blockAnimStarted = false
    this.animLocked = false
    this.kickAnimLocked = false
    this.punchComboQueued = false
    if (this.blockUpdateHandler) {
      this.off('animationupdate', this.blockUpdateHandler)
      this.blockUpdateHandler = null
    }
    if (this.anims.currentAnim?.key === `${this.charKey}-block`) {
      this.anims.stop()
    }
  }

  // ── Net mode: overhead HP bar (remote players only) ─────────────────────────────
  // Built lazily by ensureNetHpBar() and updated via updateNetHpBar(). Used ONLY by
  // GameScene in 'net' mode for remote players; single-player never touches this.
  private netHpBarBg?: Phaser.GameObjects.Rectangle
  private netHpBar?: Phaser.GameObjects.Rectangle
  private static readonly NET_BAR_W = 56
  private static readonly NET_BAR_H = 6

  /** Lazily create the overhead HP bar (remote players in net mode). */
  ensureNetHpBar() {
    if (this.netHpBar) return
    const w = Player.NET_BAR_W, h = Player.NET_BAR_H
    this.netHpBarBg = this.scene.add.rectangle(this.x, this._groundY, w + 2, h + 2, 0x000000).setDepth(99)
    this.netHpBar = this.scene.add.rectangle(this.x - w / 2, this._groundY, w, h, 0x22cc44).setOrigin(0, 0.5).setDepth(99)
  }

  /** Update the overhead HP bar position + fill. No-op if the bar was never created. */
  updateNetHpBar(hp: number, maxHp: number) {
    if (!this.netHpBar || !this.netHpBarBg) return
    const r = Math.max(0, Math.min(1, maxHp > 0 ? hp / maxHp : 0))
    const barY = this._groundY - this.displayHeight - 10
    this.netHpBarBg.setPosition(this.x, barY).setDepth(this._groundY + 1)
    this.netHpBar.setPosition(this.x - Player.NET_BAR_W / 2, barY).setDepth(this._groundY + 1)
    this.netHpBar.setDisplaySize(Player.NET_BAR_W * r, Player.NET_BAR_H)
    const color = r > 0.5 ? 0x22cc44 : r > 0.25 ? 0xddaa00 : 0xdd2222
    this.netHpBar.setFillStyle(color)
  }

  /** Tear down the overhead HP bar (called when the remote player view is destroyed). */
  destroyNetHpBar() {
    this.netHpBar?.destroy()
    this.netHpBarBg?.destroy()
    this.netHpBar = undefined
    this.netHpBarBg = undefined
  }

  // ── Net mode: P1/P2/P3 player indicator (FB4) ──────────────────────────────────
  // A small downward-pointing arrow + slot label ("P1"/"P2"/"P3") floating above
  // each HUMAN player's head in their slot color. Visible in net mode only.
  // The MY-player indicator bobs (pulsing tween); remote indicators are static.
  private indicatorArrow?: Phaser.GameObjects.Text
  private indicatorLabel?: Phaser.GameObjects.Text
  private indicatorBobTween?: Phaser.Tweens.Tween
  /** Vertical bob offset in world space (updated by the tween). */
  private indicatorBobY = 0
  /** Slot index this indicator was created for (0=P1, 1=P2, 2=P3). */
  private _indicatorSlot = -1

  /** Offset from groundY to the bottom of the indicator stack (above the HP bar). */
  private static readonly IND_OFFSET_Y = 36

  /**
   * Create the P1/P2/P3 indicator above this player's head.
   * @param slotIndex  0-based slot (0=P1, 1=P2, 2=P3)
   * @param isMine     True for the local player — applies a gentle pulsing tween.
   */
  ensurePlayerIndicator(slotIndex: number, isMine: boolean): void {
    if (this.indicatorArrow) return
    this._indicatorSlot = slotIndex
    const color = playerColor(slotIndex)

    // Arrow (▼ pointing at the character's head) — slightly larger for mine
    const arrowSize  = isMine ? '22px' : '18px'
    this.indicatorArrow = this.scene.add.text(this.x, this._groundY, '▼', {
      fontSize: arrowSize,
      color: color.css,
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: isMine ? 5 : 3,
    }).setOrigin(0.5, 1).setDepth(500)

    // Label (P1 / P2 / P3) — above the arrow
    const labelSize = isMine ? '14px' : '11px'
    this.indicatorLabel = this.scene.add.text(this.x, this._groundY, color.label, {
      fontSize: labelSize,
      color: color.css,
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: isMine ? 4 : 2,
    }).setOrigin(0.5, 1).setDepth(500)

    // My indicator: gentle vertical bob tween for instant self-identification.
    if (isMine) {
      this.indicatorBobTween = this.scene.tweens.add({
        targets: this,
        indicatorBobY: { from: 0, to: -4 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }
  }

  /**
   * Update indicator position + alpha each frame. Called by GameScene inside the
   * render loop (renderInterpolatedRemotes / renderPredictedLocal).
   * @param fsm          Current player FSM — indicator dims to 0.5 when 'down'.
   * @param connected    False while the player is reconnecting — also dims.
   */
  updatePlayerIndicator(fsm: string, connected: boolean): void {
    if (!this.indicatorArrow || !this.indicatorLabel) return

    const baseY   = this._groundY - this.displayHeight - Player.IND_OFFSET_Y
    const arrowY  = baseY + this.indicatorBobY
    const labelY  = arrowY - this.indicatorArrow.displayHeight - 2

    this.indicatorArrow.setPosition(this.x, arrowY)
    this.indicatorLabel.setPosition(this.x, labelY)

    // Depth follows the sprite so the indicator stays above it and sorts correctly.
    const depth = this._groundY + 1
    this.indicatorArrow.setDepth(depth)
    this.indicatorLabel.setDepth(depth)

    const alpha = (fsm === 'down' || connected === false) ? 0.5 : 1
    this.indicatorArrow.setAlpha(alpha)
    this.indicatorLabel.setAlpha(alpha)
  }

  /** Tear down the player indicator (called when the player view is destroyed). */
  destroyPlayerIndicator(): void {
    this.indicatorBobTween?.stop()
    this.indicatorBobTween = undefined
    this.indicatorArrow?.destroy()
    this.indicatorLabel?.destroy()
    this.indicatorArrow = undefined
    this.indicatorLabel = undefined
    this.indicatorBobY = 0
  }

  // ── FB11: world-space DOWN/OFF marker (net mode) ────────────────────────────────
  // A floating "DOWN" (red) / "OFF" (gray) label above a fallen or disconnected
  // player's head, so allies can locate them in the arena. Mirrors the HUD badge
  // (FB10) by reusing the same allyStatus rule — HUD and world never disagree.
  private downMarker?: Phaser.GameObjects.Text
  /** Extra offset above the P1/P2/P3 indicator stack so the two never overlap. */
  private static readonly DOWN_MARKER_OFFSET_Y = 30
  // Colors mirror the ally HUD badge (FB10): down = enemy-red alert, off = gray.
  private static readonly DOWN_MARKER_COLOR_DOWN = '#ff4d4d'
  private static readonly DOWN_MARKER_COLOR_OFF = '#cccccc'

  /**
   * Show/hide the world DOWN/OFF marker from authoritative fsm + connected.
   * Called every frame alongside updatePlayerIndicator. Lazily creates the text
   * on first non-'ok' status; hides (not destroys) it when the player recovers.
   */
  updateDownMarker(fsm: string, connected: boolean): void {
    const status = allyStatus(fsm, connected)
    const label = allyStatusLabel(status)
    if (!label) {
      this.downMarker?.setVisible(false)
      return
    }
    if (!this.downMarker) {
      this.downMarker = this.scene.add.text(this.x, this._groundY, label, {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5, 1).setDepth(501)
    }
    const y = this._groundY - this.displayHeight - Player.IND_OFFSET_Y - Player.DOWN_MARKER_OFFSET_Y
    this.downMarker
      .setText(label)
      .setColor(status === 'down' ? Player.DOWN_MARKER_COLOR_DOWN : Player.DOWN_MARKER_COLOR_OFF)
      .setPosition(this.x, y)
      .setDepth(this._groundY + 2)
      .setVisible(true)
  }

  /** Tear down the world DOWN/OFF marker (called when the player view is destroyed). */
  destroyDownMarker(): void {
    this.downMarker?.destroy()
    this.downMarker = undefined
  }

  /** Current world marker label ('' when hidden) — exposed via __netDebug for E2E. */
  get downMarkerLabel(): string {
    return this.downMarker?.visible ? this.downMarker.text : ''
  }

  /** True if this player's indicator has been created. */
  get hasPlayerIndicator(): boolean { return !!this.indicatorArrow }

  /** The slot index this indicator was created for (-1 if none). */
  get indicatorSlot(): number { return this._indicatorSlot }

  /** Posição lógica Y (sem offset de pulo) — usar para depth e hit detection */
  get groundY(): number { return this._groundY }

  /** True enquanto o player está knocked down (para HUD). */
  get isKnockedDown(): boolean { return this.fsm === 'knockdown' }

  // ── View sync ────────────────────────────────────────────────────────────────

  /**
   * Mirror the sprite to the authoritative PlayerState from the sim.
   * Drives position, facing, block hold/release (FSM edge), and idle/run anim.
   * Punch/kick/hit/knockdown anims are triggered by SimEvents via the play-* helpers.
   */
  syncFromState(ps: CorePlayerState) {
    const prevFsm = this.fsm
    this.fsm = ps.fsm
    this.isBlocking = ps.isBlocking

    // FB5: a 'down' player is dead for the rest of the match — it must lie on the ground
    // (knockdown pose, frozen on its last frame), NEVER fall back to idle/run. This runs
    // every frame (syncNetViews), so without this early-out the per-frame idle/run
    // fallback below would stand the corpse back up once the knockdown anim completes and
    // animLocked clears. We mirror position (the sim keeps it fixed) and hold the pose.
    if (isFallenPose(ps.fsm)) {
      // Idempotent: starts the knockdown anim the first time, no-ops once playing/frozen.
      this.playKnockdownAnim(true)
      this._groundY = ps.groundY
      this.setPosition(ps.x, ps.groundY)
      this.setDepth(ps.groundY)
      this.applyPerspectiveScale()
      this.prevX       = this.x
      this.prevGroundY = this._groundY
      return
    }

    // Block hold/release on FSM edges
    if (this.hasAnims) {
      if (ps.fsm === 'blocking' && prevFsm !== 'blocking') {
        this.startBlockAnim()
      } else if (prevFsm === 'blocking' && ps.fsm !== 'blocking') {
        this.releaseBlockAnim()
      }
    }

    // recovering → normal: clear knockdown residue (and release the FB5 down-hold).
    if (prevFsm !== 'normal' && ps.fsm === 'normal') {
      this.clearTint()
      this.setAngle(0)
      this.animLocked = false
      this._holdingDown = false
    }

    // Facing
    if (ps.facing === -1) this.setFlipX(true)
    if (ps.facing === 1)  this.setFlipX(false)

    // Position from sim
    this._groundY = ps.groundY
    this.setPosition(ps.x, ps.groundY)
    this.setDepth(ps.groundY)

    // Safety valve: release animLocked if no combat anim is actually playing.
    if (this.hasAnims && this.animLocked && ps.fsm === 'normal' && !this.blockAnimStarted) {
      const currentKey = this.anims.currentAnim?.key ?? ''
      const isCombatAnim = currentKey.endsWith('-punch') || currentKey.endsWith('-punch-combo')
                        || currentKey.endsWith('-kick')  || currentKey.endsWith('-hit')
      if ((!this.anims.isPlaying || !isCombatAnim) && !this.punchComboQueued) {
        this.animLocked     = false
        this.kickAnimLocked = false
      }
    }

    // Idle / run animation (block is managed by start/releaseBlockAnim).
    // FB5: mayPlayIdleOrRun blocks idle/run while down-held — defense-in-depth, since the
    // isFallenPose early-return above already covers the live 'down' case.
    if (this.hasAnims && mayPlayIdleOrRun({
      fsm: ps.fsm, holdingDown: this._holdingDown,
      animLocked: this.animLocked, blockAnimStarted: this.blockAnimStarted,
    })) {
      const moving = (this.x !== this.prevX || this._groundY !== this.prevGroundY)
      const target = moving ? `${this.charKey}-run` : `${this.charKey}-idle`
      if (this.anims.currentAnim?.key !== target) {
        this.play(target)
        this.applyOriginForAnim(target)
      }
    }

    this.applyPerspectiveScale()
    this.prevX       = this.x
    this.prevGroundY = this._groundY
  }

  get visualY(): number { return this._groundY }

  /** X aproximado da ponta do punho (hit detection do soco) */
  get punchHitX(): number {
    const dir = this.flipX ? -1 : 1
    const reach = (STATS[this.charKey] ?? STATS['werdum']).punchReach
    return this.x + dir * reach * this.scaleX
  }

  /** X aproximado da ponta do pé (hit detection do chute) */
  get kickHitX(): number {
    const dir = this.flipX ? -1 : 1
    const reach = (STATS[this.charKey] ?? STATS['werdum']).kickReach
    return this.x + dir * reach * this.scaleX
  }
}
