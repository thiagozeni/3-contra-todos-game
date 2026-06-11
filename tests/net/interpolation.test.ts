/**
 * interpolation unit tests — pure snapshot buffering + position lerp for remote
 * entities (other players + enemies + wand). No Phaser, no network, no Date.now():
 * all timestamps are injected so the tests are deterministic.
 */

import { describe, it, expect } from 'vitest'
import {
  createBuffer,
  pushSnapshot,
  sampleAt,
  INTERP_DELAY_MS,
} from '../../src/net/interpolation'

// A minimal interpolatable entity: numeric x/y are lerped, other fields come from
// the newer bracketing snapshot.
type Ent = { x: number; y: number; fsm?: string; hp?: number }

describe('sampleAt — midpoint lerp', () => {
  it('lerps x/y at the exact midpoint between two snapshots', () => {
    let buf = createBuffer<Ent>()
    buf = pushSnapshot(buf, 100, { a: { x: 0, y: 0 } })
    buf = pushSnapshot(buf, 150, { a: { x: 100, y: 40 } })

    const out = sampleAt(buf, 125)
    expect(out.a.x).toBeCloseTo(50)
    expect(out.a.y).toBeCloseTo(20)
  })

  it('lerps proportionally for arbitrary render times within the bracket', () => {
    let buf = createBuffer<Ent>()
    buf = pushSnapshot(buf, 1000, { a: { x: 0, y: 0 } })
    buf = pushSnapshot(buf, 1100, { a: { x: 100, y: 100 } })

    // render at 25% of the interval
    const out = sampleAt(buf, 1025)
    expect(out.a.x).toBeCloseTo(25)
    expect(out.a.y).toBeCloseTo(25)
  })
})

describe('sampleAt — clamping at the edges', () => {
  it('clamps to the first snapshot when render time precedes it', () => {
    let buf = createBuffer<Ent>()
    buf = pushSnapshot(buf, 100, { a: { x: 10, y: 5 } })
    buf = pushSnapshot(buf, 150, { a: { x: 100, y: 50 } })

    const out = sampleAt(buf, 50) // before first
    expect(out.a.x).toBe(10)
    expect(out.a.y).toBe(5)
  })

  it('clamps to the last snapshot when render time is past it', () => {
    let buf = createBuffer<Ent>()
    buf = pushSnapshot(buf, 100, { a: { x: 10, y: 5 } })
    buf = pushSnapshot(buf, 150, { a: { x: 100, y: 50 } })

    const out = sampleAt(buf, 9999) // after last
    expect(out.a.x).toBe(100)
    expect(out.a.y).toBe(50)
  })

  it('returns the single snapshot verbatim when only one exists', () => {
    let buf = createBuffer<Ent>()
    buf = pushSnapshot(buf, 100, { a: { x: 42, y: 7 } })
    expect(sampleAt(buf, 125).a).toEqual({ x: 42, y: 7 })
  })

  it('returns empty when the buffer is empty', () => {
    const buf = createBuffer<Ent>()
    expect(sampleAt(buf, 100)).toEqual({})
  })
})

describe('sampleAt — non-numeric fields from the newer snapshot', () => {
  it('takes fsm/hp from the newer bracketing snapshot, not the older', () => {
    let buf = createBuffer<Ent>()
    buf = pushSnapshot(buf, 100, { a: { x: 0, y: 0, fsm: 'approach', hp: 40 } })
    buf = pushSnapshot(buf, 200, { a: { x: 100, y: 0, fsm: 'chasePlayer', hp: 30 } })

    const out = sampleAt(buf, 150)
    expect(out.a.x).toBeCloseTo(50)
    expect(out.a.fsm).toBe('chasePlayer')
    expect(out.a.hp).toBe(30)
  })
})

