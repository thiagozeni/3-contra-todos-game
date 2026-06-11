/**
 * LobbyScene — sala de espera para o modo co-op online.
 * Atrás do feature flag NET_ENABLED.
 *
 * Fluxos:
 *  - Criar sala: NetClient.createRoom() → mostra código de 4 letras + lista de players
 *    → botão [COMEÇAR] → sends 'ready' → transição para GameScene {mode:'net',room}
 *  - Entrar com código: campo de texto → NetClient.joinByCode() → lista de players → espera host
 *
 * UI: segue o estilo de TitleScene/SelectScene — fonte 'Press Start 2P', paleta amarelo/branco.
 */

import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { NET_ENABLED, SERVER_URL } from '../net/flags'
import { NetClient } from '../net/NetClient'
import type { PlayerInfo } from '../net/NetClient'
import { padInteractive } from '../utils/iosVideo'
import { buildInviteUrl } from '../net/inviteLink'
import { shareInvite } from '../net/shareInvite'

type LobbyMode = 'menu' | 'creating' | 'hosting' | 'joining' | 'joined'

const FONT = '"Press Start 2P", monospace'
const Y_TITLE = 130
const YELLOW = '#f3c204'
const WHITE = '#f8f7f7'
const GREY = '#aaaaaa'
const RED_ERR = '#ff6666'

export class LobbyScene extends Phaser.Scene {
  private netClient!: NetClient
  private lobbyMode: LobbyMode = 'menu'
  private isHost = false

  // UI refs
  private codeDisplay!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private errorText!: Phaser.GameObjects.Text
  private playerListText!: Phaser.GameObjects.Text
  private startBtn!: Phaser.GameObjects.Text
  private codeInput = ''
  private codeInputText!: Phaser.GameObjects.Text
  private codeInputCursor!: Phaser.GameObjects.Text

  private menuGroup!: Phaser.GameObjects.Group
  private lobbyGroup!: Phaser.GameObjects.Group
  private joinGroup!: Phaser.GameObjects.Group

  private shareBtn!: Phaser.GameObjects.Text
  private shareFeedback!: Phaser.GameObjects.Text
  private shareFeedbackTimer: ReturnType<typeof setTimeout> | null = null

  private cursorBlink = 0

  constructor() {
    super({ key: 'LobbyScene' })
  }

  create(data?: { autoJoinCode?: string }) {
    const { width, height } = this.scale
    this.lobbyMode = 'menu'
    this.codeInput = ''
    this.transitioning = false

    this.cameras.main.setAlpha(1)
    this.cameras.main.fadeIn(250, 0, 0, 0)

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x0d0d1a)

    // Title
    this.add.text(width / 2, Y_TITLE, 'CO-OP ONLINE', {
      fontSize: '56px', color: YELLOW,
      fontFamily: FONT,
      stroke: '#000000', strokeThickness: 12,
    }).setOrigin(0.5, 0).setDepth(2)

