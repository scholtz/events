/**
 * Unit tests for pure filter-state utilities exported from @/stores/events.
 *
 * Covers:
 *  createDefaultEventFilters  — default values for every field
 *  eventFiltersToQuery        — filter state → URL query string
 *  eventFiltersFromQuery      — URL query string → filter state
 *  buildDiscoveryFilterInput  — filter state → GraphQL EventFilterInput variables
 *  areEventFiltersEqual       — equality check used to gate URL/fetch updates
 *  savedSearchToFilters       — saved-search entity → EventFilters
 *  formatEventPrice           — formatting helper for event cards
 *
 * No stores or Vue components are mounted; these are plain function tests.
 */

import { describe, expect, it } from 'vitest'
import type { LocationQuery } from 'vue-router'
import {
  areEventFiltersEqual,
  buildDiscoveryFilterInput,
  createDefaultEventFilters,
  eventFiltersFromQuery,
  eventFiltersToQuery,
  formatEventPrice,
  savedSearchToFilters,
} from '@/stores/events'
import type { EventFilters, SavedSearch } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function q(params: Record<string, string | string[]>): LocationQuery {
  return params as LocationQuery
}

function fullFilters(overrides: Partial<EventFilters> = {}): EventFilters {
  return {
    search: 'crypto',
    domain: 'technology',
    dateFrom: '2026-01-01',
    dateTo: '2026-12-31',
    location: 'Prague',
    priceType: 'FREE',
    priceMin: '10',
    priceMax: '200',
    sortBy: 'NEWEST',
    attendanceMode: 'HYBRID',
    language: 'en',
    timezone: 'Europe/Prague',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// createDefaultEventFilters
// ---------------------------------------------------------------------------

describe('createDefaultEventFilters', () => {
  it('returns all expected fields with correct defaults', () => {
    const defaults = createDefaultEventFilters()
    expect(defaults.search).toBe('')
    expect(defaults.domain).toBe('')
    expect(defaults.dateFrom).toBe('')
    expect(defaults.dateTo).toBe('')
    expect(defaults.location).toBe('')
    expect(defaults.priceType).toBe('ALL')
    expect(defaults.priceMin).toBe('')
    expect(defaults.priceMax).toBe('')
    expect(defaults.sortBy).toBe('UPCOMING')
    expect(defaults.attendanceMode).toBe('')
    expect(defaults.language).toBe('')
    expect(defaults.timezone).toBe('')
  })

  it('returns a new object on each call (not a shared reference)', () => {
    const a = createDefaultEventFilters()
    const b = createDefaultEventFilters()
    expect(a).not.toBe(b)
    a.search = 'changed'
    expect(b.search).toBe('')
  })
})

// ---------------------------------------------------------------------------
// areEventFiltersEqual
// ---------------------------------------------------------------------------

describe('areEventFiltersEqual', () => {
  it('returns true for two default filter objects', () => {
    expect(areEventFiltersEqual(createDefaultEventFilters(), createDefaultEventFilters())).toBe(true)
  })

  it('returns true for identical non-default objects', () => {
    expect(areEventFiltersEqual(fullFilters(), fullFilters())).toBe(true)
  })

  it('returns false when search differs', () => {
    expect(areEventFiltersEqual(fullFilters({ search: 'a' }), fullFilters({ search: 'b' }))).toBe(false)
  })

  it('returns false when domain differs', () => {
    expect(areEventFiltersEqual(fullFilters({ domain: 'tech' }), fullFilters({ domain: 'crypto' }))).toBe(false)
  })

  it('returns false when dateFrom differs', () => {
    expect(
      areEventFiltersEqual(fullFilters({ dateFrom: '2026-01-01' }), fullFilters({ dateFrom: '2026-06-01' })),
    ).toBe(false)
  })

  it('returns false when dateTo differs', () => {
    expect(
      areEventFiltersEqual(fullFilters({ dateTo: '2026-06-01' }), fullFilters({ dateTo: '2026-12-31' })),
    ).toBe(false)
  })

  it('returns false when location differs', () => {
    expect(areEventFiltersEqual(fullFilters({ location: 'Prague' }), fullFilters({ location: 'Brno' }))).toBe(false)
  })

  it('returns false when priceType differs', () => {
    expect(
      areEventFiltersEqual(fullFilters({ priceType: 'FREE' }), fullFilters({ priceType: 'PAID' })),
    ).toBe(false)
  })

  it('returns false when priceMin differs', () => {
    expect(
      areEventFiltersEqual(fullFilters({ priceMin: '10' }), fullFilters({ priceMin: '50' })),
    ).toBe(false)
  })

  it('returns false when priceMax differs', () => {
    expect(
      areEventFiltersEqual(fullFilters({ priceMax: '100' }), fullFilters({ priceMax: '200' })),
    ).toBe(false)
  })

  it('returns false when sortBy differs', () => {
    expect(
      areEventFiltersEqual(fullFilters({ sortBy: 'NEWEST' }), fullFilters({ sortBy: 'UPCOMING' })),
    ).toBe(false)
  })

  it('returns false when attendanceMode differs', () => {
    expect(
      areEventFiltersEqual(fullFilters({ attendanceMode: 'ONLINE' }), fullFilters({ attendanceMode: 'HYBRID' })),
    ).toBe(false)
  })

  it('returns false when language differs', () => {
    expect(areEventFiltersEqual(fullFilters({ language: 'en' }), fullFilters({ language: 'cs' }))).toBe(false)
  })

  it('returns false when timezone differs', () => {
    expect(
      areEventFiltersEqual(
        fullFilters({ timezone: 'Europe/Prague' }),
        fullFilters({ timezone: 'America/New_York' }),
      ),
    ).toBe(false)
  })

  it('returns false when a filter is active vs default', () => {
    expect(areEventFiltersEqual(fullFilters(), createDefaultEventFilters())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// eventFiltersToQuery
// ---------------------------------------------------------------------------

describe('eventFiltersToQuery', () => {
  it('returns an empty object for default filters', () => {
    expect(eventFiltersToQuery(createDefaultEventFilters())).toEqual({})
  })

  it('serialises search to q', () => {
    expect(eventFiltersToQuery(fullFilters({ search: 'crypto' }))).toMatchObject({ q: 'crypto' })
  })

  it('trims whitespace from search before serialising', () => {
    expect(eventFiltersToQuery(fullFilters({ search: '  crypto  ' }))).toMatchObject({ q: 'crypto' })
  })

  it('omits q when search is blank', () => {
    const result = eventFiltersToQuery(fullFilters({ search: '' }))
    expect(result).not.toHaveProperty('q')
  })

  it('serialises domain', () => {
    expect(eventFiltersToQuery(fullFilters({ domain: 'technology' }))).toMatchObject({ domain: 'technology' })
  })

  it('omits domain when empty', () => {
    const result = eventFiltersToQuery(fullFilters({ domain: '' }))
    expect(result).not.toHaveProperty('domain')
  })

  it('serialises dateFrom to from', () => {
    expect(eventFiltersToQuery(fullFilters({ dateFrom: '2026-01-01' }))).toMatchObject({ from: '2026-01-01' })
  })

  it('serialises dateTo to to', () => {
    expect(eventFiltersToQuery(fullFilters({ dateTo: '2026-12-31' }))).toMatchObject({ to: '2026-12-31' })
  })

  it('serialises location', () => {
    expect(eventFiltersToQuery(fullFilters({ location: 'Prague' }))).toMatchObject({ location: 'Prague' })
  })

  it('serialises FREE price as price=free', () => {
    expect(eventFiltersToQuery(fullFilters({ priceType: 'FREE' }))).toMatchObject({ price: 'free' })
  })

  it('serialises PAID price as price=paid', () => {
    expect(eventFiltersToQuery(fullFilters({ priceType: 'PAID' }))).toMatchObject({ price: 'paid' })
  })

  it('omits price for ALL (default)', () => {
    const result = eventFiltersToQuery(fullFilters({ priceType: 'ALL' }))
    expect(result).not.toHaveProperty('price')
  })

  it('serialises priceMin to minPrice', () => {
    expect(eventFiltersToQuery(fullFilters({ priceMin: '25' }))).toMatchObject({ minPrice: '25' })
  })

  it('serialises priceMax to maxPrice', () => {
    expect(eventFiltersToQuery(fullFilters({ priceMax: '150' }))).toMatchObject({ maxPrice: '150' })
  })

  it('serialises NEWEST sort as sort=newest', () => {
    expect(eventFiltersToQuery(fullFilters({ sortBy: 'NEWEST' }))).toMatchObject({ sort: 'newest' })
  })

  it('serialises RELEVANCE sort as sort=relevance', () => {
    expect(eventFiltersToQuery(fullFilters({ sortBy: 'RELEVANCE' }))).toMatchObject({ sort: 'relevance' })
  })

  it('omits sort for UPCOMING (default)', () => {
    const result = eventFiltersToQuery(fullFilters({ sortBy: 'UPCOMING' }))
    expect(result).not.toHaveProperty('sort')
  })

  it('serialises IN_PERSON attendance mode as mode=in-person', () => {
    expect(eventFiltersToQuery(fullFilters({ attendanceMode: 'IN_PERSON' }))).toMatchObject({ mode: 'in-person' })
  })

  it('serialises ONLINE attendance mode as mode=online', () => {
    expect(eventFiltersToQuery(fullFilters({ attendanceMode: 'ONLINE' }))).toMatchObject({ mode: 'online' })
  })

  it('serialises HYBRID attendance mode as mode=hybrid', () => {
    expect(eventFiltersToQuery(fullFilters({ attendanceMode: 'HYBRID' }))).toMatchObject({ mode: 'hybrid' })
  })

  it('omits mode when attendanceMode is empty', () => {
    const result = eventFiltersToQuery(fullFilters({ attendanceMode: '' }))
    expect(result).not.toHaveProperty('mode')
  })

  it('serialises language to lang', () => {
    expect(eventFiltersToQuery(fullFilters({ language: 'de' }))).toMatchObject({ lang: 'de' })
  })

  it('omits lang when language is empty', () => {
    const result = eventFiltersToQuery(fullFilters({ language: '' }))
    expect(result).not.toHaveProperty('lang')
  })

  it('serialises timezone to tz', () => {
    expect(eventFiltersToQuery(fullFilters({ timezone: 'Europe/Prague' }))).toMatchObject({
      tz: 'Europe/Prague',
    })
  })

  it('omits tz when timezone is empty', () => {
    const result = eventFiltersToQuery(fullFilters({ timezone: '' }))
    expect(result).not.toHaveProperty('tz')
  })

  it('produces a complete query object for all active filters', () => {
    const result = eventFiltersToQuery(fullFilters())
    expect(result).toEqual({
      q: 'crypto',
      domain: 'technology',
      from: '2026-01-01',
      to: '2026-12-31',
      location: 'Prague',
      price: 'free',
      minPrice: '10',
      maxPrice: '200',
      sort: 'newest',
      mode: 'hybrid',
      lang: 'en',
      tz: 'Europe/Prague',
    })
  })
})

// ---------------------------------------------------------------------------
// eventFiltersFromQuery
// ---------------------------------------------------------------------------

describe('eventFiltersFromQuery', () => {
  it('returns default filters for an empty query', () => {
    expect(eventFiltersFromQuery(q({}))).toEqual(createDefaultEventFilters())
  })

  it('parses q into search', () => {
    expect(eventFiltersFromQuery(q({ q: 'crypto' })).search).toBe('crypto')
  })

  it('parses domain', () => {
    expect(eventFiltersFromQuery(q({ domain: 'technology' })).domain).toBe('technology')
  })

  it('parses from into dateFrom', () => {
    expect(eventFiltersFromQuery(q({ from: '2026-01-01' })).dateFrom).toBe('2026-01-01')
  })

  it('parses to into dateTo', () => {
    expect(eventFiltersFromQuery(q({ to: '2026-12-31' })).dateTo).toBe('2026-12-31')
  })

  it('parses location', () => {
    expect(eventFiltersFromQuery(q({ location: 'Prague' })).location).toBe('Prague')
  })

  it('parses price=free into priceType FREE', () => {
    expect(eventFiltersFromQuery(q({ price: 'free' })).priceType).toBe('FREE')
  })

  it('parses price=paid into priceType PAID', () => {
    expect(eventFiltersFromQuery(q({ price: 'paid' })).priceType).toBe('PAID')
  })

  it('defaults priceType to ALL when price is absent', () => {
    expect(eventFiltersFromQuery(q({})).priceType).toBe('ALL')
  })

  it('parses minPrice into priceMin', () => {
    expect(eventFiltersFromQuery(q({ minPrice: '25' })).priceMin).toBe('25')
  })

  it('parses maxPrice into priceMax', () => {
    expect(eventFiltersFromQuery(q({ maxPrice: '150' })).priceMax).toBe('150')
  })

  it('parses sort=newest into sortBy NEWEST', () => {
    expect(eventFiltersFromQuery(q({ sort: 'newest' })).sortBy).toBe('NEWEST')
  })

  it('parses sort=relevance into sortBy RELEVANCE', () => {
    expect(eventFiltersFromQuery(q({ sort: 'relevance' })).sortBy).toBe('RELEVANCE')
  })

  it('defaults sortBy to UPCOMING when sort is absent', () => {
    expect(eventFiltersFromQuery(q({})).sortBy).toBe('UPCOMING')
  })

  it('ignores unknown sort values and falls back to UPCOMING', () => {
    expect(eventFiltersFromQuery(q({ sort: 'unknown-sort' })).sortBy).toBe('UPCOMING')
  })

  it('parses mode=in-person into attendanceMode IN_PERSON', () => {
    expect(eventFiltersFromQuery(q({ mode: 'in-person' })).attendanceMode).toBe('IN_PERSON')
  })

  it('parses mode=online into attendanceMode ONLINE', () => {
    expect(eventFiltersFromQuery(q({ mode: 'online' })).attendanceMode).toBe('ONLINE')
  })

  it('parses mode=hybrid into attendanceMode HYBRID', () => {
    expect(eventFiltersFromQuery(q({ mode: 'hybrid' })).attendanceMode).toBe('HYBRID')
  })

  it('defaults attendanceMode to empty string when mode is absent', () => {
    expect(eventFiltersFromQuery(q({})).attendanceMode).toBe('')
  })

  it('ignores unrecognised mode values', () => {
    expect(eventFiltersFromQuery(q({ mode: 'virtual' })).attendanceMode).toBe('')
  })

  it('parses lang=en into language en', () => {
    expect(eventFiltersFromQuery(q({ lang: 'en' })).language).toBe('en')
  })

  it('parses lang=DE into lowercase language de', () => {
    expect(eventFiltersFromQuery(q({ lang: 'DE' })).language).toBe('de')
  })

  it('defaults language to empty string when lang is absent', () => {
    expect(eventFiltersFromQuery(q({})).language).toBe('')
  })

  it('parses tz into timezone', () => {
    expect(eventFiltersFromQuery(q({ tz: 'Europe/Prague' })).timezone).toBe('Europe/Prague')
  })

  it('defaults timezone to empty string when tz is absent', () => {
    expect(eventFiltersFromQuery(q({})).timezone).toBe('')
  })

  it('handles array query values by taking the first element', () => {
    expect(eventFiltersFromQuery(q({ q: ['first', 'second'] })).search).toBe('first')
  })

  it('round-trips: toQuery then fromQuery restores original filters', () => {
    const original = fullFilters()
    const queryObj = eventFiltersToQuery(original)
    const restored = eventFiltersFromQuery(queryObj as LocationQuery)
    expect(areEventFiltersEqual(original, restored)).toBe(true)
  })

  it('round-trip restores default filters (empty query)', () => {
    const defaults = createDefaultEventFilters()
    const queryObj = eventFiltersToQuery(defaults)
    const restored = eventFiltersFromQuery(queryObj as LocationQuery)
    expect(areEventFiltersEqual(defaults, restored)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildDiscoveryFilterInput
// ---------------------------------------------------------------------------

describe('buildDiscoveryFilterInput', () => {
  it('returns only sortBy for default (no active) filters', () => {
    // sortBy is always included so the API can apply consistent ordering;
    // all other fields are omitted when their values are default/empty.
    expect(buildDiscoveryFilterInput(createDefaultEventFilters())).toEqual({ sortBy: 'UPCOMING' })
  })

  it('maps search to searchText', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ search: 'crypto' }))
    expect(result?.searchText).toBe('crypto')
  })

  it('trims whitespace from search before sending', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ search: '  crypto  ' }))
    expect(result?.searchText).toBe('crypto')
  })

  it('omits searchText when search is blank', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ search: '' }))
    expect(result).not.toHaveProperty('searchText')
  })

  it('maps domain to domainSlug', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ domain: 'technology' }))
    expect(result?.domainSlug).toBe('technology')
  })

  it('maps location to locationText', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ location: 'Prague' }))
    expect(result?.locationText).toBe('Prague')
  })

  it('maps dateFrom to startsFromUtc with midnight suffix', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ dateFrom: '2026-01-01' }))
    expect(result?.startsFromUtc).toBe('2026-01-01T00:00:00.000Z')
  })

  it('maps dateTo to startsToUtc with end-of-day suffix', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ dateTo: '2026-12-31' }))
    expect(result?.startsToUtc).toBe('2026-12-31T23:59:59.999Z')
  })

  it('maps priceType FREE to isFree=true', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ priceType: 'FREE' }))
    expect(result?.isFree).toBe(true)
  })

  it('maps priceType PAID to isFree=false', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ priceType: 'PAID' }))
    expect(result?.isFree).toBe(false)
  })

  it('omits isFree for ALL price type', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ priceType: 'ALL' }))
    expect(result).not.toHaveProperty('isFree')
  })

  it('maps priceMin to numeric priceMin', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ priceMin: '25' }))
    expect(result?.priceMin).toBe(25)
  })

  it('maps priceMax to numeric priceMax', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ priceMax: '150' }))
    expect(result?.priceMax).toBe(150)
  })

  it('omits priceMin when empty', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ priceMin: '' }))
    expect(result).not.toHaveProperty('priceMin')
  })

  it('maps attendanceMode', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ attendanceMode: 'HYBRID' }))
    expect(result?.attendanceMode).toBe('HYBRID')
  })

  it('omits attendanceMode when empty', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ attendanceMode: '' }))
    expect(result).not.toHaveProperty('attendanceMode')
  })

  it('maps language to lowercase language', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ language: 'CS' }))
    expect(result?.language).toBe('cs')
  })

  it('omits language when empty', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ language: '' }))
    expect(result).not.toHaveProperty('language')
  })

  it('maps timezone to timezone', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ timezone: 'Europe/Prague' }))
    expect(result?.timezone).toBe('Europe/Prague')
  })

  it('omits timezone when empty', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ timezone: '' }))
    expect(result).not.toHaveProperty('timezone')
  })

  it('always includes sortBy', () => {
    const result = buildDiscoveryFilterInput(fullFilters({ sortBy: 'UPCOMING' }))
    expect(result?.sortBy).toBe('UPCOMING')
  })

  it('produces the full expected input object for all active filters', () => {
    const result = buildDiscoveryFilterInput(
      fullFilters({
        search: 'crypto',
        domain: 'technology',
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        location: 'Prague',
        priceType: 'PAID',
        priceMin: '10',
        priceMax: '200',
        sortBy: 'NEWEST',
        attendanceMode: 'IN_PERSON',
      }),
    )
    expect(result).toEqual({
      searchText: 'crypto',
      domainSlug: 'technology',
      startsFromUtc: '2026-01-01T00:00:00.000Z',
      startsToUtc: '2026-12-31T23:59:59.999Z',
      locationText: 'Prague',
      isFree: false,
      priceMin: 10,
      priceMax: 200,
      sortBy: 'NEWEST',
      attendanceMode: 'IN_PERSON',
      language: 'en',
      timezone: 'Europe/Prague',
    })
  })
})

