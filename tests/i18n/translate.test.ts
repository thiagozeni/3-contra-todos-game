import { describe, test, expect } from 'vitest'
import { translate } from '../../src/i18n/translate'
import { pt } from '../../src/i18n/locales/pt'
import { en } from '../../src/i18n/locales/en'
import { es } from '../../src/i18n/locales/es'

describe('translate', () => {
  test('returns the Portuguese string for a known key', () => {
    expect(translate('pt', 'common.back')).toBe(pt['common.back'])
  })

  test('returns the English string for a known key, distinct from pt', () => {
    expect(translate('en', 'common.back')).toBe(en['common.back'])
    expect(translate('en', 'common.back')).not.toBe(pt['common.back'])
  })

  test('returns the Spanish string for a known key', () => {
    expect(translate('es', 'common.back')).toBe(es['common.back'])
  })

  test('falls back to Portuguese (source of truth) when a locale lacks the key', () => {
    // Simulate an incomplete locale at runtime by overriding en with a partial dict.
    const partial = { 'common.back': 'BACK' } as unknown as typeof en
    expect(translate('en', 'common.continue', { en: partial })).toBe(pt['common.continue'])
  })

  test('returns the key itself as a last resort for a truly unknown key', () => {
    expect(translate('pt', 'does.not.exist' as never)).toBe('does.not.exist')
  })
})

describe('locale dictionaries are complete', () => {
  const keys = Object.keys(pt) as (keyof typeof pt)[]

  test('en has every key that pt has', () => {
    const missing = keys.filter((k) => !(k in en))
    expect(missing).toEqual([])
  })

  test('es has every key that pt has', () => {
    const missing = keys.filter((k) => !(k in es))
    expect(missing).toEqual([])
  })

  test('no translation is left empty', () => {
    for (const k of keys) {
      expect(en[k]?.length, `en[${k}]`).toBeGreaterThan(0)
      expect(es[k]?.length, `es[${k}]`).toBeGreaterThan(0)
    }
  })
})
