import Phaser from 'phaser'
import { Player } from '../entities/Player'
import { Ally } from '../entities/Ally'
import { ProtectedChar } from '../entities/ProtectedChar'
import { Enemy, EnemyType } from '../entities/Enemy'
import { HUD } from '../ui/HUD'
import { VirtualJoystick } from '../ui/VirtualJoystick'
import { spawnDamageNumber } from '../ui/DamageNumber'
import { sound } from '../systems/SoundManager'
import { saveHighScore } from '../systems/HighScore'
import { startGame } from '../lib/leaderboard'
import { haptics, notifications, appLifecycle } from '../systems/NativeBridge'
import { gameCenter, GC_ACHIEVEMENTS } from '../systems/GameCenterBridge'
import { prepareIOSVideo, padInteractive, isNativeApp } from '../utils/iosVideo'
import { createDomVideoBackground, DomVideoBackground } from '../utils/domVideoBackground'
import { RING } from '../core/config/ring'
import { WAVES } from '../core/config/waves'
import { ENEMY_SCORE_TABLE } from '../core/config/stats'
import { performAttack } from '../core/systems/combat'
import type { GameState, PlayerState, EnemyState } from '../core/types'

export { RING }

const ALL_CHARS = ['werdum', 'dida', 'thor']

export class GameScene extends Phaser.Scene {
  private player!: Player
  private allies: Ally[] = []
  private wand!: ProtectedChar
  private enemies: Enemy[] = []
  private hud!: HUD
  private joystick!: VirtualJoystick

  // Controles teclado
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keys!: Record<string, Phaser.Input.Keyboard.Key>

  // Estado do player
  private playerHP = 150
  private playerMaxHP = 150
  private attackCooldown = 0
  private isGameOver = false
  private isPaused = false

  // Combo, score & stats
  private score = 0
  private comboCount = 0
  private comboTimer = 0
  private enemiesDefeated = 0

  // Timer
  private gameTimerMs = 0

  // Waves
  private currentWave = 0
  private spawnQueue: EnemyType[] = []
  private spawnTimer = 0
  private spawnInterval = 1500
  private waveActive = false
  private waveEndTimer = 0
  private cheatBuffer = ''
  private cheatUsed = false
  private waveDamageTaken = false
  private maxComboReached = 0

  private domBgVideo: DomVideoBackground | null = null

  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    this.isGameOver  = false
    this.isPaused    = false
    this.enemies     = []
    this.allies      = []
    this.score            = 0
    this.comboCount       = 0
    this.comboTimer       = 0
    this.gameTimerMs      = 0
    this.enemiesDefeated  = 0
    this.attackCooldown   = 0
    this.currentWave      = 0
    this.waveActive       = false
    this.waveEndTimer     = 0
    this.spawnQueue       = []
    this.cheatBuffer      = ''
    this.cheatUsed        = false
    this.waveDamageTaken  = false
    this.maxComboReached  = 0
    this.registry.remove('cheatUsed')
    this.spawnTimer       = 0

    const continueFromWave = this.registry.get('continueFromWave') as number | undefined

    // Reseta continueCount apenas em partida nova (não continue)
    if (!continueFromWave) {
      this.registry.set('continueCount', 0)
    }

    const selectedChar: string = this.registry.get('selectedChar') ?? 'werdum'

    // Anti-cheat: em partida nova, abre uma sessão de jogo no servidor. O token
    // amarra a futura submissão de score a esta partida (validação de tempo real
    // no servidor). Em continue, mantém o token da partida em andamento.
    // O "gen" (geração) evita que o token de uma partida abandonada, cuja chamada
    // start_game resolva tarde, sobrescreva o token de uma partida nova já iniciada.
    if (!continueFromWave) {
      this.registry.remove('gameSessionToken')
      const gen = ((this.registry.get('gameSessionGen') as number) ?? 0) + 1
      this.registry.set('gameSessionGen', gen)
      startGame(selectedChar).then(token => {
        if (token && this.registry.get('gameSessionGen') === gen) {
          this.registry.set('gameSessionToken', token)
        }
      })
    }

