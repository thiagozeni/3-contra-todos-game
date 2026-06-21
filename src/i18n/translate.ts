import { pt } from './locales/pt'
import { en } from './locales/en'
import { es } from './locales/es'
import type { Locale, MessageKey } from './messages'

type Dict = Record<string, string>
const DICTS: Record<Locale, Dict> = { pt, en, es }

/**
 * Pure. Resolves a key for a locale with a two-step fallback:
 *   1. the requested locale,
 *   2. pt (the source of truth, always complete),
 *   3. the key itself (defensive — should never happen for a real key).
 * `override` lets tests inject partial dictionaries.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  override?: Partial<Record<Locale, Dict>>,
): string {
  const dicts = { ...DICTS, ...override }
  const fromLocale = dicts[locale]?.[key]
  if (fromLocale != null) return fromLocale
  const fromBase = dicts.pt?.[key]
  if (fromBase != null) return fromBase
  return key
}
