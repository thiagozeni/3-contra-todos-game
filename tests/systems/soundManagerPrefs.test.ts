/**
 * SoundManager — preferências de áudio (tela OPTIONS) unit tests.
 *
 * Contratos:
 *  - Default: música e SFX ligados.
 *  - setMusicEnabled / setSfxEnabled persistem em localStorage e são independentes.
 *  - Uma nova instância lê as preferências persistidas.
 *  - Sem localStorage (ambiente node puro), cai no default ligado sem lançar.
 *
 * O ambiente do vitest é `node` (sem DOM), então mockamos um localStorage mínimo.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SoundManager } from '../../src/systems/SoundManager'

function installLocalStorageMock(): void {
  const store: Record<string, string> = {}
  ;(globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v) },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
    key: () => null,
    length: 0,
  } as Storage
}

describe('SoundManager — preferências de áudio', () => {
  beforeEach(() => { installLocalStorageMock() })
  afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage })

  it('default: música e SFX ligados', () => {
    const s = new SoundManager()
    expect(s.isMusicEnabled()).toBe(true)
    expect(s.isSfxEnabled()).toBe(true)
  })

  it('setMusicEnabled(false) desliga e persiste', () => {
    const s = new SoundManager()
    s.setMusicEnabled(false)
    expect(s.isMusicEnabled()).toBe(false)
    expect(localStorage.getItem('wf_music_enabled')).toBe('0')
  })

  it('setSfxEnabled(false) desliga e persiste', () => {
    const s = new SoundManager()
    s.setSfxEnabled(false)
    expect(s.isSfxEnabled()).toBe(false)
    expect(localStorage.getItem('wf_sfx_enabled')).toBe('0')
  })

  it('música e SFX são independentes', () => {
    const s = new SoundManager()
    s.setMusicEnabled(false)
    expect(s.isMusicEnabled()).toBe(false)
    expect(s.isSfxEnabled()).toBe(true)
  })

  it('nova instância lê as preferências persistidas', () => {
    localStorage.setItem('wf_music_enabled', '0')
    localStorage.setItem('wf_sfx_enabled', '0')
    const s = new SoundManager()
    expect(s.isMusicEnabled()).toBe(false)
    expect(s.isSfxEnabled()).toBe(false)
  })

  it('sem localStorage não lança e usa o default ligado', () => {
    delete (globalThis as { localStorage?: Storage }).localStorage
    const s = new SoundManager()
    expect(s.isMusicEnabled()).toBe(true)
    expect(s.isSfxEnabled()).toBe(true)
  })
})
