/**
 * continueCadence.test.ts — Task 3, Step 2 (RED → GREEN)
 *
 * Tests the pure logic of the continue gate:
 *   resolveContinue(freeBuild: boolean, adResult: RewardResult) → boolean
 *
 * Rules:
 *  - Premium / web (freeBuild=false): always returns true (ad result ignored)
 *  - Free build + granted=true:  returns true  (user watched rewarded ad)
 *  - Free build + granted=false: returns false (user dismissed / ad failed)
 *
 * This is a pure function with no dependencies — 100% testable in Node.
 */

import { describe, it, expect } from 'vitest'
import { resolveContinue } from '../../src/ads/interstitialCadence'

describe('resolveContinue — premium / web (freeBuild=false)', () => {
  it('grants continue regardless of ad result (Noop granted=true)', () => {
    expect(resolveContinue(false, { granted: true })).toBe(true)
  })

  it('grants continue regardless of ad result (Noop granted=false — should not happen but defensive)', () => {
    expect(resolveContinue(false, { granted: false })).toBe(true)
  })
})

describe('resolveContinue — free build (freeBuild=true)', () => {
  it('grants continue when ad was completed (granted=true)', () => {
    expect(resolveContinue(true, { granted: true })).toBe(true)
  })

  it('denies continue when ad was dismissed (granted=false)', () => {
    expect(resolveContinue(true, { granted: false })).toBe(false)
  })
})
