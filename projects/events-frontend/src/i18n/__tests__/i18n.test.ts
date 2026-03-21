import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// We need to import only the pure functions — not the default export
// which calls createI18n() and triggers import.meta.env. We'll test
// the helper functions via a direct dynamic import of the module source.

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
  })

  describe('SUPPORTED_LOCALES', () => {
    it('includes en, sk, de', async () => {
      const { SUPPORTED_LOCALES } = await import('../index')
      expect(SUPPORTED_LOCALES).toContain('en')
      expect(SUPPORTED_LOCALES).toContain('sk')
      expect(SUPPORTED_LOCALES).toContain('de')
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
      const locales: Record<string, Record<string, Record<string, string>>> = {
        en: (await import('../locales/en')).default as any,
        sk: (await import('../locales/sk')).default as any,
        de: (await import('../locales/de')).default as any,
      }

      for (const [localeName, messages] of Object.entries(locales)) {
        for (const [section, entries] of Object.entries(messages)) {
          if (typeof entries === 'object' && entries !== null) {
            for (const [key, value] of Object.entries(entries)) {
              expect(
                value,
                `Empty translation: ${localeName}.${section}.${key}`,
              ).not.toBe('')
            }
          }
        }
      }
    })
  })
})
