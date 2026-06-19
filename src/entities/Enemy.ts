import Phaser from 'phaser'
import { RING, CHAR_SCALE } from '../core/config/ring'
import { ENEMY_STATS } from '../core/config/stats'
import { sound } from '../systems/SoundManager'
import type { EnemyState, EnemyFsm } from '../core/types'

export type EnemyType = 'weak' | 'fat' | 'strong' | 'chair' | 'boss_son' | 'boss_coach' | 'boss_coco'

const STATS = ENEMY_STATS

// Personagens com spritesheets de animação completos
const ANIMATED_ENEMIES = new Set([
  'bad-guy1', 'bad-guy2', 'bad-guy3',
  'bad-guy-fat', 'bad-guy-strong', 'bad-guy-chair',
  'coco', 'son', 'coach',
])

interface AnimCfg {
  idleEnd: number; walkEnd: number
  punchEnd: number; kickEnd: number
  hitEnd: number; knockdownEnd: number; attackFps: number
}

const ANIM_CFG: Record<string, AnimCfg> = {
  'bad-guy1':      { idleEnd: 35, walkEnd: 35, punchEnd: 24, kickEnd: 35, hitEnd: 24, knockdownEnd: 35, attackFps: 22 },
  'bad-guy2':      { idleEnd: 24, walkEnd: 35, punchEnd: 24, kickEnd: 24, hitEnd: 24, knockdownEnd: 35, attackFps: 22 },
  'bad-guy3':      { idleEnd: 24, walkEnd: 35, punchEnd: 24, kickEnd: 24, hitEnd: 35, knockdownEnd: 35, attackFps: 22 },
  'bad-guy-fat':   { idleEnd: 24, walkEnd: 35, punchEnd: 24, kickEnd: 24, hitEnd: 24, knockdownEnd: 35, attackFps: 18 },
  'bad-guy-strong':{ idleEnd: 35, walkEnd: 35, punchEnd: 24, kickEnd: 24, hitEnd: 35, knockdownEnd: 35, attackFps: 22 },
  'bad-guy-chair': { idleEnd: 35, walkEnd: 35, punchEnd: 24, kickEnd: 24, hitEnd: 24, knockdownEnd: 24, attackFps: 18 },
  'coco':          { idleEnd: 24, walkEnd: 35, punchEnd: 24, kickEnd: 24, hitEnd: 35, knockdownEnd: 35, attackFps: 22 },
  'son':      { idleEnd: 24, walkEnd: 35, punchEnd: 24, kickEnd: 35, hitEnd: 35, knockdownEnd: 35, attackFps: 22 },
  'coach':    { idleEnd: 35, walkEnd: 35, punchEnd: 24, kickEnd: 24, hitEnd: 24, knockdownEnd: 35, attackFps: 22 },
}

const WEAK_KEYS = ['bad-guy1', 'bad-guy2', 'bad-guy3']
const BOSS_KEYS: Partial<Record<EnemyType, string>> = {
  boss_son: 'son', boss_coach: 'coach', boss_coco: 'coco',
}

/**
 * Enemy — pure VIEW over an EnemyState owned by the core Simulation.
 *
 * Holds no game logic: GameScene calls syncFromState(es) every frame to mirror
 * position / facing / alpha / HP bar / perspective and pick the idle/walk anim,
 * and calls the small play-* helpers in response to SimEvents (hit, knockdown,
 * stagger, attack, death). The sim is the single source of truth.
 */
export class Enemy extends Phaser.GameObjects.Sprite {
  public readonly id: number
  public hp: number
  public readonly maxHp: number
  public readonly damageToPlayer: number
  public readonly damageToWand: number
  public readonly enemyType: EnemyType
  public readonly isBoss: boolean
  public isDead = false

  private readonly charKey: string
  private readonly hasAnims: boolean
  private animLocked = false
  private fsm: EnemyFsm = 'approach'

  // UI
  private hpBarBg!: Phaser.GameObjects.Rectangle
  private hpBar!: Phaser.GameObjects.Rectangle
  private aggroIcon!: Phaser.GameObjects.Text
  private BAR_W = 40
  private readonly BAR_H = 5
  // Perspectiva
  private readonly frameH: number
  private dispH = 170
  private _lastScaleY = -Infinity

  constructor(scene: Phaser.Scene, x: number, y: number, type: EnemyType, id: number) {
    const charKey = BOSS_KEYS[type]
      ?? (type === 'weak'   ? WEAK_KEYS[Phaser.Math.Between(0, 2)]
        : type === 'strong' ? 'bad-guy-strong'
        : type === 'fat'    ? 'bad-guy-fat'
        : 'bad-guy-chair')

    const hasAnims = ANIMATED_ENEMIES.has(charKey)
    const textureKey = hasAnims ? `${charKey}-idle-sheet` : charKey

    super(scene, x, y, textureKey, 0)

    this.id = id
    this.charKey = charKey
    this.hasAnims = hasAnims

    const stats = STATS[type]
    this.hp = stats.hp
    this.maxHp = stats.hp
    this.baseStat = stats
    this.damageToPlayer = stats.damageToPlayer
    this.damageToWand = stats.damageToWand
    this.enemyType = type
    this.isBoss = !!stats.isBoss
    this.frameH = this.height  // captura antes de qualquer setScale

    if (stats.isBoss) {
      this.BAR_W = 80
    }

    this.applyPerspectiveScale()
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject)
    this.setOrigin(0.5, 1.0)

