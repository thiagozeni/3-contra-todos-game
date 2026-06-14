import { describe, it, expect } from 'vitest'
import { resolveTextStyle } from '../../../src/ui/ds/text'

describe('resolveTextStyle', () => {
  it('resolves a role to family+size+stroke, default color = text.primary', () => {
    const s = resolveTextStyle({ role: 'mega' })
    expect(s.fontFamily).toBe('"Press Start 2P", monospace')
    expect(s.fontSize).toBe('110px')
    expect(s.color).toBe('#ffffff')
    expect(s.stroke).toBe('#000000')
    expect(s.strokeThickness).toBe(14)
  })
  it('resolves semantic color tokens', () => {
    expect(resolveTextStyle({ role: 'display', color: 'textBrand' }).color).toBe('#f3c204')
  })
  it('uses the numeric family when asked', () => {
    expect(resolveTextStyle({ role: 'h1', family: 'numeric' }).fontFamily)
      .toBe('"Pixelify Sans", monospace')
  })
})
