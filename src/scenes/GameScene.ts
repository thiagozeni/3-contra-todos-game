import Phaser from 'phaser'
import { Player } from '../entities/Player'
import { Ally } from '../entities/Ally'
import { ProtectedChar } from '../entities/ProtectedChar'
import { Enemy } from '../entities/Enemy'
import { HUD } from '../ui/HUD'
import { VirtualJoystick } from '../ui/VirtualJoystick'
import { spawnDamageNumber } from '../ui/DamageNumber'
import { coopDefeatSummary } from '../ui/coopSummary'
import { makeOverlay, hex, semantic, primitive, FAMILY } from '../ui/ds'
import { fillPixelCircle } from '../ui/ds/components/para'
import { t } from '../i18n'
import { sound } from '../systems/SoundManager'
import { saveHighScore } from '../systems/HighScore'
import { startGame } from '../lib/leaderboard'
import { Capacitor } from '@capacitor/core'
import { haptics, notifications, appLifecycle } from '../systems/NativeBridge'
import { gameCenter, GC_ACHIEVEMENTS } from '../systems/GameCenterBridge'
import { isMacCompat } from '../utils/iosVideo'
import { RING } from '../core/config/ring'
import { WAVES } from '../core/config/waves'
import { ENEMY_SCORE_TABLE } from '../core/config/stats'
import { createInitialState, update as simUpdate } from '../core/Simulation'
import type { SimInput } from '../core/Simulation'
import { startNextWave as coreStartNextWave } from '../core/systems/waves'
import type { GameState, SimEvent, MoveInput, EnemyType } from '../core/types'
import type { NetClient } from '../net/NetClient'
import { netToPlayerState, netToEnemyState, netToAllyState } from '../net/stateAdapters'
import { createLifecycleManager } from '../net/lifecycle'
import type { LifecycleManager } from '../net/lifecycle'
import {
  createBuffer,
  pushSnapshot,
  sampleAt,
  INTERP_DELAY_MS,
  type SnapshotBuffer,
  type Interpolatable,
} from '../net/interpolation'
import { predictStep, reconcile } from '../net/prediction'

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
  /** Co-op leaderboard: epoch ms quando o HOST abriu a sessão anti-cheat (start da partida). */
  private coopStartMs = 0
  /** Remote player views keyed by sessionId (the local player lives in `this.player`). */
  private remotePlayers = new Map<string, Player>()
  /** Latest events batch queued by the NetClient 'events' callback, drained each frame. */
  private pendingNetEvents: SimEvent[] = []
  /** Unsubscribe handles for NetClient callbacks — cleaned up on shutdown. */
  private netUnsubs: Array<() => void> = []
  /** Change-detection: last input sent + when, to throttle 'input' sends. */
  private lastSentInput: MoveInput | null = null
  private lastSentInputAt = 0
  /** True once a final disconnect overlay has been shown (lost + no recovery), to avoid duplicate exits. */
  private netDisconnected = false
  /** App lifecycle manager — pauses input on background, triggers reconnect/leaveToMenu on foreground. */
  private lifecycleMgr: LifecycleManager | null = null
  /** Tracks net status so we only fire game over / victory once on the transition. */
  private netStatusHandled = false
  /** Reconnecting overlay objects — created on drop, destroyed on recovery. */
  private reconnectingOverlay: {
    bg: Phaser.GameObjects.Rectangle
    title: Phaser.GameObjects.Text
    sub: Phaser.GameObjects.Text
  } | null = null

  // ── Net mode (Task 7) — interpolation + local-character prediction ────────────
  /** Snapshot buffer for REMOTE entities (other players + enemies + wand), rendered
   *  ~INTERP_DELAY_MS behind the latest server snapshot via position lerp. */
  private interpBuffer: SnapshotBuffer<Interpolatable> = createBuffer<Interpolatable>()
  /** My locally-predicted PlayerState (position only; combat fields are authoritative). */
  private predicted: import('../core/types').PlayerState | null = null
  /** Monotonic client clock (performance.now) at the moment each snapshot arrived. */
  private now(): number {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now())
  }

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
    this.interpBuffer = createBuffer<Interpolatable>()
    this.predicted   = null
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

    // ── Arena v2 (dark, camadas DOM responsivas) ───────────────────────────────
    // #arena-bg   = fundo + ringue (atrás do canvas transparente).
    // #arena-front = cordas da frente (na frente do canvas; lutadores renderizam ATRÁS delas).
    // Ambos cover -> revelam torcida nas laterais conforme a tela alarga. (#arena-bg vira
    // vídeo animado na Fase 3.) Ligados no create, desligados no shutdown.
    // #arena-bg = vídeo de fundo + ringue (loop dark; cordas embutidas, logo sem círculo). Poster
    // (arena-bg.png) cobre como fallback se o vídeo falhar. #arena-front = as mesmas cordas da
    // frente recortadas (mask do próprio back), na frente do canvas → lutadores renderizam ATRÁS
    // delas (profundidade). Mesma fonte = alinhamento pixel-perfeito. Ambos cover → reveal lateral.
    // Camada #arena-front (profundidade: lutador atrás das cordas) DESLIGADA por decisão
    // de produto — esta versão NÃO terá cordas na frente (recorte escuro-sobre-escuro não
    // automatizável e fora do escopo). As cordas inteiras já vêm do back; nada a fazer.
    // Arena premium v2 (conceito GPT) — 3 camadas de profundidade:
    //   #arena-bg  (z0): arena dark + ringue estáticos (arena-premium-bg.png)
    //   canvas     (z2): os lutadores
    //   #arena-front (z3): cinegrafistas nos cantos, na frente dos lutadores (arena-premium-front.png)
    const arenaBg = document.getElementById('arena-bg') as HTMLVideoElement | null
    if (arenaBg) {
      arenaBg.poster = 'imgs/cenario/arena-premium-bg.png'
      arenaBg.style.display = 'block'
      // Loop de vídeo da arena (luzes varrendo + arquibancada reagindo + placa pulsando).
      // Fallback para o poster PNG em Mac-compat / autoplay barrado.
      if (!isMacCompat()) {
        arenaBg.src = 'videos/arena-loop.mp4'
        arenaBg.loop = true; arenaBg.muted = true
        const pl = arenaBg.play()
        if (pl && typeof pl.catch === 'function') {
          pl.catch(() => { this.input.once('pointerdown', () => arenaBg.play().catch(() => {})) })
        }
      } else {
        arenaBg.removeAttribute('src')
      }
    }
    // Cinegrafistas ANIMADOS — camada DOM (#cam-left-fx / #cam-right-fx) ancorada nas
    // bordas REAIS da tela (não no canvas letterboxed), p/ ficarem colados nos cantos
    // em qualquer proporção (mobile largo). Sprite-sheet animado via CSS (ver index.html).
    // Ligados aqui, escondidos no shutdown da cena.
    const camFx = ['cam-left-fx', 'cam-right-fx'].map((id) => document.getElementById(id))
    camFx.forEach((el) => { if (el) el.style.display = 'block' })
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      camFx.forEach((el) => { if (el) el.style.display = 'none' })
    })
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (arenaBg) { arenaBg.style.display = 'none' }
    })

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

    // Botão PAUSE — REDONDO (círculo escuro + borda dourada dupla), sem o antigo
    // fundo amarelo quadrado que ficava cortado. Ícone ic-pause centrado; hover/press.
    const pbX = 1836, pbY = 284, pbR = 50
    const pbg = this.add.graphics().setDepth(110).setScrollFactor(0)
    // Disco em ESCADA (pixelado): preto + filete dourado + fundo escuro.
    fillPixelCircle(pbg, pbX, pbY, pbR, 4, primitive.black, 1)
    fillPixelCircle(pbg, pbX, pbY, pbR - 3, 4, primitive.goldBrand, 1)
    fillPixelCircle(pbg, pbX, pbY, pbR - 6, 4, primitive.night, 0.92)
    const pbSrc = this.textures.get('ic-pause').getSourceImage() as { width: number; height: number }
    const pbAr = pbSrc.width > 0 && pbSrc.height > 0 ? pbSrc.width / pbSrc.height : 1
    // Thiago pediu o ícone 10px mais p/ cima dentro do círculo (de +4 → -6).
    const pbIcon = this.add.image(pbX, pbY - 6, 'ic-pause')
      .setDisplaySize(Math.round(46 * pbAr), 46).setDepth(111).setScrollFactor(0)
    const pbBase = pbIcon.scale
    const pbHit = this.add.circle(pbX, pbY, pbR + 6, 0x000000, 0)
      .setDepth(112).setScrollFactor(0).setInteractive({ useHandCursor: true })
    pbHit.on('pointerover', () => this.tweens.add({ targets: pbIcon, scale: pbBase * 1.14, duration: 120, ease: 'Back.Out' }))
    pbHit.on('pointerout', () => this.tweens.add({ targets: pbIcon, scale: pbBase, duration: 140, ease: 'Quad.Out' }))
    pbHit.on('pointerdown', () => {
      this.tweens.add({ targets: pbIcon, scale: pbBase * 0.88, duration: 70, yoyo: true })
      this.togglePause()
    })

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
      // BUG FIX: o boot da wave 1 só dispara em currentWave===0. No continue,
      // currentWave=resumeWave (≠0), então nenhuma wave iniciava → sem inimigos.
      // Deixa o estado como "wave recém-limpa com timer prestes a expirar": no
      // próximo tick o checkWaveEnd conta o timer a 0 e chama startNextWave, que
      // inicia a wave em que o jogador morreu (resumeWave+1 = continueFromWave).
      this.simState = {
        ...this.simState,
        gameTimerMs: resumeTime,
        wave: { ...this.simState.wave, currentWave: resumeWave, waveActive: false, waveEndTimer: 1, spawnQueue: [] },
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

    // ── FB1: reconcile MY OWN character to the AUTHORITATIVE charKey ─────────────
    // `this.player` was built in create() from the registry `selectedChar`, which is
    // STALE / empty in net mode: the server is the single source of truth for character
    // assignment. With the FB3 arcade selector the player's confirmed pick lives in the
    // server's PlayerNet.charKey — the registry value is only a leftover hint. Player.charKey
    // is readonly and the texture/anims are bound at construction, so a wrong charKey can
    // never be corrected by syncFromState — the only fix is to destroy + recreate the view.
    // Do it here, before any rendering.
    const meNet = this.mySessionId ? state?.players?.get?.(this.mySessionId) : null
    if (meNet?.charKey) this.reconcileLocalCharKey(meNet.charKey)

    // Co-op leaderboard: o HOST abre a sessão anti-cheat no início da partida
    // (mede o tempo real). Só o host submete o score do time no fim (netVictory).
    if (client.amHost()) {
      this.registry.remove('gameSessionToken')
      this.coopStartMs = Date.now()
      const hostChar = (meNet?.charKey as string) ?? this.player.charKey ?? 'werdum'
      startGame(hostChar).then(token => {
        if (token) this.registry.set('gameSessionToken', token)
      }).catch(() => { /* offline → score não será salvo */ })
    }

    if (state?.players?.forEach) {
      state.players.forEach((p: any, sid: string) => this.ensurePlayerView(sid, p))
    }

    // FB4: create MY own indicator. slotIndex may be -1 if the match hasn't started
    // yet; it will be set lazily in renderPredictedLocal once the server sends it.
    const mySlot: number = typeof meNet?.slotIndex === 'number' ? meNet.slotIndex : -1
    if (mySlot >= 0) {
      this.player.destroyPlayerIndicator()
      this.player.ensurePlayerIndicator(mySlot, true)
    }

    // FB9: build ally HUD rows for OTHER human players.
    this.setupAllyHuds(state)

    // FB12: E2E hook — preview the co-op defeat overlay without a real team wipe
    // (forcing status 'gameover' from the client is not possible; the overlay
    // render is validated here, the wording by tests/ui/coopSummary.test.ts).
    ;(window as unknown as Record<string, unknown>).__gsTest = {
      previewDefeat: (score: number, wave: number) => this.showCoopDefeatOverlay(score, wave),
    }

    // Events → FX (drained each frame in updateNet for deterministic ordering).
    this.netUnsubs.push(client.onEvents((batch: any[]) => {
      if (Array.isArray(batch)) this.pendingNetEvents.push(...(batch as SimEvent[]))
    }))

    // On every authoritative patch: spawn views for new players AND push a
    // timestamped snapshot of all REMOTE entities into the interpolation buffer.
    this.netUnsubs.push(client.onStateChange((s: any) => {
      if (s?.players?.forEach) {
        s.players.forEach((p: any, sid: string) => this.ensurePlayerView(sid, p))
      }
      this.bufferRemoteSnapshot(s)
    }))

    // Seed the buffer + my prediction with the initial snapshot, if present.
    if (state) {
      this.bufferRemoteSnapshot(state)
      const me = this.mySessionId ? state.players?.get?.(this.mySessionId) : null
      if (me) this.predicted = netToPlayerState(me)
    }

    // Connection state changes:
    //   'reconnecting' → show "Reconectando..." overlay; game keeps rendering last state
    //   'connected'    → hide the reconnecting overlay, resume normally
    //   'unavailable'  → definitive loss (server down / reconnection failed) → TitleScene
    //   'error'        → also definitive → TitleScene
    this.netUnsubs.push(client.onConnectionStateChange((cs) => {
      if (cs === 'reconnecting') {
        this.showReconnectingOverlay()
      } else if (cs === 'connected') {
        this.hideReconnectingOverlay()
      } else if (cs === 'unavailable' || cs === 'error') {
        this.hideReconnectingOverlay()
        this.handleNetDisconnect()
      }
    }))

    // ── App lifecycle (background/foreground) ─────────────────────────────────
    // Native: @capacitor/app appStateChange. Web: document.visibilitychange.
    // Both route through the same pure state machine.
    this.lifecycleMgr = this.initLifecycleManager(client)

    // Cleanup on scene shutdown.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const off of this.netUnsubs) { try { off() } catch { /* noop */ } }
      this.netUnsubs = []
      this.lifecycleMgr?.destroy()
      this.lifecycleMgr = null
      this.hud?.clearAllyHuds()
    })
  }

  /**
   * Build + register the lifecycle manager for net mode.
   *
   * Native (Capacitor): uses App.addListener('appStateChange').
   * Web: also wires document.visibilitychange as an analogue (lower-fidelity
   *   but useful for desktop/web testing when backgrounding is not possible).
   *
   * Only registered in net mode — single-player ignores lifecycle.
   *
   * NOTE: On web (non-native), document.visibilitychange fires and routes
   *   through the same machine. The plan explicitly includes web wiring
   *   (Task 3 Step 3: "opcionalmente espelhar via document.visibilitychange
   *   (mesma máquina) — bônus de robustez, atrás de feature-detect").
   */
  private initLifecycleManager(client: NetClient): LifecycleManager {
    const mgr = createLifecycleManager({
      now: () => Date.now(),
      onPauseInput: () => client.pauseSending(),
      onResumeInput: () => client.resumeSending(),
      // requestReconnect: SDK's onDrop → auto-retry is already running; no explicit
      // call needed. We resume sending here so inputs flow once the socket is back.
      requestReconnect: () => { /* SDK auto-reconnect covers this via onDrop/onReconnect */ },
      leaveToMenu: () => {
        // Destroy first to remove DOM/Capacitor listeners before clearing the ref.
        const mgr = this.lifecycleMgr
        this.lifecycleMgr = null   // prevent double-trigger on subsequent events
        mgr?.destroy()
        this.handleNetDisconnect()
      },
      reconnectWindowMs: 60_000,
    })

    // ── Native path (Capacitor iOS / Android) ──────────────────────────────
    // Dynamic import keeps @capacitor/app out of the web bundle tree when not
    // needed, matching the pattern used by shareInvite.ts in this codebase.
    if (Capacitor.isNativePlatform()) {
      let appListenerHandle: { remove: () => void } | null = null
      // Guard against the async import resolving after destroy() is called
      // (e.g. scene shutdown between initNetMode and the Promise resolving).
      let cancelled = false

      import('@capacitor/app')
        .then(({ App }) => {
          if (cancelled) return   // scene already shut down — do not register
          return App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
            if (isActive) {
              mgr.onAppForeground()
            } else {
              mgr.onAppBackground()
            }
          })
        })
        .then((handle) => {
          if (handle) {
            if (cancelled) {
              // Destroyed while awaiting — remove immediately
              handle.remove()
            } else {
              appListenerHandle = handle
            }
          }
        })
        .catch(() => { /* addListener may fail on web shim — not critical */ })

      // Extend destroy to remove the Capacitor listener (and set cancelled flag).
      const baseDestroy = mgr.destroy.bind(mgr)
      ;(mgr as { destroy: () => void }).destroy = () => {
        baseDestroy()
        cancelled = true
        appListenerHandle?.remove()
        appListenerHandle = null
      }
    }

    // ── Web path: document.visibilitychange ────────────────────────────────
    // Fires on tab-switch/minimise in browsers. On native the Capacitor
    // handler above also fires; idempotency in the machine makes this safe.
    if (typeof document !== 'undefined') {
      const onVisibility = () => {
        if (document.hidden) {
          mgr.onAppBackground()
        } else {
          mgr.onAppForeground()
        }
      }
      document.addEventListener('visibilitychange', onVisibility)

      // Extend destroy to remove the DOM listener.
      const baseDestroy2 = mgr.destroy.bind(mgr)
      ;(mgr as { destroy: () => void }).destroy = () => {
        baseDestroy2()
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }

    return mgr
  }

  /** The per-frame loop for net mode: predict my movement, render remotes
   *  interpolated, send input, drain FX events. */
  private updateNet(time: number, delta: number) {
    if (this.isGameOver) return

    const client = this.net
    if (!client) { this.handleNetDisconnect(); return }
    // Defensive: connection died permanently → graceful exit.
    const cs = client.connectionState
    if (cs === 'error' || cs === 'unavailable') { this.handleNetDisconnect(); return }
    // While reconnecting: keep rendering last state (overlay is shown by connection
    // state callback), but skip input collection / sending (no active connection).
    if (cs === 'reconnecting') return

    // 1. Collect local input once; reuse it for both prediction and the wire.
    const input = this.collectInput()

    // 2. Predict MY movement locally each frame (responsiveness), then send input —
    //    both gated on !paused (pause is a local overlay; server keeps simulating).
    if (!this.isPaused) {
      this.predictLocalMovement(input, delta)
      this.sendLocalInput(time, input)
    }

    // 3. Render: MY character from prediction; remotes + enemies + wand interpolated
    //    ~INTERP_DELAY_MS behind the latest snapshot; HUD/status from the snapshot.
    const state = this.getNetState()
    if (state) {
      this.renderInterpolatedRemotes()
      this.renderPredictedLocal()
      this.updateNetHud(state)
      this.handleNetStatus(state)
      this.updateNetDebug(state)
    }

    // 4. Drain queued FX events through the net effects table.
    if (this.pendingNetEvents.length > 0) {
      const events = this.pendingNetEvents
      this.pendingNetEvents = []
      this.processNetEvents(events)
    }
  }

  /** Read keyboard+joystick into a MoveInput (no side effects). */
  private collectInput(): MoveInput {
    const joy = this.joystick.getState()
    return {
      up:    this.cursors.up.isDown    || this.keys.W.isDown || joy.dy < -0.3,
      down:  this.cursors.down.isDown  || this.keys.S.isDown || joy.dy >  0.3,
      left:  this.cursors.left.isDown  || this.keys.A.isDown || joy.dx < -0.3,
      right: this.cursors.right.isDown || this.keys.D.isDown || joy.dx >  0.3,
      block: this.keys.L.isDown || joy.block,
      punch: this.keys.J.isDown || joy.punch,
      kick:  this.keys.K.isDown || joy.kick,
    }
  }

  /** Throttle + send the given input over the wire (change-detected, 50ms keep-alive). */
  private sendLocalInput(time: number, input: MoveInput) {
    const changed = !this.lastSentInput || !sameInput(this.lastSentInput, input)
    if (changed || time - this.lastSentInputAt >= 50) {
      this.net?.sendInput(input)
      this.lastSentInput = input
      this.lastSentInputAt = time
    }
  }

  /** Advance my predicted PlayerState by one frame using the same core movePlayer. */
  private predictLocalMovement(input: MoveInput, deltaMs: number) {
    if (!this.predicted) return
    this.predicted = predictStep(this.predicted, input, deltaMs)
  }

  /**
   * FB1: Rebuild MY own player view (`this.player`) with the authoritative charKey
   * when it differs from the one create() picked from the (possibly stale) registry.
   * Player.charKey is readonly + texture-bound at construction, so the wrong avatar
   * can only be fixed by destroying and recreating the sprite. No-op when already
   * matching (the common case: registry agreed with the server assignment).
   */
  private reconcileLocalCharKey(authoritativeCharKey: string): void {
    if (!this.player || this.player.charKey === authoritativeCharKey) return
    const x = this.player.x
    const y = this.player.groundY
    this.player.destroy()
    this.player = new Player(this, x, y, authoritativeCharKey)
    this.playerMaxHP = this.player.maxHp
    // Keep the HUD name aligned with the real character.
    this.hud?.setPlayerName(authoritativeCharKey)
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
    // FB4: create or update the remote player indicator when slotIndex is known.
    const slot: number = typeof netPlayer?.slotIndex === 'number' ? netPlayer.slotIndex : -1
    if (slot >= 0 && (!view.hasPlayerIndicator || view.indicatorSlot !== slot)) {
      view.destroyPlayerIndicator()
      view.ensurePlayerIndicator(slot, false)
    }
    return view
  }

  /**
   * Build a timestamped snapshot of all REMOTE entities (other players, enemies,
   * wand) and push it into the interpolation buffer. My own character is excluded —
   * it is driven by prediction, not interpolation. Numeric x/y get lerped later;
   * every other field (charKey/fsm/hp/enemyType/...) is carried for the view.
   * Keys are namespaced so players/enemies/wand never collide.
   */
  private bufferRemoteSnapshot(state: any) {
    if (!state) return
    const ents: Record<string, Interpolatable> = {}

    state.players?.forEach?.((p: any, sid: string) => {
      if (sid === this.mySessionId) return // mine = predicted, not interpolated
      ents['p:' + sid] = {
        x: p.x, y: p.y, sid, charKey: p.charKey, fsm: p.fsm, facing: p.facing,
        hp: p.hp, maxHp: p.maxHp, connected: p.connected,
      }
    })

    state.enemies?.forEach?.((e: any) => {
      ents['e:' + e.id] = {
        x: e.x, y: e.y, id: e.id, enemyType: e.enemyType, isBoss: e.isBoss,
        fsm: e.fsm, hp: e.hp, maxHp: e.maxHp,
      }
    })

    // Allies (FB2) — AI slots, keyed by their order-stable array index.
    state.allies?.forEach?.((a: any, i: number) => {
      ents['a:' + i] = { x: a.x, y: a.y, idx: i, charKey: a.charKey, fsm: a.fsm }
    })

    ents['w'] = { x: state.wandX ?? 0, y: state.wandY ?? 0 }

    const t = this.now()
    this.interpBuffer = pushSnapshot(this.interpBuffer, t, ents, t - INTERP_DELAY_MS)
  }

  /** Render remote players + enemies + wand interpolated ~INTERP_DELAY_MS behind. */
  private renderInterpolatedRemotes() {
    const sampled = sampleAt(this.interpBuffer, this.now() - INTERP_DELAY_MS)

    const wand = sampled['w']
    const wandX = wand?.x ?? this.wand.x
    const wandY = wand?.y ?? this.wand.y
    const myX = this.player.x

    // ── Remote players ─────────────────────────────────────────────────────────
    const seenPlayers = new Set<string>()
    for (const key of Object.keys(sampled)) {
      if (!key.startsWith('p:')) continue
      const ent = sampled[key] as any
      const sid = key.slice(2)
      seenPlayers.add(sid)
      const view = this.ensurePlayerView(sid, ent)
      const ps = netToPlayerState({
        sessionId: sid, charKey: ent.charKey, x: ent.x, y: ent.y,
        hp: ent.hp, maxHp: ent.maxHp, fsm: ent.fsm, facing: ent.facing,
        connected: ent.connected,
      })
      view.syncFromState(ps)
      view.updateNetHpBar(ent.hp, ent.maxHp)
      view.setAlpha(ent.connected === false ? 0.4 : 1)
      // FB4: update remote player indicator position + alpha
      view.updatePlayerIndicator(ent.fsm ?? 'normal', ent.connected !== false)
      // FB11: world DOWN/OFF marker above fallen/disconnected players
      view.updateDownMarker(ent.fsm ?? 'normal', ent.connected !== false)
    }
    for (const [sid, view] of this.remotePlayers) {
      if (!seenPlayers.has(sid)) {
        view.destroyNetHpBar()
        view.destroyPlayerIndicator()
        view.destroyDownMarker()
        view.destroy()
        this.remotePlayers.delete(sid)
      }
    }

    // ── Enemies ────────────────────────────────────────────────────────────────
    const liveIds = new Set<number>()
    for (const key of Object.keys(sampled)) {
      if (!key.startsWith('e:')) continue
      const ent = sampled[key] as any
      const id = ent.id as number
      liveIds.add(id)
      let view = this.enemyViews.get(id)
      if (!view) {
        view = new Enemy(this, ent.x, ent.y, ent.enemyType as EnemyType, id)
        this.enemyViews.set(id, view)
      }
      if (!view.isDead) {
        view.syncFromState(netToEnemyState({
          id, enemyType: ent.enemyType, isBoss: ent.isBoss, x: ent.x, y: ent.y,
          hp: ent.hp, maxHp: ent.maxHp, fsm: ent.fsm,
        }), wandX, wandY, myX)
      }
    }
    for (const [id, view] of this.enemyViews) {
      if (!liveIds.has(id) && !view.isDead) {
        view.playDeathAnim()
        this.enemyViews.delete(id)
      }
    }

    // ── Allies (FB2) ─────────────────────────────────────────────────────────────
    // AI allies are projected by the server (AllyNet) and rendered here, reusing the
    // single-player Ally view + syncFromState pattern. Views are created lazily on the
    // first snapshot, keyed by their order-stable array index, and never removed (the
    // ally count is fixed for the whole match).
    const enemySprites = [...this.enemyViews.values()]
    for (const key of Object.keys(sampled)) {
      if (!key.startsWith('a:')) continue
      const ent = sampled[key] as any
      const idx = ent.idx as number
      let view = this.allies[idx]
      if (!view) {
        view = new Ally(this, ent.x, ent.y, ent.charKey)
        this.allies[idx] = view
      }
      view.syncFromState(netToAllyState({
        charKey: ent.charKey, x: ent.x, y: ent.y, fsm: ent.fsm,
      }), enemySprites)
    }

    // ── Wand ───────────────────────────────────────────────────────────────────
    this.wand.setPosition(wandX, wandY)
    this.wand.setDepth(wandY)
  }

  /**
   * Render MY character from prediction reconciled against the latest authoritative
   * snapshot. Position is predicted+corrected; hp/fsm/facing are authoritative.
   */
  private renderPredictedLocal() {
    const state = this.getNetState()
    const me = this.mySessionId ? state?.players?.get?.(this.mySessionId) : null
    if (!me) return

    const authoritative = netToPlayerState(me)
    if (!this.predicted) {
      this.predicted = authoritative
    } else {
      this.predicted = reconcile(this.predicted, authoritative).state
    }
    this.player.syncFromState(this.predicted)
    this.player.setDepth(this.player.groundY)

    // FB4: lazy-create MY indicator once the server sends the slotIndex (happens at
    // match start). Then update position + alpha every frame like remotes.
    const mySlot: number = typeof me.slotIndex === 'number' ? me.slotIndex : -1
    if (mySlot >= 0 && !this.player.hasPlayerIndicator) {
      this.player.ensurePlayerIndicator(mySlot, true)
    }
    if (this.player.hasPlayerIndicator) {
      this.player.updatePlayerIndicator(this.predicted.fsm, me.connected !== false)
    }
    // FB11: world DOWN/OFF marker over my own character too (kept consistent with remotes).
    this.player.updateDownMarker(this.predicted.fsm, me.connected !== false)
  }

  /** Debug hook (net mode only) — exposes positions for E2E assertions. Reports the
   *  RENDERED positions (my predicted x, remotes interpolated) so smoothness is
   *  observable, plus raw authoritative values for reference. */
  private updateNetDebug(state: any) {
    try {
      const players: Record<string, { x: number; y: number; hp: number; mine: boolean; charKey: string; viewCharKey: string; slotIndex: number; hasIndicator: boolean; indicatorSlot: number; fsm: string; animKey: string; animFrame: number; animIsPlaying: boolean }> = {}
      state.players?.forEach?.((p: any, sid: string) => {
        const mine = sid === this.mySessionId
        const view = mine ? this.player : this.remotePlayers.get(sid)
        const rx = mine ? this.player.x : (this.remotePlayers.get(sid)?.x ?? p.x)
        const ry = mine ? this.player.y : (this.remotePlayers.get(sid)?.y ?? p.y)
        // `charKey` = authoritative (server); `viewCharKey` = what the SPRITE actually
        // renders. They must match on every device — the FB1 desync was exactly the
        // case where viewCharKey diverged from the authoritative charKey.
        // FB4: expose slotIndex + indicator state so E2E can assert P1/P2/P3 labels.
        // FB5: expose the view's current anim key/frame + playing flag so E2E can assert
        // a 'down' player holds the knockdown anim frozen on its last frame (not idle).
        const anims = (view as any)?.anims
        players[sid] = {
          x: rx, y: ry, hp: p.hp, mine, charKey: p.charKey, viewCharKey: view?.charKey ?? '',
          slotIndex: typeof p.slotIndex === 'number' ? p.slotIndex : -1,
          hasIndicator: view?.hasPlayerIndicator ?? false,
          indicatorSlot: view?.indicatorSlot ?? -1,
          fsm: p.fsm ?? '',
          animKey: anims?.currentAnim?.key ?? '',
          animFrame: anims?.currentFrame?.index ?? -1,
          animIsPlaying: !!anims?.isPlaying,
        }
      })
      // Ally views (FB2) — character + position, so E2E can assert the AI ally renders.
      const allies = this.allies.map(a => ({ charKey: a.charKey, x: a.x, y: a.y }))
      const authoritative: Record<string, { x: number; y: number }> = {}
      state.players?.forEach?.((p: any, sid: string) => { authoritative[sid] = { x: p.x, y: p.y } })
      // FB11: world DOWN/OFF marker labels per session (mine + remotes) for E2E.
      const downMarkers: Record<string, string> = {}
      if (this.mySessionId) downMarkers[this.mySessionId] = this.player?.downMarkerLabel ?? ''
      this.remotePlayers.forEach((view, sid) => { downMarkers[sid] = view.downMarkerLabel })
      ;(window as any).__netDebug = {
        sessionId: this.mySessionId,
        status: state.status,
        wave: state.wave,
        enemies: state.enemies?.length ?? 0,
        players,
        allies, // FB2: AI ally views (empty until allies are projected + rendered)
        authoritative, // raw pre-interp/predict positions for diffing
        allyHuds: this.hud?.getAllyRowsDebug() ?? [], // FB9: ally HUD rows for E2E
        downMarkers, // FB11: world marker label per sessionId ('' when none)
        defeat: this.coopDefeat ?? { visible: false, title: '' }, // FB12: co-op defeat overlay
      }

      // Optional per-FRAME trace (E2E smoothness): recorded inside Phaser's own 60Hz
      // update loop, so it is immune to the rAF throttling a backgrounded Playwright
      // tab applies to external samplers. Enable with window.__netTraceOn = true.
      const w = window as any
      if (w.__netTraceOn) {
        if (!Array.isArray(w.__netTrace)) w.__netTrace = []
        const sid = this.mySessionId
        const auth = sid ? authoritative[sid] : null
        w.__netTrace.push({
          t: +(this.now()).toFixed(1),
          myX: +this.player.x.toFixed(3),       // predicted (rendered) — should advance every frame
          authX: auth ? +auth.x.toFixed(3) : null, // authoritative (20Hz steps) for contrast
          remotes: Object.entries(players)
            .filter(([s]) => s !== sid)
            .map(([s, v]) => ({ s, x: +v.x.toFixed(3) })),
        })
        if (w.__netTrace.length > 2000) w.__netTrace.shift()
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

    // FB9 + FB10: update ally HUD rows (HP bar + DOWN/OFF status badge) for all
    // OTHER human players. The HUD derives the status badge from fsm + connected.
    state.players?.forEach?.((p: any, sid: string) => {
      if (sid === this.mySessionId) return
      this.hud.updateAllyHud(sid, p.hp ?? 0, p.maxHp ?? 1, p.fsm, p.connected)
    })
  }

  /**
   * FB9: Build ally HUD rows for OTHER human players from the initial state snapshot.
   * Called once in initNetMode() after mySessionId is known.
   */
  private setupAllyHuds(state: any): void {
    if (!state?.players?.forEach) return
    const allies: { sessionId: string; charKey: string; slotIndex: number }[] = []
    state.players.forEach((p: any, sid: string) => {
      if (sid === this.mySessionId) return
      allies.push({
        sessionId: sid,
        charKey: p.charKey ?? 'werdum',
        slotIndex: typeof p.slotIndex === 'number' ? p.slotIndex : 0,
      })
    })
    // Sort by slotIndex so the row order is deterministic regardless of map iteration order.
    allies.sort((a, b) => a.slotIndex - b.slotIndex)
    this.hud.setupAllyHuds(allies)
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

        case 'playerDown': {
          // A human ran out of HP and is now inert for the rest of the match. The
          // server's ArenaState carries fsm:'down', so syncNetViews already mirrors
          // the FSM — but a 'down' player would otherwise fall back to idle/run, so
          // we lock the knockdown pose here (idempotent with playerKnockdown, which
          // fires alongside it on a lethal knockdown hit but NOT on a chip death).
          const view = this.viewForSession(ev.sessionId)
          view?.playKnockdownAnim()
          if (this.isMine(ev.sessionId)) {
            // MY player is out: stronger feedback + persistent "VOCÊ CAIU" overlay.
            haptics.error()
            this.hud.showCombo(0)
            this.hud.showDownStatus(true)
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
    // FB6: leave the room + clear the stale pick so the NEXT co-op match starts from a
    // fresh lobby (server frees our slot; the selector is no longer seeded with the
    // previous character). Mirrors the manual SAIR button's cleanup.
    this.leaveNetRoomAndResetPick()
    // FB12: show a shared co-op defeat overlay, hold briefly, then fade to title
    // (single-player has GameOverContinueScene; co-op has no continue, so the
    // overlay is the explicit "team wiped" feedback before returning to the start).
    this.showCoopDefeatOverlay(s?.score ?? 0, s?.wave ?? 0)
    this.time.delayedCall(GameScene.COOP_DEFEAT_MS, () => {
      this.cameras.main.fadeOut(400, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TitleScene'))
    })
  }

  /** FB12: how long the co-op defeat overlay holds before fading to the title. */
  private static readonly COOP_DEFEAT_MS = 3500

  /** FB12 debug snapshot — drives __netDebug.defeat for E2E. */
  private coopDefeat?: { visible: boolean; title: string }

  /**
   * FB12: render the shared co-op "GAME OVER / TODOS CAÍRAM" overlay with the
   * reached wave + score. Pure text comes from coopDefeatSummary (unit-tested);
   * this method only draws it. Exposed (non-private at runtime) so the E2E can
   * preview it via window.__gsTest without forcing a real team wipe.
   */
  showCoopDefeatOverlay(score: number, wave: number): void {
    const sum = coopDefeatSummary(score, wave, WAVES.length)

    makeOverlay(this, {
      title: sum.title,
      titleColor: 'hpLow',
      depth: 5000,
      lines: [
        { text: sum.subtitle,  role: 'body', color: 'textPrimary' },
        { text: sum.waveLine,  role: 'body', color: 'textBrand' },
        { text: sum.scoreLine, role: 'body', color: 'textBrand', numeric: true },
      ],
      footer: 'voltando ao início...',
    })

    this.coopDefeat = { visible: true, title: sum.title }
  }

  /**
   * FB6: tear down the co-op room and clear the carried-over character pick.
   * Called on every net-mode match exit (game over, victory, manual quit) so the
   * server releases our slot and the next lobby visit is not seeded with the old pick.
   * Safe to call in single-player (no-ops: gameMode !== 'net').
   */
  private leaveNetRoomAndResetPick() {
    if (this.gameMode === 'net') this.net?.leave().catch(() => { /* noop */ })
    this.registry.remove('selectedChar')
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
    // Co-op leaderboard: score do TIME (autoritativo do servidor). Só o HOST salva,
    // com o nome de time (YouWinScene). Tempo = real desde o startGame do host.
    const isHost = this.net?.amHost() === true
    this.registry.set('youWinScore', s?.score ?? 0)
    this.registry.set('youWinTime', isHost && this.coopStartMs > 0 ? Date.now() - this.coopStartMs : 0)
    this.registry.set('youWinCoop', true)
    this.registry.set('youWinCoopHost', isHost)
    this.registry.set('youWinCoopChar', (this.player.charKey as string) ?? selectedChar)
    this.registry.set('totalWaves',  WAVES.length)
    // FB6: leave the room + clear the stale pick before the victory transition so the
    // next co-op match starts from a fresh lobby. selectedChar is read just above for
    // the win animation, so the reset is safe to do here.
    this.leaveNetRoomAndResetPick()
    this.playVictoryTransition(selectedChar)
  }

  /** Show a non-blocking "Reconectando..." overlay (Task 8). Game keeps rendering last state. */
  private showReconnectingOverlay() {
    if (this.reconnectingOverlay || this.netDisconnected || this.isGameOver) return
    const { width, height } = this.scale
    const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
      .setDepth(4000).setScrollFactor(0)
    const title = this.add.text(width / 2, height / 2 - 30, t('net.reconnecting'), {
      fontSize: '36px', color: hex(semantic.feedbackWarn),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 8,
    }).setOrigin(0.5).setDepth(4001).setScrollFactor(0)
    const sub = this.add.text(width / 2, height / 2 + 40, t('net.reconnectingWait'), {
      fontSize: '18px', color: hex(semantic.textSecondary),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 4,
    }).setOrigin(0.5).setDepth(4001).setScrollFactor(0)
    this.reconnectingOverlay = { bg, title, sub }
  }

  /** Hide the reconnecting overlay and resume normal rendering (called on recovery). */
  private hideReconnectingOverlay() {
    if (!this.reconnectingOverlay) return
    const { bg, title, sub } = this.reconnectingOverlay
    try { bg.destroy() } catch { /* noop */ }
    try { title.destroy() } catch { /* noop */ }
    try { sub.destroy() } catch { /* noop */ }
    this.reconnectingOverlay = null
  }

  /** Graceful exit when the room disconnects mid-game with no recovery possible. */
  private handleNetDisconnect() {
    if (this.netDisconnected || this.isGameOver) return
    this.netDisconnected = true
    sound.stopBgMusic()
    // FB6: connection is gone, but still clear the carried-over pick so the next lobby
    // visit is fresh.
    this.registry.remove('selectedChar')

    const { width, height } = this.scale
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.85)
      .setDepth(4000).setScrollFactor(0)
    const msg = this.add.text(width / 2, height / 2 - 30, t('net.connectionLost'), {
      fontSize: '44px', color: hex(semantic.feedbackError),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 8,
    }).setOrigin(0.5).setDepth(4001).setScrollFactor(0)
    this.add.text(width / 2, height / 2 + 40, t('net.returningToMenu'), {
      fontSize: '22px', color: hex(semantic.textPrimary),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 4,
    }).setOrigin(0.5).setDepth(4001).setScrollFactor(0)
    void overlay; void msg

    this.time.delayedCall(1800, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TitleScene'))
    })
  }

  private spawnScorePopup(x: number, y: number, points: number) {
    const txt = this.add.text(x, y - 20, `+${points}`, {
      fontSize: '20px', color: hex(primitive.goldHi),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 3,
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

    const bg = this.add.rectangle(width / 2, height / 2, 560, 420, 0x000000, 0.92)
      .setStrokeStyle(4, 0xf3c204)

    const title = this.add.text(width / 2, height / 2 - 150, t('common.pause'), {
      fontSize: '52px', color: hex(semantic.textBrand),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 8,
    }).setOrigin(0.5)

    // Painel + título primeiro; os botões entram POR CIMA (makeBtn os adiciona).
    container.add([bg, title])

    // Botões no MESMO perfil das rows da tela OPTIONS (makeOptionsOverlay): retângulo
    // night (0.62) + borda dourada, hover → borda goldHi + label dourado.
    const BTN_W = 460, BTN_H = 72
    const makeBtn = (label: string, y: number, cb: () => void) => {
      const rect = this.add.rectangle(width / 2, y, BTN_W, BTN_H, primitive.night, 0.62)
        .setStrokeStyle(3, primitive.goldBrand, 1)
      const txt = this.add.text(width / 2, y, label, {
        fontSize: '26px', color: hex(semantic.textPrimary),
        fontFamily: FAMILY.display,
        stroke: hex(semantic.ink), strokeThickness: 5,
      }).setOrigin(0.5)
      // Hit = o próprio rect do botão (460×72) — grande o bastante p/ toque, igual às
      // rows do Options. NÃO usa padInteractive p/ não sobrepor o hit dos vizinhos.
      const hit = this.add.rectangle(width / 2, y, BTN_W, BTN_H, 0x000000, 0).setInteractive({ useHandCursor: true })
      hit.on('pointerover', () => { rect.setStrokeStyle(4, primitive.goldHi, 1); txt.setColor(hex(semantic.textBrand)) })
      hit.on('pointerout',  () => { rect.setStrokeStyle(3, primitive.goldBrand, 1); txt.setColor(hex(semantic.textPrimary)) })
      hit.on('pointerdown', cb)
      container.add([rect, txt, hit])
    }

    makeBtn(t('common.continue'), height / 2 - 56, () => this.togglePause())
    makeBtn(t('pause.muteHint'),  height / 2 + 28, () => {
      const m = sound.toggleMute(); this.hud.showMuteStatus(m)
    })
    makeBtn(t('common.exit'),     height / 2 + 112, () => {
      sound.stopBgMusic()
      // Net mode: leave the room (frees our slot) + clear the carried-over pick (FB6).
      this.leaveNetRoomAndResetPick()
      this.registry.remove('continueFromWave')
      this.registry.remove('continueCount')
      this.registry.remove('gameOverScore')
      this.registry.remove('gameOverTime')
      this.registry.remove('gameOverWave')
      this.registry.remove('totalWaves')
      this.registry.remove('youWinScore')
      this.registry.remove('youWinKills')
      this.registry.remove('youWinTime')
      this.cameras.main.fadeOut(300, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TitleScene'))
    })

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
    this.registry.set('gameOverKills', this.simState.score.enemiesDefeated)
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

    this.registry.set('youWinCoop', false)
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

    const title = this.add.text(width / 2, height / 2 - 58, t('game.ringClear'), {
      fontSize: '56px',
      color: hex(primitive.goldHi),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink),
      strokeThickness: 10,
    }).setOrigin(0.5).setDepth(1202).setScrollFactor(0).setAlpha(0).setScale(0.92)

    const subtitle = this.add.text(width / 2, height / 2 + 18, t('game.missionComplete'), {
      fontSize: '24px',
      color: hex(semantic.textBrand),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink),
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
}

/** Structural equality for MoveInput — drives net-mode input change detection. */
function sameInput(a: MoveInput, b: MoveInput): boolean {
  return a.up === b.up && a.down === b.down && a.left === b.left && a.right === b.right
    && a.block === b.block && a.punch === b.punch && a.kick === b.kick
}