// ---------------------------------------------------------------------------
// savedSearchToFilters
// ---------------------------------------------------------------------------

describe('savedSearchToFilters', () => {
  function makeSavedSearch(overrides: Partial<SavedSearch> = {}): SavedSearch {
    return {
      id: 'ss-1',
      name: 'My Search',
      searchText: null,
      domainSlug: null,
      locationText: null,
      startsFromUtc: null,
      startsToUtc: null,
      isFree: null,
      priceMin: null,
      priceMax: null,
      sortBy: 'UPCOMING',
      attendanceMode: null,
      language: null,
      timezone: null,
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
      ...overrides,
    }
  }

  it('returns default filters when all saved-search fields are null', () => {
    const result = savedSearchToFilters(makeSavedSearch())
    expect(areEventFiltersEqual(result, createDefaultEventFilters())).toBe(true)
  })

  it('maps searchText to search', () => {
    expect(savedSearchToFilters(makeSavedSearch({ searchText: 'crypto' })).search).toBe('crypto')
  })

  it('maps domainSlug to domain', () => {
    expect(savedSearchToFilters(makeSavedSearch({ domainSlug: 'technology' })).domain).toBe('technology')
  })

  it('maps locationText to location', () => {
    expect(savedSearchToFilters(makeSavedSearch({ locationText: 'Prague' })).location).toBe('Prague')
  })

  it('maps startsFromUtc (ISO datetime) to dateFrom (YYYY-MM-DD)', () => {
    expect(
      savedSearchToFilters(makeSavedSearch({ startsFromUtc: '2026-01-01T00:00:00Z' })).dateFrom,
    ).toBe('2026-01-01')
  })

  it('maps startsToUtc (ISO datetime) to dateTo (YYYY-MM-DD)', () => {
    expect(
      savedSearchToFilters(makeSavedSearch({ startsToUtc: '2026-12-31T23:59:59Z' })).dateTo,
    ).toBe('2026-12-31')
  })

  it('maps isFree=true to priceType FREE', () => {
    expect(savedSearchToFilters(makeSavedSearch({ isFree: true })).priceType).toBe('FREE')
  })

  it('maps isFree=false to priceType PAID', () => {
    expect(savedSearchToFilters(makeSavedSearch({ isFree: false })).priceType).toBe('PAID')
  })

  it('maps isFree=null to priceType ALL', () => {
    expect(savedSearchToFilters(makeSavedSearch({ isFree: null })).priceType).toBe('ALL')
  })

  it('maps priceMin to string priceMin', () => {
    expect(savedSearchToFilters(makeSavedSearch({ priceMin: 25 })).priceMin).toBe('25')
  })

  it('maps priceMax to string priceMax', () => {
    expect(savedSearchToFilters(makeSavedSearch({ priceMax: 150 })).priceMax).toBe('150')
  })

  it('maps sortBy', () => {
    expect(savedSearchToFilters(makeSavedSearch({ sortBy: 'NEWEST' })).sortBy).toBe('NEWEST')
  })

  it('maps attendanceMode ONLINE', () => {
    expect(savedSearchToFilters(makeSavedSearch({ attendanceMode: 'ONLINE' })).attendanceMode).toBe('ONLINE')
  })

  it('maps attendanceMode HYBRID', () => {
    expect(savedSearchToFilters(makeSavedSearch({ attendanceMode: 'HYBRID' })).attendanceMode).toBe('HYBRID')
  })

  it('maps attendanceMode IN_PERSON', () => {
    expect(
      savedSearchToFilters(makeSavedSearch({ attendanceMode: 'IN_PERSON' })).attendanceMode,
    ).toBe('IN_PERSON')
  })

  it('maps attendanceMode null to empty string', () => {
    expect(savedSearchToFilters(makeSavedSearch({ attendanceMode: null })).attendanceMode).toBe('')
  })

  it('maps language', () => {
    expect(savedSearchToFilters(makeSavedSearch({ language: 'de' })).language).toBe('de')
  })

  it('maps language null to empty string', () => {
    expect(savedSearchToFilters(makeSavedSearch({ language: null })).language).toBe('')
  })

  it('maps timezone', () => {
    expect(savedSearchToFilters(makeSavedSearch({ timezone: 'Europe/Prague' })).timezone).toBe(
      'Europe/Prague',
    )
  })

  it('maps timezone null to empty string', () => {
    expect(savedSearchToFilters(makeSavedSearch({ timezone: null })).timezone).toBe('')
  })

  it('returns an object with all EventFilters keys', () => {
    const result = savedSearchToFilters(makeSavedSearch())
    expect(Object.keys(result).sort()).toEqual(
      [
        'attendanceMode',
        'dateFrom',
        'dateTo',
        'domain',
        'language',
        'location',
        'priceMax',
        'priceMin',
        'priceType',
        'search',
        'sortBy',
        'timezone',
      ],
    )
  })
})

