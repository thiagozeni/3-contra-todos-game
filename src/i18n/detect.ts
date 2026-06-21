import type { Locale } from './messages'
import { DEFAULT_LOCALE } from './messages'

const SUPPORTED: readonly string[] = ['pt', 'en', 'es']

/**
 * Pure. Resolves a browser language list (e.g. navigator.languages) to a shipped
 * locale. Honors preference order: the first supported language wins. If languages
 * are present but none are supported, returns 'en' (international fallback). If the
 * list is empty, returns the pt default base.
 */
export function detectLocale(languages: readonly string[]): Locale {
  for (const lang of languages) {
    const prefix = lang.toLowerCase().split('-')[0]
    if (SUPPORTED.includes(prefix)) return prefix as Locale
  }
  return languages.length > 0 ? 'en' : DEFAULT_LOCALE
}
