import { describe, it, expect } from 'vitest'
import { SPACE } from '../../../src/ui/ds/tokens/space'
import { SKEW, STROKE, edgeX, paraCorners } from '../../../src/ui/ds/tokens/shape'

describe('space scale', () => {
  it('is the base-4 ladder', () => {
    expect(Object.values(SPACE)).toEqual([4,8,12,16,24,32,48,64,96])
  })
})

describe('parallelogram geometry', () => {
  it('skew + strokes match the signature', () => {
    expect(SKEW).toBe(0.287)
    expect(STROKE).toEqual({ hair: 2, bold: 3, heavy: 6 })
  })
  it('edgeX: top edge shifted +skew/2, bottom edge -skew/2', () => {
    expect(edgeX(0, 0, 100, 20, 0)).toBeCloseTo(10)
    expect(edgeX(0, 0, 100, 20, 100)).toBeCloseTo(-10)
    expect(edgeX(0, 0, 100, 20, 50)).toBeCloseTo(0)
  })
  it('paraCorners returns 4 points tracing the full box band', () => {
    const c = paraCorners(0, 0, 200, 100, 20, 0, 1)
    expect(c).toHaveLength(4)
    expect(c[0]).toEqual({ x: 10, y: 0 })
    expect(c[1]).toEqual({ x: 210, y: 0 })
    expect(c[2]).toEqual({ x: 190, y: 100 })
    expect(c[3]).toEqual({ x: -10, y: 100 })
  })
})
