/**
 * makeRoundedPortrait — retrato em card RETANGULAR VERTICAL com cantos arredondados
 * (o formato do conceito Select), pixel-retro. Mesma DNA do angledPortrait, mas a
 * forma é um rounded-rect em vez de paralelogramo. A foto é COVER (mantém o aspect
 * da textura, preenche o card) e ancorável no topo, para mostrar o busto inteiro
 * (cabeça no topo) sem distorcer.
 *
 * Recorte via FILTER mask (Phaser 4 + WebGL: enableFilters + filters.external.addMask,
 * NÃO setMask — ver memória reference_phaser4_mask_filter).
 */
import Phaser from 'phaser'
import { primitive } from '../tokens/colors'

export interface RoundedPortraitOpts {
  x: number
  y: number
  w: number
  h: number
  texture: string
  frameColor: number
  depth: number
  radius?: number
  /** Escala extra da foto sobre o cover (1 = cover exato). Default 1. */
  zoom?: number
  /** Ancora a foto pelo topo (mostra a cabeça no topo do card). Default true. */
  anchorTop?: boolean
}

export interface RoundedPortraitHandle {
  readonly sprite: Phaser.GameObjects.Sprite
  setTexture: (k: string) => void
  setFrameColor: (c: number) => void
  setAlpha: (a: number) => void
  setVisible: (v: boolean) => void
  destroy: () => void
}

export function makeRoundedPortrait(scene: Phaser.Scene, o: RoundedPortraitOpts): RoundedPortraitHandle {
  const { x, y, w, h, depth } = o
  const r = o.radius ?? 20
  const zoom = o.zoom ?? 1
  const anchorTop = o.anchorTop ?? true

  // Backing escuro (preenche o card).
  const back = scene.add.graphics().setScrollFactor(0).setDepth(depth)
  back.fillStyle(primitive.night, 1).fillRoundedRect(x, y, w, h, r)

  // Máscara rounded-rect (filtro).
  const maskG = scene.make.graphics()
  maskG.fillStyle(0xffffff, 1).fillRoundedRect(x, y, w, h, r)

  // Foto em COVER: escala mantendo o aspect da textura até cobrir w×h.
  const cardAr = w / h
  const coverSize = (texKey: string) => {
    const src = scene.textures.get(texKey).getSourceImage() as { width: number; height: number }
    const texAr = src.width > 0 && src.height > 0 ? src.width / src.height : 1
    return texAr > cardAr ? { dw: (h * zoom) * texAr, dh: h * zoom } : { dw: w * zoom, dh: (w * zoom) / texAr }
  }

  // Ancorar no topo (cabeça no topo) ou centralizar.
  const sx = x + w / 2
  const sy = anchorTop ? y : y + h / 2
  const originY = anchorTop ? 0 : 0.5
  const init = coverSize(o.texture)
  const sprite = scene.add.sprite(sx, sy, o.texture)
    .setOrigin(0.5, originY)
    .setDisplaySize(init.dw, init.dh)
    .setScrollFactor(0)
    .setDepth(depth + 1)
  sprite.enableFilters()
  sprite.filters?.external.addMask(maskG)

  // Moldura: borda preta grossa + filete da cor do slot (dourado/aço).
  let frameColor = o.frameColor
  const frame = scene.add.graphics().setScrollFactor(0).setDepth(depth + 2)
  const drawFrame = () => {
    frame.clear()
    frame.lineStyle(6, primitive.black, 1).strokeRoundedRect(x, y, w, h, r)
    frame.lineStyle(3, frameColor, 1).strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, r - 1)
  }
  drawFrame()

  return {
    sprite,
    setTexture: (k: string) => { const c = coverSize(k); sprite.setTexture(k).setDisplaySize(c.dw, c.dh) },
    setFrameColor: (c: number) => { frameColor = c; drawFrame() },
    setAlpha: (a: number) => { sprite.setAlpha(a); back.setAlpha(a); frame.setAlpha(a) },
    setVisible: (v: boolean) => { sprite.setVisible(v); back.setVisible(v); frame.setVisible(v) },
    destroy: () => { sprite.destroy(); back.destroy(); frame.destroy(); maskG.destroy() },
  }
}