    // Fundo preto + imagem completa: fallback visível até o vídeo estar pronto.
    const fallbackRect = this.add.rectangle(960, 540, 1920, 1080, 0x000000).setDepth(-2)
    const fallbackImage = this.add.image(960, 540, 'game-bg').setDisplaySize(1920, 1080).setDepth(0)

    if (isNativeApp()) {
      const ringueOverlay = this.add.image(960, 540, 'game-bg-ringue')
        .setDisplaySize(1920, 1080)
        .setDepth(1)
        .setVisible(false)

      this.domBgVideo = createDomVideoBackground('videos/br-ringue.mp4', {
        onReady: () => {
          fallbackRect.setVisible(false)
          fallbackImage.setVisible(false)
          ringueOverlay.setVisible(true)
        },
      })
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyDomVideo())
    } else {
      // Vídeo de fundo (loop, sem áudio). Começa invisível — game-bg.png cobre o
      // fundo enquanto o WKWebView decodifica o primeiro frame.
      try {
        const bgVideo = this.add.video(960, 540, 'game-bg-video')
        let videoVisible = false

        const showVideo = () => {
          if (videoVisible || !bgVideo.active) return
          videoVisible = true
          bgVideo.setDisplaySize(1920, 1080).setVisible(true)
          this.add.image(960, 540, 'game-bg-ringue').setDisplaySize(1920, 1080).setDepth(1)
        }

        const wireNativeVideoEvents = () => {
          const el = (bgVideo as unknown as { video?: HTMLVideoElement }).video
          if (!el) return
          ;['canplay', 'playing'].forEach(eventName => {
            el.addEventListener(eventName, showVideo, { once: true })
          })
        }

        bgVideo.setDepth(0.5).setVisible(false)
        bgVideo.on('created', wireNativeVideoEvents)
        bgVideo.on('play', () => this.time.delayedCall(200, showVideo))
        prepareIOSVideo(bgVideo)
        wireNativeVideoEvents()
        bgVideo.play(true)
      } catch { /* fallback: game-bg.png cobre o fundo */ }
    }

    // Cordas frontais — acima de todos os personagens
    this.add.image(960, 525, 'game-cordas').setDisplaySize(1920, 1080).setDepth(1000)

    // Wand (fundo direito do ringue)
    this.wand = new ProtectedChar(this, 1150, 710)

    // Player (centro, levemente à frente)
    this.player = new Player(this, 960, 840, selectedChar)
    this.playerMaxHP = this.player.maxHp
    this.playerHP    = this.playerMaxHP

    // Aliados
    const allyChars = ALL_CHARS.filter(c => c !== selectedChar)
    const allyPos = [{ x: 760, y: 800 }, { x: 1160, y: 810 }]
    allyChars.forEach((key, i) => {
      const ally = new Ally(this, allyPos[i].x, allyPos[i].y, key)
      ally.setEnemiesRef(() => this.enemies)
      this.allies.push(ally)
    })

    // HUD
    this.hud = new HUD(this)
    this.hud.setPlayerName(selectedChar)
    this.hud.updatePlayerHP(this.playerHP, this.playerMaxHP)
    this.hud.updateWandHP(this.wand.hp, this.wand.maxHp, false)
    this.hud.updateScore(0)
    this.hud.updateEnemyCount(0)

    // Botão PAUSE mobile — visível apenas em touch, abaixo do portrait do Wand
    if (this.sys.game.device.input.touch) {
      const pauseBtn = this.add.text(1784, 242, 'PAUSE', {
        fontSize: '28px',
        color: '#aaaaaa',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5, 0).setDepth(110).setScrollFactor(0).setAlpha(0.6)
      padInteractive(pauseBtn, 32)
      pauseBtn.on('pointerdown', () => this.togglePause())
    }

    // Virtual joystick (mobile)
    this.joystick = new VirtualJoystick(this)

    // Controles teclado
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.keys = {
      W:   this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A:   this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S:   this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D:   this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      J:   this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      K:   this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.K),
      SPC: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      L:   this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.L),
      ESC: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      M:   this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.M),
    }

    // Eventos — off antes do on para evitar acúmulo ao reiniciar a cena (continue)
    this.events.off('enemyAttackWand',   this.onEnemyAttackWand,   this)
    this.events.off('enemyAttackPlayer', this.onEnemyAttackPlayer, this)
    this.events.on('enemyAttackWand',   this.onEnemyAttackWand,   this)
    this.events.on('enemyAttackPlayer', this.onEnemyAttackPlayer, this)

    this.input.keyboard!.off('keydown-ESC')
    this.input.keyboard!.off('keydown-M')
    this.input.keyboard!.on('keydown-ESC', () => this.togglePause())
    this.input.keyboard!.on('keydown-M',   () => {
      const muted = sound.toggleMute()
      this.hud.showMuteStatus(muted)
    })

    // Cheat code escondido: digite "coco" durante a gameplay para pular para a wave 12.
    // O resultado da partida não será salvo no top 10.
    this.input.keyboard!.off('keydown')
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (this.isGameOver || this.isPaused) return
      const key = event.key
      if (key.length !== 1) return
      this.cheatBuffer = (this.cheatBuffer + key.toLowerCase()).slice(-4)
      if (this.cheatBuffer === 'coco') {
        this.cheatBuffer = ''
        this.skipToFinalWave()
      }
    })

    // Suporte a "continue" — retoma da wave em que o jogador perdeu
    if (continueFromWave) {
      if (continueFromWave > 1) this.currentWave = continueFromWave - 1
      this.score       = (this.registry.get('gameOverScore') as number) ?? 0
      this.gameTimerMs = (this.registry.get('gameOverTime')  as number) ?? 0
      this.hud.updateScore(this.score)
      this.registry.remove('continueFromWave')
    }

    // Native: pause/resume e status bar
    appLifecycle.init(
      () => { if (!this.isPaused) this.togglePause() },
      () => { /* resume handled by game state */ },
    )

    // Native: agendar notificações
    notifications.scheduleDailyChallenge()
    notifications.scheduleReturnReminder()

    try { sound.startBgMusic() } catch { /* Audio falhou — mantém gameplay jogável */ }
    this.cameras.main.fadeIn(500, 0, 0, 0)
    this.time.delayedCall(1200, () => { if (!this.isGameOver) this.startNextWave() })
  }

  update(_time: number, delta: number) {
    if (this.isGameOver || this.isPaused) return

    this.gameTimerMs += delta
    this.hud.updateTime(Math.floor(this.gameTimerMs / 1000))

    const joy = this.joystick.getState()

    // Input combinado teclado + joystick
    const moveInput = {
      up:    this.cursors.up.isDown    || this.keys.W.isDown   || joy.dy < -0.3,
      down:  this.cursors.down.isDown  || this.keys.S.isDown   || joy.dy >  0.3,
      left:  this.cursors.left.isDown  || this.keys.A.isDown   || joy.dx < -0.3,
      right: this.cursors.right.isDown || this.keys.D.isDown   || joy.dx >  0.3,
      block: this.keys.L.isDown   || joy.block,
    }

    this.player.move(moveInput, delta)
    this.player.update(delta)
    this.hud.showKnockdownStatus(this.player.isKnockedDown)

    // Ataques
    this.attackCooldown = Math.max(0, this.attackCooldown - delta)
    if ((this.keys.J.isDown || joy.punch) && this.attackCooldown <= 0 && this.player.canAttack()) {
      this.doAttack('punch')
    }
    if ((this.keys.K.isDown || joy.kick) && this.attackCooldown <= 0 && this.player.canAttack()) {
      this.doAttack('kick')
    }

    // Combo timer
    if (this.comboCount > 0) {
      this.comboTimer -= delta
      if (this.comboTimer <= 0) { this.comboCount = 0; this.hud.showCombo(0) }
    }

    // Inimigos
    if (this.enemies.some(e => e.isDead)) {
      this.enemies = this.enemies.filter(e => !e.isDead)
    }
    for (const e of this.enemies) {
      e.applySeparationForce(this.enemies)
      e.update(delta)
    }
    this.hud.updateEnemyCount(this.enemies.length + this.spawnQueue.length)

    // Aliados
    for (const a of this.allies) a.update(delta)

    // Wand
    this.wand.update(delta)

    // Spawn
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= delta
      if (this.spawnTimer <= 0) { this.spawnNextEnemy(); this.spawnTimer = this.spawnInterval }
    }

    // Fim de wave
    if (this.waveActive && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.waveActive = false
      if (!this.waveDamageTaken && !this.cheatUsed) {
        gameCenter.unlock(GC_ACHIEVEMENTS.flawlessWave)
      }
      if (this.currentWave >= WAVES.length) {
        // Última wave — dispara vitória imediatamente, sem delay
        if (!this.isGameOver) this.startNextWave()
      } else {
        this.waveEndTimer = 3000
        sound.waveComplete()
        haptics.success()
        this.hud.showWaveComplete()
      }
    }
    if (!this.waveActive && this.waveEndTimer > 0) {
      this.waveEndTimer -= delta
      if (this.waveEndTimer <= 0 && !this.isGameOver) this.startNextWave()
    }

    // Colisão com o wand — impede personagens de atravessá-lo
    this.enforceWandCollision()

    // Separação entre inimigos ↔ player e inimigos ↔ aliados
    this.separateEnemiesFromChars()

    // Depth sorting pela posição lógica no ringue (não inclui offset do pulo)
    this.player.setDepth(this.player.groundY)
    this.wand.setDepth(this.wand.y)
    for (const a of this.allies) a.setDepth(a.y)
  }

  private separateEnemiesFromChars() {
    const MIN_DIST = 52
    const chars: { x: number; y: number }[] = [
      { x: this.player.x, y: this.player.groundY },
      ...this.allies.map(a => ({ x: a.x, y: a.y })),
    ]
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue
      for (const char of chars) {
        const dx = enemy.x - char.x
        const dy = enemy.y - char.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < MIN_DIST && dist > 0) {
          const force = (MIN_DIST - dist) / MIN_DIST * 1.5
          enemy.y = Phaser.Math.Clamp(enemy.y + (dy / dist) * force * 0.6, RING.top, RING.bottom)
          enemy.x = Phaser.Math.Clamp(enemy.x + (dx / dist) * force, RING.leftAt(enemy.y), RING.rightAt(enemy.y))
        }
      }
    }
  }

  // ── Combate ─────────────────────────────────────────────

  // ── Combat bridge ────────────────────────────────────────────────────────────
  // Builds a minimal GameState snapshot from live Phaser objects, delegates to
  // the pure core function, then writes results back and triggers visual/audio.

  /** Build a minimal GameState snapshot for the pure combat system. */
  private buildSimState(): GameState {
    const playerState: PlayerState = {
      charKey: this.player.charKey,
      hp: this.playerHP,
      maxHp: this.playerMaxHP,
      x: this.player.x,
      y: this.player.y,
      groundY: this.player.groundY,
      fsm: this.player.isKnockedDown ? 'knockdown' : 'normal',
      knockdownTimer: 0,
      attackCooldown: this.attackCooldown,
      isBlocking: this.player.isBlocking,
      facing: this.player.flipX ? -1 : 1,
      scaleX: this.player.scaleX,
    }

    // Enemy IDs = index in this.enemies array (stable for the lifetime of one attack call)
    const enemyStates: EnemyState[] = this.enemies.map((e, idx) => ({
      id: idx,
      enemyType: e.enemyType,
      isBoss: e.isBoss,
      hp: e.hp,
      maxHp: e.maxHp,
      x: e.x,
      y: e.y,
      isDead: e.isDead,
      fsm: e.aiState as EnemyState['fsm'],
      baseSpeed: e.simBaseSpeed,
      currentSpeed: e.simCurrentSpeed,
      target: 'wand',   // conservative default; not needed for hit detection
      noHitTimer: 0,
      waitTimer: 0,
      attackCooldown: 0,
      knockdownTimer: 0,
      staggerTimer: 0,
      inPhase2: e.simInPhase2,
    }))

    return {
      status: 'playing',
      player: playerState,
      enemies: enemyStates,
      allies: [],
      wand: { hp: 100, maxHp: 100, x: this.wand.x, y: this.wand.y },
      wave: {
        currentWave: this.currentWave,
        spawnQueue: [...this.spawnQueue],
        spawnTimer: this.spawnTimer,
        spawnInterval: this.spawnInterval,
        waveActive: this.waveActive,
        waveEndTimer: this.waveEndTimer,
        waveDamageTaken: this.waveDamageTaken,
      },
      score: {
        score: this.score,
        comboCount: this.comboCount,
        comboTimer: this.comboTimer,
        enemiesDefeated: this.enemiesDefeated,
        maxComboReached: this.maxComboReached,
      },
      gameTimerMs: this.gameTimerMs,
      rngState: 0,
      cheatUsed: this.cheatUsed,
    }
  }

  private doAttack(type: 'punch' | 'kick') {
    // Trigger animations immediately (visual feedback before hit resolution)
    if (type === 'punch') this.player.playPunchAnim()
    else this.player.playKickAnim()

    // Build snapshot and delegate to pure core function
    const simState = this.buildSimState()
    const { state: nextState, events } = performAttack(simState, type)

    // Write back cooldown (always set, even on miss)
    this.attackCooldown = nextState.player.attackCooldown

    // Process events
    let hitAny = false
    for (const ev of events) {
      switch (ev.type) {
        case 'attackSwung':
          hitAny = ev.hit
          break

        case 'hit': {
          // ID = index in this.enemies
          const hitEnemy = this.enemies[ev.targetId]
          if (!hitEnemy) break
          sound.hitEnemy()
          const faceY = hitEnemy.y - hitEnemy.displayHeight * 0.8
          spawnDamageNumber(this, hitEnemy.x, faceY, ev.amount)
          const originX = type === 'punch' ? this.player.punchHitX : this.player.kickHitX
          this.spawnHitParticles(originX, faceY)
          this.tweens.add({ targets: hitEnemy, alpha: 0.15, duration: 70, yoyo: true })
          // Apply damage to the sprite to drive animations/death
          hitEnemy.takeDamage(ev.amount)
          break
        }

        case 'enemyDied': {
          // Death was already triggered by takeDamage in the 'hit' case above.
          // Score popup uses the diff from core (score already updated at hitAny block below)
          const scoreForKill = ENEMY_SCORE_TABLE[ev.enemyType] * Math.max(1, Math.floor(this.comboCount / 2))
          this.spawnScorePopup(ev.x, ev.y, scoreForKill)
          // Game Center achievements
          if (ev.enemyType === 'boss_coach') gameCenter.unlock(GC_ACHIEVEMENTS.bossCoach)
          else if (ev.enemyType === 'boss_son') gameCenter.unlock(GC_ACHIEVEMENTS.bossSmoKing)
          else if (ev.enemyType === 'boss_coco') gameCenter.unlock(GC_ACHIEVEMENTS.bossCoco)
          break
        }

        case 'enemyKnockdown':
          // Handled inside takeDamage above
          break

        case 'bossPhase2':
          // Camera shake is handled by Enemy.takeDamage internally
          break

        case 'comboMilestone':
          // V1: haptics.success only at combo 10 (not 20). GC achievements for both.
          if (ev.count === 10) gameCenter.unlock(GC_ACHIEVEMENTS.combo10)
          if (ev.count === 20) gameCenter.unlock(GC_ACHIEVEMENTS.combo20)
          break
      }
    }

    if (hitAny) {
      type === 'punch' ? haptics.medium() : haptics.heavy()
      // Write back score + combo state from the pure result
      this.score = nextState.score.score
      this.comboCount = nextState.score.comboCount
      this.comboTimer = nextState.score.comboTimer
      this.enemiesDefeated = nextState.score.enemiesDefeated
      this.maxComboReached = nextState.score.maxComboReached
      this.hud.updateScore(this.score)
      this.hud.showCombo(this.comboCount)
      // V1: haptics.success at combos 3, 5, and 10
      if (this.comboCount === 3 || this.comboCount === 5 || this.comboCount === 10) {
        haptics.success()
      }
    }
  }

  private spawnScorePopup(x: number, y: number, points: number) {
    const txt = this.add.text(x, y - 20, `+${points}`, {
      fontSize: '20px', color: '#ffffaa',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 3,
    }).setDepth(150).setOrigin(0.5)
    this.tweens.add({
      targets: txt, y: y - 90, alpha: 0,
      duration: 1100, ease: 'Power2',
      onComplete: () => txt.destroy(),
    })
  }

  private spawnHitParticles(x: number, y: number) {
    try {
      const emitter = this.add.particles(x, y, 'spark', {
        speed: { min: 60, max: 160 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.8, end: 0 },
        lifespan: 280,
        quantity: 7,
        tint: [0xff8800, 0xffdd00, 0xffffff],
      })
      this.time.delayedCall(300, () => emitter.destroy())
    } catch (_) { /* partículas são opcionais */ }
  }

  private enforceWandCollision() {
    // Dimensões do conteúdo real do wand-ko (928×250 em canvas 1280×768)
    // Centro do conteúdo: x=635, y=391 (offset do centro da imagem: -5, +7)
    const RX = (928 / 2) * this.wand.scaleX
    const RY = (250 / 2) * this.wand.scaleY
    const wx = this.wand.x + (635 - 640) * this.wand.scaleX
    const wy = this.wand.y + (391 - 384) * this.wand.scaleY

    // Retorna posição corrigida se dentro da elipse
    const resolveEllipse = (cx: number, cy: number): { x: number; y: number } | null => {
      const dx = cx - wx
      const dy = cy - wy
      if ((dx / RX) ** 2 + (dy / RY) ** 2 >= 1) return null
      // Ângulo no espaço normalizado → projeta na borda da elipse
      const angle = Math.atan2(dy / RY, dx / RX)
      return {
        x: Phaser.Math.Clamp(wx + RX * Math.cos(angle), RING.left, RING.right),
        y: Phaser.Math.Clamp(wy + RY * Math.sin(angle), RING.top,  RING.bottom),
      }
    }

    // Player
    const pr = resolveEllipse(this.player.x, this.player.groundY)
    if (pr) this.player.nudgeTo(pr.x, pr.y)

    // Enemies
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue
      const er = resolveEllipse(enemy.x, enemy.y)
      if (er) { enemy.x = er.x; enemy.y = er.y }
    }

    // Allies
    for (const ally of this.allies) {
      const ar = resolveEllipse(ally.x, ally.y)
      if (ar) { ally.x = ar.x; ally.y = ar.y }
    }
  }

  private onEnemyAttackWand(enemy: Enemy) {
    const isDead = this.wand.takeDamage(enemy.damageToWand)
    this.hud.updateWandHP(this.wand.hp, this.wand.maxHp)
    haptics.warning()
    if (isDead) this.gameOver()
  }

  private onEnemyAttackPlayer(enemy: Enemy) {
    if (this.player.isKnockedDown) return

    // Bloqueio reduz dano ao mínimo (1 ponto)
    const dmg = this.player.isBlocking
      ? 1
      : enemy.damageToPlayer

    if (this.player.isBlocking) {
      sound.block()
      enemy.stagger()
    } else {
      sound.playerHit()
      this.player.playHitAnim()
      this.cameras.main.shake(130, 0.0035)
    }

    this.playerHP = Math.max(0, this.playerHP - dmg)
    this.hud.updatePlayerHP(this.playerHP, this.playerMaxHP)
    if (!this.player.isBlocking) this.waveDamageTaken = true

    if (!this.player.isBlocking && (enemy.damageToPlayer >= 25 || this.playerHP <= 0)) {
      this.player.knockdown()
      this.comboCount = 0
      this.hud.showCombo(0)
      haptics.error()
    } else if (!this.player.isBlocking) {
      haptics.heavy()
    }
    if (this.playerHP <= 0) this.gameOver()
  }

  // ── Waves ────────────────────────────────────────────────

  private skipToFinalWave() {
    if (this.cheatUsed || this.isGameOver) return
    this.cheatUsed = true
    this.registry.set('cheatUsed', true)

    // Limpa estado da wave atual
    for (const e of this.enemies) {
      try { e.destroy() } catch { /* noop */ }
    }
    this.enemies     = []
    this.spawnQueue  = []
    this.waveActive  = false
    this.waveEndTimer = 0
    this.spawnTimer  = 0

    // Próxima wave a iniciar será a 12 (boss final)
    this.currentWave = WAVES.length - 1
    this.startNextWave()
  }

  private startNextWave() {
    this.currentWave++
    if (this.currentWave > WAVES.length) { this.showVictory(); return }

    const config = WAVES[this.currentWave - 1]
    this.hud.updateWave(this.currentWave, WAVES.length)
    this.hud.showWaveAnnouncement(this.currentWave, config.isBoss)
    sound.waveStart(config.isBoss)
    this.spawnInterval = config.spawnInterval

    this.spawnQueue = []
    for (const g of config.enemies) {
      for (let i = 0; i < g.count; i++) this.spawnQueue.push(g.type)
    }
    if (!config.isBoss) Phaser.Utils.Array.Shuffle(this.spawnQueue)

    this.spawnTimer  = 800
    this.waveActive  = true
    this.waveDamageTaken = false

    if (this.currentWave > 1) {
      this.playerHP = Math.min(this.playerMaxHP, this.playerHP + this.playerMaxHP * 0.15)
      this.hud.updatePlayerHP(this.playerHP, this.playerMaxHP)
    }
  }

  private spawnNextEnemy() {
    const type = this.spawnQueue.shift()!
    const side = Phaser.Math.Between(0, 1) === 0
    const x = side ? RING.left + 20 : RING.right - 20
    const y = Phaser.Math.Between(RING.top + 30, RING.bottom - 30)
    const enemy = new Enemy(this, x, y, type)
    enemy.wandRef   = this.wand
    enemy.playerRef = this.player
    enemy.setAlpha(0)
    this.tweens.add({ targets: enemy, alpha: 1, duration: 220 })
    this.enemies.push(enemy)
  }

  // ── Pause ────────────────────────────────────────────────

  private pauseOverlay?: Phaser.GameObjects.Container

  private togglePause() {
    this.isPaused = !this.isPaused
    if (this.isPaused) {
      sound.pause()
      // bgVideo removed
      this.pauseOverlay = this.buildPauseMenu()
    } else {
      sound.unpause()
      // bgVideo removed
      this.pauseOverlay?.destroy()
      this.pauseOverlay = undefined
    }
  }

  private buildPauseMenu(): Phaser.GameObjects.Container {
    const { width, height } = this.scale
    const container = this.add.container(0, 0)

    const bg = this.add.rectangle(width / 2, height / 2, 520, 340, 0x000000, 0.92)
      .setStrokeStyle(4, 0xf3c204)

    const title = this.add.text(width / 2, height / 2 - 110, 'PAUSA', {
      fontSize: '52px', color: '#f3c204',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5)

    const makeBtn = (label: string, y: number, cb: () => void) => {
      const txt = this.add.text(width / 2, y, label, {
        fontSize: '24px', color: '#ffffff',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000', strokeThickness: 5,
      }).setOrigin(0.5)
      padInteractive(txt)
      txt.on('pointerdown', cb)
      txt.on('pointerover', () => txt.setColor('#f3c204'))
      txt.on('pointerout',  () => txt.setColor('#ffffff'))
      return txt
    }

    const resumeBtn = makeBtn('CONTINUAR', height / 2 - 20, () => this.togglePause())
    const muteBtn   = makeBtn('MUTE (M)',  height / 2 + 50, () => {
      const m = sound.toggleMute(); this.hud.showMuteStatus(m)
    })
    const quitBtn   = makeBtn('SAIR',      height / 2 + 115, () => {
      sound.stopBgMusic()
      // Limpa todo o estado de partida para um novo jogo limpo
      this.registry.remove('continueFromWave')
      this.registry.remove('continueCount')
      this.registry.remove('gameOverScore')
      this.registry.remove('gameOverTime')
      this.registry.remove('gameOverWave')
      this.registry.remove('totalWaves')
      this.registry.remove('youWinScore')
      this.registry.remove('youWinKills')
      this.registry.remove('youWinTime')
      this.registry.remove('selectedChar')
      this.cameras.main.fadeOut(300, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TitleScene'))
    })

    container.add([bg, title, resumeBtn, muteBtn, quitBtn])
    container.setDepth(3000)
    return container
  }

  // ── Game Over / Vitória ──────────────────────────────────

  private gameOver() {
    if (this.isGameOver) return
    this.isGameOver = true
    sound.stopBgMusic()
    sound.gameOver()
    haptics.error()
    this.saveHighScore()

    this.registry.set('gameOverScore', this.score)
    this.registry.set('gameOverTime',  this.gameTimerMs)
    this.registry.set('gameOverWave',  this.currentWave)
    this.registry.set('totalWaves',    WAVES.length)

    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () =>
      this.scene.start('GameOverContinueScene'),
    )
  }

  private showVictory() {
    if (this.isGameOver) return
    this.isGameOver = true
    sound.stopBgMusic()
    sound.victory()
    haptics.success()
    this.saveHighScore()

    const selectedChar = (this.registry.get('selectedChar') as string) ?? 'werdum'

    this.registry.set('youWinScore', this.score)
    this.registry.set('youWinKills', this.enemiesDefeated)
    this.registry.set('youWinTime',  this.gameTimerMs)
    this.registry.set('totalWaves',  WAVES.length)

    this.playVictoryTransition(selectedChar)
  }

  private playVictoryTransition(selectedChar: string) {
    const { width, height } = this.scale

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x05070a, 0)
      .setDepth(1200)
      .setScrollFactor(0)
    const flash = this.add.rectangle(width / 2, height / 2, width, height, 0xf3c204, 0)
      .setDepth(1201)
      .setScrollFactor(0)

    const title = this.add.text(width / 2, height / 2 - 58, 'RING CLEAR', {
      fontSize: '56px',
      color: '#fff3bf',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 10,
    }).setOrigin(0.5).setDepth(1202).setScrollFactor(0).setAlpha(0).setScale(0.92)

    const subtitle = this.add.text(width / 2, height / 2 + 18, 'MISSION COMPLETE', {
      fontSize: '24px',
      color: '#f3c204',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(1202).setScrollFactor(0).setAlpha(0)

    if (selectedChar === 'dida') this.player.playKickAnim()
    else this.player.playPunchAnim()
    this.player.setFlipX(false)

    this.cameras.main.flash(180, 255, 243, 191, false)
    this.cameras.main.shake(180, 0.003)

    this.tweens.add({
      targets: flash,
      alpha: 0.22,
      duration: 140,
      yoyo: true,
      ease: 'Quad.easeOut',
    })
    this.tweens.add({
      targets: overlay,
      alpha: 0.5,
      duration: 260,
      ease: 'Quad.easeOut',
    })
    this.tweens.add({
      targets: [title, subtitle],
      alpha: 1,
      y: '-=16',
      scale: 1,
      duration: 320,
      ease: 'Back.easeOut',
      stagger: 40,
    })

    this.time.delayedCall(940, () => {
      this.cameras.main.fadeOut(420, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () =>
        this.scene.start('YouWinScene', {
          fromGameScene: true,
          selectedChar,
          finalWave: this.currentWave,
          totalWaves: WAVES.length,
        }),
      )
    })
  }

  // ── High Score (localStorage) ────────────────────────────

  private saveHighScore() {
    saveHighScore(this.score, this.registry)
  }

  private destroyDomVideo() {
    this.domBgVideo?.destroy()
    this.domBgVideo = null
  }
}
