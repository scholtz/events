/**
 * discoveryRecovery – pure utilities for computing empty-state messages and
 * context-aware recovery suggestions on the main discovery page.
 *
 * All functions are pure (no store or router access) so they can be unit-tested
 * independently from the Vue component.
 */

import type { EventFilters } from '@/types'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

type FilterChip = {
  key: string
}

// ---------------------------------------------------------------------------
// Empty-state message
// ---------------------------------------------------------------------------

/**
 * Returns the contextual paragraph shown below the "No events found" heading.
 *
 * - When no filters are active: generic "no events yet" message.
 * - When exactly one filter is active: a targeted hint naming the constraint.
 * - When multiple filters are active: a compact "N active filters" hint.
 */
export function computeEmptyStateMessage(
  filters: EventFilters,
  chips: FilterChip[],
  hasActiveFilters: boolean,
  t: TranslateFn,
): string {
  if (!hasActiveFilters) {
    return t('home.emptyNoEvents')
  }

  const activeChips = chips.filter((c) => c.key !== 'sortBy')
  const filterCount = activeChips.length

  if (filterCount === 1) {
    const chip = activeChips[0]
    if (!chip) return t('home.emptyGeneric')

    if (chip.key === 'location') {
      return t('home.emptyLocation', { location: filters.location })
    }
    if (chip.key === 'search') {
      return t('home.emptySearch', { search: filters.search })
    }
    if (chip.key === 'attendanceMode') {
      if (filters.attendanceMode === 'IN_PERSON') return t('home.emptyModeInPerson')
      if (filters.attendanceMode === 'ONLINE') return t('home.emptyModeOnline')
      return t('home.emptyModeHybrid')
    }
    if (chip.key === 'priceType') {
      return filters.priceType === 'FREE' ? t('home.emptyPriceFree') : t('home.emptyPricePaid')
    }
    if (chip.key === 'dateFrom' || chip.key === 'dateTo') {
      return t('home.emptyDate')
    }
    if (chip.key === 'domain') {
      return t('home.emptyDomain')
    }
    if (chip.key === 'timezone') {
      return t('home.emptyTimezone', { timezone: filters.timezone })
    }
    if (chip.key === 'language') {
      return t('home.emptyLanguage', { language: filters.language })
    }
  }

  if (filterCount > 1) {
    return t('home.emptyMultiple', { count: filterCount })
  }

  return t('home.emptyGeneric')
}

// ---------------------------------------------------------------------------
// Recovery suggestion label
// ---------------------------------------------------------------------------

/**
 * Returns the label for the secondary recovery action button shown in the
 * empty state alongside the primary "Clear filters" button.
 *
 * Returns `null` when:
 * - No filters are active (no recovery button needed).
 * - Multiple non-date filters are active (too many combinations to suggest
 *   a single targeted action — just clear all).
 * - The active chip does not have a known targeted suggestion.
 *
 * When ALL active chips are date chips, "Clear date range" is returned even
 * though more than one chip is present (dateFrom + dateTo = one logical constraint).
 */
export function computeRecoverySuggestionLabel(
  filters: EventFilters,
  chips: FilterChip[],
  hasActiveFilters: boolean,
  t: TranslateFn,
): string | null {
  if (!hasActiveFilters) return null

  const activeChips = chips.filter((c) => c.key !== 'sortBy')
  if (activeChips.length === 0) return null

  // If ALL active chips are date chips, offer "Clear date range"
  const dateKeys = new Set(['dateFrom', 'dateTo'])
  if (activeChips.every((c) => dateKeys.has(c.key))) {
    return t('home.recoveryClearDates')
  }

  // Only one non-date chip: offer a targeted suggestion
  if (activeChips.length !== 1) return null
  const chip = activeChips[0]
  if (!chip) return null

  if (chip.key === 'attendanceMode') {
    if (filters.attendanceMode === 'IN_PERSON') return t('home.recoveryTryOnline')
    if (filters.attendanceMode === 'ONLINE') return t('home.recoveryTryInPerson')
  }

  if (chip.key === 'location') {
    return t('home.recoveryTryOnline')
  }

  if (chip.key === 'priceType') {
    return t('home.recoveryShowAllPrices')
  }

  if (chip.key === 'domain') {
    return t('home.recoveryClearDomainTag')
  }

  return null
}

// ---------------------------------------------------------------------------
// Low-signal message
// ---------------------------------------------------------------------------

const LOW_SIGNAL_THRESHOLD = 3

/**
 * Returns the low-signal guidance message when the result set is thin but
 * non-empty (between 1 and LOW_SIGNAL_THRESHOLD results inclusive).
 *
 * Returns `null` when:
 * - There are no results.
 * - There are more results than the threshold (normal state).
 */
export function computeLowSignalMessage(eventCount: number, t: TranslateFn): string | null {
  if (eventCount === 0 || eventCount > LOW_SIGNAL_THRESHOLD) return null
  return eventCount === 1
    ? t('home.fewResultsOne')
    : t('home.fewResultsMany', { count: eventCount })
}
