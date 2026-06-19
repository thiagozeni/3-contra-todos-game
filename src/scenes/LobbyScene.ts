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
import { hex, semantic, primitive, FAMILY, makeAngledPanel } from '../ui/ds'
import { sound } from '../systems/SoundManager'
import { NET_ENABLED, SERVER_URL } from '../net/flags'
import { NetClient } from '../net/NetClient'
import { padInteractive } from '../utils/iosVideo'
import { buildInviteUrl } from '../net/inviteLink'
import { shareInvite } from '../net/shareInvite'
import { FREE_BUILD } from '../ads/buildFlavor'
import { CoopSelector } from './CoopSelector'
import { createDomCodeInput, type DomCodeInput } from '../utils/domCodeInput'
import { mountSceneBgVideo } from '../ui/sceneBg'

// URL placeholder for the premium app upsell CTA. Replaced by the store listing URL
// when the premium V2 listing is live (Checklist item 1 / Fatia 4 User Checklist).
const PREMIUM_STORE_URL = 'https://3contratodos.com'

type LobbyMode = 'menu' | 'creating' | 'hosting' | 'joining' | 'joined'

// Cores/fonte locais agora derivam dos tokens do DS (Opção A, proposta 07).
// YELLOW/GREY são byte-idênticos; WHITE (#f8f7f7→#ffffff) e RED_ERR (#ff6666→#ff4444)
// têm Δ visual mínimo, conforme tabela aprovada.
const FONT = FAMILY.display
const Y_TITLE = 130
const YELLOW = hex(semantic.textBrand)
const WHITE = hex(semantic.textPrimary)
const GREY = hex(semantic.textMuted)
const RED_ERR = hex(semantic.feedbackError)

export class LobbyScene extends Phaser.Scene {
  private netClient!: NetClient
  private lobbyMode: LobbyMode = 'menu'

  /**
   * True when this is a free build and CRIAR SALA is gated.
   * Exposed via __coopTest.getHostGateState() for E2E assertions.
   */
  private hostGateBlocked: boolean = FREE_BUILD

  // UI refs
  private codeDisplay!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private errorText!: Phaser.GameObjects.Text
  private selector!: CoopSelector
  private codeInput = ''
  private codeInputText!: Phaser.GameObjects.Text
  private codeInputCursor!: Phaser.GameObjects.Text
  /** DOM overlay input — replaces canvas-driven typing on mobile (FB7). */
  private domCodeInput: DomCodeInput | null = null

  private menuGroup!: Phaser.GameObjects.Group
  private lobbyGroup!: Phaser.GameObjects.Group
  private joinGroup!: Phaser.GameObjects.Group

  private shareBtn!: Phaser.GameObjects.Text
  private shareFeedback!: Phaser.GameObjects.Text
  private shareFeedbackTimer: ReturnType<typeof setTimeout> | null = null

  private cursorBlink = 0

  /** My Colyseus sessionId once in a room — identifies my cursor in the selector. */
  private mySessionId: string | null = null
  /** Latest authoritative player list (sorted) — drives the selector render. */
  private lastPlayers: import('../net/NetClient').PlayerInfo[] = []
  /**
   * Unsubscribe handles for the selector's NetClient callbacks (FB6). The lobby is a
   * pooled scene; without tearing these down before re-wiring, each match leaves a live
   * onStateChange closure behind. On the next match those stale callbacks ALSO fire
   * transitionToGame on every patch — racing the real transition into the wrong room and
   * leaving the player "stuck on the previous character".
   */
  private selectionUnsubs: Array<() => void> = []

  constructor() {
    super({ key: 'LobbyScene' })
  }