    if (hasAnims) {
      this.createAnimations()
      this.play(`${charKey}-idle`)
      this.on('animationcomplete', (anim: Phaser.Animations.Animation) => {
        if (
          anim.key === `${charKey}-punch` ||
          anim.key === `${charKey}-kick`  ||
          anim.key === `${charKey}-hit`
        ) {
          this.animLocked = false
        }
      })
    }

    // HP bar
    this.hpBarBg = scene.add.rectangle(x, y - this.dispH - 8, this.BAR_W + 2, this.BAR_H + 2, 0x000000).setDepth(99)
    this.hpBar = scene.add.rectangle(x - this.BAR_W / 2, y - this.dispH - 8, this.BAR_W, this.BAR_H,
      stats.isBoss ? 0xff8800 : 0xdd2222).setOrigin(0, 0.5).setDepth(99)

    this.aggroIcon = scene.add.text(x, y - this.dispH - 22, '', {
      fontSize: '14px', color: '#ff0000', fontFamily: 'monospace',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100)
  }

  private baseStat: typeof ENEMY_STATS[EnemyType]
  private attackCount = 0  // alterna punch/kick na animação de ataque

  private createAnimations() {
    const k  = this.charKey
    const ac = this.scene.anims
    if (ac.exists(`${k}-idle`)) return

    const cfg = ANIM_CFG[k]
    if (!cfg) return

    ac.create({ key: `${k}-idle`, frames: ac.generateFrameNumbers(`${k}-idle-sheet`, { start: 0, end: cfg.idleEnd }),   frameRate: 10, repeat: -1 })
    ac.create({ key: `${k}-walk`, frames: ac.generateFrameNumbers(`${k}-walk-sheet`, { start: 0, end: cfg.walkEnd }),   frameRate: 14, repeat: -1 })

    if (this.scene.textures.exists(`${k}-punch-sheet`))
      ac.create({ key: `${k}-punch`, frames: ac.generateFrameNumbers(`${k}-punch-sheet`, { start: 0, end: cfg.punchEnd }), frameRate: cfg.attackFps, repeat: 0 })
    if (this.scene.textures.exists(`${k}-kick-sheet`))
      ac.create({ key: `${k}-kick`,  frames: ac.generateFrameNumbers(`${k}-kick-sheet`,  { start: 0, end: cfg.kickEnd  }), frameRate: cfg.attackFps, repeat: 0 })
    if (this.scene.textures.exists(`${k}-hit-sheet`))
      ac.create({ key: `${k}-hit`,      frames: ac.generateFrameNumbers(`${k}-hit-sheet`,      { start: 0, end: cfg.hitEnd      }), frameRate: 22, repeat: 0 })
    if (this.scene.textures.exists(`${k}-knockdown-sheet`))
      ac.create({ key: `${k}-knockdown`, frames: ac.generateFrameNumbers(`${k}-knockdown-sheet`, { start: 0, end: cfg.knockdownEnd }), frameRate: 14, repeat: 0 })
  }

  private applyPerspectiveScale() {
    if (this.y === this._lastScaleY) return
    this._lastScaleY = this.y
    const stats = this.baseStat
    const t = Phaser.Math.Clamp((this.y - RING.top) / (RING.bottom - RING.top), 0, 1)
    // ENEMY_EXTRA (1.06): +3% (round 2) +3% (round 3) só nos inimigos/bosses, sobre o CHAR_SCALE global.
    this.dispH = Phaser.Math.Linear(204, 360, t) * (stats.sizeScale ?? 1.0) * CHAR_SCALE * 1.06
    const scaleY = this.dispH / this.frameH
    this.setScale(scaleY * stats.scale, scaleY)
  }

  // ── View sync ────────────────────────────────────────────────────────────────

