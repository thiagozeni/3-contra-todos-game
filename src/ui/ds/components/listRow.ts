/** ListRow — a Top-10 ranking row. Columns positioned by x-offsets from the row's
 *  left edge; numeric columns (continues/time/score) use the Pixelify family.
 *  `highlight` paints a faint gold band behind (the just-saved entry). */
import type Phaser from 'phaser'
import { primitive, type SemanticColorId } from '../tokens/colors'
import { dsText } from '../text'
import type { TypeRole } from '../tokens/type'

export interface ListRowData {
  rank: string
  name: string
  character: string
  continues: string
  time: string
  score: string
}

export interface ListRowOpts {
  x: number
  y: number              // vertical center of the row
  w: number              // full row width (for the highlight band)
  cols: [number, number, number, number, number, number] // x-offsets: rank,name,char,cont,time,score
  data: ListRowData
  highlight?: boolean
  role?: TypeRole        // default 'body'
  rowH?: number          // highlight band height, default 58
  depth?: number
}

export interface ListRowHandle { destroy(): void }

export function makeListRow(scene: Phaser.Scene, o: ListRowOpts): ListRowHandle {
  const role: TypeRole = o.role ?? 'body'
  const depth = o.depth ?? 0
  const color: SemanticColorId = o.highlight ? 'textBrand' : 'textPrimary'
  const objs: Phaser.GameObjects.GameObject[] = []

  if (o.highlight) {
    const band = scene.add.rectangle(o.x + o.w / 2, o.y, o.w, o.rowH ?? 58, primitive.goldBrand, 0.12)
      .setScrollFactor(0).setDepth(depth)
    objs.push(band)
  }

  // [x-offset, text, numeric?]
  const fields: ReadonlyArray<readonly [number, string, boolean]> = [
    [o.cols[0], o.data.rank, false],
    [o.cols[1], o.data.name, false],
    [o.cols[2], o.data.character, false],
    [o.cols[3], o.data.continues, true],
    [o.cols[4], o.data.time, true],
    [o.cols[5], o.data.score, true],
  ]

  for (const [cx, text, numeric] of fields) {
    const t = dsText(scene, o.x + cx, o.y, text, {
      role, color, family: numeric ? 'numeric' : 'display', origin: [0, 0.5],
    }).setDepth(depth + 1).setScrollFactor(0)
    objs.push(t)
  }

  return { destroy: () => objs.forEach((ob) => ob.destroy()) }
}
