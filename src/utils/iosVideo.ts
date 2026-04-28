/**
 * iosVideo — utilitários iOS: vídeo autoplay e hit areas expandidas para touch.
 *
 * padInteractive — expande a área de toque de qualquer Text/Rectangle em `pad` px
 * em todas as direções, evitando toques perdidos em dispositivos iOS (iPhone/iPad).
 */

/**
 * Aplica setInteractive com padding extra e cursor pointer.
 * Use no lugar de `.setInteractive({ useHandCursor: true })` em botões touch.
 */
export function padInteractive<T extends Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle>(
  obj: T,
  pad = 24,
): T {
  obj.setInteractive(
    new Phaser.Geom.Rectangle(-pad, -pad, obj.width + pad * 2, obj.height + pad * 2),
    Phaser.Geom.Rectangle.Contains,
  )
  obj.input!.cursor = 'pointer'
  return obj
}

/**
 * iosVideo — utilitário para garantir que vídeos tocam em iOS WKWebView (Capacitor).
 *
 * iOS é rígido com autoplay: mesmo com `noAudio: true` no Phaser loader, o
 * elemento <video> precisa ter os atributos `playsinline`, `webkit-playsinline`
 * e `muted` setados ANTES do `.play()`. Caso contrário, na primeira execução
 * do app o vídeo não inicia até que o usuário interaja com a tela.
 *
 * Uso:
 *   const bg = this.add.video(x, y, 'key')
 *   prepareIOSVideo(bg)
 *   bg.play(true)
 */
import Phaser from 'phaser'

/**
 * Detecta apps iOS rodando no Mac via compatibility layer (Apple Silicon).
 * Nesses casos o WKWebView não reproduz `<video>` corretamente e Phaser.add.video
 * trava a cena em tela preta. Use este guard antes de criar qualquer vídeo de fundo.
 */
export function isMacCompat(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  const isNative = cap?.isNativePlatform?.() === true
  return isNative && navigator.maxTouchPoints === 0
}

function applyAttrs(el: HTMLVideoElement) {
  try {
    el.muted = true
    el.defaultMuted = true
    el.playsInline = true
    el.setAttribute('playsinline', 'true')
    el.setAttribute('webkit-playsinline', 'true')
    el.setAttribute('muted', 'true')
    el.autoplay = true
  } catch { /* noop */ }
}

/**
 * Garante que o elemento <video> interno tenha os atributos corretos para iOS.
 * Pode ser chamado antes ou depois do `play()` — também escuta o evento `created`
 * que dispara quando o Phaser cria o elemento de fato.
 */
export function prepareIOSVideo(video: Phaser.GameObjects.Video) {
  const tryApply = () => {
    const el = (video as unknown as { video: HTMLVideoElement | undefined }).video
    if (el) applyAttrs(el)
  }

  tryApply()
  video.on('created', tryApply)
  video.on('play', tryApply)

  // Fallback: se o vídeo não estiver tocando depois de 500ms (porque o WebView
  // ainda não recebeu user gesture), engata um listener no primeiro pointerdown
  // global da scene que força um novo play().
  video.scene.time.delayedCall(500, () => {
    const el = (video as unknown as { video: HTMLVideoElement | undefined }).video
    if (!el || el.paused) {
      const forcePlay = () => {
        applyAttrs(el ?? (video as unknown as { video: HTMLVideoElement }).video)
        try { video.play(true) } catch { /* noop */ }
      }
      video.scene.input.once('pointerdown', forcePlay)
    }
  })
}
