import Phaser from 'phaser'
import { RING } from '../core/config/ring'
import { ALLY_STATS } from '../core/config/stats'
import { Enemy } from './Enemy'
import { stepAlly } from '../core/systems/ally'
import type { AllyState as CoreAllyState, EnemyState as CoreEnemyState } from '../core/types'

type AllyFsmState = 'idle' | 'moveToEnemy' | 'attack' | 'knockdown' | 'recover'

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

// Origem corrigida por animação (compensa conteúdo descentrado no frame)
const ANIM_ORIGIN_X: Record<string, number> = {
  'werdum-punch':       174 / 320,
  'werdum-punch-combo': 174 / 320,
}

const ANIM_CFG: Record<string, { idleEnd: number; moveEnd: number; moveSheet: string }> = {
  werdum: { idleEnd: 7,  moveEnd: 35, moveSheet: 'werdum-walk-sheet' },
  dida:   { idleEnd: 35, moveEnd: 24, moveSheet: 'dida-walk-sheet'  },
  thor:   { idleEnd: 35, moveEnd: 35, moveSheet: 'thor-walk-sheet'  },
}

export class Ally extends Phaser.GameObjects.Sprite {
  private allyState: AllyFsmState = 'idle'
  private attackCooldown: number = 0
  private knockdownTimer: number = 0
  private enemiesRef!: () => Enemy[]
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

  setEnemiesRef(fn: () => Enemy[]) {
    this.enemiesRef = fn
  }

  update(delta: number) {
    const prevX = this.x
    const prevY = this.y
    const prevFsm = this.allyState

    // Build core state snapshot
    const coreState: CoreAllyState = {
      charKey: this.charKey,
      x: this.x,
      y: this.y,
      fsm: this.allyState,
      attackCooldown: this.attackCooldown,
      knockdownTimer: this.knockdownTimer,
    }

    // Convert live Enemy sprites to CoreEnemyState snapshots
    const liveEnemySprites = this.enemiesRef ? this.enemiesRef() : []
    const coreEnemies: CoreEnemyState[] = liveEnemySprites.map((e, idx) => ({
      id: idx,
      enemyType: e.enemyType,
      isBoss: e.isBoss,
      hp: e.hp,
      maxHp: e.maxHp,
      x: e.x,
      y: e.y,
      isDead: e.isDead,
      fsm: e.aiState as CoreEnemyState['fsm'],
      baseSpeed: e.simBaseSpeed,
      currentSpeed: e.simCurrentSpeed,
      target: 'wand' as const,
      noHitTimer: 0,
      waitTimer: 0,
      attackCooldown: 0,
      knockdownTimer: 0,
      staggerTimer: 0,
      inPhase2: e.simInPhase2,
    }))

    const result = stepAlly(coreState, coreEnemies, delta, 0)
    const next = result.ally

    // Write back state
    this.allyState = next.fsm as AllyFsmState
    this.attackCooldown = next.attackCooldown
    this.knockdownTimer = next.knockdownTimer

    // Apply position
    this.x = next.x
    this.y = next.y

    // Visual side-effects for FSM transitions
    if (next.fsm === 'idle' && prevFsm === 'recover') {
      this.setAlpha(1)
      this.animLocked = false
      this.clearTint()
    }

    // Write back damage to Enemy sprites (via takeDamage)
    // The ally core function returns updated enemy states — apply hp changes
    for (let i = 0; i < result.enemies.length; i++) {
      const coreE = result.enemies[i]
      const sprite = liveEnemySprites[i]
      if (!sprite || sprite.isDead) continue
      if (coreE.hp < sprite.hp) {
        const diff = sprite.hp - coreE.hp
        sprite.takeDamage(diff)
      }
    }

    // Flip toward nearest enemy — only while seeking (V1 parity: not during attack cooldown)
    if (this.allyState === 'moveToEnemy') {
      let nearest: Enemy | null = null
      let nearestDist = Infinity
      for (const e of liveEnemySprites.filter(s => !s.isDead)) {
        const dx = e.x - this.x
        const dy = e.y - this.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < nearestDist) { nearestDist = d; nearest = e }
      }
      if (nearest) this.setFlipX(nearest.x < this.x)
    }

    // Play punch animation on attack start
    if (next.fsm === 'attack' && prevFsm !== 'attack') {
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

  knockdown() {
    if (this.allyState === 'knockdown') return
    this.allyState = 'knockdown'
    this.knockdownTimer = 2500
    this.animLocked = true
    this.setAlpha(0.5)
    if (this.hasAnims && this.scene.textures.exists(`${this.charKey}-knockdown-sheet`)) {
      this.play(`${this.charKey}-knockdown`)
    }
  }
}
