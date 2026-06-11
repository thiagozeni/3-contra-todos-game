import Phaser from 'phaser'
import { Player } from '../entities/Player'
import { Ally } from '../entities/Ally'
import { ProtectedChar } from '../entities/ProtectedChar'
import { Enemy } from '../entities/Enemy'
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
import { createInitialState, update as simUpdate } from '../core/Simulation'
import type { SimInput } from '../core/Simulation'
import { startNextWave as coreStartNextWave } from '../core/systems/waves'
import type { GameState, SimEvent, MoveInput, EnemyType } from '../core/types'
import type { NetClient } from '../net/NetClient'
import { netToPlayerState, netToEnemyState } from '../net/stateAdapters'

export { RING }

/** Data passed via scene.start('GameScene', data) */
export interface GameSceneInitData {
  mode?: 'local' | 'net'
  netClient?: unknown   // NetClient — consumed by Task 6; typed loosely to avoid circular import
  room?: unknown        // ArenaState snapshot — consumed by Task 6
}

export class GameScene extends Phaser.Scene {
  private player!: Player
  private allies: Ally[] = []
  private wand!: ProtectedChar
  /** Enemy sprites keyed by their sim EnemyState id (single source of truth). */
  private enemyViews = new Map<number, Enemy>()
  private hud!: HUD
  private joystick!: VirtualJoystick

  /** THE single source of truth — the headless simulation state. */
  private simState!: GameState

  /**
   * Mode: 'local' = single-player (default); 'net' = co-op online.
   * Task 6 reads this to branch the update loop.
   */
  protected gameMode: 'local' | 'net' = 'local'
  /** NetClient instance — passed from LobbyScene, consumed by Task 6. */
  protected netClient: unknown = null
  /** Latest ArenaState room snapshot — consumed by Task 6. */
  protected netRoom: unknown = null

  // ── Net mode (Task 6) ────────────────────────────────────────────────────────
  /** My own Colyseus sessionId — identifies which PlayerNet drives `this.player`. */
  private mySessionId: string | null = null
  /** Remote player views keyed by sessionId (the local player lives in `this.player`). */
  private remotePlayers = new Map<string, Player>()
  /** Latest events batch queued by the NetClient 'events' callback, drained each frame. */
  private pendingNetEvents: SimEvent[] = []
  /** Unsubscribe handles for NetClient callbacks — cleaned up on shutdown. */
  private netUnsubs: Array<() => void> = []
  /** Change-detection: last input sent + when, to throttle 'input' sends. */
  private lastSentInput: MoveInput | null = null
  private lastSentInputAt = 0
  /** True once a disconnect overlay has been shown, to avoid duplicate exits. */
  private netDisconnected = false
  /** Tracks net status so we only fire game over / victory once on the transition. */
  private netStatusHandled = false

  // Controles teclado
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keys!: Record<string, Phaser.Input.Keyboard.Key>

  private playerMaxHP = 150
  private isGameOver = false
  private isPaused = false

  private cheatBuffer = ''
  /** Tracks the previous score/combo so HUD updates are driven from state diffs. */
  private prevScore = 0
  private prevCombo = 0

  private domBgVideo: DomVideoBackground | null = null

  constructor() {
    super({ key: 'GameScene' })
  }

  /**
   * Called by Phaser before create().
   * Receives optional data from scene.start('GameScene', data).
   * Default to 'local' mode so existing single-player is unaffected.
   */
  init(data?: GameSceneInitData) {
    this.gameMode  = data?.mode ?? 'local'
    this.netClient = data?.netClient ?? null
    this.netRoom   = data?.room ?? null
  }

