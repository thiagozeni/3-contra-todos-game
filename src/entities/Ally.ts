import Phaser from 'phaser'
import { RING } from '../core/config/ring'
import { ALLY_STATS } from '../core/config/stats'
import { Enemy } from './Enemy'
import type { AllyState as CoreAllyState, AllyFsm } from '../core/types'

// Personagens com spritesheets de animação
const ANIMATED_ALLIES = new Set(['werdum', 'dida', 'thor'])

// Escala horizontal por animação — normaliza corpo para ~120px/scaleY
const ANIM_SCALE_H: Record<string, number> = {
  'werdum-idle':        0.75,
  'werdum-run':         1.20,
  'werdum-punch':       0.61,
  'werdum-punch-combo': 0.61,
  'werdum-knockdown':   0.75,
  'dida-idle':          0.98,
  'dida-run':           0.80,
  'thor-idle':          0.94,
  'thor-run':           0.89,
}

const ANIM_ORIGIN_X: Record<string, number> = {
  'werdum-punch':       174 / 320,
  'werdum-punch-combo': 174 / 320,
}

const ANIM_CFG: Record<string, { idleEnd: number; moveEnd: number; moveSheet: string }> = {
  werdum: { idleEnd: 7,  moveEnd: 35, moveSheet: 'werdum-walk-sheet' },
  dida:   { idleEnd: 35, moveEnd: 24, moveSheet: 'dida-walk-sheet'  },
  thor:   { idleEnd: 35, moveEnd: 35, moveSheet: 'thor-walk-sheet'  },
}

/**
 * Ally — VIEW over an AllyState owned by the core Simulation.
 *
 * The sim's stepAlly owns all ally logic (seek, attack, knockdown) and emits the
 * damage as 'hit' SimEvents the scene routes to Enemy views. This view only
 * mirrors position / facing / anim from syncFromState(as, enemySprites).
 */
export class Ally extends Phaser.GameObjects.Sprite {
  private fsm: AllyFsm = 'idle'
  private readonly frameH: number
  private readonly charKey: string
  private readonly hasAnims: boolean

  private animLocked = false
  private _lastScaleY = -Infinity
  private _lastScaleAnimKey = ''

  constructor(scene: Phaser.Scene, x: number, y: number, key: string) {
    const stats = ALLY_STATS[key] ?? ALLY_STATS['werdum']
    const hasAnims = ANIMATED_ALLIES.has(key)
    const textureKey = hasAnims ? `${key}-idle-sheet` : (stats.svKey ?? key)

    super(scene, x, y, textureKey, 0)

    this.charKey = key
    this.hasAnims = hasAnims

    this.frameH = this.height

    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject)
    this.setOrigin(0.5, 1.0)
    this.applyPerspectiveScale(y)
    this.setDepth(y)

