// Pure TS — zero Phaser, zero network. Entity interpolation for REMOTE entities
// (other players, enemies, the wand). We render ~100ms behind the latest snapshot
// and lerp positions between the two snapshots that bracket the render time, so
// remotes move smoothly despite the 20Hz / 50ms server patch rate.
//
// Timing is fully injected: every function takes timestamps as parameters, never
// calls Date.now(), so the logic is deterministic and unit-testable.

/** Default render delay behind the latest snapshot. // TUNING */
export const INTERP_DELAY_MS = 100

/** A numeric-position entity. Only x/y are interpolated; other fields are carried
 *  verbatim from the newer bracketing snapshot. */
export interface Interpolatable {
  x: number
  y: number
  [key: string]: unknown
}

/** A keyed collection of entities at one instant (players by sessionId, enemies by id). */
export type EntityMap<T extends Interpolatable> = Record<string, T>

/** One timestamped snapshot of the whole remote world (or a slice of it). */
export interface Snapshot<T extends Interpolatable> {
  /** Arrival/sample timestamp in ms (injected, monotonic). */
  t: number
  entities: EntityMap<T>
}

/** An immutable buffer of recent snapshots, oldest-first. */
export interface SnapshotBuffer<T extends Interpolatable> {
  snapshots: ReadonlyArray<Snapshot<T>>
}

/** Create an empty buffer. */
export function createBuffer<T extends Interpolatable>(): SnapshotBuffer<T> {
  return { snapshots: [] }
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f
}

/**
 * Append a snapshot (immutably) and optionally trim entries no longer needed to
 * bracket `renderTime`. We always keep the most recent snapshot strictly older
 * than `renderTime` (and everything newer); anything older than that is dropped.
 * If `renderTime` is omitted no trimming beyond an upper cap occurs.
 *
 * Returns a NEW buffer; the input is never mutated.
 */
export function pushSnapshot<T extends Interpolatable>(
  buf: SnapshotBuffer<T>,
  t: number,
  entities: EntityMap<T>,
  renderTime?: number,
): SnapshotBuffer<T> {
  // Insert keeping oldest-first ordering (snapshots normally arrive in order, but
  // we stay robust to a late arrival).
  const next: Snapshot<T>[] = [...buf.snapshots, { t, entities }]
  if (next.length > 1 && next[next.length - 1].t < next[next.length - 2].t) {
    next.sort((a, b) => a.t - b.t)
  }

  const trimmed = trim(next, renderTime)
  return { snapshots: trimmed }
}

// Hard cap so a buffer never grows unbounded even without a renderTime hint. // TUNING
const MAX_SNAPSHOTS = 32

function trim<T extends Interpolatable>(
  snaps: Snapshot<T>[],
  renderTime?: number,
): Snapshot<T>[] {
  let result = snaps
  if (renderTime !== undefined && result.length > 2) {
    // Find the newest snapshot at-or-before renderTime; drop everything strictly
    // older than it (it is the lower bracket — older ones are useless).
    let keepFrom = 0
    for (let i = 0; i < result.length; i++) {
      if (result[i].t <= renderTime) keepFrom = i
      else break
    }
    if (keepFrom > 0) result = result.slice(keepFrom)
  }
  if (result.length > MAX_SNAPSHOTS) {
    result = result.slice(result.length - MAX_SNAPSHOTS)
  }
  return result
}

/**
 * Sample the interpolated world at `renderTime`.
 *
 * - Empty buffer → {}.
 * - Single snapshot → that snapshot's entities verbatim.
 * - renderTime before the first snapshot → clamp to the first.
 * - renderTime after the last snapshot → clamp to the last.
 * - Otherwise: find the two snapshots (lo, hi) that bracket renderTime, lerp x/y
 *   by the fraction, and take every other (non-numeric) field from `hi`.
 *
 * Spawn (entity present only in `hi`): rendered at its own hi position (no lerp
 * from 0,0). Death (entity present only in `lo`): omitted from the output.
 *
 * Pure: the buffer is never mutated.
 */
export function sampleAt<T extends Interpolatable>(
  buf: SnapshotBuffer<T>,
  renderTime: number,
): EntityMap<T> {
  const snaps = buf.snapshots
  if (snaps.length === 0) return {}
  if (snaps.length === 1) return cloneMap(snaps[0].entities)

  const first = snaps[0]
  const last = snaps[snaps.length - 1]
  if (renderTime <= first.t) return cloneMap(first.entities)
  if (renderTime >= last.t) return cloneMap(last.entities)

  // Find bracketing pair (lo.t <= renderTime < hi.t).
  let lo = first
  let hi = snaps[1]
  for (let i = 0; i < snaps.length - 1; i++) {
    if (snaps[i].t <= renderTime && renderTime < snaps[i + 1].t) {
      lo = snaps[i]
      hi = snaps[i + 1]
      break
    }
  }

  const span = hi.t - lo.t
  const f = span <= 0 ? 0 : (renderTime - lo.t) / span

  const out: EntityMap<T> = {}
  // Iterate the NEWER snapshot: only entities present in `hi` are alive at render
  // time (entities only in `lo` have despawned → omitted).
  for (const key of Object.keys(hi.entities)) {
    const newer = hi.entities[key]
    const older = lo.entities[key]
    if (older === undefined) {
      // Spawn: appears at its own position, never lerped from (0,0).
      out[key] = { ...newer }
    } else {
      out[key] = {
        ...newer, // non-numeric fields come from the newer snapshot
        x: lerp(older.x, newer.x, f),
        y: lerp(older.y, newer.y, f),
      }
    }
  }
  return out
}

function cloneMap<T extends Interpolatable>(m: EntityMap<T>): EntityMap<T> {
  const out: EntityMap<T> = {}
  for (const k of Object.keys(m)) out[k] = { ...m[k] }
  return out
}
