import { pt } from './locales/pt'

/** The three shipped locales. pt is the base/default; en is the international fallback. */
export type Locale = 'pt' | 'en' | 'es'

export const LOCALES: readonly Locale[] = ['pt', 'en', 'es']

/** Base locale — used when nothing else is detectable. pt-BR is the game's heritage. */
export const DEFAULT_LOCALE: Locale = 'pt'

/** Every translatable key, derived from the pt dictionary (the source of truth). */
export type MessageKey = keyof typeof pt

/** A complete dictionary — en.ts and es.ts must satisfy this, so TS catches gaps. */
export type Messages = Record<MessageKey, string>
