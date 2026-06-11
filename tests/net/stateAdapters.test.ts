/**
 * stateAdapters unit tests — pure projection of the network Schema onto the
 * view-facing PlayerState / EnemyState shapes. No Phaser, no SDK.
 */

import { describe, it, expect } from 'vitest'
import { netToPlayerState, netToEnemyState, netToAllyState } from '../../src/net/stateAdapters'

describe('netToPlayerState', () => {
  const base = {
    sessionId: 's1', charKey: 'werdum', x: 100, y: 700,
    hp: 90, maxHp: 150, fsm: 'normal', facing: 1, connected: true,
  }

  it('maps core fields and uses y as groundY', () => {
    const ps = netToPlayerState(base)
    expect(ps.charKey).toBe('werdum')
    expect(ps.x).toBe(100)
    expect(ps.y).toBe(700)
    expect(ps.groundY).toBe(700)
    expect(ps.hp).toBe(90)
    expect(ps.maxHp).toBe(150)
  })

  it('derives isBlocking from the blocking fsm', () => {
    expect(netToPlayerState({ ...base, fsm: 'blocking' }).isBlocking).toBe(true)
    expect(netToPlayerState({ ...base, fsm: 'normal' }).isBlocking).toBe(false)
  })

  it('clamps facing to ±1 and unknown fsm to normal', () => {
    expect(netToPlayerState({ ...base, facing: -1 }).facing).toBe(-1)
    expect(netToPlayerState({ ...base, facing: 5 }).facing).toBe(1)
    expect(netToPlayerState({ ...base, fsm: 'garbage' }).fsm).toBe('normal')
  })
})

describe('netToEnemyState', () => {
  const base = {
    id: 7, enemyType: 'weak', isBoss: false, x: 800, y: 750,
    hp: 20, maxHp: 30, fsm: 'approach',
  }

  it('maps identity + position + hp', () => {
    const es = netToEnemyState(base)
    expect(es.id).toBe(7)
    expect(es.enemyType).toBe('weak')
    expect(es.x).toBe(800)
    expect(es.y).toBe(750)
    expect(es.hp).toBe(20)
    expect(es.maxHp).toBe(30)
  })

  it('marks isDead when fsm is dead, and normalises unknown fsm', () => {
    expect(netToEnemyState({ ...base, fsm: 'dead' }).isDead).toBe(true)
    expect(netToEnemyState({ ...base, fsm: 'approach' }).isDead).toBe(false)
    expect(netToEnemyState({ ...base, fsm: 'garbage' }).fsm).toBe('approach')
  })

  it('approximates target from fsm (chasePlayer → player, else wand)', () => {
    expect(netToEnemyState({ ...base, fsm: 'chasePlayer' }).target).toBe('player')
    expect(netToEnemyState({ ...base, fsm: 'approach' }).target).toBe('wand')
  })
})

describe('netToAllyState (FB2)', () => {
  const base = { charKey: 'thor', x: 640, y: 760, fsm: 'moveToEnemy' }

  it('maps charKey + position + fsm', () => {
    const as = netToAllyState(base)
    expect(as.charKey).toBe('thor')
    expect(as.x).toBe(640)
    expect(as.y).toBe(760)
    expect(as.fsm).toBe('moveToEnemy')
  })

  it('preserves every valid ally fsm', () => {
    for (const fsm of ['idle', 'moveToEnemy', 'attack', 'knockdown', 'recover']) {
      expect(netToAllyState({ ...base, fsm }).fsm).toBe(fsm)
    }
  })

  it('normalises an unknown fsm to idle', () => {
    expect(netToAllyState({ ...base, fsm: 'garbage' }).fsm).toBe('idle')
    expect(netToAllyState({ ...base, fsm: '' }).fsm).toBe('idle')
  })

  it('fills sim-owned timer fields with inert defaults', () => {
    const as = netToAllyState(base)
    expect(as.attackCooldown).toBe(0)
    expect(as.knockdownTimer).toBe(0)
  })
})
