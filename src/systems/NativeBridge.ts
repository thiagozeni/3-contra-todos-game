/**
 * NativeBridge — abstrai plugins Capacitor nativos com fallback web.
 * Usado para haptics, share, local notifications e app lifecycle.
 */
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Share } from '@capacitor/share'
import { LocalNotifications } from '@capacitor/local-notifications'
import { App } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'

const isNative = Capacitor.isNativePlatform()

// ─── Haptics ───────────────────────────────────────────────────

export const haptics = {
  /** Leve — toque em botão, coleta de item */
  light() {
    if (!isNative) return
    Haptics.impact({ style: ImpactStyle.Light })
  },

  /** Médio — soco conecta, hit normal */
  medium() {
    if (!isNative) return
    Haptics.impact({ style: ImpactStyle.Medium })
  },

  /** Pesado — chute conecta, hit forte, knockdown */
  heavy() {
    if (!isNative) return
    Haptics.impact({ style: ImpactStyle.Heavy })
  },

  /** Sucesso — vitória, wave concluída */
  success() {
    if (!isNative) return
    Haptics.notification({ type: NotificationType.Success })
  },

  /** Alerta — HP baixo, último continue */
  warning() {
    if (!isNative) return
    Haptics.notification({ type: NotificationType.Warning })
  },

  /** Erro — game over, KO */
  error() {
    if (!isNative) return
    Haptics.notification({ type: NotificationType.Error })
  },

  /** Seleção — navegar menus */
  selection() {
    if (!isNative) return
    Haptics.selectionStart()
    Haptics.selectionChanged()
    Haptics.selectionEnd()
  },
}

// ─── Share ──────────────────────────────────────────────────────

export const nativeShare = {
  async shareScore(playerName: string, score: number, wave: number) {
    const text = `Marquei ${score.toLocaleString()} pontos no 3 Contra Todos! Cheguei na wave ${wave} com ${playerName}. Consegue me superar?`

    if (isNative) {
      await Share.share({
        title: '3 Contra Todos',
        text,
        dialogTitle: 'Compartilhar score',
      })
    } else {
      // Fallback web: clipboard
      try {
        await navigator.clipboard.writeText(text)
      } catch { /* silencioso no web */ }
    }
  },

  async shareVictory(playerName: string, score: number) {
    const text = `Zerei o 3 Contra Todos com ${playerName}! Score: ${score.toLocaleString()}. Baixe e tente superar!`

    if (isNative) {
      await Share.share({
        title: '3 Contra Todos — Vitória!',
        text,
        dialogTitle: 'Compartilhar vitória',
      })
    }
  },
}

// ─── Local Notifications ────────────────────────────────────────

export const notifications = {
  async requestPermission(): Promise<boolean> {
    if (!isNative) return false
    const result = await LocalNotifications.requestPermissions()
    return result.display === 'granted'
  },

  async scheduleDailyChallenge() {
    if (!isNative) return

    const granted = await this.requestPermission()
    if (!granted) return

    // Cancela notificações anteriores antes de reagendar
    await LocalNotifications.cancel({ notifications: [{ id: 1001 }] })

    await LocalNotifications.schedule({
      notifications: [
        {
          id: 1001,
          title: '3 Contra Todos',
          body: 'Seus inimigos estão esperando! Entra na arena e mostra quem manda.',
          schedule: {
            on: { hour: 19, minute: 0 },
            repeats: true,
            allowWhileIdle: true,
          },
          sound: undefined,
          smallIcon: 'ic_stat_icon',
          largeIcon: 'ic_launcher',
        },
      ],
    })
  },

  async scheduleReturnReminder() {
    if (!isNative) return

    const granted = await this.requestPermission()
    if (!granted) return

    await LocalNotifications.cancel({ notifications: [{ id: 1002 }] })

    // Lembrete 24h após última sessão
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await LocalNotifications.schedule({
      notifications: [
        {
          id: 1002,
          title: 'A arena te espera!',
          body: 'Faz tempo que você não joga. Seus amigos estão subindo no ranking!',
          schedule: { at: tomorrow },
          sound: undefined,
        },
      ],
    })
  },
}

// ─── App Lifecycle ──────────────────────────────────────────────

export const appLifecycle = {
  /**
   * Registra os listeners de pause/resume e retorna um cleanup. O chamador DEVE
   * invocar o cleanup ao sair (ex.: scene shutdown) — sem isso, cada partida acumula
   * listeners nativos que continuam recebendo pause/resume (vazamento + toggles repetidos).
   */
  init(onPause?: () => void, onResume?: () => void): () => void {
    if (!isNative) return () => {}

    const handles = [
      App.addListener('pause', () => { onPause?.() }),
      App.addListener('resume', () => { onResume?.() }),
    ]

    // Esconder status bar para imersão total
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
    StatusBar.hide().catch(() => {})

    return () => {
      handles.forEach((h) => { void h.then((handle) => handle.remove()).catch(() => {}) })
    }
  },
}
