import { describe, it, expect } from 'vitest'
import { primitive, semantic, hex, overlayAlpha } from '../../../src/ui/ds/tokens/colors'

describe('color tokens', () => {
  it('brand gold primitive is #f3c204', () => {
    expect(primitive.goldBrand).toBe(0xf3c204)
  })
  it('semantic text.brand maps to brand gold', () => {
    expect(semantic.textBrand).toBe(primitive.goldBrand)
  })
  it('semantic hp colors map to state primitives', () => {
    expect(semantic.hpFull).toBe(primitive.green)
    expect(semantic.hpMid).toBe(primitive.orange)
    expect(semantic.hpLow).toBe(primitive.red)
  })
  it('hex() formats a 6-digit css string with leading zeros', () => {
    expect(hex(0xf3c204)).toBe('#f3c204')
    expect(hex(0x000000)).toBe('#000000')
    expect(hex(0x00ff00)).toBe('#00ff00')
  })
  it('overlay alpha is 0.78', () => {
    expect(overlayAlpha).toBe(0.78)
  })
})
