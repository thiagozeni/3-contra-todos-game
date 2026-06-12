/**
 * FB6 — "my" selector-state resolution.
 *
 * Regression: the lobby is reused across matches; a STALE mySessionId from the previous
 * match made the new-room selector resolve "me" to a non-existent player, so the new pick
 * never registered ("stuck with the previous character"). resolveMySelection must yield an
 * empty, unconfirmed, not-present selection for any session id that is not in the room.
 */

import { describe, it, expect } from 'vitest'
import { resolveMySelection } from '../../src/net/selectionState'
import type { PlayerInfo } from '../../src/net/NetClient'

const mk = (over: Partial<PlayerInfo>): PlayerInfo => ({
  sessionId: 's1', charKey: '', connected: true, selectedChar: '', confirmed: false, slotIndex: 0, ...over,
})

describe('resolveMySelection (FB6)', () => {
  it('resolves my pick + confirmed flag when my session is present', () => {
    const players = [mk({ sessionId: 'me', selectedChar: 'dida', confirmed: true })]
    expect(resolveMySelection(players, 'me')).toEqual({ selectedChar: 'dida', confirmed: true, present: true })
  })

  it('a STALE session id (not in the new room) yields an empty, unconfirmed selection', () => {
    // The previous match's player ('old') is gone; the new room has a fresh session.
    const players = [mk({ sessionId: 'new', selectedChar: '', confirmed: false })]
    expect(resolveMySelection(players, 'old')).toEqual({ selectedChar: '', confirmed: false, present: false })
  })

  it('a null session id yields an empty selection (never another player\'s pick)', () => {
    const players = [mk({ sessionId: 'other', selectedChar: 'werdum', confirmed: true })]
    expect(resolveMySelection(players, null)).toEqual({ selectedChar: '', confirmed: false, present: false })
  })

  it('never leaks another player\'s pick as mine', () => {
    const players = [
      mk({ sessionId: 'me', selectedChar: '', confirmed: false }),
      mk({ sessionId: 'them', selectedChar: 'thor', confirmed: true }),
    ]
    const mine = resolveMySelection(players, 'me')
    expect(mine.selectedChar).toBe('')
    expect(mine.confirmed).toBe(false)
    expect(mine.present).toBe(true)
  })

  it('handles an empty room (no players) for a non-null id', () => {
    expect(resolveMySelection([], 'me')).toEqual({ selectedChar: '', confirmed: false, present: false })
  })
})
