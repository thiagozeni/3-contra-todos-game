import Phaser from 'phaser'
import { RING } from '../scenes/GameScene'
import { sound } from '../systems/SoundManager'

export interface MoveInput {
  up: boolean; down: boolean; left: boolean; right: boolean
  block?: boolean
}

const STATS: Record<string, { speed: number; maxHp: number; sizeScale: number; scaleH: number; punchReach: number; kickReach: number }> = {
  werdum: { speed: 180, maxHp: 200, sizeScale: 1.03, scaleH: 0.75, punchReach: 150, kickReach: 170 },
  dida:   { speed: 190, maxHp: 190, sizeScale: 1.015, scaleH: 0.98, punchReach: 140, kickReach: 160 },
  thor:   { speed: 200, maxHp: 200, sizeScale: 0.99, scaleH: 0.94, punchReach: 130, kickReach: 150 },
}

// Personagens com spritesheets de animação prontos
const ANIMATED = new Set(['werdum', 'dida', 'thor'])

type PlayerState = 'normal' | 'knockdown' | 'recovering' | 'blocking'

export class Player extends Phaser.GameObjects.Sprite {
  public readonly charKey: string
  public readonly maxHp: number
  private speed: number
  private playerState: PlayerState = 'normal'

  // Knockdown
  private knockdownTimer = 0
  public isKnockedDown = false

