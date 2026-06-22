import { describe, it, expect } from 'vitest'
import { RING } from '../../src/core/config/ring'
import { WAVES } from '../../src/core/config/waves'
import { PLAYER_STATS } from '../../src/core/config/stats'
import { ENEMY_STATS, ENEMY_SCORE_TABLE } from '../../src/core/config/stats'
import { ALLY_STATS } from '../../src/core/config/stats'
import { COMBAT } from '../../src/core/config/combat'
import { KNOCKDOWN_THRESHOLDS } from '../../src/core/config/combat'

// ── RING ─────────────────────────────────────────────────────────────────────

describe('RING', () => {
  // Round 2: +300px de largura cada lado + shift vertical 15px (top 603 / bottom 1050).
  it('has correct static bounds', () => {
    expect(RING.top).toBe(603)
    expect(RING.bottom).toBe(1050)
    expect(RING.leftTop).toBe(290)
    expect(RING.leftBottom).toBe(80)
    expect(RING.rightTop).toBe(1650)
    expect(RING.rightBottom).toBe(1860)
    expect(RING.left).toBe(80)
    expect(RING.right).toBe(1860)
  })

  it('leftAt returns leftTop at y=top', () => {
    expect(RING.leftAt(603)).toBeCloseTo(290, 5)
  })

  it('leftAt returns leftBottom at y=bottom', () => {
    expect(RING.leftAt(1050)).toBeCloseTo(80, 5)
  })

  it('leftAt interpolates at midpoint (y=826.5)', () => {
    // t = (826.5 - 603) / 447 = 0.5 → lerp(290, 80, 0.5) = 185
    expect(RING.leftAt(826.5)).toBeCloseTo(185, 5)
  })

  it('leftAt clamps above top', () => {
    expect(RING.leftAt(500)).toBeCloseTo(290, 5)
  })

  it('leftAt clamps below bottom', () => {
    expect(RING.leftAt(1100)).toBeCloseTo(80, 5)
  })

  it('rightAt returns rightTop at y=top', () => {
    expect(RING.rightAt(603)).toBeCloseTo(1650, 5)
  })

  it('rightAt returns rightBottom at y=bottom', () => {
    expect(RING.rightAt(1050)).toBeCloseTo(1860, 5)
  })

  it('rightAt interpolates at midpoint (y=826.5)', () => {
    // t = 0.5 → lerp(1650, 1860, 0.5) = 1755
    expect(RING.rightAt(826.5)).toBeCloseTo(1755, 5)
  })
})

// ── WAVES ────────────────────────────────────────────────────────────────────

describe('WAVES', () => {
  it('has exactly 12 waves', () => {
    expect(WAVES).toHaveLength(12)
  })

  it('wave ids run from 1 to 12', () => {
    for (let i = 0; i < 12; i++) {
      expect(WAVES[i].id).toBe(i + 1)
    }
  })

  it('boss waves are 8, 10, 12', () => {
    const bossIds = WAVES.filter(w => w.isBoss).map(w => w.id)
    expect(bossIds).toEqual([8, 10, 12])
  })

  it('non-boss waves do not have isBoss flag', () => {
    for (const w of WAVES) {
      if (![8, 10, 12].includes(w.id)) {
        expect(w.isBoss).toBeFalsy()
      }
    }
  })

  it('wave 8 has boss_coach + 3 weak', () => {
    const w = WAVES.find(w => w.id === 8)!
    expect(w.enemies).toContainEqual({ type: 'boss_coach', count: 1 })
    expect(w.enemies).toContainEqual({ type: 'weak', count: 3 })
    expect(w.spawnInterval).toBe(1500)
  })

  it('wave 10 has boss_son + 3 weak', () => {
    const w = WAVES.find(w => w.id === 10)!
    expect(w.enemies).toContainEqual({ type: 'boss_son', count: 1 })
    expect(w.enemies).toContainEqual({ type: 'weak', count: 3 })
    expect(w.spawnInterval).toBe(1500)
  })

  it('wave 12 has boss_coco + 4 weak', () => {
    const w = WAVES.find(w => w.id === 12)!
    expect(w.enemies).toContainEqual({ type: 'boss_coco', count: 1 })
    expect(w.enemies).toContainEqual({ type: 'weak', count: 4 })
    expect(w.spawnInterval).toBe(1200)
  })

  it('wave 1 has 3 weak at interval 1800', () => {
    const w = WAVES.find(w => w.id === 1)!
    expect(w.enemies).toEqual([{ type: 'weak', count: 3 }])
    expect(w.spawnInterval).toBe(1800)
  })
})