describe('sampleAt — spawn (present in newer only)', () => {
  it('renders a newly-spawned entity at its own position, never lerping from origin', () => {
    let buf = createBuffer<Ent>()
    buf = pushSnapshot(buf, 100, { a: { x: 0, y: 0 } })
    buf = pushSnapshot(buf, 200, { a: { x: 100, y: 0 }, b: { x: 500, y: 300 } })

    const out = sampleAt(buf, 150)
    // 'a' is bracketed and lerped
    expect(out.a.x).toBeCloseTo(50)
    // 'b' only exists in the newer snapshot → appears at its real position (no 0,0 lerp)
    expect(out.b).toBeDefined()
    expect(out.b.x).toBe(500)
    expect(out.b.y).toBe(300)
  })
})

describe('sampleAt — death (missing in newer)', () => {
  it('drops an entity that is absent from the newer bracketing snapshot', () => {
    let buf = createBuffer<Ent>()
    buf = pushSnapshot(buf, 100, { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } })
    buf = pushSnapshot(buf, 200, { a: { x: 100, y: 0 } }) // 'b' died

    const out = sampleAt(buf, 150)
    expect(out.a).toBeDefined()
    expect(out.b).toBeUndefined()
  })
})

describe('buffer trimming', () => {
  it('drops snapshots older than the one needed to bracket the render time', () => {
    let buf = createBuffer<Ent>()
    buf = pushSnapshot(buf, 100, { a: { x: 0, y: 0 } })
    buf = pushSnapshot(buf, 200, { a: { x: 100, y: 0 } })
    buf = pushSnapshot(buf, 300, { a: { x: 200, y: 0 } })
    buf = pushSnapshot(buf, 400, { a: { x: 300, y: 0 } })

    // Sampling around 350 only needs the 300/400 pair; everything strictly older
    // than the snapshot that brackets-below 350 can be trimmed.
    const trimmed = pushSnapshot(buf, 400, { a: { x: 300, y: 0 } }, 350)
    // Oldest retained should bracket 350 from below (the 300 snapshot), nothing older.
    expect(trimmed.snapshots[0].t).toBeGreaterThanOrEqual(300)
    expect(trimmed.snapshots.length).toBeLessThan(5)
    // Still interpolates correctly after trimming.
    const out = sampleAt(trimmed, 350)
    expect(out.a.x).toBeCloseTo(250)
  })

  it('never trims below two snapshots needed to bracket', () => {
    let buf = createBuffer<Ent>()
    buf = pushSnapshot(buf, 100, { a: { x: 0, y: 0 } }, 125)
    buf = pushSnapshot(buf, 150, { a: { x: 100, y: 0 } }, 125)
    expect(buf.snapshots.length).toBeGreaterThanOrEqual(2)
    expect(sampleAt(buf, 125).a.x).toBeCloseTo(50)
  })
})

describe('keyed collections — enemies by id and players by sessionId', () => {
  it('interpolates an enemy list keyed by numeric id', () => {
    let buf = createBuffer<Ent>()
    buf = pushSnapshot(buf, 0, { '7': { x: 0, y: 0 }, '9': { x: 10, y: 10 } })
    buf = pushSnapshot(buf, 100, { '7': { x: 100, y: 0 }, '9': { x: 10, y: 110 } })

    const out = sampleAt(buf, 50)
    expect(out['7'].x).toBeCloseTo(50)
    expect(out['9'].y).toBeCloseTo(60)
  })

  it('interpolates players keyed by sessionId', () => {
    let buf = createBuffer<Ent>()
    buf = pushSnapshot(buf, 0, { sessABC: { x: 200, y: 700 } })
    buf = pushSnapshot(buf, 100, { sessABC: { x: 300, y: 700 } })
    expect(sampleAt(buf, 50).sessABC.x).toBeCloseTo(250)
  })
})

describe('INTERP_DELAY_MS default', () => {
  it('defaults to ~100ms render delay', () => {
    expect(INTERP_DELAY_MS).toBe(100)
  })
})
