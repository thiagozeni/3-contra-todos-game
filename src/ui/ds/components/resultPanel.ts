/**
 * makeResultPanel — painel de resultado da partida (Game Over / You Win), fiel ao
 * conceito _gpt_concept: caixa escura ARREDONDADA + 4 linhas, cada uma com um ícone
 * colorido à esquerda (troféu / caveira / relógio / coração), label dourado e valor
 * numérico à direita. Troféu e relógio são sprites (ic-trophy/ic-hourglass);
 * caveira e coração são desenhados (não há asset). Retorna os objetos p/ cascata.
 */
import Phaser from 'phaser'
import { primitive, semantic, hex } from '../tokens/colors'
import { FAMILY } from '../tokens/type'
import { pixelPanel } from './para'

export type ResultRowKind = 'score' | 'kills' | 'time' | 'continues' | 'wave'

export interface ResultRow { kind: ResultRowKind; label: string; value: string }

export interface ResultPanelOpts {
  x: number
  y: number
  w?: number
  h?: number
  rows: ResultRow[]
  depth?: number
}

export interface ResultPanelHandle {
  readonly objects: Phaser.GameObjects.GameObject[]
  destroy(): void
}

function drawHeart(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number, color: number) {
  g.fillStyle(color, 1)
  g.fillCircle(cx - s * 0.22, cy - s * 0.12, s * 0.26)
  g.fillCircle(cx + s * 0.22, cy - s * 0.12, s * 0.26)
  g.fillTriangle(cx - s * 0.46, cy - s * 0.02, cx + s * 0.46, cy - s * 0.02, cx, cy + s * 0.5)
}

function drawWaveBars(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number, color: number) {
  // 3 barras ascendentes (progressão de ondas) — pixel-safe (fillRect).
  g.fillStyle(color, 1)
  const bw = s * 0.2, gap = s * 0.12
  const hs = [s * 0.4, s * 0.66, s * 0.92]
  const totalW = bw * 3 + gap * 2
  hs.forEach((h, i) => {
    const x = cx - totalW / 2 + i * (bw + gap)
    g.fillRect(x, cy + s * 0.46 - h, bw, h)
  })
}

function drawSkull(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number, color: number) {
  g.fillStyle(color, 1)
  g.fillCircle(cx, cy - s * 0.08, s * 0.4)                          // crânio
  g.fillRoundedRect(cx - s * 0.26, cy + s * 0.12, s * 0.52, s * 0.28, s * 0.1) // mandíbula
  g.fillStyle(primitive.black, 1)
  g.fillCircle(cx - s * 0.17, cy - s * 0.06, s * 0.12)              // olho esq
  g.fillCircle(cx + s * 0.17, cy - s * 0.06, s * 0.12)              // olho dir
  g.fillRect(cx - s * 0.04, cy + s * 0.06, s * 0.08, s * 0.1)       // nariz
  g.fillRect(cx - s * 0.16, cy + s * 0.2, s * 0.06, s * 0.16)       // dentes
  g.fillRect(cx - s * 0.03, cy + s * 0.2, s * 0.06, s * 0.16)
  g.fillRect(cx + s * 0.1, cy + s * 0.2, s * 0.06, s * 0.16)
}

const ICON_COLOR: Record<ResultRowKind, number> = {
  score: primitive.goldBrand,
  kills: 0xe8e8e8,
  time: primitive.cyan,
  continues: primitive.greenOk,
  wave: primitive.orange,
}

export function makeResultPanel(scene: Phaser.Scene, o: ResultPanelOpts): ResultPanelHandle {
  const w = o.w ?? 488
  const rowH = 56
  const padTop = 28
  const h = o.h ?? padTop * 2 + o.rows.length * rowH
  const depth = o.depth ?? 2
  const r = 22
  const objects: Phaser.GameObjects.GameObject[] = []

  // Caixa arredondada (escura, borda dupla preta/aço).
  const g = scene.add.graphics().setDepth(depth)
  pixelPanel(g, o.x, o.y, w, h, r, 4, primitive.night, 0.92, primitive.black, primitive.steel, 3, 3)
  objects.push(g)

  const iconX = o.x + 44
  const labelX = o.x + 78
  const valueX = o.x + w - 32

  o.rows.forEach((row, i) => {
    const cy = o.y + padTop + rowH / 2 + i * rowH
    const color = ICON_COLOR[row.kind]

    // Ícone.
    if (row.kind === 'score' && scene.textures.exists('ic-trophy')) {
      objects.push(scene.add.image(iconX, cy, 'ic-trophy').setDisplaySize(34, 34).setDepth(depth + 1))
    } else if (row.kind === 'time' && scene.textures.exists('ic-hourglass')) {
      objects.push(scene.add.image(iconX, cy, 'ic-hourglass').setDisplaySize(32, 32).setDepth(depth + 1))
    } else {
      const ig = scene.add.graphics().setDepth(depth + 1)
      if (row.kind === 'kills') drawSkull(ig, iconX, cy, 30, color)
      else if (row.kind === 'wave') drawWaveBars(ig, iconX, cy, 30, color)
      else drawHeart(ig, iconX, cy, 30, color)
      objects.push(ig)
    }

    // Label na cor da categoria (mesma do ícone), conforme o conceito game-over.png:
    // SCORE dourado, INIMIGOS branco, TEMPO ciano, CONTINUES verde.
    objects.push(
      scene.add.text(labelX, cy, row.label, {
        fontSize: '24px', color: hex(color), fontFamily: FAMILY.display,
        stroke: hex(semantic.ink), strokeThickness: 4,
      }).setOrigin(0, 0.5).setDepth(depth + 1),
    )
    // Valor numérico em dourado (destaque do conceito).
    objects.push(
      scene.add.text(valueX, cy, row.value, {
        fontSize: '28px', color: hex(primitive.gold), fontFamily: FAMILY.numeric,
        stroke: hex(semantic.ink), strokeThickness: 5,
      }).setOrigin(1, 0.5).setDepth(depth + 1),
    )
  })

  return { objects, destroy: () => objects.forEach((ob) => ob.destroy()) }
}
