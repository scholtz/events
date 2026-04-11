/**
 * Unit tests for src/lib/discoveryTrustState.ts
 *
 * Verifies every branch of computeDiscoveryTrustState and the
 * shouldShowFreshnessNotice helper across all named states:
 *
 *  fresh           – live data, online, no error
 *  cached-offline  – offline with cached data available
 *  cached-sw       – online but last response served by SW IDB cache
 *  refreshing      – in-flight fetch with cached data still shown
 *  refresh-failed  – latest fetch failed but old data still shown
 *  unavailable     – no cached data and offline/error
 */

import { describe, expect, it } from 'vitest'
import {
  computeDiscoveryTrustState,
  shouldShowFreshnessNotice,
} from '@/lib/discoveryTrustState'
import type { DiscoveryTrustInput } from '@/lib/discoveryTrustState'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Baseline: online, idle, no error, live data, events present. */
function fresh(overrides: Partial<DiscoveryTrustInput> = {}): DiscoveryTrustInput {
  return {
    isOffline: false,
    isLoading: false,
    hasError: false,
    dataSource: 'live',
    hasCachedData: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// computeDiscoveryTrustState
// ---------------------------------------------------------------------------

describe('computeDiscoveryTrustState', () => {
  // ── fresh ──────────────────────────────────────────────────────────────────

  it('returns "fresh" for a normal online live-data scenario', () => {
    expect(computeDiscoveryTrustState(fresh())).toBe('fresh')
  })

  it('returns "fresh" when still loading the very first fetch (no cached data yet)', () => {
    // Loading the first batch — no data yet, no error, online
    expect(
      computeDiscoveryTrustState(
        fresh({ isLoading: true, dataSource: null, hasCachedData: false }),
      ),
    ).toBe('fresh')
  })

  // ── cached-offline ─────────────────────────────────────────────────────────

  it('returns "cached-offline" when offline and cached data is available', () => {
    expect(computeDiscoveryTrustState(fresh({ isOffline: true }))).toBe('cached-offline')
  })

  it('returns "cached-offline" even when dataSource is null (offline after any cache)', () => {
    expect(
      computeDiscoveryTrustState(fresh({ isOffline: true, dataSource: null })),
    ).toBe('cached-offline')
  })

  // ── cached-sw ──────────────────────────────────────────────────────────────

  it('returns "cached-sw" when the SW served from IDB cache (online)', () => {
    expect(computeDiscoveryTrustState(fresh({ dataSource: 'cache' }))).toBe('cached-sw')
  })

  it('returns "cached-sw" for a fresh-from-cache scenario even with no active loading', () => {
    expect(
      computeDiscoveryTrustState(fresh({ dataSource: 'cache', isLoading: false })),
    ).toBe('cached-sw')
  })

  // ── refreshing ─────────────────────────────────────────────────────────────

  it('returns "refreshing" when a background fetch is in flight with stale data shown', () => {
    expect(computeDiscoveryTrustState(fresh({ isLoading: true }))).toBe('refreshing')
  })

  it('returns "refreshing" even when dataSource is null (second fetch after first succeeded)', () => {
    expect(
      computeDiscoveryTrustState(fresh({ isLoading: true, dataSource: null })),
    ).toBe('refreshing')
  })

  // ── refresh-failed ─────────────────────────────────────────────────────────

  it('returns "refresh-failed" when the last fetch failed but cached data is still shown', () => {
    expect(computeDiscoveryTrustState(fresh({ hasError: true }))).toBe('refresh-failed')
  })

  it('returns "refresh-failed" with dataSource null (failed re-fetch, old data still shown)', () => {
    expect(
      computeDiscoveryTrustState(fresh({ hasError: true, dataSource: null })),
    ).toBe('refresh-failed')
  })

  // ── unavailable ────────────────────────────────────────────────────────────

  it('returns "unavailable" when offline and no cached data at all', () => {
    expect(
      computeDiscoveryTrustState(
        fresh({ isOffline: true, hasCachedData: false, dataSource: null }),
      ),
    ).toBe('unavailable')
  })

  it('returns "unavailable" when fetch failed and no cached data', () => {
    expect(
      computeDiscoveryTrustState(
        fresh({ hasError: true, hasCachedData: false, dataSource: null }),
      ),
    ).toBe('unavailable')
  })

  it('returns "unavailable" when offline, errored, and no cached data', () => {
    expect(
      computeDiscoveryTrustState({
        isOffline: true,
        isLoading: false,
        hasError: true,
        dataSource: null,
        hasCachedData: false,
      }),
    ).toBe('unavailable')
  })

  // ── precedence checks ──────────────────────────────────────────────────────

  it('prioritises "unavailable" over "cached-offline" when hasCachedData is false', () => {
    // offline + no data → unavailable (not cached-offline)
    expect(
      computeDiscoveryTrustState(
        fresh({ isOffline: true, hasCachedData: false, dataSource: null }),
      ),
    ).toBe('unavailable')
  })

  it('prioritises "cached-offline" over "cached-sw" when both conditions are true', () => {
    // offline AND last fetch was from SW cache → offline takes precedence
    expect(
      computeDiscoveryTrustState(fresh({ isOffline: true, dataSource: 'cache' })),
    ).toBe('cached-offline')
  })

  it('prioritises "cached-sw" over "refreshing" when dataSource is cache and loading', () => {
    // This can happen when a background refresh starts after a SW-cached response
    expect(
      computeDiscoveryTrustState(fresh({ dataSource: 'cache', isLoading: true })),
    ).toBe('cached-sw')
  })
})

// ---------------------------------------------------------------------------
// shouldShowFreshnessNotice
// ---------------------------------------------------------------------------

describe('shouldShowFreshnessNotice', () => {
  it('returns false for "fresh" state — no notice needed', () => {
    expect(shouldShowFreshnessNotice('fresh')).toBe(false)
  })

  it('returns false for "unavailable" state — dedicated error UI is shown instead', () => {
    expect(shouldShowFreshnessNotice('unavailable')).toBe(false)
  })

  it('returns true for "cached-offline"', () => {
    expect(shouldShowFreshnessNotice('cached-offline')).toBe(true)
  })

  it('returns true for "cached-sw"', () => {
    expect(shouldShowFreshnessNotice('cached-sw')).toBe(true)
  })

  it('returns true for "refreshing"', () => {
    expect(shouldShowFreshnessNotice('refreshing')).toBe(true)
  })

  it('returns true for "refresh-failed"', () => {
    expect(shouldShowFreshnessNotice('refresh-failed')).toBe(true)
  })
})
