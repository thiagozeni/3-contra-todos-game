import Phaser from 'phaser'
import { RING } from '../core/config/ring'
import { ENEMY_STATS, ENEMY_SCORE_TABLE } from '../core/config/stats'
import { KNOCKDOWN_THRESHOLDS } from '../core/config/combat'
import { sound } from '../systems/SoundManager'
import { stepEnemy, staggerEnemy } from '../core/systems/enemyAi'
import type { EnemyState } from '../core/types'

export type EnemyType = 'weak' | 'fat' | 'strong' | 'chair' | 'boss_son' | 'boss_coach' | 'boss_coco'

/** @deprecated Use ENEMY_SCORE_TABLE from core/config/stats */
export const ENEMY_SCORE = ENEMY_SCORE_TABLE

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

type AIState = 'approach' | 'waitBeforeAttack' | 'chasePlayer' | 'knockdown' | 'recover' | 'staggered' | 'dead'

interface Positionable { x: number; y: number }

export class Enemy extends Phaser.GameObjects.Sprite {
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
  private attackCount = 0  // alterna punch/kick

  private baseSpeed: number
  private currentSpeed: number
  private _aiState: AIState = 'approach'
  private target: 'wand' | Positionable = 'wand'
  private noHitTimer = 0
  private waitTimer = 0
  private attackCooldown = 0
  private knockdownTimer = 0
  private staggerTimer = 0
  private inPhase2 = false

  public wandRef!: Positionable
  public playerRef!: Positionable

  // Public read accessors for the combat bridge (buildSimState in GameScene)
  get aiState(): AIState { return this._aiState }
  get simBaseSpeed(): number { return this.baseSpeed }
  get simCurrentSpeed(): number { return this.currentSpeed }
  get simInPhase2(): boolean { return this.inPhase2 }

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

  constructor(scene: Phaser.Scene, x: number, y: number, type: EnemyType) {
    const charKey = BOSS_KEYS[type]
      ?? (type === 'weak'   ? WEAK_KEYS[Phaser.Math.Between(0, 2)]
        : type === 'strong' ? 'bad-guy-strong'
        : type === 'fat'    ? 'bad-guy-fat'
        : 'bad-guy-chair')

    const hasAnims = ANIMATED_ENEMIES.has(charKey)
    const textureKey = hasAnims ? `${charKey}-idle-sheet` : charKey

    super(scene, x, y, textureKey, 0)

    this.charKey = charKey
    this.hasAnims = hasAnims

    const stats = STATS[type]
    this.hp = stats.hp
    this.maxHp = stats.hp
    this.baseSpeed = stats.speed
    this.currentSpeed = stats.speed
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
    const stats = STATS[this.enemyType]
    const t = Phaser.Math.Clamp((this.y - RING.top) / (RING.bottom - RING.top), 0, 1)
    this.dispH = Phaser.Math.Linear(204, 360, t) * (stats.sizeScale ?? 1.0)
    const scaleY = this.dispH / this.frameH
    this.setScale(scaleY * stats.scale, scaleY)
  }

  takeDamage(amount: number): void {
    if (this.isDead || this.aiState === 'knockdown') return
    this.hp = Math.max(0, this.hp - amount)
    this.target = this.playerRef
    this.noHitTimer = 0

    // Fase 2 do boss_coco: HP < 100 → velocidade +40%
    if (this.enemyType === 'boss_coco' && !this.inPhase2 && this.hp < 100) {
      this.inPhase2 = true
      this.currentSpeed = this.baseSpeed * 1.4
      this.scene.cameras.main.shake(200, 0.008)
    }

    if (this.hp <= 0) { this.die(); return }

    const kdThreshold = this.enemyType === 'fat' ? KNOCKDOWN_THRESHOLDS.fat
      : this.enemyType === 'strong' || this.isBoss ? KNOCKDOWN_THRESHOLDS.boss : KNOCKDOWN_THRESHOLDS.default
    if (amount >= kdThreshold) {
      this.enterKnockdown()
    } else {
      this.playHitAnim()
    }
  }

  /** Bloqueio do player interrompe o ataque e empurra o inimigo para trás */
  stagger() {
    const coreState = this.buildCoreState()
    const ctx = {
      playerX: this.playerRef.x,
      playerGroundY: this.playerRef.y,
      wandX: this.wandRef.x,
      wandY: this.wandRef.y,
      rngState: 0,
    }
    const { enemy: next } = staggerEnemy(coreState, ctx)

    // No-op guard: if stagger was rejected (dead/knockdown/already staggered)
    if (next.fsm === coreState.fsm && next.staggerTimer === coreState.staggerTimer) return

    this._aiState = next.fsm
    this.staggerTimer = next.staggerTimer
    this.attackCooldown = next.attackCooldown
    this.x = next.x
    this.animLocked = false
  }

