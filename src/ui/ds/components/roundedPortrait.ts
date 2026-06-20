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
import { fillPixelRoundRect } from './para'

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
  /** Desaturação 0..1 (0 = colorido, 1 = P&B total). Parcial evita o look "estátua". */
  grayscale?: number
  /** Tint multiplicativo sobre a foto (ex.: tom frio p/ "congelado/inativo"). */
  tint?: number
  /** Alpha SÓ da foto (moldura/fundo seguem opacos). Default 1. */
  photoAlpha?: number
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

  // Degrau da escada dos cantos (pixel-art): ~1/5 do raio, mín 3px.
  const STEP = Math.max(3, Math.round(r / 5))
  // Moldura em camadas concêntricas (escada): preto externo + filete + fundo.
  const BORDER = 3, FILLET = 3, B = BORDER + FILLET

  // Moldura+fundo (atrás da foto): 3 fills pixel-round concêntricos. A borda
  // aparece porque a máscara da foto é recuada por B (mostra preto + filete).
  let frameColor = o.frameColor
  const back = scene.add.graphics().setScrollFactor(0).setDepth(depth)
  const drawBackFrame = () => {
    back.clear()
    fillPixelRoundRect(back, x, y, w, h, r, STEP, primitive.black, 1)
    fillPixelRoundRect(back, x + BORDER, y + BORDER, w - 2 * BORDER, h - 2 * BORDER, Math.max(1, r - BORDER), STEP, frameColor, 1)
    fillPixelRoundRect(back, x + B, y + B, w - 2 * B, h - 2 * B, Math.max(1, r - B), STEP, primitive.night, 1)
  }
  drawBackFrame()

  // Máscara — forma INTERNA (recuada por B), em escada igual ao fundo. Recorta a
  // foto dentro do filete, revelando a moldura preta+dourada.
  const maskG = scene.make.graphics()
  fillPixelRoundRect(maskG, x + B, y + B, w - 2 * B, h - 2 * B, Math.max(1, r - B), STEP, 0xffffff, 1)

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
  // Desaturação parcial (opcional) — ColorMatrix grayscale; valor < 1 mantém algum
  // pigmento p/ não virar "estátua de pedra". Aplicado ANTES da máscara.
  if (o.grayscale) sprite.filters?.internal.addColorMatrix().colorMatrix.grayscale(o.grayscale)
  // Tint frio opcional (multiplicativo) p/ um ar "congelado/inativo" em vez de cinza neutro.
  if (o.tint !== undefined) sprite.setTint(o.tint)
  // Alpha só da foto (moldura/fundo seguem opacos).
  if (o.photoAlpha !== undefined) sprite.setAlpha(o.photoAlpha)
  sprite.filters?.external.addMask(maskG)

  return {
    sprite,
    setTexture: (k: string) => { const c = coverSize(k); sprite.setTexture(k).setDisplaySize(c.dw, c.dh) },
    setFrameColor: (c: number) => { frameColor = c; drawBackFrame() },
    setAlpha: (a: number) => { sprite.setAlpha(a); back.setAlpha(a) },
    setVisible: (v: boolean) => { sprite.setVisible(v); back.setVisible(v) },
    destroy: () => { sprite.destroy(); back.destroy(); maskG.destroy() },
  }
}
