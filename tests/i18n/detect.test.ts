import { describe, test, expect } from 'vitest'
import { detectLocale } from '../../src/i18n/detect'

describe('detectLocale', () => {
  test('picks pt for a Brazilian Portuguese browser', () => {
    expect(detectLocale(['pt-BR'])).toBe('pt')
  })

  test('picks pt for generic Portuguese', () => {
    expect(detectLocale(['pt'])).toBe('pt')
  })

  test('picks es for Spain Spanish', () => {
    expect(detectLocale(['es-ES'])).toBe('es')
  })

  test('picks es for Latin American Spanish', () => {
    expect(detectLocale(['es-419'])).toBe('es')
  })

  test('picks en for US English', () => {
    expect(detectLocale(['en-US'])).toBe('en')
  })

  test('falls back to en for an unsupported language', () => {
    expect(detectLocale(['fr-FR'])).toBe('en')
  })

  test('falls back to en for German', () => {
    expect(detectLocale(['de-DE'])).toBe('en')
  })

  test('returns the pt default base when no languages are provided', () => {
    expect(detectLocale([])).toBe('pt')
  })

  test('respects preference order — first supported language wins', () => {
    // browser prefers French, then Spanish, then English
    expect(detectLocale(['fr-FR', 'es-MX', 'en-US'])).toBe('es')
  })

  test('is case-insensitive on the language tag', () => {
    expect(detectLocale(['PT-br'])).toBe('pt')
  })
})
