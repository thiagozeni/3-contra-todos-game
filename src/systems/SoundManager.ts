/**
 * SoundManager — efeitos de combate via WAVs reais (Deadly Kombat Library)
 * UI por síntese Web Audio e música de fundo via HTMLAudioElement.
 */
type MusicTrack = 'intro' | 'gameplay'

export class SoundManager {
  // ── Phaser audio (efeitos de combate) ────────────────────────────────
  private psm: Phaser.Sound.BaseSoundManager | null = null

  /** Chamado uma vez em BootScene.create() após carregar todos os assets. */
  init(scene: Phaser.Scene) {
    this.psm = scene.sound
  }

  private pick(keys: string[]): string {
    return keys[Math.floor(Math.random() * keys.length)]
  }

  private sfx(keys: string[], volume = 0.72) {
    if (this.muted || !this.psm) return
    try { this.psm.play(this.pick(keys), { volume }) } catch (_) { /* sem crash */ }
  }

  // ── Web Audio (síntese — UI) ─────────────────────────────────────────
  private ctx: AudioContext | null = null
  private muted = false

  // Música usa um único elemento nativo. No app iOS rodando no macOS, isso é
  // mais confiável que criar sons longos pelo WebAudio do Phaser fora do gesto.
  private musicEl: HTMLAudioElement | null = null
  private musicTrack: MusicTrack | null = null
  private desiredMusic: MusicTrack | null = null
  private pendingMusic: MusicTrack | null = null
  private musicRetryListenersInstalled = false
  private readonly musicVolume = 0.35
  private readonly musicSources: Record<MusicTrack, string> = {
    intro: 'audio/music/intro.mp3',
    gameplay: 'audio/music/game-play.mp3',
  }

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    return this.ctx
  }

  private audioContextResumes(): Promise<unknown>[] {
    const resumes: Promise<unknown>[] = []
    try {
      const ctx = (this.psm as unknown as { context?: AudioContext } | null)?.context
      if (ctx?.state === 'suspended') resumes.push(ctx.resume())
    } catch { /* noop */ }
    try {
      if (this.ctx?.state === 'suspended') resumes.push(this.ctx.resume())
    } catch { /* noop */ }
    return resumes
  }

  unlockAudio(): Promise<void> {
    this.installMusicRetryListeners()
    const resumes = this.audioContextResumes()
    return Promise.allSettled(resumes).then(() => undefined)
  }

  setMuted(v: boolean) {
    this.muted = v
    this.syncMusicMute()
    if (!v && this.desiredMusic && this.musicEl?.paused) this.playNativeMusic(this.desiredMusic)
  }
  toggleMute() {
    this.muted = !this.muted
    this.syncMusicMute()
    if (!this.muted && this.desiredMusic && this.musicEl?.paused) this.playNativeMusic(this.desiredMusic)
    return this.muted
  }

  private tone(freq: number, type: OscillatorType, dur: number, vol = 0.25, delay = 0) {
    if (this.muted) return
    try {
      const ctx = this.getCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = type
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay)
      gain.gain.setValueAtTime(0.001, ctx.currentTime + delay)
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + dur + 0.05)
    } catch (_) { /* sem crash */ }
  }

  // ── Sons de combate (free-sfx — OpenGameArt CC0) ─────────────────────

  /** Whoosh de soco — curtíssimo (0.19–0.28s) */
  punch() {
    this.sfx(['sfx-punch-1', 'sfx-punch-2', 'sfx-punch-3', 'sfx-punch-4'])
  }

  /** Whoosh de chute — levemente mais longo (0.33–0.38s) */
  kick() {
    this.sfx(['sfx-kick-1', 'sfx-kick-2', 'sfx-kick-3', 'sfx-kick-4'])
  }

  /** Impacto leve ao acertar inimigo — sorteia entre 18 variações */
  hitEnemy() {
    this.sfx([
      'sfx-impact-01','sfx-impact-02','sfx-impact-03','sfx-impact-04','sfx-impact-05',
      'sfx-impact-06','sfx-impact-07','sfx-impact-08','sfx-impact-09','sfx-impact-10',
      'sfx-impact-11','sfx-impact-12','sfx-impact-13','sfx-impact-14','sfx-impact-15',
      'sfx-impact-16','sfx-impact-17','sfx-impact-18',
    ])
  }

  /** Bloqueio — usa os 5 impacts mais curtos (< 0.40s) */
  block() {
    this.sfx(['sfx-impact-02','sfx-impact-06','sfx-impact-09','sfx-impact-12','sfx-impact-17'])
  }

  /** Jogador recebe golpe — impacto médio (0.60–0.79s) */
  playerHit() {
    this.sfx(['sfx-phit-1','sfx-phit-2','sfx-phit-3','sfx-phit-4','sfx-phit-5'])
  }

  /** Inimigo comum morre — impacto pesado (0.83–0.86s) */
  enemyDeath() {
    this.sfx(['sfx-edeath-1','sfx-edeath-2','sfx-edeath-3','sfx-edeath-4'])
  }

  /** Boss morre — impacto mais longo (1.0–1.1s) + queda */
  bossDeath() {
    this.sfx(['sfx-bdeath-1','sfx-bdeath-2','sfx-bdeath-3'])
    this.sfx(['sfx-fall'], 0.7)
  }

  /** Knockdown do jogador — impacto máximo (1.54s) + queda */
  playerKnockdown() {
    this.sfx(['sfx-ko'], 0.9)
    this.sfx(['sfx-fall'], 0.6)
  }

  // ── Placeholders para ataques especiais futuros ───────────────────────

  /** Soco especial com fogo */
  firePunch(finisher = false) {
    this.sfx([finisher ? 'sfx-fire-fin' : 'sfx-fire-punch'])
  }

  /** Soco com armadura metálica */
  metalPunch(finisher = false) {
    this.sfx([finisher ? 'sfx-metal-fin' : 'sfx-metal-punch'])
  }

  /** Golpe com taco de madeira */
  woodBat() {
    this.sfx(['sfx-wood-bat-1', 'sfx-wood-bat-2'])
  }

  /** Golpe com lâmina */
  blade() {
    this.sfx(['sfx-blade-1', 'sfx-blade-2'])
  }

  /** Acrobacia / esquiva aérea */
  somersault() {
    this.sfx(['sfx-somersault-1', 'sfx-somersault-2'])
  }

  // ── Sons de UI e eventos (síntese Web Audio) ──────────────────────────

  jump()    { this.tone(500, 'square', 0.06, 0.15); this.tone(650, 'square', 0.06, 0.15, 0.05) }
  land()    { /* sem uso ativo */ }
  select()  { this.tone(500, 'square', 0.07, 0.2); this.tone(700, 'square', 0.07, 0.2, 0.08) }
  hover()   { this.tone(400, 'square', 0.04, 0.1) }
  pause()   { this.tone(300, 'triangle', 0.1, 0.2) }
  unpause() { this.tone(400, 'triangle', 0.1, 0.2) }

  waveStart(isBoss = false) {
    if (isBoss) {
      [200, 160, 120, 300].forEach((f, i) => this.tone(f, 'sawtooth', 0.18, 0.35, i * 0.12))
    } else {
      [400, 550, 700].forEach((f, i) => this.tone(f, 'square', 0.1, 0.2, i * 0.09))
    }
  }

  waveComplete() {
    [500, 600, 700, 600, 800].forEach((f, i) => this.tone(f, 'triangle', 0.1, 0.2, i * 0.08))
  }

  gameOver() {
    [500, 420, 340, 260, 200, 160].forEach((f, i) => this.tone(f, 'square', 0.18, 0.28, i * 0.16))
  }

  victory() {
    [300, 400, 500, 400, 600, 500, 700, 600, 900].forEach((f, i) =>
      this.tone(f, 'square', 0.12, 0.22, i * 0.09))
  }

  // ── Música de fundo (HTMLAudioElement) ───────────────────────────────

  /**
   * Resume os AudioContexts se estiverem suspensos.
   * No Mac rodando app iOS via compatibility layer, o contexto pode estar suspenso
   * porque o Phaser aguarda 'touchstart' para desbloqueio — que nunca ocorre no Mac
   * (o usuário usa mouse). Chamamos resume() explicitamente antes de qualquer play().
   */
  private resumeAudioContext() {
    this.unlockAudio().catch(() => { /* noop */ })
  }

  private getMusicElement(): HTMLAudioElement {
    if (!this.musicEl) {
      const el = new Audio()
      el.loop = true
      el.preload = 'auto'
      this.musicEl = el
      this.syncMusicMute()
    }
    return this.musicEl
  }

  private syncMusicMute() {
    if (!this.musicEl) return
    this.musicEl.muted = this.muted
    this.musicEl.volume = this.muted ? 0 : this.musicVolume
  }

  private installMusicRetryListeners() {
    if (this.musicRetryListenersInstalled) return
    this.musicRetryListenersInstalled = true

    const retry = () => {
      const track = this.pendingMusic ?? this.desiredMusic
      if (!track) return
      this.audioContextResumes().forEach(p => p.catch(() => { /* noop */ }))
      this.playNativeMusic(track)
    }

    window.addEventListener('pointerdown', retry, { capture: true })
    window.addEventListener('mousedown', retry, { capture: true })
    window.addEventListener('touchstart', retry, { capture: true })
    window.addEventListener('keydown', retry, { capture: true })
  }

  private playNativeMusic(track: MusicTrack) {
    this.desiredMusic = track
    this.resumeAudioContext()

    const el = this.getMusicElement()
    this.syncMusicMute()

    if (this.musicTrack !== track) {
      try { el.pause() } catch { /* noop */ }
      el.src = this.musicSources[track]
      try { el.currentTime = 0 } catch { /* noop */ }
      try { el.load() } catch { /* noop */ }
      this.musicTrack = track
    }

    if (!el.paused && this.pendingMusic !== track) return

    try {
      el.play()
        .then(() => {
          if (this.desiredMusic === track) this.pendingMusic = null
        })
        .catch(() => {
          this.pendingMusic = track
          this.installMusicRetryListeners()
        })
    } catch {
      this.pendingMusic = track
      this.installMusicRetryListeners()
    }
  }

  /** Toca a música de intro (título e seleção de personagem) */
  startIntroMusic() {
    this.playNativeMusic('intro')
  }

  /** Troca para a música de gameplay (para a intro se estiver tocando) */
  startBgMusic() {
    this.playNativeMusic('gameplay')
  }

  stopBgMusic() {
    this.desiredMusic = null
    this.pendingMusic = null
    if (!this.musicEl) return
    try {
      this.musicEl.pause()
      this.musicEl.currentTime = 0
    } catch { /* noop */ }
  }
}

// Instância global
export const sound = new SoundManager()