  // Bloqueio
  public isBlocking = false
  private blockAnimStarted = false
  private blockUpdateHandler: ((anim: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => void) | null = null

  // Escala horizontal por animação — normaliza corpo visual para mesma largura em todos os frames
  // Referência: idle@0.72 → corpo visual 114.5px. scaleH = 114.5 / body_width_median
  private static readonly ANIM_SCALE_H: Record<string, number> = {
    // Werdum — normaliza corpo para ~120px/scaleY (body medido: idle 160px, walk 100px)
    'werdum-idle':        0.75,
    'werdum-run':         1.23,
    'werdum-punch':       0.72,
    'werdum-punch-combo': 0.72,
    'werdum-kick':        0.65,
    'werdum-hit':         0.63,
    'werdum-block':       0.735,  // 0.75 × 0.98 = -2%
    'werdum-knockdown':   0.75,
    // Dida — normaliza corpo para ~120px/scaleY (body medido: idle 122px, walk 151px)
    'dida-idle':          0.98,
    'dida-run':           0.80,
    'dida-block':         1.10,
    // Thor — normaliza corpo para ~120px/scaleY (body medido: idle 128px, walk 135px)
    'thor-idle':          0.94,
    'thor-run':           0.89,
  }

  // Multiplicador vertical por animação — compensa sprites menores/maiores em altura
  private static readonly ANIM_SCALE_V: Record<string, number> = {
    'werdum-run':   1.04,
    'werdum-block': 1.078,  // 1.10 × 0.98 = -2%
  }

  // Origem corrigida por animação (compensa conteúdo descentrado no frame)
  private static readonly ANIM_ORIGIN_X: Record<string, number> = {
    'werdum-punch':       174 / 320,
    'werdum-punch-combo': 174 / 320,
    'werdum-kick':        217 / 384,
  }

  // Origem Y por animação — ancora o pé na posição correta sem causar salto na transição
  private static readonly ANIM_ORIGIN_Y: Record<string, number> = {
    'werdum-run': 0.969,  // ancora o pé no mesmo groundY do idle
  }

  // Índice do frame de pausa do bloqueio (dentro da lista de frames da animação, 0-based)
  private static readonly BLOCK_MID_IDX: Record<string, number> = {
    werdum: 5,  // frames 8..18 → 11 frames, pausa no meio
    dida:   4,  // frames 0..8  → 9 frames,  pausa no meio
    thor:   7,  // frames 0..15 → 16 frames, pausa no meio
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
  // Altura original do frame (antes de qualquer scale)
  private readonly frameH: number
  // Cache de perspectiva — evita recalcular quando Y e animação não mudaram
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
    this.speed = stats.speed
    this.maxHp = stats.maxHp

    // Capturar altura original do frame (scaleY=1 neste momento)
    this.frameH = this.height
    // Scale inicial será definido pelo primeiro applyPerspectiveScale()

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
            // punchComboQueued permanece true até o combo iniciar de fato,
            // para que a válvula de segurança em update() não libere o lock prematuramente
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

  /** Ajusta a origem para alinhar o conteúdo visual com a posição lógica */
  private applyOriginForAnim(animKey: string) {
    const ox = Player.ANIM_ORIGIN_X[animKey] ?? 0.5
    const oy = Player.ANIM_ORIGIN_Y[animKey] ?? 1.0
    this.setOrigin(ox, oy)
  }

  /** Scale proporcional à profundidade: fundo=204px, frente=420px */
  private applyPerspectiveScale() {
    const currentAnim = this.anims.currentAnim?.key ?? `${this.charKey}-idle`
    if (this._groundY === this._lastScaleGroundY && currentAnim === this._lastScaleAnimKey) return
    this._lastScaleGroundY = this._groundY
    this._lastScaleAnimKey = currentAnim
    const stats  = STATS[this.charKey] ?? STATS['werdum']
    const t      = Phaser.Math.Clamp(
      (this._groundY - RING.top) / (RING.bottom - RING.top), 0, 1,
    )
    const dispH  = Phaser.Math.Linear(204, 420, t) * stats.sizeScale
    const scaleY = dispH / this.frameH
    const scaleH = Player.ANIM_SCALE_H[currentAnim] ?? stats.scaleH
    const scaleV = Player.ANIM_SCALE_V[currentAnim] ?? 1.0
    this.setScale(scaleY * scaleH, scaleY * scaleV)
  }

  private createAnimations() {
    const k  = this.charKey
    const ac = this.scene.anims
    if (ac.exists(`${k}-idle`)) return

    // Configurações por personagem (idle endFrame, walk/run endFrame)
    const ANIM_CFG: Record<string, { idleEnd: number; moveEnd: number; moveSheet: string }> = {
      werdum: { idleEnd: 7,  moveEnd: 35, moveSheet: 'werdum-walk-sheet'  },
      dida:   { idleEnd: 35, moveEnd: 24, moveSheet: 'dida-walk-sheet'   },
      thor:   { idleEnd: 35, moveEnd: 35, moveSheet: 'thor-walk-sheet'   },
    }
    const cfg = ANIM_CFG[k] ?? { idleEnd: 7, moveEnd: 35, moveSheet: `${k}-run-sheet` }

    ac.create({ key: `${k}-idle`, frames: ac.generateFrameNumbers(`${k}-idle-sheet`, { start: 0, end: cfg.idleEnd }), frameRate: 10, repeat: -1 })
    ac.create({ key: `${k}-run`,  frames: ac.generateFrameNumbers(cfg.moveSheet,     { start: 0, end: cfg.moveEnd }), frameRate: 14, repeat: -1 })

    // Animações de combate (só para personagens com sprites completos)
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
    if (!this.hasAnims) {
      sound.punch()   // chars sem animação (ex: Wand): som imediato
      return
    }
    if (this.animLocked) {
      // enfileira o combo — som tocará quando o combo realmente iniciar
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
    if (!this.hasAnims || this.kickAnimLocked || this.animLocked) return
    this.kickAnimLocked = true
    this.animLocked = true
    sound.kick()
    this.play(`${this.charKey}-kick`)
    this.applyOriginForAnim(`${this.charKey}-kick`)
  }

  /** Dispara animação de dano (chamado pelo GameScene) */
  playHitAnim() {
    if (!this.hasAnims) return
    this.kickAnimLocked = false
    this.punchComboQueued = false
    this.animLocked = true
    // Interrompe bloqueio se estiver ativo
    if (this.blockUpdateHandler) {
      this.off('animationupdate', this.blockUpdateHandler)
      this.blockUpdateHandler = null
    }
    this.blockAnimStarted = false
    this.play(`${this.charKey}-hit`)
    this.applyOriginForAnim(`${this.charKey}-hit`)
  }

  /** Inicia animação de bloqueio: toca até o frame do meio e pausa enquanto a tecla está pressionada */
  private startBlockAnim() {
    if (this.blockAnimStarted) return
    this.blockAnimStarted = true
    // Limpa locks de combate que possam ter ficado travados (soco/chute interrompido pelo bloqueio)
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

  /** Solta o bloqueio ao largar a tecla */
  private releaseBlockAnim() {
    if (!this.blockAnimStarted) return
    this.blockAnimStarted = false  // limpa imediatamente — não depende de animationcomplete
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

  /** Posição lógica Y (sem offset de pulo) — usar para depth e hit detection */
  get groundY(): number { return this._groundY }

  move(input: MoveInput, delta: number) {
    const wantBlock   = !!(input.block && (this.playerState === 'normal' || this.playerState === 'blocking'))
    const wasBlocking = this.playerState === 'blocking'
    this.isBlocking = wantBlock
    if (wantBlock) {
      this.playerState = 'blocking'
      if (this.hasAnims && !wasBlocking) this.startBlockAnim()
      return
    }
    if (wasBlocking) {
      this.playerState = 'normal'
      if (this.hasAnims) this.releaseBlockAnim()
    }

    if (this.playerState === 'knockdown' || this.playerState === 'recovering') return

    const dt = delta / 1000
    let dx = 0, dy = 0

    if (this.playerState === 'normal') {
      if (input.left)  dx -= this.speed
      if (input.right) dx += this.speed
      if (input.up)    dy -= this.speed * 0.6
      if (input.down)  dy += this.speed * 0.6
    }

    if (dx < 0) this.setFlipX(true)
    if (dx > 0) this.setFlipX(false)

    this._groundY = Phaser.Math.Clamp(this._groundY + dy * dt, RING.top, RING.bottom)
    const newX    = Phaser.Math.Clamp(this.x + dx * dt, RING.leftAt(this._groundY), RING.rightAt(this._groundY))
    this.setPosition(newX, this._groundY)
  }

  update(delta: number) {
    this.setY(this._groundY)

    // Knockdown timer
    if (this.playerState === 'knockdown') {
      this.knockdownTimer -= delta
      if (this.knockdownTimer <= 0) {
        this.playerState = 'recovering'
        this.scene.time.delayedCall(500, () => {
          if (this.playerState === 'recovering') {
            this.playerState = 'normal'
            this.isKnockedDown = false
            this.animLocked = false
            this.clearTint()
            this.setAngle(0)
          }
        })
      }
    }

    // Segurança: libera animLocked se nenhuma animação de combate está ativa no momento.
    // Evita travamento causado por animationcomplete não disparar em animações interrompidas
    // (ex: hit chega durante punch-combo pendente, ou race condition de cooldown vs. animação).
    if (this.hasAnims && this.animLocked && this.playerState === 'normal' && !this.blockAnimStarted) {
      const currentKey = this.anims.currentAnim?.key ?? ''
      const isCombatAnim = currentKey.endsWith('-punch') || currentKey.endsWith('-punch-combo')
                        || currentKey.endsWith('-kick')  || currentKey.endsWith('-hit')
      if ((!this.anims.isPlaying || !isCombatAnim) && !this.punchComboQueued) {
        this.animLocked    = false
        this.kickAnimLocked = false
      }
    }

    // Controle de animação (idle / run) — blocking é gerenciado por startBlockAnim/releaseBlockAnim
    if (this.hasAnims && !this.animLocked && this.playerState !== 'blocking' && !this.blockAnimStarted) {
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

  /** Move o personagem para uma posição corrigida (colisão com wand) */
  nudgeTo(x: number, groundY: number) {
    this.x        = x
    this._groundY = groundY
  }

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

  canAttack(): boolean {
    return this.playerState === 'normal'
  }

  knockdown() {
    if (this.playerState !== 'normal' && this.playerState !== 'blocking') return
    this.playerState    = 'knockdown'
    this.isKnockedDown  = true
    this.knockdownTimer = 2000
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
      this.play(`${this.charKey}-knockdown`)
      this.applyOriginForAnim(`${this.charKey}-knockdown`)
    }
    sound.playerKnockdown()
  }
}