// ── PLAYER STATS ─────────────────────────────────────────────────────────────

describe('PLAYER_STATS', () => {
  it('has werdum stats', () => {
    expect(PLAYER_STATS.werdum.speed).toBe(180)
    expect(PLAYER_STATS.werdum.maxHp).toBe(200)
    expect(PLAYER_STATS.werdum.sizeScale).toBe(1.02)
    expect(PLAYER_STATS.werdum.scaleH).toBe(0.75)
    expect(PLAYER_STATS.werdum.punchReach).toBe(150)
    expect(PLAYER_STATS.werdum.kickReach).toBe(170)
  })

  it('has dida stats', () => {
    expect(PLAYER_STATS.dida.speed).toBe(190)
    expect(PLAYER_STATS.dida.maxHp).toBe(190)
    expect(PLAYER_STATS.dida.sizeScale).toBe(1.015)
    expect(PLAYER_STATS.dida.scaleH).toBe(0.98)
    expect(PLAYER_STATS.dida.punchReach).toBe(140)
    expect(PLAYER_STATS.dida.kickReach).toBe(160)
  })

  it('has thor stats', () => {
    expect(PLAYER_STATS.thor.speed).toBe(200)
    expect(PLAYER_STATS.thor.maxHp).toBe(200)
    expect(PLAYER_STATS.thor.sizeScale).toBe(0.99)
    expect(PLAYER_STATS.thor.scaleH).toBe(0.94)
    expect(PLAYER_STATS.thor.punchReach).toBe(130)
    expect(PLAYER_STATS.thor.kickReach).toBe(150)
  })
})

// ── ALLY STATS ───────────────────────────────────────────────────────────────

describe('ALLY_STATS', () => {
  it('has werdum ally stats', () => {
    expect(ALLY_STATS.werdum.speed).toBe(80)
    expect(ALLY_STATS.werdum.sizeScale).toBe(1.02)
    expect(ALLY_STATS.werdum.scaleH).toBe(0.75)
  })

  it('has dida ally stats', () => {
    expect(ALLY_STATS.dida.speed).toBe(110)
    expect(ALLY_STATS.dida.sizeScale).toBe(1.015)
    expect(ALLY_STATS.dida.scaleH).toBe(0.98)
  })

  it('has thor ally stats', () => {
    expect(ALLY_STATS.thor.speed).toBe(130)
    expect(ALLY_STATS.thor.sizeScale).toBe(0.99)
    expect(ALLY_STATS.thor.scaleH).toBe(0.94)
  })
})

// ── ENEMY SCORE TABLE ────────────────────────────────────────────────────────

describe('ENEMY_SCORE_TABLE', () => {
  it('has correct scores for all enemy types', () => {
    expect(ENEMY_SCORE_TABLE.weak).toBe(10)
    expect(ENEMY_SCORE_TABLE.strong).toBe(25)
    expect(ENEMY_SCORE_TABLE.chair).toBe(25)
    expect(ENEMY_SCORE_TABLE.fat).toBe(40)
    expect(ENEMY_SCORE_TABLE.boss_son).toBe(200)
    expect(ENEMY_SCORE_TABLE.boss_coach).toBe(300)
    expect(ENEMY_SCORE_TABLE.boss_coco).toBe(500)
  })
})