    this.add.text(width / 2, Y_TITLE + 85, 'BETA', {
      fontSize: '28px', color: '#ff9900',
      fontFamily: FONT,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(2)

    // Permanent error/status area
    this.errorText = this.add.text(width / 2, 290, '', {
      fontSize: '22px', color: RED_ERR,
      fontFamily: FONT,
      stroke: '#000000', strokeThickness: 3,
      align: 'center', wordWrap: { width: 900 },
    }).setOrigin(0.5, 0).setDepth(5)

    // Back button (always visible)
    const back = this.add.text(60, 60, '< VOLTAR', {
      fontSize: '28px', color: WHITE,
      fontFamily: FONT,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5).setAlpha(0.7).setDepth(2)
    padInteractive(back)
    back.on('pointerdown', (_p: any, _lx: number, _ly: number, event: any) => {
      event.stopPropagation()
      this.goBack()
    })

    // Build menu
    this.buildMenuUI(width, height)
    this.buildLobbyUI(width, height)
    this.buildJoinUI(width, height)

    this.showMenu()

    // Keyboard for code entry
    this.input.keyboard!.on('keydown', this.handleKeyDown, this)

    // Init NetClient
    if (!NET_ENABLED) {
      this.showError('Servidor indisponível (modo offline)')
      return
    }
    this.netClient = new NetClient(SERVER_URL)

    // Auto-join: if an invite code was passed via ?sala= in the URL (BootScene detects it),
    // skip the menu and go straight to the join flow.
    if (data?.autoJoinCode) {
      const code = data.autoJoinCode
      this.codeInput = code
      // Use first available character (quick-pick; no character selection screen)
      if (!this.registry.get('selectedChar')) {
        this.registry.set('selectedChar', 'werdum')
      }
      // Defer one frame so UI is fully built before triggering async join
      this.time.delayedCall(0, () => this.doJoinByCode())
    }

    // E2E test harness (dev/beta only — gated behind NET_ENABLED). Lets a Playwright
    // script drive the co-op flow deterministically without simulating canvas clicks.
    ;(window as unknown as Record<string, unknown>).__coopTest = {
      host: async (charKey: string) => {
        this.registry.set('selectedChar', charKey)
        await this.doCreateRoom()
        return this.netClient.getRoomCode()
      },
      join: async (code: string, charKey: string) => {
        this.registry.set('selectedChar', charKey)
        this.codeInput = code
        await this.doJoinByCode()
        return this.netClient.getRoomCode()
      },
      start: () => this.doStart(),
      mode: () => this.lobbyMode,
      share: () => this.doShareInvite(),
      getInviteUrl: () => {
        const code = this.netClient?.getRoomCode()
        if (!code) return null
        return buildInviteUrl(code, window.location.origin + window.location.pathname)
      },
    }
  }

  update(_time: number, delta: number) {
    // Cursor blink for code input
    if (this.lobbyMode === 'joining') {
      this.cursorBlink += delta
      if (this.cursorBlink > 600) this.cursorBlink = 0
      const showCursor = this.cursorBlink < 300
      this.codeInputCursor.setVisible(showCursor)
    }
  }

  // ── UI Builders ─────────────────────────────────────────────────────────────

  private buildMenuUI(width: number, _height: number) {
    this.menuGroup = this.add.group()

    const btnY = 420
    const gap = 130

    const createBtn = this.makeButton(width / 2, btnY, 'CRIAR SALA', () => this.doCreateRoom())
    const joinBtn   = this.makeButton(width / 2, btnY + gap, 'ENTRAR COM CÓDIGO', () => this.showJoinUI())

    this.menuGroup.addMultiple([createBtn, joinBtn])
  }

  private buildLobbyUI(width: number, height: number) {
    this.lobbyGroup = this.add.group()

    // Code display (big, centered)
    this.codeDisplay = this.add.text(width / 2, 340, '', {
      fontSize: '96px', color: YELLOW,
      fontFamily: FONT,
      stroke: '#000000', strokeThickness: 18,
      letterSpacing: 24,
    }).setOrigin(0.5, 0).setDepth(3)

    // Label above code
    const codeLabel = this.add.text(width / 2, 310, 'CÓDIGO DA SALA:', {
      fontSize: '22px', color: GREY,
      fontFamily: FONT,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(3)

    this.statusText = this.add.text(width / 2, 530, '', {
      fontSize: '24px', color: WHITE,
      fontFamily: FONT,
      stroke: '#000000', strokeThickness: 2,
      align: 'center',
    }).setOrigin(0.5, 0).setDepth(3)

    // Player list
    const listLabel = this.add.text(width / 2, 610, 'JOGADORES:', {
      fontSize: '22px', color: GREY,
      fontFamily: FONT,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(3)

    this.playerListText = this.add.text(width / 2, 655, '', {
      fontSize: '28px', color: WHITE,
      fontFamily: FONT,
      stroke: '#000000', strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5, 0).setDepth(3)

    // Start button (host only)
    this.startBtn = this.makeButton(width / 2, height - 200, 'COMEÇAR', () => this.doStart())
    this.startBtn.setVisible(false)

    // Share button (host only) — appears next to the room code
    this.shareBtn = this.makeButton(width / 2 + 380, 390, 'COMPARTILHAR', () => this.doShareInvite())
    this.shareBtn.setFontSize('24px')
    this.shareBtn.setVisible(false)

    // Feedback text for clipboard copy
    this.shareFeedback = this.add.text(width / 2, 490, '', {
      fontSize: '22px', color: '#44ff88',
      fontFamily: FONT,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(5)

    this.lobbyGroup.addMultiple([this.codeDisplay, codeLabel, this.statusText, listLabel, this.playerListText, this.startBtn, this.shareBtn, this.shareFeedback])
  }

  private buildJoinUI(width: number, _height: number) {
    this.joinGroup = this.add.group()

    const label = this.add.text(width / 2, 360, 'CÓDIGO DA SALA:', {
      fontSize: '28px', color: GREY,
      fontFamily: FONT,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(3)

    // Code input box
    const boxW = 520, boxH = 100
    const boxY = 430
    const inputBg = this.add.rectangle(width / 2, boxY + boxH / 2, boxW, boxH, 0x1a1a2e)
      .setStrokeStyle(4, 0xf3c204)
      .setDepth(3)

    this.codeInputText = this.add.text(width / 2 - boxW / 2 + 20, boxY + boxH / 2, '', {
      fontSize: '64px', color: YELLOW,
      fontFamily: FONT,
      stroke: '#000000', strokeThickness: 8,
      letterSpacing: 16,
    }).setOrigin(0, 0.5).setDepth(4)

    this.codeInputCursor = this.add.text(0, boxY + boxH / 2, '|', {
      fontSize: '64px', color: YELLOW,
      fontFamily: FONT,
    }).setOrigin(0, 0.5).setDepth(4)

    const hint = this.add.text(width / 2, boxY + boxH + 20, 'Digite o código e pressione ENTER', {
      fontSize: '20px', color: GREY,
      fontFamily: FONT,
    }).setOrigin(0.5, 0).setDepth(3)

    // Confirm button
    const confirmBtn = this.makeButton(width / 2, 680, 'ENTRAR', () => this.doJoinByCode())

    this.joinGroup.addMultiple([label, inputBg, this.codeInputText, this.codeInputCursor, hint, confirmBtn])
  }

  // ── Visibility helpers ───────────────────────────────────────────────────────

  private showMenu() {
    this.lobbyMode = 'menu'
    this.setGroupVisible(this.menuGroup, true)
    this.setGroupVisible(this.lobbyGroup, false)
    this.setGroupVisible(this.joinGroup, false)
  }

  private showLobbyUI(code: string, isHost: boolean) {
    this.isHost = isHost
    this.codeDisplay.setText(code)
    this.statusText.setText(isHost ? 'Aguardando jogadores...' : 'Aguardando o host iniciar...')
    this.startBtn.setVisible(isHost)
    this.shareBtn.setVisible(isHost)
    this.shareFeedback.setText('')
    this.playerListText.setText('')
    this.setGroupVisible(this.menuGroup, false)
    this.setGroupVisible(this.joinGroup, false)
    this.setGroupVisible(this.lobbyGroup, true)
    this.clearError()
  }

  private showJoinUI() {
    this.lobbyMode = 'joining'
    this.codeInput = ''
    this.updateCodeInputDisplay()
    this.setGroupVisible(this.menuGroup, false)
    this.setGroupVisible(this.lobbyGroup, false)
    this.setGroupVisible(this.joinGroup, true)
    this.clearError()
    this.cursorBlink = 0
  }

  private setGroupVisible(group: Phaser.GameObjects.Group, visible: boolean) {
    group.getChildren().forEach(child => (child as Phaser.GameObjects.GameObject & { setVisible: (v: boolean) => void }).setVisible(visible))
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  private async doCreateRoom() {
    if (!NET_ENABLED) {
      this.showError('Servidor indisponível')
      return
    }
    this.clearError()
    this.lobbyMode = 'creating'
    sound.select()

    const charKey = (this.registry.get('selectedChar') as string) ?? 'werdum'

    this.netClient.onConnectionStateChange(state => {
      if (state === 'unavailable' || state === 'error') {
        this.showError('Servidor indisponível. Tente novamente.')
        this.showMenu()
      }
    })

    this.netClient.onPlayersChange(players => {
      this.updatePlayerList(players)
    })

    const result = await this.netClient.createRoom(charKey)
    if (!result) {
      this.showMenu()
      return
    }

    this.lobbyMode = 'hosting'
    this.showLobbyUI(result.code, true)

    // Subscribe state changes for player list
    this.netClient.onStateChange(state => {
      if (state?.players) {
        this.emitPlayersFromState(state)
      }
    })
  }

  private async doJoinByCode() {
    const rawCode = this.codeInput.trim()
    if (rawCode.length !== 4) {
      this.showError('Insira exatamente 4 letras')
      return
    }

    this.clearError()
    sound.select()

    const charKey = (this.registry.get('selectedChar') as string) ?? 'dida'

    this.netClient.onConnectionStateChange(state => {
      if (state === 'unavailable' || state === 'error') {
        this.showError('Sala não encontrada ou servidor indisponível.')
        this.showJoinUI()
      }
    })

    this.netClient.onPlayersChange(players => {
      this.updatePlayerList(players)
    })

    const result = await this.netClient.joinByCode(rawCode, charKey)
    if (!result) {
      return // error already shown via state callback
    }

    this.lobbyMode = 'joined'
    this.showLobbyUI(result.code, false)

    this.netClient.onStateChange(state => {
      if (state?.status === 'playing') {
        this.transitionToGame()
      }
      if (state?.players) {
        this.emitPlayersFromState(state)
      }
    })
  }

  private async doShareInvite(): Promise<import('../net/shareInvite').ShareResult | null> {
    const code = this.netClient?.getRoomCode()
    if (!code) return null

    const inviteUrl = buildInviteUrl(code, window.location.origin + window.location.pathname)
    const result = await shareInvite(inviteUrl)

    // Clear any existing timer
    if (this.shareFeedbackTimer !== null) {
      clearTimeout(this.shareFeedbackTimer)
      this.shareFeedbackTimer = null
    }

    if (result === 'copied') {
      this.shareFeedback.setText('Link copiado!')
    } else if (result === 'failed') {
      this.shareFeedback.setText(inviteUrl)
    }
    // 'shared' and 'cancelled' need no feedback text (share sheet handled it)

    if (result === 'copied' || result === 'failed') {
      this.shareFeedbackTimer = setTimeout(() => {
        if (this.shareFeedback?.active) this.shareFeedback.setText('')
        this.shareFeedbackTimer = null
      }, 3000)
    }

    return result
  }

  private doStart() {
    if (!this.isHost || this.lobbyMode !== 'hosting') return
    sound.select()
    this.netClient.sendReady()
    this.statusText.setText('Iniciando...')
    this.startBtn.setVisible(false)
    // Host also watches for status change
    this.netClient.onStateChange(state => {
      if (state?.status === 'playing') {
        this.transitionToGame()
      }
    })
  }

  private transitioning = false

  private transitionToGame() {
    // onStateChange fires every patch (~20Hz); without this guard fadeOut would be
    // restarted each tick and 'camerafadeoutcomplete' would never fire.
    if (this.transitioning) return
    this.transitioning = true
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene', {
        mode: 'net',
        netClient: this.netClient,
        room: this.netClient.getRoomState(),
      })
    })
  }

  private goBack() {
    sound.select()
    // Disconnect gracefully
    if (this.netClient && (this.lobbyMode === 'hosting' || this.lobbyMode === 'joined')) {
      this.netClient.leave().catch(() => {})
    }
    this.cameras.main.fadeOut(300, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TitleScene'))
  }

  // ── Keyboard input for code entry ────────────────────────────────────────────

  private handleKeyDown(event: KeyboardEvent) {
    if (this.lobbyMode !== 'joining') return

    const { key } = event
    if (key === 'Backspace') {
      this.codeInput = this.codeInput.slice(0, -1)
      this.updateCodeInputDisplay()
    } else if (key === 'Enter') {
      this.doJoinByCode()
    } else if (key === 'Escape') {
      this.showMenu()
    } else if (/^[a-zA-Z]$/.test(key) && this.codeInput.length < 4) {
      this.codeInput += key.toUpperCase()
      this.updateCodeInputDisplay()
    }
  }

  private updateCodeInputDisplay() {
    this.codeInputText.setText(this.codeInput)
    // Position cursor after the last character
    const textWidth = this.codeInputText.width
    const boxX = this.scale.width / 2 - 520 / 2 + 20
    this.codeInputCursor.setX(boxX + textWidth + 4)
  }

  // ── Player list ───────────────────────────────────────────────────────────────

  private emitPlayersFromState(state: any) {
    const players: PlayerInfo[] = []
    try {
      if (state.players?.forEach) {
        state.players.forEach((p: any, sessionId: string) => {
          players.push({ sessionId, charKey: p.charKey ?? '?', connected: p.connected ?? true })
        })
      }
    } catch {}
    this.updatePlayerList(players)
  }

  private updatePlayerList(players: PlayerInfo[]) {
    if (!this.playerListText?.active) return
    if (players.length === 0) {
      this.playerListText.setText('')
      return
    }
    const lines = players.map((p, i) => {
      const status = p.connected ? '' : ' (desconectado)'
      return `  ${i + 1}P  ${p.charKey.toUpperCase()}${status}`
    })
    this.playerListText.setText(lines.join('\n'))
  }

  // ── Error display ─────────────────────────────────────────────────────────────

  private showError(msg: string) {
    if (this.errorText?.active) this.errorText.setText(msg)
  }

  private clearError() {
    if (this.errorText?.active) this.errorText.setText('')
  }

  // ── UI factory ────────────────────────────────────────────────────────────────

  private makeButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const btn = this.add.text(x, y, label, {
      fontSize: '36px', color: WHITE,
      fontFamily: FONT,
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(3)

    padInteractive(btn)
    btn.on('pointerover',  () => btn.setColor(YELLOW))
    btn.on('pointerout',   () => btn.setColor(WHITE))
    btn.on('pointerdown',  onClick)

    return btn
  }
}