    if (hasAnims) {
      this.createAnimations()
      this.play(`${key}-idle`)
      this.on('animationcomplete', (anim: Phaser.Animations.Animation) => {
        if (
          anim.key === `${key}-punch`       ||
          anim.key === `${key}-punch-combo` ||
          anim.key === `${key}-knockdown`
        ) {
          this.animLocked = false
        }
      })
    }
  }

  private applyPerspectiveScale(y: number) {
    const currentAnim = this.anims.currentAnim?.key ?? `${this.charKey}-idle`
    if (y === this._lastScaleY && currentAnim === this._lastScaleAnimKey) return
    this._lastScaleY = y
    this._lastScaleAnimKey = currentAnim
    const stats = ALLY_STATS[this.charKey] ?? ALLY_STATS['werdum']
    const t     = Phaser.Math.Clamp((y - RING.top) / (RING.bottom - RING.top), 0, 1)
    const dispH = Phaser.Math.Linear(204, 420, t) * stats.sizeScale
    const scaleY = dispH / this.frameH
    const scaleH = ANIM_SCALE_H[currentAnim] ?? stats.scaleH
    this.setScale(scaleY * scaleH, scaleY)
  }

  private createAnimations() {
    const k  = this.charKey
    const ac = this.scene.anims

    if (ac.exists(`${k}-idle`)) return  // já criadas (ex: pelo Player)

    const cfg = ANIM_CFG[k] ?? { idleEnd: 7, moveEnd: 35, moveSheet: `${k}-run-sheet` }

    ac.create({ key: `${k}-idle`, frames: ac.generateFrameNumbers(`${k}-idle-sheet`, { start: 0, end: cfg.idleEnd }), frameRate: 10, repeat: -1 })
    ac.create({ key: `${k}-run`,  frames: ac.generateFrameNumbers(cfg.moveSheet,     { start: 0, end: cfg.moveEnd }), frameRate: 14, repeat: -1 })

    if (this.scene.textures.exists(`${k}-punch-sheet`)) {
      ac.create({ key: `${k}-punch`,       frames: ac.generateFrameNumbers(`${k}-punch-sheet`, { start: 0, end: 9  }), frameRate: 26, repeat: 0 })
      ac.create({ key: `${k}-punch-combo`, frames: ac.generateFrameNumbers(`${k}-punch-sheet`, { start: 0, end: 24 }), frameRate: 26, repeat: 0 })
    }
    if (this.scene.textures.exists(`${k}-knockdown-sheet`))
      ac.create({ key: `${k}-knockdown`, frames: ac.generateFrameNumbers(`${k}-knockdown-sheet`, { start: 0, end: 15 }), frameRate: 14, repeat: 0 })
    if (this.scene.textures.exists(`${k}-kick-sheet`))
      ac.create({ key: `${k}-kick`, frames: ac.generateFrameNumbers(`${k}-kick-sheet`, { start: 0, end: 24 }), frameRate: 22, repeat: 0 })
  }

  // ── View sync ────────────────────────────────────────────────────────────────

  /**
   * Mirror the sprite to the authoritative AllyState from the sim.
   * Drives position, facing (toward nearest live enemy while seeking), and the
   * idle/run/attack animation (attack triggered on the FSM edge into 'attack').
   */
  syncFromState(as: CoreAllyState, enemySprites: Enemy[]) {
    const prevX = this.x
    const prevY = this.y
    const prevFsm = this.fsm
    this.fsm = as.fsm

    // Position from sim
    this.x = as.x
    this.y = as.y

    // recover → idle restores alpha
    if (as.fsm === 'idle' && prevFsm === 'recover') {
      this.setAlpha(1)
      this.animLocked = false
      this.clearTint()
    }

    const liveEnemies = enemySprites.filter(s => !s.isDead)

    // Flip toward nearest enemy — only while seeking (V1 parity)
    if (as.fsm === 'moveToEnemy') {
      let nearest: Enemy | null = null
      let nearestDist = Infinity
      for (const e of liveEnemies) {
        const dx = e.x - this.x
        const dy = e.y - this.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < nearestDist) { nearestDist = d; nearest = e }
      }
      if (nearest) this.setFlipX(nearest.x < this.x)
    }

    // Attack animation on the transition into 'attack'
    if (as.fsm === 'attack' && prevFsm !== 'attack') {
      if (this.hasAnims && !this.animLocked && this.scene.textures.exists(`${this.charKey}-punch-sheet`)) {
        this.animLocked = true
        this.play(`${this.charKey}-punch`)
      }
    }

    // Controle de animação (idle / run)
    if (this.hasAnims && !this.animLocked) {
      const moving = (this.x !== prevX || this.y !== prevY)
      const target = moving ? `${this.charKey}-run` : `${this.charKey}-idle`
      if (this.anims.currentAnim?.key !== target) {
        this.play(target)
        this.setOrigin(ANIM_ORIGIN_X[target] ?? 0.5, 1.0)
      }
    }

    this.applyPerspectiveScale(this.y)
    this.setDepth(this.y)
  }

  /** Knockdown reaction (visual only; sim owns the timer). */
  playKnockdownAnim() {
    this.animLocked = true
    this.setAlpha(0.5)
    if (this.hasAnims && this.scene.textures.exists(`${this.charKey}-knockdown-sheet`)) {
      this.play(`${this.charKey}-knockdown`)
    }
  }
}
