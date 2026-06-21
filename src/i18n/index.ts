import { detectLocale } from './detect'
import { translate } from './translate'
import { DEFAULT_LOCALE, LOCALES, type Locale, type MessageKey } from './messages'

export type { Locale, MessageKey } from './messages'
export { LOCALES, DEFAULT_LOCALE } from './messages'

/** localStorage key holding the user's explicit language choice. */
export const STORAGE_KEY = 'wf:lang'

type ReadStorage = Pick<Storage, 'getItem'>
type WriteStorage = Pick<Storage, 'setItem'>

let current: Locale = DEFAULT_LOCALE
const listeners = new Set<(l: Locale) => void>()

function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v)
}

/** Reads window.localStorage defensively (absent in SSR/tests, may throw in private mode). */
function envStorage(): (ReadStorage & WriteStorage) | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function envLanguages(): readonly string[] {
  try {
    return typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []
  } catch {
    return []
  }
}

export interface InitOpts {
  /** undefined → use the real localStorage; null → no persistence (tests). */
  storage?: ReadStorage | null
  /** undefined → use navigator.languages. */
  languages?: readonly string[]
}

/**
 * Resolves the active locale once at startup: an explicit stored choice wins; otherwise
 * detect from the browser. Returns the chosen locale and sets it as current.
 */
export function init(opts: InitOpts = {}): Locale {
  const storage = opts.storage !== undefined ? opts.storage : envStorage()
  const languages = opts.languages !== undefined ? opts.languages : envLanguages()

  const stored = storage?.getItem(STORAGE_KEY) ?? null
  current = isLocale(stored) ? stored : detectLocale(languages)
  return current
}

export function getLocale(): Locale {
  return current
}

/** Changes the active locale, persists the choice, and notifies subscribers. */
export function setLocale(locale: Locale, storage?: WriteStorage | null): void {
  if (!isLocale(locale)) return
  current = locale
  const store = storage !== undefined ? storage : envStorage()
  try {
    store?.setItem(STORAGE_KEY, locale)
  } catch {
    /* private mode / quota — locale still applies for the session */
  }
  listeners.forEach((fn) => fn(locale))
}

/** Translates a key in the current locale. The single call all screens use. */
export function t(key: MessageKey): string {
  return translate(current, key)
}

/** Subscribe to locale changes. Returns an unsubscribe function. */
export function onLocaleChange(fn: (l: Locale) => void): () => void {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