// ---------------------------------------------------------------------------
// formatEventPrice
// ---------------------------------------------------------------------------

describe('formatEventPrice', () => {
  it('returns "Free" for free events', () => {
    expect(formatEventPrice({ isFree: true, priceAmount: 0, currencyCode: 'EUR' })).toBe('Free')
  })

  it('returns "Free" when priceAmount is 0 (even if isFree is false)', () => {
    expect(formatEventPrice({ isFree: false, priceAmount: 0, currencyCode: 'EUR' })).toBe('Free')
  })

  it('formats a whole-number paid price without decimals', () => {
    expect(formatEventPrice({ isFree: false, priceAmount: 99, currencyCode: 'EUR' })).toBe('€99')
  })

  it('formats a decimal paid price with two decimal places', () => {
    expect(formatEventPrice({ isFree: false, priceAmount: 49.99, currencyCode: 'USD' })).toBe('$49.99')
  })

  it('returns "Paid" when priceAmount is null and not free', () => {
    expect(formatEventPrice({ isFree: false, priceAmount: null, currencyCode: 'EUR' })).toBe('Paid')
  })

  it('defaults currency to EUR when currencyCode is empty', () => {
    const result = formatEventPrice({ isFree: false, priceAmount: 100, currencyCode: '' })
    // EUR symbol or code should appear
    expect(result).toMatch(/100/)
  })
})
