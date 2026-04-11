/**
 * Discovery trust-state model.
 *
 * This module provides pure, deterministic functions that classify the
 * current data-freshness situation into named trust states.  Components
 * consume these states to decide which notice (if any) to show above a
 * result list.
 *
 * Trust-state taxonomy
 * ─────────────────────
 *  fresh           – live network response; no notice needed
 *  cached-offline  – app is offline; showing data from a previous fetch
 *  cached-sw       – app is online but SW served response from IDB cache
 *  refreshing      – a fresh fetch is in progress; cached data still shown
 *  refresh-failed  – the last fetch failed; old data (if any) still shown
 *  unavailable     – no cached data and no connectivity / failed fetch
 */

export type DiscoveryTrustState =
  | 'fresh'
  | 'cached-offline'
  | 'cached-sw'
  | 'refreshing'
  | 'refresh-failed'
  | 'unavailable'

export interface DiscoveryTrustInput {
  /** True when window.navigator.onLine is false. */
  isOffline: boolean
  /** True when a fetch is currently in-flight. */
  isLoading: boolean
  /** True when the last fetch produced an error. */
  hasError: boolean
  /**
   * Source of the last successfully fetched data set.
   * null means no successful fetch has ever completed.
   */
  dataSource: 'live' | 'cache' | null
  /** True when there are cached events available to show. */
  hasCachedData: boolean
}

/**
 * Map network/cache/fetch inputs to a named trust state.
 *
 * The classification follows this priority order:
 *  1. No cached data + offline or error → unavailable
 *  2. Offline + cached data → cached-offline
 *  3. Last fetch from SW IDB cache (even when online) → cached-sw
 *  4. In-flight refresh with old data still shown → refreshing
 *  5. Last fetch failed but old data still shown → refresh-failed
 *  6. Default → fresh
 */
export function computeDiscoveryTrustState(input: DiscoveryTrustInput): DiscoveryTrustState {
  const { isOffline, isLoading, hasError, dataSource, hasCachedData } = input

  // Cannot show anything useful
  if (!hasCachedData && (isOffline || hasError)) {
    return 'unavailable'
  }

  // Offline but we still have data from a previous fetch
  if (isOffline && hasCachedData) {
    return 'cached-offline'
  }

  // SW served from IDB cache (online but stale)
  if (dataSource === 'cache') {
    return 'cached-sw'
  }

  // A background refresh is in flight; stale data is currently visible
  if (isLoading && hasCachedData) {
    return 'refreshing'
  }

  // The latest refresh failed but old data is still shown
  if (hasError && hasCachedData) {
    return 'refresh-failed'
  }

  return 'fresh'
}

/**
 * Returns true when the trust state indicates that data may be outdated
 * and a user-visible notice should be shown above the result list.
 */
export function shouldShowFreshnessNotice(state: DiscoveryTrustState): boolean {
  return (
    state === 'cached-offline' ||
    state === 'cached-sw' ||
    state === 'refreshing' ||
    state === 'refresh-failed'
  )
}
