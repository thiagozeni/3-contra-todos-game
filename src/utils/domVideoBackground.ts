type DomVideoBackgroundOptions = {
  onReady?: () => void
}

export type DomVideoBackground = {
  readonly element: HTMLVideoElement
  destroy: () => void
}

export function createDomVideoBackground(
  src: string,
  options: DomVideoBackgroundOptions = {},
): DomVideoBackground {
  const wrap = document.getElementById('game-wrap') ?? document.body
  const video = document.createElement('video')
  const disposers: Array<() => void> = []
  let ready = false
  let resizeObserver: ResizeObserver | null = null

  video.className = 'dom-video-bg'
  video.src = src
  video.loop = true
  video.muted = true
  video.defaultMuted = true
  video.autoplay = true
  video.playsInline = true
  video.preload = 'auto'
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')
  video.setAttribute('muted', 'true')
  video.setAttribute('aria-hidden', 'true')

  const syncToCanvas = () => {
    const canvas = wrap.querySelector('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) {
      video.style.left = '0px'
      video.style.top = '0px'
      video.style.width = '100%'
      video.style.height = '100%'
      return
    }

    const wrapRect = wrap.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()
    video.style.left = `${canvasRect.left - wrapRect.left}px`
    video.style.top = `${canvasRect.top - wrapRect.top}px`
    video.style.width = `${canvasRect.width}px`
    video.style.height = `${canvasRect.height}px`
  }

  const reveal = () => {
    if (ready) return
    ready = true
    syncToCanvas()
    video.classList.add('is-ready')
    options.onReady?.()
  }

  const addWindowListener = (eventName: string, handler: () => void) => {
    window.addEventListener(eventName, handler)
    disposers.push(() => window.removeEventListener(eventName, handler))
  }

  const addVideoListener = (eventName: string, handler: () => void) => {
    video.addEventListener(eventName, handler)
    disposers.push(() => video.removeEventListener(eventName, handler))
  }

  const tryPlay = () => {
    const playAttempt = video.play()
    if (playAttempt?.then) {
      playAttempt.then(reveal).catch(() => { /* retry no próximo gesto */ })
    }
  }

  ;['loadeddata', 'canplay'].forEach(eventName => addVideoListener(eventName, tryPlay))
  addVideoListener('playing', reveal)
  ;['pointerdown', 'mousedown', 'touchstart', 'keydown'].forEach(eventName => addWindowListener(eventName, tryPlay))
  addWindowListener('resize', syncToCanvas)
  window.visualViewport?.addEventListener('resize', syncToCanvas)
  disposers.push(() => window.visualViewport?.removeEventListener('resize', syncToCanvas))

  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(syncToCanvas)
    resizeObserver.observe(wrap)
  }

  wrap.prepend(video)
  syncToCanvas()
  tryPlay()

  return {
    element: video,
    destroy: () => {
      disposers.forEach(dispose => dispose())
      resizeObserver?.disconnect()
      try { video.pause() } catch { /* noop */ }
      video.removeAttribute('src')
      try { video.load() } catch { /* noop */ }
      video.remove()
    },
  }
}
