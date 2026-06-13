import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { saveScore } from '../lib/leaderboard'
import { nativeShare, haptics } from '../systems/NativeBridge'
import { gameCenter, GC_ACHIEVEMENTS, localProgress } from '../systems/GameCenterBridge'
import { padInteractive } from '../utils/iosVideo'
import { CSS, FONT } from '../ui/theme'

export class YouWinScene extends Phaser.Scene {
  private navigating = false
  private nameInput: HTMLInputElement | null = null

  constructor() {
    super({ key: 'YouWinScene' })
  }

  create() {
    this.navigating = false
    const { width, height } = this.scale

    this.cameras.main.fadeIn(600, 0, 0, 0)

    // Fundo
    this.add.image(width / 2, height / 2, 'select-player-bg').setDisplaySize(width, height).setDepth(0)
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.45).setDepth(1)

    // Títulos
    this.add.text(960, 157, 'CONGRATULATIONS', {
      fontSize: '72px', color: CSS.gold,
      fontFamily: FONT.hud,
      stroke: CSS.ink, strokeThickness: 10,
    }).setOrigin(0.5).setDepth(2)

    this.add.text(960, 253, 'YOU WIN!', {
      fontSize: '80px', color: CSS.gold,
      fontFamily: FONT.hud,
      stroke: CSS.ink, strokeThickness: 12,
    }).setOrigin(0.5).setDepth(2)

    // Arte celebração
    this.add.image(878, 299, 'good-guys-win').setOrigin(0, 0).setDepth(2)

    // Stats da partida
    const score     = this.registry.get('youWinScore')    as number ?? 0
    const kills     = this.registry.get('youWinKills')    as number ?? 0
    const timeMs    = this.registry.get('youWinTime')     as number ?? 0
    const continues = this.registry.get('continueCount')  as number ?? 0
    const mm = String(Math.floor(timeMs / 60000)).padStart(2, '0')
    const ss = String(Math.floor((timeMs % 60000) / 1000)).padStart(2, '0')

    const statStyle = {
      fontSize: '27px', color: '#ffffff',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 4,
    }
    const labelStyle = { ...statStyle, color: '#f3c204' }

    const stats: [string, string][] = [
      ['SCORE',     score.toLocaleString()],
      ['INIMIGOS',  String(kills)],
      ['TEMPO',     `${mm}:${ss}`],
      ['CONTINUES', String(continues)],
    ]
    stats.forEach(([label, value], i) => {
      const y = 340 + i * 72
      this.add.text(130, y, label, labelStyle).setOrigin(0, 0).setDepth(2)
      this.add.text(690, y, value, statStyle).setOrigin(1, 0).setDepth(2)
    })

