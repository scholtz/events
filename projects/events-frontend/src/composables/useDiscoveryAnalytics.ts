/**
 * useDiscoveryAnalytics – privacy-conscious instrumentation for event discovery interactions.
 *
 * Records when users submit a search, change or clear filters, or click a discovery result,
 * capturing only anonymous aggregate signals:
 *   - actionType: the type of interaction
 *   - activeFilterCount: how many filters were active
 *   - resultCount: how many results were visible (for search/filter actions)
 *   - eventSlug: the public URL slug of the event opened (for result clicks only)
 *
 * The dispatch is intentionally fire-and-forget: it never blocks user navigation or
 * filter interactions. Analytics failures are silently swallowed to avoid degrading
 * the attendee experience.
 *
 * Privacy: no personal data (user ID, email, IP, search text content) is collected here.
 * Only anonymous aggregate product-usage signals are captured.
 */

import { gqlRequest } from '@/lib/graphql'

export type DiscoveryActionType = 'SEARCH' | 'FILTER_CHANGE' | 'FILTER_CLEAR' | 'RESULT_CLICK'

export interface DiscoveryAnalyticsEvent {
  actionType: DiscoveryActionType
  eventSlug?: string
  activeFilterCount: number
  resultCount?: number
}

const TRACK_DISCOVERY_ACTION_MUTATION = `
  mutation TrackDiscoveryAction($input: TrackDiscoveryActionInput!) {
    trackDiscoveryAction(input: $input)
  }
`

/**
 * Dispatch a discovery analytics event via the GraphQL API.
 *
 * The function is async and fire-and-forget — callers MUST NOT await it in
 * the UI event handler. Failures are silently swallowed.
 */
async function dispatchDiscoveryEvent(event: DiscoveryAnalyticsEvent): Promise<void> {
  try {
    await gqlRequest<{ trackDiscoveryAction: boolean }>(TRACK_DISCOVERY_ACTION_MUTATION, {
      input: {
        actionType: event.actionType,
        eventSlug: event.eventSlug ?? null,
        activeFilterCount: event.activeFilterCount,
        resultCount: event.resultCount ?? null,
      },
    })
  } catch {
    // Silently swallow analytics failures — never degrade the user experience
  }
}

/**
 * Composable that returns discovery analytics helpers.
 *
 * @example
 * const { trackSearch, trackFilterChange, trackFilterClear, trackResultClick } = useDiscoveryAnalytics()
 * // In a filter-applied handler:
 * trackFilterChange(3, 12)
 * // In a result-click handler:
 * trackResultClick('my-event-slug', 2)
 */
export function useDiscoveryAnalytics() {
  /**
   * Record a keyword search submission without blocking the caller.
   *
   * @param activeFilterCount  Number of filters currently active (including keyword).
   * @param resultCount        Number of results returned by the search.
   */
  function trackSearch(activeFilterCount: number, resultCount: number): void {
    dispatchDiscoveryEvent({
      actionType: 'SEARCH',
      activeFilterCount,
      resultCount,
    }).catch(() => {
      // Silently swallow analytics failures
    })
  }

  /**
   * Record a filter change (non-keyword filter updated) without blocking the caller.
   *
   * @param activeFilterCount  Number of filters active after the change.
   * @param resultCount        Number of results after applying the updated filters.
   */
  function trackFilterChange(activeFilterCount: number, resultCount: number): void {
    dispatchDiscoveryEvent({
      actionType: 'FILTER_CHANGE',
      activeFilterCount,
      resultCount,
    }).catch(() => {
      // Silently swallow analytics failures
    })
  }

  /**
   * Record a "clear all filters" action without blocking the caller.
   *
   * @param resultCount  Number of results after clearing (i.e. the unfiltered count).
   */
  function trackFilterClear(resultCount: number): void {
    dispatchDiscoveryEvent({
      actionType: 'FILTER_CLEAR',
      activeFilterCount: 0,
      resultCount,
    }).catch(() => {
      // Silently swallow analytics failures
    })
  }

  /**
   * Record a result click (event card opened) without blocking the caller.
   *
   * @param eventSlug          The public URL slug of the event that was opened.
   * @param activeFilterCount  Number of filters active at the time of the click.
   */
  function trackResultClick(eventSlug: string, activeFilterCount: number): void {
    dispatchDiscoveryEvent({
      actionType: 'RESULT_CLICK',
      eventSlug,
      activeFilterCount,
    }).catch(() => {
      // Silently swallow analytics failures
    })
  }

  return { trackSearch, trackFilterChange, trackFilterClear, trackResultClick }
}
