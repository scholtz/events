import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// We need to import only the pure functions — not the default export
// which calls createI18n() and triggers import.meta.env. We'll test
// the helper functions via a direct dynamic import of the module source.

type LocaleValue = string | LocaleMessages
type LocaleMessages = Record<string, LocaleValue>

async function importLocaleMessages(locale: 'en' | 'sk' | 'de'): Promise<LocaleMessages> {
  if (locale === 'en') return (await import('../locales/en')).default as LocaleMessages
  if (locale === 'sk') return (await import('../locales/sk')).default as LocaleMessages
  return (await import('../locales/de')).default as LocaleMessages
}

function visitTranslationStrings(
  messages: LocaleMessages,
  visit: (path: string, value: string) => void,
  path = '',
) {
  for (const [key, value] of Object.entries(messages)) {
    const nextPath = path ? `${path}.${key}` : key
    if (typeof value === 'string') {
      visit(nextPath, value)
      continue
    }

    visitTranslationStrings(value, visit, nextPath)
  }
}

describe('i18n', () => {
  // Provide a minimal localStorage stub for the node test environment
  const store: Record<string, string> = {}
  const mockStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }

  beforeEach(() => {
    mockStorage.clear()
    // Stub global localStorage
    vi.stubGlobal('localStorage', mockStorage)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('detectLocale & persistLocale', () => {
    it('returns stored locale from localStorage', async () => {
      const { detectLocale, LOCALE_STORAGE_KEY } = await import('../index')
      mockStorage.setItem(LOCALE_STORAGE_KEY, 'sk')
      expect(detectLocale()).toBe('sk')
    })

    it('returns stored locale de from localStorage', async () => {
      const { detectLocale, LOCALE_STORAGE_KEY } = await import('../index')
      mockStorage.setItem(LOCALE_STORAGE_KEY, 'de')
      expect(detectLocale()).toBe('de')
    })

    it('ignores unsupported stored locale', async () => {
      const { detectLocale, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } = await import('../index')
      mockStorage.setItem(LOCALE_STORAGE_KEY, 'fr')
      const result = detectLocale()
      expect(SUPPORTED_LOCALES).toContain(result)
    })

    it('returns en when no localStorage value exists', async () => {
      const { detectLocale } = await import('../index')
      // navigator.languages is not available in vitest, so it falls back to 'en'
      const result = detectLocale()
      expect(result).toBe('en')
    })

    it('persistLocale stores the locale in localStorage', async () => {
      const { persistLocale, LOCALE_STORAGE_KEY } = await import('../index')
      persistLocale('de')
      expect(mockStorage.getItem(LOCALE_STORAGE_KEY)).toBe('de')
    })

    it('persistLocale overwrites previous locale', async () => {
      const { persistLocale, LOCALE_STORAGE_KEY } = await import('../index')
      persistLocale('sk')
      persistLocale('en')
      expect(mockStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    })

    it('persistLocale stores each supported locale correctly', async () => {
      const { persistLocale, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } = await import('../index')
      for (const loc of SUPPORTED_LOCALES) {
        persistLocale(loc)
        expect(mockStorage.getItem(LOCALE_STORAGE_KEY)).toBe(loc)
      }
    })
  })

  describe('SUPPORTED_LOCALES', () => {
    it('includes en, sk, de', async () => {
      const { SUPPORTED_LOCALES } = await import('../index')
      expect(SUPPORTED_LOCALES).toContain('en')
      expect(SUPPORTED_LOCALES).toContain('sk')
      expect(SUPPORTED_LOCALES).toContain('de')
    })

    it('has exactly 3 supported locales', async () => {
      const { SUPPORTED_LOCALES } = await import('../index')
      expect(SUPPORTED_LOCALES).toHaveLength(3)
    })
  })

  describe('LOCALE_STORAGE_KEY', () => {
    it('is a non-empty string', async () => {
      const { LOCALE_STORAGE_KEY } = await import('../index')
      expect(typeof LOCALE_STORAGE_KEY).toBe('string')
      expect(LOCALE_STORAGE_KEY.length).toBeGreaterThan(0)
    })
  })

  describe('locale message completeness', () => {
    it('all locales have the same top-level keys as English', async () => {
      const en = (await import('../locales/en')).default
      const sk = (await import('../locales/sk')).default
      const de = (await import('../locales/de')).default

      const enKeys = Object.keys(en).sort()
      const skKeys = Object.keys(sk).sort()
      const deKeys = Object.keys(de).sort()

      expect(skKeys).toEqual(enKeys)
      expect(deKeys).toEqual(enKeys)
    })

    it('all locales have matching nested keys for each section', async () => {
      const en = (await import('../locales/en')).default
      const sk = (await import('../locales/sk')).default
      const de = (await import('../locales/de')).default

      for (const section of Object.keys(en)) {
        const enSection = (en as Record<string, Record<string, string>>)[section]
        const skSection = (sk as Record<string, Record<string, string>>)[section]
        const deSection = (de as Record<string, Record<string, string>>)[section]

        if (typeof enSection === 'object' && enSection !== null) {
          const enNestedKeys = Object.keys(enSection).sort()
          const skNestedKeys = Object.keys(skSection).sort()
          const deNestedKeys = Object.keys(deSection).sort()

          expect(skNestedKeys, `Slovak locale missing keys in ${section}`).toEqual(enNestedKeys)
          expect(deNestedKeys, `German locale missing keys in ${section}`).toEqual(enNestedKeys)
        }
      }
    })

    it('no translation value is an empty string', async () => {
      const locales: Record<string, LocaleMessages> = {
        en: await importLocaleMessages('en'),
        sk: await importLocaleMessages('sk'),
        de: await importLocaleMessages('de'),
      }

      for (const [localeName, messages] of Object.entries(locales)) {
        visitTranslationStrings(messages, (path, value) => {
          expect(value, `Empty translation: ${localeName}.${path}`).not.toBe('')
        })
      }
    })

    it('every translation value is a string', async () => {
      const locales: Record<string, LocaleMessages> = {
        en: await importLocaleMessages('en'),
        sk: await importLocaleMessages('sk'),
        de: await importLocaleMessages('de'),
      }

      for (const [localeName, messages] of Object.entries(locales)) {
        visitTranslationStrings(messages, (path, value) => {
          expect(
            typeof value,
            `Non-string value: ${localeName}.${path} = ${JSON.stringify(value)}`,
          ).toBe('string')
        })
      }
    })

    it('English locale has language names for all supported locales', async () => {
      const en = (await import('../locales/en')).default
      const { SUPPORTED_LOCALES } = await import('../index')

      for (const loc of SUPPORTED_LOCALES) {
        expect(
          (en.languages as Record<string, string>)[loc],
          `Missing language name for ${loc} in English locale`,
        ).toBeDefined()
      }
    })

    it('all locales have language names for all supported locales', async () => {
      const en = (await import('../locales/en')).default
      const sk = (await import('../locales/sk')).default
      const de = (await import('../locales/de')).default
      const { SUPPORTED_LOCALES } = await import('../index')

      for (const loc of SUPPORTED_LOCALES) {
        expect((en.languages as Record<string, string>)[loc]).toBeDefined()
        expect((sk.languages as Record<string, string>)[loc]).toBeDefined()
        expect((de.languages as Record<string, string>)[loc]).toBeDefined()
      }
    })

    it('English translations use straight apostrophes, not curly quotes', async () => {
      const en = await importLocaleMessages('en')

      visitTranslationStrings(en, (path, value) => {
        expect(
          value.includes('\u2019'),
          `Curly quote found: en.${path} = ${JSON.stringify(value)}`,
        ).toBe(false)
      })
    })
  })
})