    // ENTER YOUR NAME
    this.add.text(129, 628, 'ENTER YOUR NAME:', {
      fontSize: '36px', color: '#e4e4e4',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0, 0).setDepth(2)

    // Input HTML sobreposto
    this.nameInput = this.createNameInput()

    // PLAY AGAIN? label
    this.add.text(129, 760, 'PLAY AGAIN?', {
      fontSize: '64px', color: '#e4e4e4',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0, 0).setDepth(2)

    // Cursor ">"
    this.add.text(215, 873, '>', {
      fontSize: '35px', color: '#f3c204',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(2)

    // PRESS START (pisca)
    const startText = this.add.text(502, 873, 'PRESS START', {
      fontSize: '44px', color: '#f3c204',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(2)
    padInteractive(startText)

    this.tweens.add({
      targets: startText, alpha: 0.2, duration: 600,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    startText.on('pointerdown', () => this.submit())

    this.time.delayedCall(1000, () => {
      this.input.keyboard!.on('keydown-ENTER', () => this.submit())
    })
  }

  private createNameInput(): HTMLInputElement {
    const canvas = this.game.canvas
    const bounds  = canvas.getBoundingClientRect()
    const scaleX  = bounds.width  / 1920
    const scaleY  = bounds.height / 1080

    const input = document.createElement('input')
    input.type        = 'text'
    input.maxLength   = 12
    input.placeholder = 'AAA'
    input.style.position    = 'fixed'
    input.style.left        = `${bounds.left + 129 * scaleX}px`
    input.style.top         = `${bounds.top  + 678 * scaleY}px`
    input.style.width       = `${560 * scaleX}px`
    input.style.height      = `${56 * scaleY}px`
    input.style.fontSize    = `${28 * scaleY}px`
    input.style.fontFamily  = '"Press Start 2P", monospace'
    input.style.background  = 'rgba(0,0,0,0.7)'
    input.style.color       = '#f3c204'
    input.style.border      = '2px solid #f3c204'
    input.style.outline     = 'none'
    input.style.padding     = '4px 8px'
    input.style.textTransform = 'uppercase'
    input.style.zIndex      = '100'
    input.style.letterSpacing = '2px'
    document.body.appendChild(input)

    // Libera teclado do Phaser enquanto o input estiver focado
    input.addEventListener('focus', () => {
      this.input.keyboard!.disableGlobalCapture()
    })
    input.addEventListener('blur', () => {
      this.input.keyboard!.enableGlobalCapture()
    })

    input.focus()

    // Força uppercase enquanto digita
    input.addEventListener('input', () => {
      const pos = input.selectionStart
      input.value = input.value.toUpperCase()
      input.setSelectionRange(pos, pos)
    })

    // Garante que ENTER no input chama submit
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.submit() }
    })

    return input
  }

  private removeNameInput() {
    if (this.nameInput) {
      this.nameInput.remove()
      this.nameInput = null
    }
  }

  private statusText: Phaser.GameObjects.Text | null = null

  private async submit() {
    if (this.navigating) return
    this.navigating = true

    const name      = (this.nameInput?.value.trim() || 'AAA').toUpperCase().slice(0, 12)
    const score     = this.registry.get('youWinScore')   as number ?? 0
    const timeMs    = this.registry.get('youWinTime')    as number ?? 0
    const continues = this.registry.get('continueCount') as number ?? 0
    const character = (this.registry.get('selectedChar') as string) ?? 'werdum'

    this.removeNameInput()
    sound.select()

    // Feedback de salvando
    this.statusText = this.add.text(129, 690, 'SALVANDO...', {
      fontSize: '22px', color: '#aaaaaa',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000', strokeThickness: 3,
    }).setDepth(5)

    const cheatUsed = this.registry.get('cheatUsed') === true
    // Aguarda brevemente o token da sessão: start_game roda no início da partida e
    // quase sempre já resolveu (a partida dura >150s), mas em rede lenta pode atrasar.
    // Espera até ~3s antes de desistir, para não marcar uma vitória legítima como não salva.
    let sessionToken = this.registry.get('gameSessionToken') as string | undefined
    if (!cheatUsed && !sessionToken) {
      for (let i = 0; i < 30 && !sessionToken; i++) {
        await new Promise(r => this.time.delayedCall(100, r))
        sessionToken = this.registry.get('gameSessionToken') as string | undefined
      }
    }

    // Game Center: submit score + achievements de vitória (não conta se cheat)
    if (!cheatUsed) {
      gameCenter.submitScore(Math.floor(score))
      gameCenter.unlock(GC_ACHIEVEMENTS.firstVictory)
      if (continues === 0) gameCenter.unlock(GC_ACHIEVEMENTS.noContinues)
      if (timeMs > 0 && timeMs < 5 * 60 * 1000) gameCenter.unlock(GC_ACHIEVEMENTS.speedRun)
      const charsWon = localProgress.recordVictory(character)
      if (['werdum', 'dida', 'thor'].every(c => charsWon.includes(c))) {
        gameCenter.unlock(GC_ACHIEVEMENTS.allChars)
      }
    }

    let saveOk = false
    try {
      if (cheatUsed) {
        this.statusText.setText('CHEAT — NÃO SALVO').setColor('#f3c204')
        await new Promise(r => this.time.delayedCall(800, r))
      } else if (!sessionToken) {
        // Sem sessão válida (ex.: start_game falhou por offline/rate limit) — não salva.
        this.statusText.setText('SEM CONEXÃO — NÃO SALVO').setColor('#f3c204')
        await new Promise(r => this.time.delayedCall(800, r))
      } else {
        await saveScore({ player_name: name, character, continues: Math.floor(continues), time_ms: Math.floor(timeMs / 1000) * 1000, score: Math.floor(score) }, sessionToken)
        saveOk = true
      }
    } catch (e) {
      console.error('[Leaderboard] Erro ao salvar:', e)
      this.statusText.setText('ERRO AO SALVAR PONTUAÇÃO')
      this.statusText.setColor('#ff4444')
      // Aguarda 3s e vai mesmo assim
      await new Promise(r => this.time.delayedCall(3000, r))
    }

    if (saveOk) {
      this.statusText.setText('SALVO!').setColor('#44ff88')
      await new Promise(r => this.time.delayedCall(400, r))
    }

    // Passa o nome para TopTenScene destacar a entrada
    this.registry.set('lastEntryName', name)
    this.registry.set('lastEntryContinues', continues)
    this.registry.set('lastEntryTime', timeMs)
    this.registry.set('lastEntryScore', score)

    // Oferece share antes de sair
    await this.showSharePrompt(name, score)

    this.registry.remove('youWinScore')
    this.registry.remove('youWinKills')
    this.registry.remove('youWinTime')
    this.registry.remove('continueFromWave')
    this.registry.remove('gameOverWave')
    this.registry.remove('gameOverScore')
    this.registry.remove('gameOverTime')
    this.registry.remove('continueCount')
    this.registry.remove('cheatUsed')
    this.registry.remove('gameSessionToken')

    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TopTenScene'))
  }

  private showSharePrompt(playerName: string, score: number): Promise<void> {
    return new Promise(resolve => {
      // Limpa texto de status anterior
      this.statusText?.destroy()

      // Posicionado 40px abaixo do PRESS START (y=873), centralizado em x=502
      const blockCenterX = 502
      const blockY = 965

      const btnStyle = {
        fontSize: '28px', color: '#000000',
        fontFamily: '"Press Start 2P", monospace',
        backgroundColor: '#f3c204',
        padding: { x: 24, y: 12 },
      }

      const skipStyle = {
        fontSize: '20px', color: '#aaaaaa',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000', strokeThickness: 3,
      }

      const shareBtn = this.add.text(blockCenterX - 110, blockY, 'SHARE', btnStyle)
        .setOrigin(0.5).setDepth(10)
      padInteractive(shareBtn)

      const skipBtn = this.add.text(blockCenterX + 130, blockY, 'SKIP >', skipStyle)
        .setOrigin(0.5).setDepth(10)
      padInteractive(skipBtn)

      const cleanup = () => {
        shareBtn.destroy()
        skipBtn.destroy()
      }

      shareBtn.on('pointerdown', async () => {
        haptics.light()
        cleanup()
        try {
          await nativeShare.shareVictory(playerName, score)
        } catch { /* usuário cancelou share dialog */ }
        resolve()
      })

      skipBtn.on('pointerdown', () => {
        haptics.selection()
        cleanup()
        resolve()
      })

      // Auto-skip após 8s
      this.time.delayedCall(8000, () => {
        if (shareBtn.active) {
          cleanup()
          resolve()
        }
      })
    })
  }

  shutdown() {
    this.removeNameInput()
  }
}
