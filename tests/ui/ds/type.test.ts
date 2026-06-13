import { describe, it, expect } from 'vitest'
import { TYPE, FAMILY, ROLES } from '../../../src/ui/ds/tokens/type'

describe('type scale', () => {
  it('has 9 roles from mega to caption', () => {
    expect(ROLES).toEqual(['mega','title','display','h1','h2','h3','body','small','caption'])
  })
  it('mega is 110px, body 26px, caption 16px', () => {
    expect(TYPE.mega.px).toBe(110)
    expect(TYPE.body.px).toBe(26)
    expect(TYPE.caption.px).toBe(16)
  })
  it('px is monotonically non-increasing down the scale', () => {
    const px = ROLES.map((r) => TYPE[r].px)
    for (let i = 1; i < px.length; i++) expect(px[i]).toBeLessThan(px[i - 1])
  })
  it('families are the approved web fonts (unchanged)', () => {
    expect(FAMILY.display).toBe('"Press Start 2P", monospace')
    expect(FAMILY.numeric).toBe('"Pixelify Sans", monospace')
  })
})
