/**
 * Unit tests for discoveryRecovery pure utilities.
 *
 * All functions under test are pure (no stores, no router, no Vue), so these
 * tests run synchronously with a minimal `t()` stub that echoes key names and
 * interpolates params — enough to verify branching logic without needing the
 * full i18n runtime.
 */

import { describe, expect, it } from 'vitest'
import type { EventFilters } from '@/types'
import {
  computeEmptyStateMessage,
  computeLowSignalMessage,
  computeRecoverySuggestion,
  computeRecoverySuggestionLabel,
} from '@/lib/discoveryRecovery'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal translate stub: returns "{key}" or "{key}:{params}" for assertions. */
function stubT(key: string, params?: Record<string, unknown>): string {
  if (!params) return key
  const pairs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')
  return `${key}:${pairs}`
}

type Chip = { key: string }

function defaultFilters(overrides: Partial<EventFilters> = {}): EventFilters {
  return {
    search: '',
    domain: '',
    dateFrom: '',
    dateTo: '',
    location: '',
    priceType: 'ALL',
    priceMin: '',
    priceMax: '',
    sortBy: 'UPCOMING',
    attendanceMode: '',
    language: '',
    timezone: '',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// computeEmptyStateMessage
// ---------------------------------------------------------------------------

describe('computeEmptyStateMessage', () => {
  it('returns emptyNoEvents when no filters are active', () => {
    const result = computeEmptyStateMessage(defaultFilters(), [], false, stubT)
    expect(result).toBe('home.emptyNoEvents')
  })

  it('returns emptyGeneric when hasActiveFilters is true but no chips (edge case)', () => {
    const result = computeEmptyStateMessage(defaultFilters(), [], true, stubT)
    expect(result).toBe('home.emptyGeneric')
  })

  it('returns location-specific message for single location chip', () => {
    const chips: Chip[] = [{ key: 'location' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ location: 'Berlin' }),
      chips,
      true,
      stubT,
    )
    expect(result).toContain('home.emptyLocation')
    expect(result).toContain('Berlin')
  })

  it('returns search-specific message for single search chip', () => {
    const chips: Chip[] = [{ key: 'search' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ search: 'nonexistent-xyz' }),
      chips,
      true,
      stubT,
    )
    expect(result).toContain('home.emptySearch')
    expect(result).toContain('nonexistent-xyz')
  })

  it('returns IN_PERSON mode message for attendanceMode=IN_PERSON chip', () => {
    const chips: Chip[] = [{ key: 'attendanceMode' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ attendanceMode: 'IN_PERSON' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.emptyModeInPerson')
  })

  it('returns ONLINE mode message for attendanceMode=ONLINE chip', () => {
    const chips: Chip[] = [{ key: 'attendanceMode' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ attendanceMode: 'ONLINE' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.emptyModeOnline')
  })

  it('returns HYBRID mode message for attendanceMode=HYBRID chip', () => {
    const chips: Chip[] = [{ key: 'attendanceMode' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ attendanceMode: 'HYBRID' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.emptyModeHybrid')
  })

  it('returns FREE price message for priceType=FREE chip', () => {
    const chips: Chip[] = [{ key: 'priceType' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ priceType: 'FREE' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.emptyPriceFree')
  })

  it('returns PAID price message for priceType=PAID chip', () => {
    const chips: Chip[] = [{ key: 'priceType' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ priceType: 'PAID' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.emptyPricePaid')
  })

  it('returns date message for dateFrom chip', () => {
    const chips: Chip[] = [{ key: 'dateFrom' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ dateFrom: '2026-01-01' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.emptyDate')
  })

  it('returns date message for dateTo chip', () => {
    const chips: Chip[] = [{ key: 'dateTo' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ dateTo: '2026-12-31' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.emptyDate')
  })

  it('returns domain message for domain chip', () => {
    const chips: Chip[] = [{ key: 'domain' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ domain: 'technology' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.emptyDomain')
  })

  it('returns timezone-specific message for timezone chip', () => {
    const chips: Chip[] = [{ key: 'timezone' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ timezone: 'America/New_York' }),
      chips,
      true,
      stubT,
    )
    expect(result).toContain('home.emptyTimezone')
    expect(result).toContain('America/New_York')
  })

  it('returns language-specific message for language chip', () => {
    const chips: Chip[] = [{ key: 'language' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ language: 'de' }),
      chips,
      true,
      stubT,
    )
    expect(result).toContain('home.emptyLanguage')
    expect(result).toContain('de')
  })

  it('returns multiple-filter message when 2 non-sortBy chips are active', () => {
    const chips: Chip[] = [{ key: 'location' }, { key: 'attendanceMode' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ location: 'Berlin', attendanceMode: 'ONLINE' }),
      chips,
      true,
      stubT,
    )
    expect(result).toContain('home.emptyMultiple')
    expect(result).toContain('2')
  })

  it('ignores sortBy chip when counting active filters', () => {
    const chips: Chip[] = [{ key: 'sortBy' }, { key: 'location' }]
    const result = computeEmptyStateMessage(
      defaultFilters({ location: 'Berlin', sortBy: 'NEWEST' }),
      chips,
      true,
      stubT,
    )
    // Only 1 real filter (location) → location-specific message, not multi
    expect(result).toContain('home.emptyLocation')
  })
})

// ---------------------------------------------------------------------------
// computeRecoverySuggestionLabel
// ---------------------------------------------------------------------------

describe('computeRecoverySuggestionLabel', () => {
  it('returns null when no filters are active', () => {
    expect(computeRecoverySuggestionLabel(defaultFilters(), [], false, stubT)).toBeNull()
  })

  it('returns null when active chips array is empty', () => {
    expect(computeRecoverySuggestionLabel(defaultFilters(), [], true, stubT)).toBeNull()
  })

  it('returns recoveryClearDates when only dateFrom chip is active', () => {
    const chips: Chip[] = [{ key: 'dateFrom' }]
    const result = computeRecoverySuggestionLabel(
      defaultFilters({ dateFrom: '2026-01-01' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.recoveryClearDates')
  })

  it('returns recoveryClearDates when both dateFrom and dateTo chips are active', () => {
    const chips: Chip[] = [{ key: 'dateFrom' }, { key: 'dateTo' }]
    const result = computeRecoverySuggestionLabel(
      defaultFilters({ dateFrom: '2026-01-01', dateTo: '2026-12-31' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.recoveryClearDates')
  })

  it('returns recoveryTryOnline for attendanceMode=IN_PERSON', () => {
    const chips: Chip[] = [{ key: 'attendanceMode' }]
    const result = computeRecoverySuggestionLabel(
      defaultFilters({ attendanceMode: 'IN_PERSON' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.recoveryTryOnline')
  })

  it('returns recoveryTryInPerson for attendanceMode=ONLINE', () => {
    const chips: Chip[] = [{ key: 'attendanceMode' }]
    const result = computeRecoverySuggestionLabel(
      defaultFilters({ attendanceMode: 'ONLINE' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.recoveryTryInPerson')
  })

  it('returns null for attendanceMode=HYBRID (no direct opposite)', () => {
    const chips: Chip[] = [{ key: 'attendanceMode' }]
    const result = computeRecoverySuggestionLabel(
      defaultFilters({ attendanceMode: 'HYBRID' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBeNull()
  })

  it('returns recoveryTryOnline for location chip', () => {
    const chips: Chip[] = [{ key: 'location' }]
    const result = computeRecoverySuggestionLabel(
      defaultFilters({ location: 'Berlin' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.recoveryTryOnline')
  })

  it('returns recoveryShowAllPrices for priceType chip', () => {
    const chips: Chip[] = [{ key: 'priceType' }]
    const result = computeRecoverySuggestionLabel(
      defaultFilters({ priceType: 'FREE' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.recoveryShowAllPrices')
  })

  it('returns recoveryClearDomainTag for domain chip', () => {
    const chips: Chip[] = [{ key: 'domain' }]
    const result = computeRecoverySuggestionLabel(
      defaultFilters({ domain: 'technology' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBe('home.recoveryClearDomainTag')
  })

  it('returns null for multiple non-date chips (ambiguous — just clear all)', () => {
    const chips: Chip[] = [{ key: 'location' }, { key: 'attendanceMode' }]
    const result = computeRecoverySuggestionLabel(
      defaultFilters({ location: 'Berlin', attendanceMode: 'IN_PERSON' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBeNull()
  })

  it('returns null for search chip (no obvious secondary action)', () => {
    const chips: Chip[] = [{ key: 'search' }]
    const result = computeRecoverySuggestionLabel(
      defaultFilters({ search: 'something' }),
      chips,
      true,
      stubT,
    )
    expect(result).toBeNull()
  })

  it('ignores sortBy chip when computing suggestions', () => {
    const chips: Chip[] = [{ key: 'sortBy' }, { key: 'attendanceMode' }]
    const result = computeRecoverySuggestionLabel(
      defaultFilters({ attendanceMode: 'IN_PERSON', sortBy: 'NEWEST' }),
      chips,
      true,
      stubT,
    )
    // Only 1 real filter (attendanceMode) → suggestion based on attendanceMode
    expect(result).toBe('home.recoveryTryOnline')
  })
})

// ---------------------------------------------------------------------------
// computeLowSignalMessage
// ---------------------------------------------------------------------------

describe('computeLowSignalMessage', () => {
  it('returns null for zero events', () => {
    expect(computeLowSignalMessage(0, stubT)).toBeNull()
  })

  it('returns singular message for exactly 1 event', () => {
    const result = computeLowSignalMessage(1, stubT)
    expect(result).toBe('home.fewResultsOne')
  })

  it('returns plural message for 2 events', () => {
    const result = computeLowSignalMessage(2, stubT)
    expect(result).toContain('home.fewResultsMany')
    expect(result).toContain('2')
  })

  it('returns plural message for 3 events (threshold boundary)', () => {
    const result = computeLowSignalMessage(3, stubT)
    expect(result).toContain('home.fewResultsMany')
    expect(result).toContain('3')
  })

  it('returns null for 4 events (above threshold)', () => {
    expect(computeLowSignalMessage(4, stubT)).toBeNull()
  })

  it('returns null for large event counts', () => {
    expect(computeLowSignalMessage(100, stubT)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// computeRecoverySuggestion (structured form with actionKey)
// ---------------------------------------------------------------------------

describe('computeRecoverySuggestion', () => {
  it('returns null when no filters are active', () => {
    expect(computeRecoverySuggestion(defaultFilters(), [], false, stubT)).toBeNull()
  })

  it('returns actionKey clearDates for date-only chips', () => {
    const chips: Chip[] = [{ key: 'dateFrom' }, { key: 'dateTo' }]
    const result = computeRecoverySuggestion(
      defaultFilters({ dateFrom: '2026-01-01', dateTo: '2026-12-31' }),
      chips,
      true,
      stubT,
    )
    expect(result?.actionKey).toBe('clearDates')
    expect(result?.label).toBe('home.recoveryClearDates')
  })

  it('returns actionKey tryOnline for IN_PERSON mode', () => {
    const chips: Chip[] = [{ key: 'attendanceMode' }]
    const result = computeRecoverySuggestion(
      defaultFilters({ attendanceMode: 'IN_PERSON' }),
      chips,
      true,
      stubT,
    )
    expect(result?.actionKey).toBe('tryOnline')
  })

  it('returns actionKey tryInPerson for ONLINE mode', () => {
    const chips: Chip[] = [{ key: 'attendanceMode' }]
    const result = computeRecoverySuggestion(
      defaultFilters({ attendanceMode: 'ONLINE' }),
      chips,
      true,
      stubT,
    )
    expect(result?.actionKey).toBe('tryInPerson')
  })

  it('returns actionKey tryOnlineFromLocation for location chip', () => {
    const chips: Chip[] = [{ key: 'location' }]
    const result = computeRecoverySuggestion(
      defaultFilters({ location: 'Berlin' }),
      chips,
      true,
      stubT,
    )
    expect(result?.actionKey).toBe('tryOnlineFromLocation')
  })

  it('returns actionKey clearPrice for priceType chip', () => {
    const chips: Chip[] = [{ key: 'priceType' }]
    const result = computeRecoverySuggestion(
      defaultFilters({ priceType: 'FREE' }),
      chips,
      true,
      stubT,
    )
    expect(result?.actionKey).toBe('clearPrice')
  })

  it('returns actionKey clearDomain for domain chip', () => {
    const chips: Chip[] = [{ key: 'domain' }]
    const result = computeRecoverySuggestion(
      defaultFilters({ domain: 'technology' }),
      chips,
      true,
      stubT,
    )
    expect(result?.actionKey).toBe('clearDomain')
  })
})
