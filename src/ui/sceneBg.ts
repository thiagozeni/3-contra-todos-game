import Phaser from 'phaser'

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
