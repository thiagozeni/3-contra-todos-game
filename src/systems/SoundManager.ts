/**
 * SoundManager — efeitos de combate via WAVs reais (Deadly Kombat Library)
 * Música de fundo e sons de UI mantidos como síntese Web Audio.
 */
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

  // ── Web Audio (síntese — música e UI) ────────────────────────────────
  private ctx: AudioContext | null = null
  private muted = false

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    return this.ctx
  }

  setMuted(v: boolean) {
    this.muted = v
    if (this.bgMusic) (this.bgMusic as Phaser.Sound.WebAudioSound).setMute(v)
  }
  toggleMute() {
    this.muted = !this.muted
    if (this.bgMusic) (this.bgMusic as Phaser.Sound.WebAudioSound).setMute(this.muted)
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

  // ── Música de fundo (síntese Web Audio) ──────────────────────────────

  private bgMusic: Phaser.Sound.BaseSound | null = null

  /**
   * Resume o AudioContext do Phaser se estiver suspenso.
   * No Mac rodando app iOS via compatibility layer, o contexto pode estar suspenso
   * porque o Phaser aguarda 'touchstart' para desbloqueio — que nunca ocorre no Mac
   * (o usuário usa mouse). Chamamos resume() explicitamente antes de qualquer play().
   */
  private resumeAudioContext() {
    if (!this.psm) return
    try {
      const ctx = (this.psm as unknown as { context?: AudioContext }).context
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => { /* noop */ })
      }
    } catch { /* noop */ }
  }

  /** Toca a música de intro (título e seleção de personagem) */
  startIntroMusic() {
    if (this.bgMusic?.isPlaying || !this.psm) return
    this.resumeAudioContext()
    this.bgMusic = this.psm.add('bgm-intro', { loop: true, volume: 0.35 })
    this.bgMusic.play()
  }

  /** Troca para a música de gameplay (para a intro se estiver tocando) */
  startBgMusic() {
    if (!this.psm) return
    this.stopBgMusic()
    this.resumeAudioContext()
    this.bgMusic = this.psm.add('bgm-gameplay', { loop: true, volume: 0.35 })
    this.bgMusic.play()
  }

  stopBgMusic() {
    this.bgMusic?.stop()
    this.bgMusic = null
  }
}

// Instância global
export const sound = new SoundManager()