  create(data?: { autoJoinCode?: string }) {
    const { width, height } = this.scale
    this.lobbyMode = 'menu'
    this.codeInput = ''
    this.transitioning = false

    // FB6: Phaser pools scene instances — class-field initializers run ONCE at
    // construction, NOT on every create(). After a finished match returns here, the
    // lobby would otherwise carry stale identity/state from the previous match:
    //   - mySessionId still held the OLD session id → the state-driven selector mapped
    //     "me" to the wrong (absent) player, so the new pick never registered as mine
    //     and the player appeared "stuck with the previous character".
    //   - lastPlayers still held the OLD roster → the first render flashed stale picks.
    // Reset them on every entry so each match starts from a clean lobby.
    this.mySessionId = null
    this.lastPlayers = []
    // FB6: drop selector callbacks left registered by a previous match (the leak that
    // made stale onStateChange closures fire transitionToGame into the wrong room).
    this.clearSelectionSubs()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearSelectionSubs()
      // FB7: always clean up the DOM overlay on scene exit to prevent orphan nodes.
      this.destroyDomCodeInput()
    })

    this.cameras.main.setAlpha(1)
    this.cameras.main.fadeIn(250, 0, 0, 0)

    // Background — arena animada (loop reusado da How-to-Play: ring limpo + luzes
    // varrendo, sem texto), como no conceito co-op. Fallback PNG/isMacCompat embutido.
    mountSceneBgVideo(this, 'videos/howtoplay-loop.mp4', 'imgs/cenario/how-to-play-bg-superwide.png')
    // Véu escuro p/ legibilidade do título/painel/cards sobre a arena.
    this.add.rectangle(width / 2, height / 2, width, height, primitive.black, 0.55).setDepth(0)

    // Title
    this.add.text(width / 2, Y_TITLE, 'CO-OP ONLINE', {
      fontSize: '56px', color: YELLOW,
      fontFamily: FONT,
      stroke: hex(semantic.ink), strokeThickness: 12,
    }).setOrigin(0.5, 0).setDepth(2)

    this.add.text(width / 2, Y_TITLE + 85, 'BETA', {
      fontSize: '28px', color: hex(primitive.orange),
      fontFamily: FONT,
      stroke: hex(semantic.ink), strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(2)

    // Permanent error/status area
    this.errorText = this.add.text(width / 2, 290, '', {
      fontSize: '22px', color: RED_ERR,
      fontFamily: FONT,
      stroke: hex(semantic.ink), strokeThickness: 3,
      align: 'center', wordWrap: { width: 900 },
    }).setOrigin(0.5, 0).setDepth(5)

    // Back button (always visible)
    const back = this.add.text(60, 60, '< VOLTAR', {
      fontSize: '28px', color: WHITE,
      fontFamily: FONT,
      stroke: hex(semantic.ink), strokeThickness: 4,
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
      // The player still picks in the arcade selector after joining — no pre-pick here.
      // Defer one frame so UI is fully built before triggering async join.
      // Pass isAutoJoin=true so failure lands in menu (not stuck in join UI).
      this.time.delayedCall(0, () => this.doJoinByCode(true))
    }

    // E2E test harness (dev/beta only — gated behind NET_ENABLED). Lets a Playwright
    // script drive the co-op flow deterministically without simulating canvas clicks.
    ;(window as unknown as Record<string, unknown>).__coopTest = {
      // host(charKey): create a room. charKey is only an initial cursor hint now —
      // the actual pick is sent separately (select/confirm or pickAndConfirm).
      host: async (charKey?: string) => {
        if (charKey) this.registry.set('selectedChar', charKey)
        await this.doCreateRoom()
        return this.netClient.getRoomCode()
      },
      join: async (code: string, charKey?: string) => {
        if (charKey) this.registry.set('selectedChar', charKey)
        this.codeInput = code
        await this.doJoinByCode()
        return this.netClient.getRoomCode()
      },
      // ── FB3 arcade selector test API ──────────────────────────────────────────
      select: (charKey: string) => this.netClient?.sendSelectChar(charKey),
      confirm: () => this.netClient?.sendConfirmChar(),
      unconfirm: () => this.netClient?.sendUnconfirm(),
      /** Convenience: select + confirm in one call (the common E2E pattern). */
      pickAndConfirm: (charKey: string) => {
        this.netClient?.sendSelectChar(charKey)
        // Confirm on the next tick so the server has applied the pick first.
        setTimeout(() => this.netClient?.sendConfirmChar(), 120)
      },
      /** Returns my current selector state for E2E assertions. */
      selection: () => {
        const me = this.lastPlayers.find(p => p.sessionId === this.mySessionId)
        return {
          mySessionId: this.mySessionId,
          selectedChar: me?.selectedChar ?? '',
          confirmed: me?.confirmed ?? false,
          players: this.lastPlayers.map(p => ({
            sessionId: p.sessionId, selectedChar: p.selectedChar,
            confirmed: p.confirmed, connected: p.connected,
          })),
        }
      },
      // Legacy manual start (sends 'ready'; server honours it only when all confirmed).
      start: () => this.netClient?.sendReady(),
      mode: () => this.lobbyMode,
      share: () => this.doShareInvite(),
      getInviteUrl: () => {
        const code = this.netClient?.getRoomCode()
        if (!code) return null
        return buildInviteUrl(code, window.location.origin + window.location.pathname)
      },
      /** Returns the host gate state for E2E assertions (Task 4, Fatia 4). */
      getHostGateState: () => ({
        blocked: this.hostGateBlocked,
        isFreeBuild: FREE_BUILD,
      }),
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

    if (FREE_BUILD) {
      // ── Free build: CRIAR SALA is gated — show upsell instead ───────────────
      // The JOIN flow is completely untouched (ENTRAR COM CÓDIGO works as normal).
      const lockedBtn = this.add.text(width / 2, btnY, '🔒 CRIAR SALA', {
        fontSize: '36px', color: GREY,
        fontFamily: FONT,
        stroke: hex(semantic.ink), strokeThickness: 6,
        align: 'center',
      }).setOrigin(0.5).setAlpha(0.55).setDepth(2)

      const upsellText = this.add.text(width / 2, btnY + 52, 'Hostear é do app premium', {
        fontSize: '20px', color: hex(primitive.orange),
        fontFamily: FONT,
        stroke: hex(semantic.ink), strokeThickness: 3,
        align: 'center',
      }).setOrigin(0.5, 0).setDepth(2)

      // CTA: links to the premium store listing (placeholder until V2 listing is live)
      const ctaBtn = this.makeButton(width / 2, btnY + 88, '▶ CONHEÇA A EDIÇÃO PREMIUM', () => {
        // Open premium store URL in a new tab (web) or the platform store (native).
        // Replace PREMIUM_STORE_URL with the actual store deep-link when the listing is live.
        if (typeof window !== 'undefined') {
          window.open(PREMIUM_STORE_URL, '_blank', 'noopener,noreferrer')
        }
      })
      ctaBtn.setFontSize('20px').setColor(hex(semantic.textBrand))

      const joinBtn = this.makeButton(width / 2, btnY + gap + 60, 'ENTRAR COM CÓDIGO', () => this.showJoinUI())

      this.menuGroup.addMultiple([lockedBtn, upsellText, ctaBtn, joinBtn])
    } else {
      // ── Premium / web beta: both buttons fully active ─────────────────────────
      const createBtn = this.makeButton(width / 2, btnY, 'CRIAR SALA', () => this.doCreateRoom())
      const joinBtn   = this.makeButton(width / 2, btnY + gap, 'ENTRAR COM CÓDIGO', () => this.showJoinUI())
      this.menuGroup.addMultiple([createBtn, joinBtn])
    }
  }

  private buildLobbyUI(_width: number, _height: number) {
    this.lobbyGroup = this.add.group()

    // ── Painel de código à ESQUERDA (conceito co-op) ────────────────────────────
    // O bloco "CÓDIGO DA SALA / OHBZ / COMPARTILHAR / dica" fica num card lateral à
    // esquerda, liberando o centro-topo para a fileira de cards (selecionado maior).
    const PANEL_CX = 214 // centro X do painel (x=44 + w=340/2)
    const panel = makeAngledPanel(this, { x: 44, y: 392, w: 340, h: 300, variant: 'filled', frame: primitive.goldBrand, depth: 2 })
    panel.graphics.setVisible(false)

    const codeLabel = this.add.text(PANEL_CX, 424, 'CÓDIGO DA SALA:', {
      fontSize: '20px', color: GREY,
      fontFamily: FONT,
      stroke: hex(semantic.ink), strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(3)

    this.codeDisplay = this.add.text(PANEL_CX, 456, '', {
      fontSize: '50px', color: YELLOW,
      fontFamily: FONT,
      stroke: hex(semantic.ink), strokeThickness: 10,
      letterSpacing: 12,
    }).setOrigin(0.5, 0).setDepth(3)

    // Share button — stays visible during selection (invite code remains shown).
    this.shareBtn = this.makeButton(PANEL_CX, 556, 'COMPARTILHAR', () => this.doShareInvite())
    this.shareBtn.setFontSize('22px')
    this.shareBtn.setVisible(false)

    // Feedback text for clipboard copy
    this.shareFeedback = this.add.text(PANEL_CX, 604, '', {
      fontSize: '18px', color: hex(semantic.feedbackOk),
      fontFamily: FONT,
      stroke: hex(semantic.ink), strokeThickness: 3,
      align: 'center', wordWrap: { width: 320 },
    }).setOrigin(0.5, 0).setDepth(5)

    this.statusText = this.add.text(PANEL_CX, 636, '', {
      fontSize: '15px', color: WHITE,
      fontFamily: FONT,
      stroke: hex(semantic.ink), strokeThickness: 2,
      align: 'center', wordWrap: { width: 320 }, lineSpacing: 4,
    }).setOrigin(0.5, 0).setDepth(3)

    // The arcade character selector (built once; shown when in a room).
    this.selector = new CoopSelector(
      this,
      charKey => this.netClient?.sendSelectChar(charKey),
      confirmed => (confirmed ? this.netClient?.sendConfirmChar() : this.netClient?.sendUnconfirm()),
    )

    this.lobbyGroup.addMultiple([panel.graphics, this.codeDisplay, codeLabel, this.statusText, this.shareBtn, this.shareFeedback])
  }

  private buildJoinUI(width: number, _height: number) {
    this.joinGroup = this.add.group()

    const label = this.add.text(width / 2, 360, 'CÓDIGO DA SALA:', {
      fontSize: '28px', color: GREY,
      fontFamily: FONT,
      stroke: hex(semantic.ink), strokeThickness: 2,
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
      stroke: hex(semantic.ink), strokeThickness: 8,
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
    // FB7: kill the DOM overlay whenever we return to menu (Voltar or cancel)
    this.destroyDomCodeInput()
    this.setGroupVisible(this.menuGroup, true)
    this.setGroupVisible(this.lobbyGroup, false)
    this.setGroupVisible(this.joinGroup, false)
    this.selector?.setVisible(false)
  }

  private showLobbyUI(code: string, _isHost: boolean) {
    // FB7: remove DOM input overlay now that we are in the lobby
    this.destroyDomCodeInput()
    this.codeDisplay.setText(code)
    this.statusText.setText('Escolham seus lutadores — a partida começa quando todos confirmarem')
    // Share/invite stays visible to everyone during selection (code remains shown).
    this.shareBtn.setVisible(true)
    this.shareFeedback.setText('')
    this.setGroupVisible(this.menuGroup, false)
    this.setGroupVisible(this.joinGroup, false)
    this.setGroupVisible(this.lobbyGroup, true)
    this.selector.setVisible(true)
    this.clearError()
  }

  private showJoinUI() {
    this.lobbyMode = 'joining'
    this.codeInput = ''
    this.updateCodeInputDisplay()
    this.setGroupVisible(this.menuGroup, false)
    this.setGroupVisible(this.lobbyGroup, false)
    this.setGroupVisible(this.joinGroup, false)
    this.selector?.setVisible(false)
    this.setGroupVisible(this.joinGroup, true)
    this.clearError()
    this.cursorBlink = 0
    // FB7: replace canvas-driven input with a DOM <input> overlay so the
    // virtual keyboard appears immediately on mobile.
    this.destroyDomCodeInput()
    this.mountDomCodeInput()
  }

  /**
   * FB7: Mount the DOM <input> overlay for the join-by-code flow.
   * The input box in the Phaser canvas is at the rectangle centred at
   * (width/2, boxY + boxH/2) = (960, 480) in 1920×1080 game space.
   * boxY = 430, boxH = 100 → centre Y = 480.
   */
  private mountDomCodeInput() {
    const { width } = this.scale
    // Game-space box: same dimensions as buildJoinUI (boxW=520, boxH=100, boxY=430)
    this.domCodeInput = createDomCodeInput({
      gameX: width / 2,   // 960 in 1920-wide canvas
      gameY: 480,         // boxY(430) + boxH/2(50)
      gameW: 520,
      gameH: 100,
      onSubmit: (code) => {
        this.codeInput = code
        this.updateCodeInputDisplay()
        this.doJoinByCode()
      },
      onEscape: () => {
        this.destroyDomCodeInput()
        this.showMenu()
      },
    })
    // Keep the Phaser canvas text display in sync while the user types.
    // The DOM input is the authoritative source; codeInput just mirrors it for
    // display. The listener is removed automatically when the element is removed
    // from the DOM (since we hold no reference beyond the element's lifetime).
    const syncCanvas = () => {
      if (!this.domCodeInput) return
      this.codeInput = this.domCodeInput.getValue()
      this.updateCodeInputDisplay()
    }
    this.domCodeInput.element.addEventListener('input', syncCanvas)
  }

  /** FB7: Tear down the DOM overlay (idempotent). */
  private destroyDomCodeInput() {
    if (this.domCodeInput) {
      this.domCodeInput.destroy()
      this.domCodeInput = null
    }
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
    this.showStatus('Conectando...')
    sound.select()

    // FB3: the join-time charKey is only an initial CURSOR hint now (selection happens
    // in the lobby). Pass the registry pick if any so the cursor can pre-position.
    const charKey = (this.registry.get('selectedChar') as string) ?? ''

    const result = await this.netClient.createRoom(charKey)
    if (!result) {
      const msg = this.netClient.lastError ?? 'Servidor indisponível'
      this.showError(msg)
      this.hideStatus()
      this.showMenu()
      return
    }

    this.lobbyMode = 'hosting'
    this.mySessionId = this.netClient.getSessionId()
    this.showLobbyUI(result.code, true)

    this.wireSelectionState('hosting')
  }

  private async doJoinByCode(isAutoJoin = false) {
    const rawCode = this.codeInput.trim()
    if (rawCode.length !== 4) {
      this.showError('Insira exatamente 4 letras')
      return
    }

    this.clearError()
    this.showStatus('Conectando...')
    sound.select()

    // FB3: charKey is only an initial cursor hint; real picking happens in the lobby.
    const charKey = (this.registry.get('selectedChar') as string) ?? ''

    const result = await this.netClient.joinByCode(rawCode, charKey)
    if (!result) {
      const msg = this.netClient.lastError ?? 'Sala não encontrada ou servidor indisponível'
      this.showError(msg)
      this.hideStatus()
      // Auto-join failure: bad stale ?sala= link → land in menu, not a dead end
      if (isAutoJoin) {
        this.showMenu()
      } else {
        this.showJoinUI()
      }
      return
    }

    this.lobbyMode = 'joined'
    this.mySessionId = this.netClient.getSessionId()
    this.showLobbyUI(result.code, false)

    this.wireSelectionState('joined')
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

  // ── Arcade selection state wiring ────────────────────────────────────────────

  /**
   * Subscribe to room state once in a room: render the selector live and auto-transition
   * to the match when the server flips status to 'playing' (all players confirmed).
   */
  private wireSelectionState(forMode: 'hosting' | 'joined') {
    // FB6: drop any callbacks left over from a previous match before wiring new ones.
    this.clearSelectionSubs()

    this.selectionUnsubs.push(this.netClient.onStateChange(state => {
      if (state?.status === 'playing') {
        this.transitionToGame()
        return
      }
      if (state?.players) {
        this.lastPlayers = this.playersFromState(state)
        this.selector.render({ players: this.lastPlayers, mySessionId: this.mySessionId })
      }
    }))

    // If the connection drops while in the selector, fall back gracefully.
    this.selectionUnsubs.push(this.netClient.onConnectionStateChange(state => {
      if ((state === 'unavailable' || state === 'error') && this.lobbyMode === forMode) {
        this.showError('Servidor indisponível. Tente novamente.')
        this.showMenu()
      }
    }))
  }

  /** FB6: tear down the selector's NetClient callbacks (idempotent). */
  private clearSelectionSubs() {
    for (const off of this.selectionUnsubs) { try { off() } catch { /* noop */ } }
    this.selectionUnsubs = []
  }

  /** Extract a stable (slotIndex-sorted) player list from a raw room state. */
  private playersFromState(state: any): import('../net/NetClient').PlayerInfo[] {
    const players: import('../net/NetClient').PlayerInfo[] = []
    try {
      state.players?.forEach?.((p: any, sessionId: string) => {
        players.push({
          sessionId,
          charKey: p.charKey ?? '',
          connected: p.connected ?? true,
          selectedChar: p.selectedChar ?? '',
          confirmed: p.confirmed ?? false,
          slotIndex: typeof p.slotIndex === 'number' ? p.slotIndex : -1,
        })
      })
    } catch { /* defensive */ }
    // Sort by server-authoritative slotIndex so the render order matches P1/P2/P3.
    // Fall back to sessionId sort for any players whose slotIndex is not yet set.
    return players.sort((a, b) => {
      if (a.slotIndex >= 0 && b.slotIndex >= 0) return a.slotIndex - b.slotIndex
      if (a.slotIndex >= 0) return -1
      if (b.slotIndex >= 0) return 1
      return a.sessionId.localeCompare(b.sessionId)
    })
  }

  /** Characters currently picked by OTHER players — locked for me. */
  private lockedForMe(): Set<string> {
    const locked = new Set<string>()
    for (const p of this.lastPlayers) {
      if (p.sessionId !== this.mySessionId && p.selectedChar) locked.add(p.selectedChar)
    }
    return locked
  }

  private transitioning = false

  private transitionToGame() {
    // onStateChange fires every patch (~20Hz); without this guard fadeOut would be
    // restarted each tick and 'camerafadeoutcomplete' would never fire.
    if (this.transitioning) return
    this.transitioning = true

    const startGame = () => {
      this.scene.start('GameScene', {
        mode: 'net',
        netClient: this.netClient,
        room: this.netClient.getRoomState(),
      })
    }

    // FB6: LobbyScene is a POOLED scene. On a SECOND match the camera fade controller
    // can be left in a stale/dirty state from the previous entry, so 'camerafadeoutcomplete'
    // may never fire and the match silently never starts (the player appears "stuck" in
    // the lobby with the previous match). Reset the camera FX first, and add a safety
    // timer so the transition ALWAYS completes even if the fade event is dropped.
    this.cameras.main.resetFX()
    let started = false
    const go = () => { if (started) return; started = true; startGame() }
    this.cameras.main.once('camerafadeoutcomplete', go)
    this.time.delayedCall(700, go) // fade is 400ms — fire the fallback comfortably after
    this.cameras.main.fadeOut(400, 0, 0, 0)
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
    // In the selector (hosting/joined): arrows move my cursor, Enter confirms/cancels.
    if (this.lobbyMode === 'hosting' || this.lobbyMode === 'joined') {
      const { key } = event
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        this.selector.moveCursor(-1, this.lockedForMe())
      } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        this.selector.moveCursor(1, this.lockedForMe())
      } else if (key === 'Enter' || key === ' ') {
        this.selector.toggleConfirm()
      }
      return
    }

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

  // ── Error display ─────────────────────────────────────────────────────────────

  private showError(msg: string) {
    if (this.errorText?.active) {
      this.errorText.setColor(RED_ERR)
      this.errorText.setText(msg)
    }
  }

  private clearError() {
    if (this.errorText?.active) {
      this.errorText.setColor(RED_ERR)
      this.errorText.setText('')
    }
  }

  /**
   * Show a transient status message (e.g. "Conectando…") in the error area
   * using a neutral colour so it's not alarming.
   */
  private showStatus(msg: string) {
    if (this.errorText?.active) {
      this.errorText.setColor(hex(semantic.textMuted))
      this.errorText.setText(msg)
    }
  }

  /** Clear the status message and reset the text colour to red for future errors. */
  private hideStatus() {
    if (this.errorText?.active) {
      this.errorText.setColor(RED_ERR)
      this.errorText.setText('')
    }
  }

  // ── UI factory ────────────────────────────────────────────────────────────────

  private makeButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const btn = this.add.text(x, y, label, {
      fontSize: '36px', color: WHITE,
      fontFamily: FONT,
      stroke: hex(semantic.ink), strokeThickness: 6,
    }).setOrigin(0.5).setDepth(3)

    padInteractive(btn)
    btn.on('pointerover',  () => btn.setColor(YELLOW))
    btn.on('pointerout',   () => btn.setColor(WHITE))
    btn.on('pointerdown',  onClick)

    return btn
  }
}
