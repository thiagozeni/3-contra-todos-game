/**
 * introBackdrop — fundo da tela de Intro (Fatia V): vídeo de loop
 * (`videos/intro-loop.mp4`) na camada DOM `#intro-bg-video`, com FALLBACK para o
 * PNG estático (`#scene-bg`) em Mac-compat / autoplay barrado / erro de carga
 * (ver isMacCompat + memória de guards de vídeo).
 *
 * Todo o movimento (personagens, fogo do logo, luzes do teto, fagulhas) vive
 * DENTRO do vídeo gerado — nada é "assado" em tempo real por cima.
 */
import Phaser from 'phaser'
import { isMacCompat } from '../utils/iosVideo'

const VIDEO_SRC = 'videos/intro-loop.mp4'
const PNG_SRC = 'imgs/cenario/intro-bg.png'

/** Monta vídeo + fallback. Tudo é limpo no SHUTDOWN da cena. */
export function mountIntroBackdrop(scene: Phaser.Scene): void {
  // ── Base estática (PNG) — fica sempre como poster/fallback no #scene-bg ──
  const img = document.getElementById('scene-bg') as HTMLImageElement | null
  if (img) { img.src = PNG_SRC; img.style.display = 'block' }

  // ── Vídeo de loop (DOM), exceto em Mac-compat (textura de vídeo instável) ──
  const vid = document.getElementById('intro-bg-video') as HTMLVideoElement | null
  const useVideo = !!vid && !isMacCompat()
  if (useVideo && vid) {
    vid.src = VIDEO_SRC
    vid.style.display = 'block'
    vid.onerror = () => { vid.style.display = 'none' } // cai pro PNG
    const p = vid.play()
    if (p && typeof p.catch === 'function') {
      // autoplay barrado → tenta de novo no primeiro gesto; até lá fica o PNG.
      p.catch(() => {
        const resume = () => { vid.play().catch(() => {}) }
        scene.input.once('pointerdown', resume)
      })
    }
  }

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (img) img.style.display = 'none'
    if (vid) {
      vid.pause()
      vid.style.display = 'none'
      vid.removeAttribute('src')
      try { vid.load() } catch { /* noop */ }
    }
  })
}
