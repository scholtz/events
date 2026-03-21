import { createI18n } from 'vue-i18n'
import en from './locales/en'
import sk from './locales/sk'
import de from './locales/de'

export type SupportedLocale = 'en' | 'sk' | 'de'

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'sk', 'de']

export const LOCALE_STORAGE_KEY = 'app_locale'

/**
 * Detect the best initial locale from (in priority order):
 * 1. localStorage persisted preference
 * 2. Browser navigator.languages
 * 3. Fallback to 'en'
 */
export function detectLocale(): SupportedLocale {
  // 1. Persisted preference
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored && SUPPORTED_LOCALES.includes(stored as SupportedLocale)) {
      return stored as SupportedLocale
    }
  } catch {
    // localStorage may not be available (SSR, privacy mode)
  }

  // 2. Browser language
  if (typeof navigator !== 'undefined' && navigator.languages) {
    for (const lang of navigator.languages) {
      const short = lang.split('-')[0] as SupportedLocale
      if (SUPPORTED_LOCALES.includes(short)) {
        return short
      }
    }
  }

  return 'en'
}

/**
 * Persist the chosen locale to localStorage so it survives page reloads.
 */
export function persistLocale(locale: SupportedLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
  messages: {
    en,
    sk,
    de,
  },
})

export default i18n
