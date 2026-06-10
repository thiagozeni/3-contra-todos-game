// Pure TypeScript — zero Phaser. Deterministic seeded RNG (mulberry32).
// Public domain algorithm: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c

export interface Rng {
  /** Returns a float in [0, 1). */
  next(): number
  /** Returns an integer in [min, max] inclusive. */
  between(min: number, max: number): number
  /** Returns a new shuffled copy of arr; input is NOT mutated. */
  shuffle<T>(arr: readonly T[]): T[]
  /** Returns the internal uint32 state (for snapshot / resume). */
  getState(): number
}

/**
 * Create a deterministic RNG from a seed (or a raw uint32 state).
 * Calling `createRng(rng.getState())` resumes the sequence from that point.
 */
export function createRng(seed: number): Rng {
  // mulberry32: internal state is a single uint32
  let state = seed >>> 0  // force unsigned 32-bit integer

  function next(): number {
    state = (state + 0x6D2B79F5) >>> 0
    let z = state
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    z = (z ^ (z >>> 14)) >>> 0
    return z / 0x100000000
  }

  function between(min: number, max: number): number {
    if (min === max) return min
    return Math.floor(next() * (max - min + 1)) + min
  }

  function shuffle<T>(arr: readonly T[]): T[] {
    const result = [...arr]
    for (let i = result.length - 1; i > 0; i--) {
      const j = between(0, i)
      const tmp = result[i]
      result[i] = result[j]
      result[j] = tmp
    }
    return result
  }

  function getState(): number {
    return state
  }

  return { next, between, shuffle, getState }
}
