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

describe('core/ é Colyseus-free', () => {
  it('nenhum arquivo de src/core importa colyseus', () => {
    const files = walk('src/core')
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const src = readFileSync(f, 'utf-8')
      expect(src, `${f} importa colyseus`).not.toMatch(/from ['"]colyseus['"]|from ['"]@colyseus|import.*[Cc]olyseus/)
    }
  })

  it('regex de guard colyseus funciona (fixture check)', () => {
    const badSamples = [
      `import { Room } from 'colyseus'`,
      `import { Schema } from "@colyseus/schema"`,
      `import Colyseus from 'colyseus'`,
      `import colyseus from 'colyseus'`,
    ]
    const goodSamples = [
      `import { something } from './local'`,
      `// uses colyseus in a comment`,
      `const x = "colyseus"`,
    ]
    const pattern = /from ['"]colyseus['"]|from ['"]@colyseus|import.*[Cc]olyseus/

    for (const bad of badSamples) {
      expect(bad, `bad sample not matched: ${bad}`).toMatch(pattern)
    }
    for (const good of goodSamples) {
      expect(good, `good sample false-positive: ${good}`).not.toMatch(pattern)
    }
  })
})
