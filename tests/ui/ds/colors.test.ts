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

  // Opção A (proposta 07): tokens de feedback/muted ancorados nos valores ad-hoc já
  // usados nas telas (#aaaaaa, #44ff88, #ff4444, #ffdd44). Aditivos — byte-idênticos
  // ao que as telas já renderizam, para a migração da Task 18 consumir só semantic.
  it('feedback + muted primitives match the in-use ad-hoc hex (byte-identical)', () => {
    expect(primitive.gray33).toBe(0xaaaaaa)
    expect(primitive.greenOk).toBe(0x44ff88)
    expect(primitive.redErr).toBe(0xff4444)
    expect(primitive.amber).toBe(0xffdd44)
  })
  it('semantic feedback roles map to their primitives', () => {
    expect(semantic.textMuted).toBe(primitive.gray33)
    expect(semantic.feedbackOk).toBe(primitive.greenOk)
    expect(semantic.feedbackError).toBe(primitive.redErr)
    expect(semantic.feedbackWarn).toBe(primitive.amber)
  })
})
