import { describe, test, expect, beforeEach } from 'vitest'
import { init, t, getLocale, setLocale, onLocaleChange, STORAGE_KEY } from '../../src/i18n'
import { pt } from '../../src/i18n/locales/pt'
import { es } from '../../src/i18n/locales/es'

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    _map: map,
  }
}

describe('i18n state', () => {
  beforeEach(() => {
    // Reset to a known baseline so tests are order-independent.
    init({ storage: null, languages: ['pt-BR'] })
  })

  test('init uses the stored locale when present, ignoring the browser', () => {
    const locale = init({ storage: fakeStorage({ [STORAGE_KEY]: 'es' }), languages: ['en-US'] })
    expect(locale).toBe('es')
    expect(getLocale()).toBe('es')
  })

  test('init detects from the browser when storage is empty', () => {
    expect(init({ storage: fakeStorage(), languages: ['en-US'] })).toBe('en')
  })

  test('init ignores an invalid stored value and falls back to detection', () => {
    expect(init({ storage: fakeStorage({ [STORAGE_KEY]: 'xx' }), languages: ['es-MX'] })).toBe('es')
  })

  test('t resolves the key in the current locale', () => {
    init({ storage: null, languages: ['es-ES'] })
    expect(t('common.back')).toBe(es['common.back'])
    init({ storage: null, languages: ['pt-BR'] })
    expect(t('common.back')).toBe(pt['common.back'])
  })

  test('setLocale changes the current locale and persists it', () => {
    const store = fakeStorage()
    setLocale('en', store)
    expect(getLocale()).toBe('en')
    expect(store._map.get(STORAGE_KEY)).toBe('en')
  })

  test('onLocaleChange notifies subscribers when the locale changes', () => {
    const seen: string[] = []
    const off = onLocaleChange((l) => seen.push(l))
    setLocale('es', null)
    setLocale('en', null)
    off()
    setLocale('pt', null)
    expect(seen).toEqual(['es', 'en'])
  })
})
