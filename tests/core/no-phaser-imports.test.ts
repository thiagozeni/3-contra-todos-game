import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
  })
}

describe('core/ é Phaser-free', () => {
  it('nenhum arquivo de src/core importa phaser', () => {
    const files = walk('src/core')
    expect(files.length).toBeGreaterThan(0) // core existe e tem arquivos
    for (const f of files) {
      const src = readFileSync(f, 'utf-8')
      expect(src, `${f} importa phaser`).not.toMatch(/from ['"]phaser['"]|import Phaser/)
    }
  })
})