// ── ENEMY STATS ──────────────────────────────────────────────────────────────

describe('ENEMY_STATS', () => {
  it('weak enemy stats', () => {
    expect(ENEMY_STATS.weak.hp).toBe(40)
    expect(ENEMY_STATS.weak.speed).toBe(75)
    expect(ENEMY_STATS.weak.damageToPlayer).toBe(10)
    expect(ENEMY_STATS.weak.damageToWand).toBe(12)
  })

  it('fat enemy stats', () => {
    expect(ENEMY_STATS.fat.hp).toBe(100)        // 130→100 (playtest: wave-4 wall nerf)
    expect(ENEMY_STATS.fat.speed).toBe(45)
    expect(ENEMY_STATS.fat.damageToPlayer).toBe(18)
    expect(ENEMY_STATS.fat.damageToWand).toBe(16) // 20→16
  })

  it('strong enemy stats', () => {
    expect(ENEMY_STATS.strong.hp).toBe(90)
    expect(ENEMY_STATS.strong.speed).toBe(60)
    expect(ENEMY_STATS.strong.damageToPlayer).toBe(15)
    expect(ENEMY_STATS.strong.damageToWand).toBe(18)
  })

  it('boss_coco stats', () => {
    expect(ENEMY_STATS.boss_coco.hp).toBe(420)
    expect(ENEMY_STATS.boss_coco.speed).toBe(95)
    expect(ENEMY_STATS.boss_coco.isBoss).toBe(true)
    expect(ENEMY_STATS.boss_coco.sizeScale).toBe(1.21)
  })

  it('boss_coach stats', () => {
    expect(ENEMY_STATS.boss_coach.hp).toBe(180)
    expect(ENEMY_STATS.boss_coach.speed).toBe(55)
    expect(ENEMY_STATS.boss_coach.isBoss).toBe(true)
  })
})

// ── COMBAT ───────────────────────────────────────────────────────────────────

describe('COMBAT', () => {
  it('punch values', () => {
    expect(COMBAT.punch.rangeH).toBe(80)
    expect(COMBAT.punch.rangeV).toBe(40)
    expect(COMBAT.punch.damage).toBe(10)
    expect(COMBAT.punch.cooldownMs).toBe(150)
  })

  it('kick values', () => {
    expect(COMBAT.kick.rangeH).toBe(100)
    expect(COMBAT.kick.rangeV).toBe(40)
    expect(COMBAT.kick.damage).toBe(16)
    expect(COMBAT.kick.cooldownMs).toBe(500)
  })

  it('combo window', () => {
    expect(COMBAT.combo.windowMs).toBe(1800)
  })

  it('combo tier1 at hits >= 3 gives 1.5x', () => {
    expect(COMBAT.combo.tier1.hits).toBe(3)
    expect(COMBAT.combo.tier1.mult).toBe(1.5)
  })

  it('combo tier2 at hits >= 5 gives 2x', () => {
    expect(COMBAT.combo.tier2.hits).toBe(5)
    expect(COMBAT.combo.tier2.mult).toBe(2)
  })
})

// ── KNOCKDOWN_THRESHOLDS ──────────────────────────────────────────────────────

describe('KNOCKDOWN_THRESHOLDS', () => {
  it('fat threshold is 60 (only a strong combo can knock it down)', () => {
    expect(KNOCKDOWN_THRESHOLDS.fat).toBe(60) // was 9999 (never) — playtest gave it a CC answer
  })

  it('strong threshold is 30', () => {
    expect(KNOCKDOWN_THRESHOLDS.strong).toBe(30)
  })

  it('boss threshold is 30', () => {
    expect(KNOCKDOWN_THRESHOLDS.boss).toBe(30)
  })

  it('default threshold is 18', () => {
    expect(KNOCKDOWN_THRESHOLDS.default).toBe(18)
  })
})
