/**
 * Unit tests for useDiscoveryAnalytics.
 *
 * Verifies that:
 *  - All tracker functions return immediately without throwing (fire-and-forget)
 *  - No synchronous side-effects block the caller
 *  - The composable exposes all four tracking functions
 */

import { describe, expect, it } from 'vitest'
import { useDiscoveryAnalytics } from '@/composables/useDiscoveryAnalytics'

describe('useDiscoveryAnalytics', () => {
  it('returns all four tracking functions', () => {
    const analytics = useDiscoveryAnalytics()
    expect(typeof analytics.trackSearch).toBe('function')
    expect(typeof analytics.trackFilterChange).toBe('function')
    expect(typeof analytics.trackFilterClear).toBe('function')
    expect(typeof analytics.trackResultClick).toBe('function')
  })

  it('trackSearch does not throw when called with valid arguments', () => {
    const { trackSearch } = useDiscoveryAnalytics()
    expect(() => trackSearch(1, 10)).not.toThrow()
    expect(() => trackSearch(0, 0)).not.toThrow()
    expect(() => trackSearch(5, 42)).not.toThrow()
  })

  it('trackSearch is fire-and-forget: returns void synchronously', () => {
    const { trackSearch } = useDiscoveryAnalytics()
    const result = trackSearch(2, 8)
    expect(result).toBeUndefined()
  })

  it('trackFilterChange does not throw when called with valid arguments', () => {
    const { trackFilterChange } = useDiscoveryAnalytics()
    expect(() => trackFilterChange(1, 5)).not.toThrow()
    expect(() => trackFilterChange(3, 0)).not.toThrow()
  })

  it('trackFilterChange is fire-and-forget: returns void synchronously', () => {
    const { trackFilterChange } = useDiscoveryAnalytics()
    const result = trackFilterChange(2, 7)
    expect(result).toBeUndefined()
  })

  it('trackFilterClear does not throw when called with valid arguments', () => {
    const { trackFilterClear } = useDiscoveryAnalytics()
    expect(() => trackFilterClear(20)).not.toThrow()
    expect(() => trackFilterClear(0)).not.toThrow()
  })

  it('trackFilterClear is fire-and-forget: returns void synchronously', () => {
    const { trackFilterClear } = useDiscoveryAnalytics()
    const result = trackFilterClear(15)
    expect(result).toBeUndefined()
  })

  it('trackResultClick does not throw when called with valid arguments', () => {
    const { trackResultClick } = useDiscoveryAnalytics()
    expect(() => trackResultClick('my-event-slug', 2)).not.toThrow()
    expect(() => trackResultClick('another-event', 0)).not.toThrow()
  })

  it('trackResultClick is fire-and-forget: returns void synchronously', () => {
    const { trackResultClick } = useDiscoveryAnalytics()
    const result = trackResultClick('event-slug', 3)
    expect(result).toBeUndefined()
  })

  it('multiple calls from the same composable instance do not throw', () => {
    const { trackSearch, trackFilterChange, trackFilterClear, trackResultClick } =
      useDiscoveryAnalytics()
    expect(() => {
      trackSearch(1, 10)
      trackFilterChange(2, 5)
      trackFilterClear(12)
      trackResultClick('test-event', 2)
    }).not.toThrow()
  })
})
