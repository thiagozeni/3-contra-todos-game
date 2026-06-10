import { describe, it, expect } from 'vitest'
import { createRng } from '../../src/core/rng'

// ── Determinism ───────────────────────────────────────────────────────────────

describe('createRng — determinism', () => {
  it('same seed produces the same first 10 next() values', () => {
    const a = createRng(42)
    const b = createRng(42)
    for (let i = 0; i < 10; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('different seeds produce different sequences', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    // They should not be identical (astronomically unlikely if RNG is correct)
    expect(seqA).not.toEqual(seqB)
  })
})

// ── Range of next() ───────────────────────────────────────────────────────────

describe('createRng — next() range', () => {
  it('next() is in [0, 1)', () => {
    const rng = createRng(99)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

// ── between() ────────────────────────────────────────────────────────────────

describe('createRng — between()', () => {
  it('between(0, 3) over 1000 samples hits 0, 1, 2, and 3', () => {
    const rng = createRng(7)
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      seen.add(rng.between(0, 3))
    }
    expect(seen.has(0)).toBe(true)
    expect(seen.has(1)).toBe(true)
    expect(seen.has(2)).toBe(true)
    expect(seen.has(3)).toBe(true)
  })

  it('between(0, 3) never returns -1 or 4', () => {
    const rng = createRng(13)
    for (let i = 0; i < 1000; i++) {
      const v = rng.between(0, 3)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(3)
    }
  })

  it('between(5, 5) always returns 5', () => {
    const rng = createRng(0)
    for (let i = 0; i < 20; i++) {
      expect(rng.between(5, 5)).toBe(5)
    }
  })
})

// ── shuffle() ────────────────────────────────────────────────────────────────

describe('createRng — shuffle()', () => {
  it('is deterministic: same seed → same shuffled order', () => {
    const arr = [1, 2, 3, 4, 5]
    const a = createRng(123)
    const b = createRng(123)
    expect(a.shuffle(arr)).toEqual(b.shuffle(arr))
  })

  it('returns a NEW array, does not mutate input', () => {
    const arr = [1, 2, 3, 4, 5]
    const original = [...arr]
    const rng = createRng(42)
    const result = rng.shuffle(arr)
    expect(arr).toEqual(original)       // input not mutated
    expect(result).not.toBe(arr)        // new reference
  })

  it('result is a permutation (same elements, same length)', () => {
    const arr = [10, 20, 30, 40, 50]
    const rng = createRng(7)
    const result = rng.shuffle(arr)
    expect(result).toHaveLength(arr.length)
    expect([...result].sort((a, b) => a - b)).toEqual([...arr].sort((a, b) => a - b))
  })

  it('shuffles a single-element array safely', () => {
    const rng = createRng(1)
    expect(rng.shuffle([42])).toEqual([42])
  })
})

// ── State snapshot / resume ───────────────────────────────────────────────────

describe('createRng — state snapshot and resume', () => {
  it('getState returns a number', () => {
    const rng = createRng(5)
    expect(typeof rng.getState()).toBe('number')
  })

  it('resuming from saved state continues the same sequence', () => {
    const rng = createRng(999)
    // Advance 5 steps
    for (let i = 0; i < 5; i++) rng.next()

    const savedState = rng.getState()

    // Capture the next 5 values from the original rng
    const expected = Array.from({ length: 5 }, () => rng.next())

    // Resume from saved state
    const resumed = createRng(savedState)
    const actual = Array.from({ length: 5 }, () => resumed.next())

    expect(actual).toEqual(expected)
  })

  it('getState after zero advances equals the seed (raw uint32 init)', () => {
    // The state after construction with seed s should equal the initial internal
    // state produced by mulberry32 init — resuming from that state must replay
    // the exact same sequence as creating with the same seed.
    const seed = 12345
    const a = createRng(seed)
    const stateAfterInit = a.getState()

    const b = createRng(seed)
    const c = createRng(stateAfterInit)

    // Both should produce identical next values
    for (let i = 0; i < 10; i++) {
      expect(c.next()).toBe(b.next())
    }
  })
})
