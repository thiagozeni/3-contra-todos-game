import Phaser from 'phaser'
import { isMacCompat } from '../utils/iosVideo'

/**
 * Monta o fundo da cena na camada DOM `#scene-bg` (object-fit: cover, responsivo:
 * preenche de 16:9 até ultrawide sem barras) e o esconde no SHUTDOWN da cena.
 *
 * Substitui o padrão antigo `add.image(...).setDisplaySize(w, h).setDepth(0)`, que
 * fazia cover-central no canvas 1920×1080 e cortava as laterais em telas largas.
 *
 * O canvas do jogo é `transparent: true`, então o `<img>` aparece atrás dele.
 * Qualquer overlay de escurecimento (rectangle alpha) continua sendo desenhado
 * no canvas, sobre o fundo DOM — o efeito visual é idêntico.
 *
 * A ordem de transição do Phaser (`scene.start`) é: SHUTDOWN da cena atual →
 * CREATE da próxima. Logo, com cada cena escondendo no shutdown e mostrando no
 * create, o swap de `src` é instantâneo e coberto pelo fadeIn da cena entrante.
 */
export function mountSceneBg(scene: Phaser.Scene, src: string): void {
  const sceneBg = document.getElementById('scene-bg') as HTMLImageElement | null
  if (sceneBg) {
    sceneBg.src = src
    sceneBg.style.display = 'block'
  }
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (sceneBg) sceneBg.style.display = 'none'
  })
}

/**
 * Igual ao mountSceneBg, mas com um VÍDEO de loop (`#scene-bg-video`) por cima do
 * PNG (`#scene-bg`, que vira poster/fallback). Em Mac-compat / autoplay barrado /
 * erro de carga, o vídeo some e fica o PNG. Tudo limpo no SHUTDOWN da cena.
 * Mesma filosofia do introBackdrop, para as telas de menu (How to Play/Select/Game Over).
 */
export function mountSceneBgVideo(scene: Phaser.Scene, videoSrc: string, posterSrc: string): void {
  // PNG sempre como fallback/poster.
  mountSceneBg(scene, posterSrc)

  const vid = document.getElementById('scene-bg-video') as HTMLVideoElement | null
  const useVideo = !!vid && !isMacCompat()
  if (useVideo && vid) {
    vid.poster = posterSrc
    vid.src = videoSrc
    vid.style.display = 'block'
    vid.onerror = () => { vid.style.display = 'none' } // cai pro PNG
    const p = vid.play()
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        const resume = () => { vid.play().catch(() => {}) }
        scene.input.once('pointerdown', resume)
      })
    }
  }

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (vid) {
      vid.pause()
      vid.style.display = 'none'
      vid.removeAttribute('src')
      try { vid.load() } catch { /* noop */ }
    }
  })
}
