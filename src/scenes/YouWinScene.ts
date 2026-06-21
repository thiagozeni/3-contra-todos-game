import Phaser from 'phaser'
import { t } from '../i18n'
import { sound } from '../systems/SoundManager'
import { saveScore, saveCoopScore, saveCoopScoreSigned } from '../lib/leaderboard'
import type { CoopResult } from '../net/NetClient'
import { nativeShare, haptics } from '../systems/NativeBridge'
import { gameCenter, GC_ACHIEVEMENTS, localProgress } from '../systems/GameCenterBridge'
import { padInteractive } from '../utils/iosVideo'
import { hex, semantic, FAMILY, makeResultPanel, type ResultRow } from '../ui/ds'
import { mountSceneBgVideo } from '../ui/sceneBg'

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

    // Fundo próprio da tela (#scene-bg cover) — "CONGRATULATIONS / YOU WIN!" +
    // personagens já vêm embutidos na arte; o Phaser só sobrepõe o dinâmico
    // (stats, input de nome, PLAY AGAIN).
    mountSceneBgVideo(this, 'videos/youwin-loop.mp4', 'imgs/cenario/you-win-superwide.png')
    // Overlay leve só p/ legibilidade do painel à esquerda (arte respira).
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.3).setDepth(1)

    // Stats da partida
    const coop      = this.registry.get('youWinCoop') === true
    const score     = this.registry.get('youWinScore')    as number ?? 0
    const timeMs    = this.registry.get('youWinTime')     as number ?? 0
    const mm = String(Math.floor(timeMs / 60000)).padStart(2, '0')
    const ss = String(Math.floor((timeMs % 60000) / 1000)).padStart(2, '0')

    // Painel de resultado — caixa arredondada + ícones por linha (fiel ao conceito).
    // Co-op não rastreia kills nem continues → SCORE + TEMPO + WAVE (mesmo estilo).
    const rows: ResultRow[] = coop
      ? [
          { kind: 'score', label: t('result.score'), value: score.toLocaleString() },
          { kind: 'time',  label: t('result.time'),  value: `${mm}:${ss}` },
          { kind: 'wave',  label: t('result.wave'),  value: `${(this.registry.get('youWinWave') as number) ?? 0} / ${(this.registry.get('totalWaves') as number) ?? 0}` },
        ]
      : [
          { kind: 'score',     label: t('result.score'),     value: score.toLocaleString() },
          { kind: 'kills',     label: t('result.enemies'),   value: String((this.registry.get('youWinKills') as number) ?? 0) },
          { kind: 'time',      label: t('result.time'),      value: `${mm}:${ss}` },
          { kind: 'continues', label: t('result.continues'), value: String((this.registry.get('continueCount') as number) ?? 0) },
        ]
    makeResultPanel(this, { x: 96, y: 312, w: 560, depth: 1, rows })

    // Co-op: UM único cliente (submitter, designado pelo servidor — o host, ou o próximo
    // se ele saiu) digita o NOME DO TIME e salva. Com o caminho assinado (C2/H4) é o
    // coopIsSubmitter; sem token (servidor antigo) cai no host. Os demais veem a mensagem.
    const coopToken = this.registry.get('coopResult') as CoopResult | null
    const coopSubmitter = coopToken
      ? this.registry.get('coopIsSubmitter') === true
      : this.registry.get('youWinCoopHost') === true
    const canType = !coop || coopSubmitter

    this.add.text(129, 628, coop ? t('youwin.teamName') : t('youwin.enterName'), {
      fontSize: '36px', color: hex(semantic.textPrimary),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 6,
    }).setOrigin(0, 0).setDepth(2)

    if (canType) {
      // Input HTML sobreposto
      this.nameInput = this.createNameInput(coop ? 'TIME' : 'AAA')
    } else {
      // Guest de co-op — sem input; o host salva a pontuação do time.
      this.add.text(129, 686, t('youwin.hostWillSave'), {
        fontSize: '22px', color: hex(semantic.textMuted),
        fontFamily: FAMILY.display, stroke: hex(semantic.ink), strokeThickness: 3,
      }).setOrigin(0, 0).setDepth(2)
    }

    // "> PRESS START <" (pisca) — conceito não tem "PLAY AGAIN?", só o CTA abaixo do input.
    const startText = this.add.text(129, 812, t('youwin.pressStart'), {
      fontSize: '52px', color: hex(semantic.textBrand),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 6,
    }).setOrigin(0, 0).setDepth(2)
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

  private createNameInput(placeholder = 'AAA'): HTMLInputElement {
    const canvas = this.game.canvas
    const bounds  = canvas.getBoundingClientRect()
    const scaleX  = bounds.width  / 1920
    const scaleY  = bounds.height / 1080

    const input = document.createElement('input')
    input.type        = 'text'
    input.maxLength   = 12
    input.placeholder = placeholder
    input.style.position    = 'fixed'
    input.style.left        = `${bounds.left + 129 * scaleX}px`
    input.style.top         = `${bounds.top  + 678 * scaleY}px`
    input.style.width       = `${560 * scaleX}px`
    input.style.height      = `${56 * scaleY}px`
    input.style.fontSize    = `${28 * scaleY}px`
    input.style.fontFamily  = FAMILY.display
    input.style.background  = 'rgba(0,0,0,0.7)'
    input.style.color       = hex(semantic.textBrand)
    input.style.border      = `2px solid ${hex(semantic.textBrand)}`
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

    const coop      = this.registry.get('youWinCoop') === true
    const name      = (this.nameInput?.value.trim() || (coop ? 'TIME' : 'AAA')).toUpperCase().slice(0, 12)
    const score     = this.registry.get('youWinScore')   as number ?? 0
    const timeMs    = this.registry.get('youWinTime')    as number ?? 0
    const continues = this.registry.get('continueCount') as number ?? 0
    const character = coop
      ? ((this.registry.get('youWinCoopChar') as string) ?? 'werdum')
      : ((this.registry.get('selectedChar') as string) ?? 'werdum')
    // C2/H4: resultado co-op assinado pelo servidor (null se servidor antigo → usa fallback).
    const coopToken = this.registry.get('coopResult') as CoopResult | null
    // Submitter = único cliente que salva (designado pelo servidor; host normalmente).
    const coopSubmitter = coopToken
      ? this.registry.get('coopIsSubmitter') === true
      : this.registry.get('youWinCoopHost') === true

    this.removeNameInput()
    sound.select()
    // Co-op abre a aba CO-OP do Top 10 ao final.
    if (coop) this.registry.set('topTenMode', 'coop')

    // Feedback de salvando
    this.statusText = this.add.text(129, 690, t('youwin.saving'), {
      fontSize: '22px', color: hex(semantic.textMuted),
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink), strokeThickness: 3,
    }).setDepth(5)

    const cheatUsed = this.registry.get('cheatUsed') === true
    // Guest de co-op não salva (o host salva a pontuação do time) — só transita.
    const willSave = !cheatUsed && (!coop || coopSubmitter)

    // Aguarda brevemente o token da sessão: start_game roda no início da partida e
    // quase sempre já resolveu (a partida dura >150s), mas em rede lenta pode atrasar.
    let sessionToken = this.registry.get('gameSessionToken') as string | undefined
    if (willSave && !sessionToken) {
      for (let i = 0; i < 30 && !sessionToken; i++) {
        await new Promise(r => this.time.delayedCall(100, r))
        sessionToken = this.registry.get('gameSessionToken') as string | undefined
      }
    }

    // Game Center: só single-player (co-op tem leaderboard próprio).
    if (!cheatUsed && !coop) {
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
        this.statusText.setText(t('youwin.cheatNotSaved')).setColor(hex(semantic.textBrand))
        await new Promise(r => this.time.delayedCall(800, r))
      } else if (coop && !coopSubmitter) {
        // Não-submitter: o submitter (host, ou o líder designado pelo servidor se o host
        // saiu) salva o score do time. Apenas UM cliente submete → sem corrida de nonce.
        this.statusText.setText(t('youwin.teamSavedByHost')).setColor(hex(semantic.textBrand))
        await new Promise(r => this.time.delayedCall(800, r))
      } else if (coop && coopToken) {
        // C2/H4: caminho ASSINADO pelo servidor — score/wave/tempo inforjáveis. Não precisa
        // de sessionToken (a assinatura é a prova). Fallback p/ o caminho legado se falhar
        // (servidor antigo sem o broadcast / segredo divergente) e ainda houver sessionToken.
        try {
          await saveCoopScoreSigned({
            team_name: name, character,
            score: coopToken.score, wave: coopToken.wave, time_ms: coopToken.timeMs,
            nonce: coopToken.nonce, sig: coopToken.sig,
          })
          saveOk = true
        } catch (e) {
          if (sessionToken) {
            await saveCoopScore({ team_name: name, character, time_ms: Math.floor(timeMs / 1000) * 1000, score: Math.floor(score) }, sessionToken)
            saveOk = true
          } else {
            throw e
          }
        }
      } else if (!sessionToken) {
        // Sem sessão válida (ex.: start_game falhou por offline/rate limit) — não salva.
        this.statusText.setText(t('youwin.offlineNotSaved')).setColor(hex(semantic.textBrand))
        await new Promise(r => this.time.delayedCall(800, r))
      } else if (coop) {
        await saveCoopScore({ team_name: name, character, time_ms: Math.floor(timeMs / 1000) * 1000, score: Math.floor(score) }, sessionToken)
        saveOk = true
      } else {
        await saveScore({ player_name: name, character, continues: Math.floor(continues), time_ms: Math.floor(timeMs / 1000) * 1000, score: Math.floor(score) }, sessionToken)
        saveOk = true
      }
    } catch (e) {
      console.error('[Leaderboard] Erro ao salvar:', e)
      this.statusText.setText(t('youwin.saveError'))
      this.statusText.setColor(hex(semantic.feedbackError))
      // Aguarda 3s e vai mesmo assim
      await new Promise(r => this.time.delayedCall(3000, r))
    }

    if (saveOk) {
      this.statusText.setText(t('youwin.saved')).setColor(hex(semantic.feedbackOk))
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
    this.registry.remove('youWinCoop')
    this.registry.remove('youWinCoopHost')
    this.registry.remove('youWinCoopChar')

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
        fontSize: '28px', color: hex(semantic.ink),
        fontFamily: FAMILY.display,
        backgroundColor: hex(semantic.textBrand),
        padding: { x: 24, y: 12 },
      }

      const skipStyle = {
        fontSize: '20px', color: hex(semantic.textMuted),
        fontFamily: FAMILY.display,
        stroke: hex(semantic.ink), strokeThickness: 3,
      }

      const shareBtn = this.add.text(blockCenterX - 110, blockY, t('youwin.share'), btnStyle)
        .setOrigin(0.5).setDepth(10)
      padInteractive(shareBtn)

      const skipBtn = this.add.text(blockCenterX + 130, blockY, t('youwin.skip'), skipStyle)
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