  /** Chamado pelo GameScene para separar inimigos sobrepostos */
  applySeparationForce(others: Enemy[]) {
    for (const other of others) {
      if (other === this || other.isDead) continue
      const dx = this.x - other.x
      const dy = this.y - other.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const minDist = 48
      if (dist < minDist && dist > 0) {
        const force = (minDist - dist) / minDist * 1.5
        this.x = Phaser.Math.Clamp(this.x + (dx / dist) * force, RING.leftAt(this.y), RING.rightAt(this.y))
        this.y = Phaser.Math.Clamp(this.y + (dy / dist) * force * 0.6, RING.top, RING.bottom)
      }
    }
  }

  private playHitAnim() {
    if (!this.hasAnims || this.animLocked) return
    if (this.scene.anims.exists(`${this.charKey}-hit`)) {
      this.animLocked = true
      this.play(`${this.charKey}-hit`)
      return
    }
    // Sem animação de hit: flash branco como feedback visual
    const hadTint = this.isTinted
    const prevTint = this.tintTopLeft
    this.setTint(0xffffff)
    this.scene.time.delayedCall(120, () => {
      if (this.isDead) return
      hadTint ? this.setTint(prevTint) : this.clearTint()
    })
  }

  private enterKnockdown() {
    this._aiState = 'knockdown'
    this.knockdownTimer = this.isBoss ? 800 : 1500
    this.animLocked = true
    this.setAlpha(0.6)
    if (this.hasAnims && this.scene.anims.exists(`${this.charKey}-knockdown`)) {
      this.play(`${this.charKey}-knockdown`)
    } else if (this.hasAnims && this.scene.anims.exists(`${this.charKey}-hit`)) {
      this.play(`${this.charKey}-hit`)
    }
  }

  private die() {
    this.isDead = true
    this._aiState = 'dead'
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

    // Toca animação de knockdown até o fim, só então inicia o fade-out
    if (this.hasAnims && this.scene.anims.exists(`${this.charKey}-knockdown`)) {
      this.animLocked = true
      this.play(`${this.charKey}-knockdown`)
      this.once('animationcomplete', fadeOut)
    } else {
      fadeOut()
    }
  }

  private playAttackAnim(kickOnly = false) {
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

  /** Build a minimal EnemyState snapshot for the core AI system. */
  private buildCoreState(): EnemyState {
    return {
      id: 0, // not used for AI step
      enemyType: this.enemyType,
      isBoss: this.isBoss,
      hp: this.hp,
      maxHp: this.maxHp,
      x: this.x,
      y: this.y,
      isDead: this.isDead,
      fsm: this._aiState,
      baseSpeed: this.baseSpeed,
      currentSpeed: this.currentSpeed,
      target: this.target === 'wand' ? 'wand' : 'player',
      noHitTimer: this.noHitTimer,
      waitTimer: this.waitTimer,
      attackCooldown: this.attackCooldown,
      knockdownTimer: this.knockdownTimer,
      staggerTimer: this.staggerTimer,
      inPhase2: this.inPhase2,
    }
  }

  update(delta: number) {
    if (this.isDead) return

    const prevX = this.x
    const prevY = this.y
    const prevFsm = this._aiState

    // Build core state and delegate to pure AI
    const coreState = this.buildCoreState()
    const ctx = {
      playerX: this.playerRef.x,
      playerGroundY: this.playerRef.y,
      wandX: this.wandRef.x,
      wandY: this.wandRef.y,
      rngState: 0,
    }
    const result = stepEnemy(coreState, ctx, delta)
    const next = result.enemy

    // Write back mutable state from core result
    this.attackCooldown  = next.attackCooldown
    this.noHitTimer      = next.noHitTimer
    this.waitTimer       = next.waitTimer
    this.knockdownTimer  = next.knockdownTimer
    this.staggerTimer    = next.staggerTimer
    this.currentSpeed    = next.currentSpeed
    this.inPhase2        = next.inPhase2
    const prevTarget     = this.target
    this.target          = next.target === 'wand' ? 'wand' : this.playerRef

    this._aiState = next.fsm

    // Sync position from core
    this.x = next.x
    this.y = next.y

    // FSM transition visual side-effects: recover → approach restores alpha
    if (next.fsm === 'approach' && prevFsm !== 'approach') {
      this.setAlpha(1)
      this.animLocked = false
    }

    // Ícone de aggro
    this.aggroIcon.setText(this.target !== 'wand' ? '!' : '')
    void prevTarget  // suppress unused warning

    // Emit intents to Phaser event bus (bridge → GameScene handlers)
    if (result.intents.attackWand) {
      this.playAttackAnim(true)
      this.scene.events.emit('enemyAttackWand', this)
    }
    if (result.intents.attackPlayer) {
      this.playAttackAnim()
      this.scene.events.emit('enemyAttackPlayer', this)
    }

    // Horizontal flip
    if (next.fsm !== 'waitBeforeAttack' && next.fsm !== 'staggered') {
      const targetX = this.target === 'wand' ? this.wandRef.x : this.playerRef.x
      this.setFlipX(targetX < this.x)
    }

    // Controle de animação (idle / walk)
    if (this.hasAnims && !this.animLocked) {
      const moving = (this.x !== prevX || this.y !== prevY)
      const isWaiting = (this._aiState === 'waitBeforeAttack')
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

}
