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
 * Returns the label and the logical action key for the secondary recovery
 * button shown in the empty state alongside the primary "Clear filters" button.
 *
 * The action key allows the component to map the suggestion back to a concrete
 * side-effect without re-running the chip-filtering logic a second time.
 *
 * Returns `null` when no targeted suggestion is applicable (no filters active,
 * multiple conflicting filters, or chip type with no obvious single next step).
 */
export function computeRecoverySuggestion(
  filters: EventFilters,
  chips: FilterChip[],
  hasActiveFilters: boolean,
  t: TranslateFn,
): { label: string; actionKey: string } | null {
  if (!hasActiveFilters) return null

  const activeChips = chips.filter((c) => c.key !== 'sortBy')
  if (activeChips.length === 0) return null

  // All chips are date chips → "Clear date range"
  const dateKeys = new Set(['dateFrom', 'dateTo'])
  if (activeChips.every((c) => dateKeys.has(c.key))) {
    return { label: t('home.recoveryClearDates'), actionKey: 'clearDates' }
  }

  if (activeChips.length !== 1) return null
  const chip = activeChips[0]
  if (!chip) return null

  if (chip.key === 'attendanceMode') {
    if (filters.attendanceMode === 'IN_PERSON') {
      return { label: t('home.recoveryTryOnline'), actionKey: 'tryOnline' }
    }
    if (filters.attendanceMode === 'ONLINE') {
      return { label: t('home.recoveryTryInPerson'), actionKey: 'tryInPerson' }
    }
  }

  if (chip.key === 'location') {
    return { label: t('home.recoveryTryOnline'), actionKey: 'tryOnlineFromLocation' }
  }

  if (chip.key === 'priceType') {
    return { label: t('home.recoveryShowAllPrices'), actionKey: 'clearPrice' }
  }

  if (chip.key === 'domain') {
    return { label: t('home.recoveryClearDomainTag'), actionKey: 'clearDomain' }
  }

  return null
}

/**
 * Convenience wrapper that returns only the suggestion label.
 * Useful for tests and callers that don't need the action key.
 */
export function computeRecoverySuggestionLabel(
  filters: EventFilters,
  chips: FilterChip[],
  hasActiveFilters: boolean,
  t: TranslateFn,
): string | null {
  return computeRecoverySuggestion(filters, chips, hasActiveFilters, t)?.label ?? null
}

// ---------------------------------------------------------------------------
// Saved-search empty-state message
// ---------------------------------------------------------------------------

/**
 * Returns a context-aware message explaining that a saved search preset
 * currently has no matches. The message reassures the user that this is
 * likely temporary and suggests checking back later or broadening the search.
 *
 * Returns `null` when no saved search is currently active.
 */
export function computeSavedSearchEmptyStateMessage(
  savedSearchName: string | null,
  t: TranslateFn,
): string | null {
  if (!savedSearchName) return null
  return t('home.savedSearchEmpty', { name: savedSearchName })
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