  create() {
    this.isGameOver  = false
    this.isPaused    = false
    this.allies      = []
    this.enemyViews  = new Map()
    this.cheatBuffer = ''
    this.prevScore   = 0
    this.prevCombo   = 0
    this.registry.remove('cheatUsed')

    const continueFromWave = this.registry.get('continueFromWave') as number | undefined

    // Reseta continueCount apenas em partida nova (não continue)
    if (!continueFromWave) {
      this.registry.set('continueCount', 0)
    }

    const selectedChar: string = this.registry.get('selectedChar') ?? 'werdum'

    // Anti-cheat: em partida nova, abre uma sessão de jogo no servidor.
    // NET MODE: skip — co-op scores are NOT submitted through the single-player
    // anti-cheat path (co-op leaderboard is future work; see saveHighScore()).
    if (!continueFromWave && this.gameMode === 'local') {
      this.registry.remove('gameSessionToken')
      const gen = ((this.registry.get('gameSessionGen') as number) ?? 0) + 1
      this.registry.set('gameSessionGen', gen)
      startGame(selectedChar).then(token => {
        if (token && this.registry.get('gameSessionGen') === gen) {
          this.registry.set('gameSessionToken', token)
        }
      })
    }

    // ── Build the initial simulation state (single source of truth) ──────────────
    // Seed from wall-clock time: determinism matters for tests/server, not casual play.
    const seed = Date.now() & 0xffffffff
    this.simState = createInitialState(selectedChar as 'werdum' | 'dida' | 'thor', seed)

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

    // Wand (fundo direito do ringue) — posição do sim
    this.wand = new ProtectedChar(this, this.simState.wand.x, this.simState.wand.y)

    // Player — posição do sim
    this.player = new Player(this, this.simState.player.x, this.simState.player.y, selectedChar)
    this.playerMaxHP = this.player.maxHp

    // Aliados — um por AllyState do sim.
    // NET MODE: skip — in co-op the other characters are REAL remote players (rendered
    // from the players map), not the single-player AI allies. Creating AI ally sprites
    // here would leave frozen phantoms that never sync.
    if (this.gameMode === 'local') {
      this.simState.allies.forEach(a => {
        this.allies.push(new Ally(this, a.x, a.y, a.charKey))
      })
    }

    // HUD
    this.hud = new HUD(this)
    this.hud.setPlayerName(selectedChar)
    this.hud.updatePlayerHP(this.simState.player.hp, this.playerMaxHP)
    this.hud.updateWandHP(this.simState.wand.hp, this.simState.wand.maxHp, false)
    this.hud.updateScore(0)
    this.hud.updateEnemyCount(0)

    // Botão PAUSE mobile
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

    this.input.keyboard!.off('keydown-ESC')
    this.input.keyboard!.off('keydown-M')
    this.input.keyboard!.on('keydown-ESC', () => this.togglePause())
    this.input.keyboard!.on('keydown-M',   () => {
      const muted = sound.toggleMute()
      this.hud.showMuteStatus(muted)
    })

    // Cheat code escondido: "coco" pula para a wave final. Não salva no top 10.
    this.input.keyboard!.off('keydown')
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      // Cheat is a LOCAL-mode shortcut only — in net mode the server owns wave state,
      // so a local skip would desync; ignore it.
      if (this.isGameOver || this.isPaused || this.gameMode === 'net') return
      const key = event.key
      if (key.length !== 1) return
      this.cheatBuffer = (this.cheatBuffer + key.toLowerCase()).slice(-4)
      if (this.cheatBuffer === 'coco') {
        this.cheatBuffer = ''
        this.skipToFinalWave()
      }
    })

    // Suporte a "continue" — retoma da wave em que o jogador perdeu, preservando
    // score/tempo. Constrói um simState fresco e ajusta wave/score.
    if (continueFromWave) {
      const resumeWave = continueFromWave > 1 ? continueFromWave - 1 : 0
      const resumeScore = (this.registry.get('gameOverScore') as number) ?? 0
      const resumeTime  = (this.registry.get('gameOverTime')  as number) ?? 0
      this.simState = {
        ...this.simState,
        gameTimerMs: resumeTime,
        wave: { ...this.simState.wave, currentWave: resumeWave },
        score: { ...this.simState.score, score: resumeScore },
      }
      this.prevScore = resumeScore
      this.hud.updateScore(resumeScore)
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

    if (this.gameMode === 'net') this.initNetMode()
  }

  update(time: number, delta: number) {
    if (this.gameMode === 'net') {
      this.updateNet(time, delta)
      return
    }

    if (this.isGameOver || this.isPaused) return

    // ── 1. Collect input (keyboard + joystick) into SimInput ─────────────────────
    const joy = this.joystick.getState()
    const input: SimInput = {
      up:    this.cursors.up.isDown    || this.keys.W.isDown || joy.dy < -0.3,
      down:  this.cursors.down.isDown  || this.keys.S.isDown || joy.dy >  0.3,
      left:  this.cursors.left.isDown  || this.keys.A.isDown || joy.dx < -0.3,
      right: this.cursors.right.isDown || this.keys.D.isDown || joy.dx >  0.3,
      block: this.keys.L.isDown || joy.block,
      punch: this.keys.J.isDown || joy.punch,
      kick:  this.keys.K.isDown || joy.kick,
    }

    // ── 2. Advance the simulation ────────────────────────────────────────────────
    const { state, events } = simUpdate(this.simState, input, delta)
    this.simState = state

    // ── 3. Sync sprites FROM state ───────────────────────────────────────────────
    this.syncViews()

    // ── 4. Process events through the effects table ──────────────────────────────
    this.processEvents(events)

    // ── 5. HUD driven by state diffs ─────────────────────────────────────────────
    this.hud.updateTime(Math.floor(this.simState.gameTimerMs / 1000))
    this.hud.updateEnemyCount(this.simState.enemies.length + this.simState.wave.spawnQueue.length)
    if (this.simState.score.score !== this.prevScore) {
      this.prevScore = this.simState.score.score
      this.hud.updateScore(this.simState.score.score)
    }
    if (this.simState.score.comboCount !== this.prevCombo) {
      const prev = this.prevCombo
      this.prevCombo = this.simState.score.comboCount
      this.hud.showCombo(this.simState.score.comboCount)
      // Haptics nos combos 3/5/10 (parity V1) — somente na subida.
      const c = this.simState.score.comboCount
      if (c > prev && (c === 3 || c === 5 || c === 10)) haptics.success()
    }
    this.hud.showKnockdownStatus(this.player.isKnockedDown)

    // ── 6. Rendering-only: depth sort by groundY ─────────────────────────────────
    this.player.setDepth(this.player.groundY)
    this.wand.setDepth(this.wand.y)
    for (const a of this.allies) a.setDepth(a.y)
  }

  // ── View sync ──────────────────────────────────────────────────────────────────

  private syncViews() {
    const s = this.simState
    this.player.syncFromState(s.player)

    // Allies: positional index matches the AllyState array order.
    for (let i = 0; i < this.allies.length; i++) {
      const as = s.allies[i]
      if (as) this.allies[i].syncFromState(as, [...this.enemyViews.values()])
    }

    // Enemies: mirror each EnemyState onto its keyed sprite.
    for (const es of s.enemies) {
      const view = this.enemyViews.get(es.id)
      if (view && !view.isDead) {
        view.syncFromState(es, s.wand.x, s.wand.y, s.player.x)
      }
    }
  }

  // ── Event → effect table ─────────────────────────────────────────────────────
  // ONE switch replicating every V1 side-effect (sound/haptics/gameCenter/hud/
  // tweens/particles/DamageNumber/camera).

  private processEvents(events: SimEvent[]) {
    for (const ev of events) {
      switch (ev.type) {
        case 'attackSwung': {
          // attackSwung always precedes its hit events in the same tick (combat.ts
          // unshifts it), so record the kind for the spark-particle origin below.
          this.lastAttackKind = ev.kind
          // Player attack anim + sound (handled inside play*Anim) + haptics on hit.
          if (ev.kind === 'punch') this.player.playPunchAnim()
          else this.player.playKickAnim()
          if (ev.hit) ev.kind === 'punch' ? haptics.medium() : haptics.heavy()
          break
        }

        case 'hit': {
          const view = this.enemyViews.get(ev.targetId)
          if (!view) break
          // Enemy hit anim/flash fires for ANY hit source (V1 Enemy.takeDamage).
          view.playHitFx()
          // The full juice (sound + damage number + spark particles + alpha flash)
          // was player-only in V1; ally hits chipped silently. Preserve that.
          if (ev.source === 'player') {
            sound.hitEnemy()
            const faceY = view.y - view.displayHeight * 0.8
            spawnDamageNumber(this, view.x, faceY, ev.amount)
            const originX = this.lastAttackKind === 'kick' ? this.player.kickHitX : this.player.punchHitX
            this.spawnHitParticles(originX, faceY)
            this.tweens.add({ targets: view, alpha: 0.15, duration: 70, yoyo: true })
          }
          break
        }

        case 'enemyKnockdown': {
          this.enemyViews.get(ev.id)?.playKnockdownAnim()
          break
        }

        case 'enemyStaggered': {
          this.enemyViews.get(ev.id)?.playStaggerFx()
          sound.block()
          break
        }

        case 'bossPhase2': {
          this.enemyViews.get(ev.id)?.playPhase2Fx()
          break
        }

        case 'enemyDied': {
          const view = this.enemyViews.get(ev.id)
          if (view) {
            view.playDeathAnim()
            this.enemyViews.delete(ev.id)
          }
          const scoreForKill = ENEMY_SCORE_TABLE[ev.enemyType] * Math.max(1, Math.floor(this.simState.score.comboCount / 2))
          this.spawnScorePopup(ev.x, ev.y, scoreForKill)
          if (ev.enemyType === 'boss_coach') gameCenter.unlock(GC_ACHIEVEMENTS.bossCoach)
          else if (ev.enemyType === 'boss_son') gameCenter.unlock(GC_ACHIEVEMENTS.bossSmoKing)
          else if (ev.enemyType === 'boss_coco') gameCenter.unlock(GC_ACHIEVEMENTS.bossCoco)
          break
        }

        case 'enemySpawned': {
          const enemy = new Enemy(this, ev.x, ev.y, ev.enemyType, ev.id)
          enemy.setAlpha(0)
          this.tweens.add({ targets: enemy, alpha: 1, duration: 220 })
          this.enemyViews.set(ev.id, enemy)
          break
        }

        case 'enemyAttacked': {
          this.enemyViews.get(ev.id)?.playAttackAnim(ev.kind === 'kick')
          break
        }

        case 'playerDamaged': {
          this.player.playHitAnim()
          sound.playerHit()
          this.cameras.main.shake(130, 0.0035)
          // Skip heavy() on knockdown hits: playerKnockdown will fire haptics.error() instead,
          // matching V1 which fired only error() (the else-if excluded heavy()).
          if (!ev.knockdown) haptics.heavy()
          this.hud.updatePlayerHP(this.simState.player.hp, this.playerMaxHP)
          break
        }

        case 'playerKnockdown': {
          this.player.playKnockdownAnim()
          haptics.error()
          this.hud.showCombo(0)
          break
        }

        case 'wandDamaged': {
          this.wand.playDamageFx()
          this.hud.updateWandHP(this.simState.wand.hp, this.simState.wand.maxHp)
          haptics.warning()
          break
        }

        case 'waveStarted': {
          const isBoss = WAVES[ev.wave - 1]?.isBoss ?? false
          this.hud.updateWave(ev.wave, WAVES.length)
          this.hud.showWaveAnnouncement(ev.wave, isBoss)
          sound.waveStart(isBoss)
          this.hud.updatePlayerHP(this.simState.player.hp, this.playerMaxHP)
          break
        }

        case 'waveCleared': {
          if (ev.flawless) gameCenter.unlock(GC_ACHIEVEMENTS.flawlessWave)
          sound.waveComplete()
          haptics.success()
          this.hud.showWaveComplete()
          break
        }

        case 'comboMilestone': {
          if (ev.count === 10) gameCenter.unlock(GC_ACHIEVEMENTS.combo10)
          if (ev.count === 20) gameCenter.unlock(GC_ACHIEVEMENTS.combo20)
          break
        }

        case 'victory': {
          if (ev.flawless) gameCenter.unlock(GC_ACHIEVEMENTS.flawlessWave)
          if (!this.isGameOver) this.showVictory()
          break
        }

        case 'gameOver': {
          this.gameOver()
          break
        }
      }
    }
  }

  /** Tracks the last swung attack kind so 'hit' events can place spark particles. */
  private lastAttackKind: 'punch' | 'kick' = 'punch'

  // ════════════════════════════════════════════════════════════════════════════
  // NET MODE (Task 6) — render the server's ArenaState; send input. No local sim.
  // No prediction / interpolation here (that is Task 7) — snapping is expected.
  // ════════════════════════════════════════════════════════════════════════════

  /** Helper accessor: the NetClient passed from LobbyScene (typed). */
  private get net(): NetClient | null {
    return this.netClient as NetClient | null
  }

  /** Latest authoritative ArenaState snapshot (room.state). Null if unavailable. */
  private getNetState(): any {
    return this.net?.getRoomState() ?? null
  }

  /**
   * Wire up net mode: identify the local player, build remote player views from the
   * current players map, and subscribe to state/events/connection callbacks.
   */
  private initNetMode() {
    const client = this.net
    if (!client) { this.handleNetDisconnect(); return }

    this.mySessionId = client.getSessionId()

    // Build remote player views from whoever is already in the players map.
    const state = this.getNetState()
    if (state?.players?.forEach) {
      state.players.forEach((p: any, sid: string) => this.ensurePlayerView(sid, p))
    }

    // Events → FX (drained each frame in updateNet for deterministic ordering).
    this.netUnsubs.push(client.onEvents((batch: any[]) => {
      if (Array.isArray(batch)) this.pendingNetEvents.push(...(batch as SimEvent[]))
    }))

    // New players joining mid-session → spawn their view on next sync.
    this.netUnsubs.push(client.onStateChange((s: any) => {
      if (s?.players?.forEach) {
        s.players.forEach((p: any, sid: string) => this.ensurePlayerView(sid, p))
      }
    }))

    // Connection lost mid-game → clean exit (Task 8 adds reconnection).
    this.netUnsubs.push(client.onConnectionStateChange((cs) => {
      if (cs === 'error' || cs === 'unavailable') this.handleNetDisconnect()
    }))

    // Cleanup on scene shutdown.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const off of this.netUnsubs) { try { off() } catch { /* noop */ } }
      this.netUnsubs = []
    })
  }

  /** The per-frame loop for net mode: send input, render snapshot, drain FX events. */
  private updateNet(time: number, _delta: number) {
    if (this.isGameOver) return

    const client = this.net
    if (!client) { this.handleNetDisconnect(); return }
    // Defensive: connection died (e.g. server stopped) → graceful exit.
    const cs = client.connectionState
    if (cs === 'error' || cs === 'unavailable') { this.handleNetDisconnect(); return }

    // 1. Collect + send local input — UNLESS paused (pause is a local overlay only;
    //    the server keeps simulating; we simply stop steering our character).
    if (!this.isPaused) this.sendLocalInput(time)

    // 2. Render from the latest authoritative snapshot.
    const state = this.getNetState()
    if (state) {
      this.syncNetViews(state)
      this.updateNetHud(state)
      this.handleNetStatus(state)
    }

    // 3. Drain queued FX events through the net effects table.
    if (this.pendingNetEvents.length > 0) {
      const events = this.pendingNetEvents
      this.pendingNetEvents = []
      this.processNetEvents(events)
    }
  }

  /** Collect keyboard+joystick input (same as local) and send it (change-detected). */
  private sendLocalInput(time: number) {
    const joy = this.joystick.getState()
    const input: MoveInput = {
      up:    this.cursors.up.isDown    || this.keys.W.isDown || joy.dy < -0.3,
      down:  this.cursors.down.isDown  || this.keys.S.isDown || joy.dy >  0.3,
      left:  this.cursors.left.isDown  || this.keys.A.isDown || joy.dx < -0.3,
      right: this.cursors.right.isDown || this.keys.D.isDown || joy.dx >  0.3,
      block: this.keys.L.isDown || joy.block,
      punch: this.keys.J.isDown || joy.punch,
      kick:  this.keys.K.isDown || joy.kick,
    }

    // Send only when the input changed OR at most every 50ms (keep-alive).
    const changed = !this.lastSentInput || !sameInput(this.lastSentInput, input)
    if (changed || time - this.lastSentInputAt >= 50) {
      this.net?.sendInput(input)
      this.lastSentInput = input
      this.lastSentInputAt = time
    }
  }

  /** Ensure a Player view exists for a remote sessionId (skips the local player). */
  private ensurePlayerView(sid: string, netPlayer: any): Player {
    if (sid === this.mySessionId) return this.player
    let view = this.remotePlayers.get(sid)
    if (!view) {
      const ps = netToPlayerState(netPlayer)
      view = new Player(this, ps.x, ps.y, ps.charKey || 'dida')
      view.ensureNetHpBar()
      this.remotePlayers.set(sid, view)
    }
    return view
  }

  /** Mirror the authoritative snapshot onto player + enemy + wand views. */
  private syncNetViews(state: any) {
    // ── Players ──────────────────────────────────────────────────────────────
    const seen = new Set<string>()
    if (state.players?.forEach) {
      state.players.forEach((p: any, sid: string) => {
        seen.add(sid)
        const ps = netToPlayerState(p)
        if (sid === this.mySessionId) {
          this.player.syncFromState(ps)
        } else {
          const view = this.ensurePlayerView(sid, p)
          view.syncFromState(ps)
          view.updateNetHpBar(p.hp, p.maxHp)
          // Dim disconnected remotes for clarity (Task 8 refines this).
          view.setAlpha(p.connected === false ? 0.4 : 1)
        }
      })
    }
    // Remove remote views whose player left the map.
    for (const [sid, view] of this.remotePlayers) {
      if (!seen.has(sid)) {
        view.destroyNetHpBar()
        view.destroy()
        this.remotePlayers.delete(sid)
      }
    }

    // ── Enemies ──────────────────────────────────────────────────────────────
    const wandX = state.wandX ?? 0
    const wandY = state.wandY ?? 0
    const myX = this.player.x
    const liveIds = new Set<number>()
    if (state.enemies?.forEach) {
      state.enemies.forEach((e: any) => {
        liveIds.add(e.id)
        let view = this.enemyViews.get(e.id)
        if (!view) {
          view = new Enemy(this, e.x, e.y, e.enemyType as EnemyType, e.id)
          this.enemyViews.set(e.id, view)
        }
        if (!view.isDead) view.syncFromState(netToEnemyState(e), wandX, wandY, myX)
      })
    }
    // Despawn enemy views absent from the snapshot AND not already mid-death anim.
    for (const [id, view] of this.enemyViews) {
      if (!liveIds.has(id) && !view.isDead) {
        view.playDeathAnim()
        this.enemyViews.delete(id)
      }
    }

    // ── Wand ─────────────────────────────────────────────────────────────────
    this.wand.setPosition(wandX, wandY)
    this.wand.setDepth(wandY)

    // ── Depth sort for the local player ───────────────────────────────────────
    this.player.setDepth(this.player.groundY)

    // ── Debug hook (net mode only) — exposes positions for E2E assertions. ─────
    // Harmless in production: only attached while a net match is running.
    try {
      const players: Record<string, { x: number; y: number; hp: number; mine: boolean }> = {}
      state.players?.forEach?.((p: any, sid: string) => {
        players[sid] = { x: p.x, y: p.y, hp: p.hp, mine: sid === this.mySessionId }
      })
      ;(window as any).__netDebug = {
        sessionId: this.mySessionId,
        status: state.status,
        wave: state.wave,
        enemies: state.enemies?.length ?? 0,
        players,
      }
    } catch { /* non-browser env */ }
  }

  /** HUD in net mode: MY hp + wand hp + score/wave/combo from the snapshot. */
  private updateNetHud(state: any) {
    const me = this.mySessionId ? state.players?.get?.(this.mySessionId) : null
    if (me) this.hud.updatePlayerHP(me.hp, me.maxHp)
    this.hud.updateWandHP(state.wandHp ?? 0, state.wandMaxHp ?? 1, false)
    this.hud.updateWave(state.wave ?? 1, WAVES.length)

    const enemyCount = (state.enemies?.length ?? 0) + (state.spawnQueueLen ?? 0)
    this.hud.updateEnemyCount(enemyCount)

    if ((state.score ?? 0) !== this.prevScore) {
      this.prevScore = state.score ?? 0
      this.hud.updateScore(this.prevScore)
    }
    if ((state.comboCount ?? 0) !== this.prevCombo) {
      this.prevCombo = state.comboCount ?? 0
      this.hud.showCombo(this.prevCombo)
    }
    this.hud.showKnockdownStatus(me?.fsm === 'knockdown')
  }

  /** Drive game over / victory from the authoritative status field (once). */
  private handleNetStatus(state: any) {
    if (this.netStatusHandled) return
    if (state.status === 'gameover') {
      this.netStatusHandled = true
      this.netGameOver()
    } else if (state.status === 'victory') {
      this.netStatusHandled = true
      this.netVictory()
    }
  }

  /**
   * Net FX table — mirrors the local processEvents switch, but resolves the affected
   * character view by `sessionId` and reads HP from the live snapshot (no simState).
   * Haptics fire only for MY sessionId; other players flash without haptics.
   */
  private processNetEvents(events: SimEvent[]) {
    for (const ev of events) {
      switch (ev.type) {
        case 'attackSwung': {
          this.lastAttackKind = ev.kind
          const view = this.viewForSession(ev.sessionId)
          if (view) ev.kind === 'punch' ? view.playPunchAnim() : view.playKickAnim()
          if (ev.hit && this.isMine(ev.sessionId)) {
            ev.kind === 'punch' ? haptics.medium() : haptics.heavy()
          }
          break
        }

        case 'hit': {
          const view = this.enemyViews.get(ev.targetId)
          if (!view) break
          view.playHitFx()
          if (ev.source === 'player') {
            sound.hitEnemy()
            const faceY = view.y - view.displayHeight * 0.8
            spawnDamageNumber(this, view.x, faceY, ev.amount)
            this.spawnHitParticles(view.x, faceY)
            this.tweens.add({ targets: view, alpha: 0.15, duration: 70, yoyo: true })
          }
          break
        }

        case 'enemyKnockdown': {
          this.enemyViews.get(ev.id)?.playKnockdownAnim()
          break
        }

        case 'enemyStaggered': {
          this.enemyViews.get(ev.id)?.playStaggerFx()
          sound.block()
          break
        }

        case 'bossPhase2': {
          this.enemyViews.get(ev.id)?.playPhase2Fx()
          break
        }

        case 'enemyDied': {
          const view = this.enemyViews.get(ev.id)
          if (view) {
            view.playDeathAnim()
            this.enemyViews.delete(ev.id)
          }
          const combo = this.getNetState()?.comboCount ?? 0
          const scoreForKill = ENEMY_SCORE_TABLE[ev.enemyType] * Math.max(1, Math.floor(combo / 2))
          this.spawnScorePopup(ev.x, ev.y, scoreForKill)
          if (ev.enemyType === 'boss_coach') gameCenter.unlock(GC_ACHIEVEMENTS.bossCoach)
          else if (ev.enemyType === 'boss_son') gameCenter.unlock(GC_ACHIEVEMENTS.bossSmoKing)
          else if (ev.enemyType === 'boss_coco') gameCenter.unlock(GC_ACHIEVEMENTS.bossCoco)
          break
        }

        case 'enemySpawned': {
          // The view is created by syncNetViews when the enemy first appears, but
          // spawning it here on the event keeps the fade-in juice (V1 parity).
          if (!this.enemyViews.has(ev.id)) {
            const enemy = new Enemy(this, ev.x, ev.y, ev.enemyType, ev.id)
            enemy.setAlpha(0)
            this.tweens.add({ targets: enemy, alpha: 1, duration: 220 })
            this.enemyViews.set(ev.id, enemy)
          }
          break
        }

        case 'enemyAttacked': {
          this.enemyViews.get(ev.id)?.playAttackAnim(ev.kind === 'kick')
          break
        }

        case 'playerDamaged': {
          const view = this.viewForSession(ev.sessionId)
          view?.playHitAnim()
          sound.playerHit()
          if (this.isMine(ev.sessionId)) {
            this.cameras.main.shake(130, 0.0035)
            if (!ev.knockdown) haptics.heavy()
          }
          break
        }

        case 'playerKnockdown': {
          const view = this.viewForSession(ev.sessionId)
          view?.playKnockdownAnim()
          if (this.isMine(ev.sessionId)) {
            haptics.error()
            this.hud.showCombo(0)
          }
          break
        }

        case 'wandDamaged': {
          this.wand.playDamageFx()
          const s = this.getNetState()
          if (s) this.hud.updateWandHP(s.wandHp ?? 0, s.wandMaxHp ?? 1)
          haptics.warning()
          break
        }

        case 'waveStarted': {
          const isBoss = WAVES[ev.wave - 1]?.isBoss ?? false
          this.hud.updateWave(ev.wave, WAVES.length)
          this.hud.showWaveAnnouncement(ev.wave, isBoss)
          sound.waveStart(isBoss)
          break
        }

        case 'waveCleared': {
          if (ev.flawless) gameCenter.unlock(GC_ACHIEVEMENTS.flawlessWave)
          sound.waveComplete()
          haptics.success()
          this.hud.showWaveComplete()
          break
        }

        case 'comboMilestone': {
          if (ev.count === 10) gameCenter.unlock(GC_ACHIEVEMENTS.combo10)
          if (ev.count === 20) gameCenter.unlock(GC_ACHIEVEMENTS.combo20)
          break
        }

        case 'victory': {
          if (ev.flawless) gameCenter.unlock(GC_ACHIEVEMENTS.flawlessWave)
          // Status field drives the actual transition (handleNetStatus); avoid double.
          break
        }

        case 'gameOver': {
          // Status field drives the transition (handleNetStatus).
          break
        }
      }
    }
  }

  /** Resolve the Player view for a sessionId (local or remote); null if unknown. */
  private viewForSession(sid: string | undefined): Player | null {
    if (!sid) return null
    if (sid === this.mySessionId) return this.player
    return this.remotePlayers.get(sid) ?? null
  }

  /** True when an event belongs to the local player (gates haptics/screen-shake). */
  private isMine(sid: string | undefined): boolean {
    return !!sid && sid === this.mySessionId
  }

  /** Net game over: reuse the local flow but DO NOT save a co-op high score. */
  private netGameOver() {
    if (this.isGameOver) return
    this.isGameOver = true
    sound.stopBgMusic()
    sound.gameOver()
    haptics.error()
    // Co-op leaderboard is future work — no saveHighScore / anti-cheat submit here.
    const s = this.getNetState()
    this.registry.set('gameOverScore', s?.score ?? 0)
    this.registry.set('gameOverWave',  s?.wave ?? 0)
    this.registry.set('totalWaves',    WAVES.length)
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TitleScene'))
  }

  /** Net victory: reuse the victory transition but skip the co-op score save. */
  private netVictory() {
    if (this.isGameOver) return
    this.isGameOver = true
    sound.stopBgMusic()
    sound.victory()
    haptics.success()
    const selectedChar = (this.registry.get('selectedChar') as string) ?? 'werdum'
    const s = this.getNetState()
    // Co-op leaderboard is future work — no saveHighScore here.
    this.registry.set('youWinScore', s?.score ?? 0)
    this.registry.set('totalWaves',  WAVES.length)
    this.playVictoryTransition(selectedChar)
  }

  /** Graceful exit when the room disconnects mid-game (Task 8 adds reconnection). */
  private handleNetDisconnect() {
    if (this.netDisconnected || this.isGameOver) return
    this.netDisconnected = true
    sound.stopBgMusic()

    const { width, height } = this.scale
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.85)
      .setDepth(4000).setScrollFactor(0)
    const msg = this.add.text(width / 2, height / 2 - 30, 'CONEXÃO PERDIDA', {
      fontSize: '44px', color: '#ff6666',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(4001).setScrollFactor(0)
    this.add.text(width / 2, height / 2 + 40, 'Voltando ao menu...', {
      fontSize: '22px', color: '#ffffff',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(4001).setScrollFactor(0)
    void overlay; void msg

    this.time.delayedCall(1800, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TitleScene'))
    })
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

  // ── Cheat ────────────────────────────────────────────────────────────────────

  private skipToFinalWave() {
    if (this.simState.cheatUsed || this.isGameOver) return
    this.registry.set('cheatUsed', true)

    // Destrói os sprites de inimigos da wave atual.
    for (const view of this.enemyViews.values()) {
      try { view.destroy() } catch { /* noop */ }
    }
    this.enemyViews.clear()

    // Constrói um estado em que a PRÓXIMA wave a iniciar é a final (boss), depois
    // dispara startNextWave do core (equivalente ao comportamento V1).
    const prepared: GameState = {
      ...this.simState,
      cheatUsed: true,
      enemies: [],
      wave: {
        ...this.simState.wave,
        currentWave: WAVES.length - 1,
        spawnQueue: [],
        waveActive: false,
        waveEndTimer: 0,
        spawnTimer: 0,
      },
    }
    const { state, events } = coreStartNextWave(prepared)
    this.simState = state
    this.processEvents(events)
  }

  // ── Pause ────────────────────────────────────────────────────────────────────

  private pauseOverlay?: Phaser.GameObjects.Container

  private togglePause() {
    this.isPaused = !this.isPaused
    if (this.isPaused) {
      sound.pause()
      this.pauseOverlay = this.buildPauseMenu()
    } else {
      sound.unpause()
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
      // Net mode: leave the room so the server frees our slot.
      if (this.gameMode === 'net') this.net?.leave().catch(() => {})
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

  // ── Game Over / Vitória ──────────────────────────────────────────────────────

  private gameOver() {
    if (this.isGameOver) return
    this.isGameOver = true
    sound.stopBgMusic()
    sound.gameOver()
    haptics.error()
    this.saveHighScore()

    this.registry.set('gameOverScore', this.simState.score.score)
    this.registry.set('gameOverTime',  this.simState.gameTimerMs)
    this.registry.set('gameOverWave',  this.simState.wave.currentWave)
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

    this.registry.set('youWinScore', this.simState.score.score)
    this.registry.set('youWinKills', this.simState.score.enemiesDefeated)
    this.registry.set('youWinTime',  this.simState.gameTimerMs)
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
          finalWave: this.simState.wave.currentWave,
          totalWaves: WAVES.length,
        }),
      )
    })
  }

  // ── High Score (localStorage) ────────────────────────────────────────────────

  private saveHighScore() {
    saveHighScore(this.simState.score.score, this.registry)
  }

  private destroyDomVideo() {
    this.domBgVideo?.destroy()
    this.domBgVideo = null
  }
}

/** Structural equality for MoveInput — drives net-mode input change detection. */
function sameInput(a: MoveInput, b: MoveInput): boolean {
  return a.up === b.up && a.down === b.down && a.left === b.left && a.right === b.right
    && a.block === b.block && a.punch === b.punch && a.kick === b.kick
}