  /**
   * Mirror this sprite to the authoritative EnemyState produced by the sim.
   * Drives position, facing, alpha, HP bar, perspective and the idle/walk anim.
   * Combat reactions (hit/knockdown/stagger/attack/death) are triggered by the
   * scene's SimEvent switch through the play-* helpers below, not here.
   */
  syncFromState(es: EnemyState, wandX: number, wandY: number, playerX: number) {
    if (this.isDead) return

    const prevX = this.x
    const prevY = this.y
    const prevFsm = this.fsm
    this.fsm = es.fsm
    this.hp = es.hp

    // Position from sim
    this.x = es.x
    this.y = es.y

    // recover → approach restores alpha (knockdown faded it to 0.6)
    if (es.fsm === 'approach' && prevFsm !== 'approach') {
      this.setAlpha(1)
      this.animLocked = false
    }

    // Aggro icon: '!' while chasing the player
    const chasing = es.target === 'player'
    this.aggroIcon.setText(chasing ? '!' : '')

    // Horizontal flip — only during movement states (V1 parity)
    if (es.fsm === 'approach' || es.fsm === 'chasePlayer') {
      const targetX = es.target === 'wand' ? wandX : playerX
      this.setFlipX(targetX < this.x)
    }
    void wandY

    // Idle / walk animation
    if (this.hasAnims && !this.animLocked) {
      const moving = (this.x !== prevX || this.y !== prevY)
      const isWaiting = es.fsm === 'waitBeforeAttack'
      const target = (!moving || isWaiting) ? `${this.charKey}-idle` : `${this.charKey}-walk`
      if (this.anims.currentAnim?.key !== target) {
        this.play(target)
      }
    }

    // Perspectiva e UI
    this.applyPerspectiveScale()
    this.setDepth(this.y)
    const barY = this.y - this.dispH - 8
    this.hpBarBg.setPosition(this.x, barY).setDepth(this.y + 1)
    this.hpBar.setPosition(this.x - this.BAR_W / 2, barY).setDepth(this.y + 1)
    this.hpBar.setDisplaySize(this.BAR_W * (this.hp / this.maxHp), this.BAR_H)
    this.aggroIcon.setPosition(this.x, barY - 14).setDepth(this.y + 2)
  }

  // ── Event-driven visual reactions ─────────────────────────────────────────────

  /** Hit reaction: play hit anim (or white-flash fallback). Driven by 'hit' event. */
  playHitFx() {
    // V1 Enemy.takeDamage early-returned while knocked down / dead.
    if (this.isDead || this.fsm === 'knockdown') return
    if (!this.hasAnims || this.animLocked) {
      // Sem animação de hit (ou travado): flash branco como feedback visual
      if (!this.hasAnims || !this.scene.anims.exists(`${this.charKey}-hit`)) {
        const hadTint = this.isTinted
        const prevTint = this.tintTopLeft
        this.setTint(0xffffff)
        this.scene.time.delayedCall(120, () => {
          if (this.isDead) return
          hadTint ? this.setTint(prevTint) : this.clearTint()
        })
      }
      return
    }
    if (this.scene.anims.exists(`${this.charKey}-hit`)) {
      this.animLocked = true
      this.play(`${this.charKey}-hit`)
    }
  }

  /** Knockdown reaction. Driven by 'enemyKnockdown' event. */
  playKnockdownAnim() {
    this.animLocked = true
    this.setAlpha(0.6)
    if (this.hasAnims && this.scene.anims.exists(`${this.charKey}-knockdown`)) {
      this.play(`${this.charKey}-knockdown`)
    } else if (this.hasAnims && this.scene.anims.exists(`${this.charKey}-hit`)) {
      this.play(`${this.charKey}-hit`)
    }
  }

  /** Boss phase-2 reaction: camera shake. Driven by 'bossPhase2' event. */
  playPhase2Fx() {
    this.scene.cameras.main.shake(200, 0.008)
  }

  /** Stagger reaction (player blocked the attack). Driven by 'enemyStaggered' event. */
  playStaggerFx() {
    this.animLocked = false
  }

  /** Attack wind-up animation. Driven by the enemy's attack intents in the scene. */
  playAttackAnim(kickOnly = false) {
    if (!this.hasAnims || this.animLocked) return
    this.attackCount++
    const hasKick = this.scene.textures.exists(`${this.charKey}-kick-sheet`)
    const useKick = kickOnly ? hasKick : (this.attackCount % 3 === 0 && hasKick)
    const animKey = useKick ? `${this.charKey}-kick` : `${this.charKey}-punch`
    if (this.scene.anims.exists(animKey)) {
      this.animLocked = true
      this.play(animKey)
    }
  }

  /** Death: tear down bars, play knockdown to the end, then fade out + destroy. */
  playDeathAnim() {
    if (this.isDead) return
    this.isDead = true
    this.fsm = 'dead'
    this.hpBarBg.destroy()
    this.hpBar.destroy()
    this.aggroIcon.destroy()
    this.isBoss ? sound.bossDeath() : sound.enemyDeath()

    const fadeOut = () => {
      this.scene.tweens.add({
        targets: this,
        alpha: 0, y: this.y + 20,
        duration: 400,
        onComplete: () => this.destroy(),
      })
    }

    if (this.hasAnims && this.scene.anims.exists(`${this.charKey}-knockdown`)) {
      this.animLocked = true
      this.play(`${this.charKey}-knockdown`)
      this.once('animationcomplete', fadeOut)
    } else {
      fadeOut()
    }
  }
}
