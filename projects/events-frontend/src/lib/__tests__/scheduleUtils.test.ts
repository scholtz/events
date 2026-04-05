/**
 * Unit tests for scheduleUtils pure utilities.
 *
 * All functions under test are pure (no stores, no router, no Vue), so these
 * tests run synchronously without a DOM environment.
 *
 * Timezone note: `Date.now()` and `new Date(isoString).getTime()` both work in
 * UTC milliseconds, so no timezone stub is needed for status classification.
 * `vi.useFakeTimers` is used to pin "now" to a deterministic UTC epoch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fromDatetimeLocalValue, scheduleStatus, toDatetimeLocalValue } from '@/lib/scheduleUtils'

// ---------------------------------------------------------------------------
// scheduleStatus
// ---------------------------------------------------------------------------

describe('scheduleStatus', () => {
  // Pin "now" to 2026-06-15T12:00:00.000Z for all tests in this suite.
  const NOW_ISO = '2026-06-15T12:00:00.000Z'
  const NOW_MS = new Date(NOW_ISO).getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW_MS)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "upcoming" when the window starts in the future', () => {
    expect(
      scheduleStatus({
        startsAtUtc: '2026-06-16T00:00:00.000Z', // tomorrow
        endsAtUtc: '2026-06-20T00:00:00.000Z',
      }),
    ).toBe('upcoming')
  })

  it('returns "upcoming" when now is exactly one millisecond before start', () => {
    const startsMs = NOW_MS + 1
    expect(
      scheduleStatus({
        startsAtUtc: new Date(startsMs).toISOString(),
        endsAtUtc: new Date(startsMs + 86_400_000).toISOString(),
      }),
    ).toBe('upcoming')
  })

  it('returns "active" when now is exactly at the start (inclusive)', () => {
    expect(
      scheduleStatus({
        startsAtUtc: NOW_ISO, // now == start → active
        endsAtUtc: '2026-06-16T12:00:00.000Z',
      }),
    ).toBe('active')
  })

  it('returns "active" when now is inside the window', () => {
    expect(
      scheduleStatus({
        startsAtUtc: '2026-06-14T00:00:00.000Z', // yesterday
        endsAtUtc: '2026-06-16T00:00:00.000Z', // tomorrow
      }),
    ).toBe('active')
  })

  it('returns "active" when now is one millisecond before end (exclusive end)', () => {
    const endsMs = NOW_MS + 1
    expect(
      scheduleStatus({
        startsAtUtc: new Date(NOW_MS - 86_400_000).toISOString(),
        endsAtUtc: new Date(endsMs).toISOString(), // now < end
      }),
    ).toBe('active')
  })

  it('returns "expired" when now is exactly at the end (exclusive)', () => {
    expect(
      scheduleStatus({
        startsAtUtc: '2026-06-14T12:00:00.000Z',
        endsAtUtc: NOW_ISO, // now == end → expired
      }),
    ).toBe('expired')
  })

  it('returns "expired" when the window ended in the past', () => {
    expect(
      scheduleStatus({
        startsAtUtc: '2026-06-01T00:00:00.000Z',
        endsAtUtc: '2026-06-10T00:00:00.000Z',
      }),
    ).toBe('expired')
  })

  it('returns "expired" for a very short window that ended one millisecond ago', () => {
    const endsMs = NOW_MS - 1
    expect(
      scheduleStatus({
        startsAtUtc: new Date(endsMs - 3_600_000).toISOString(),
        endsAtUtc: new Date(endsMs).toISOString(),
      }),
    ).toBe('expired')
  })

  it('handles ISO strings without milliseconds correctly', () => {
    // Common format returned by some API responses: "2026-06-14T00:00:00Z"
    expect(
      scheduleStatus({
        startsAtUtc: '2026-06-14T00:00:00Z', // past
        endsAtUtc: '2026-06-20T00:00:00Z', // future
      }),
    ).toBe('active')
  })
})

// ---------------------------------------------------------------------------
// toDatetimeLocalValue
// ---------------------------------------------------------------------------

describe('toDatetimeLocalValue', () => {
  it('truncates a full UTC ISO string to "YYYY-MM-DDTHH:mm"', () => {
    expect(toDatetimeLocalValue('2026-06-15T10:30:00.000Z')).toBe('2026-06-15T10:30')
  })

  it('handles a UTC ISO string without milliseconds', () => {
    expect(toDatetimeLocalValue('2026-06-15T10:30:00Z')).toBe('2026-06-15T10:30')
  })

  it('handles a UTC ISO string with only minutes (already truncated)', () => {
    // Idempotent if already truncated
    expect(toDatetimeLocalValue('2026-06-15T10:30')).toBe('2026-06-15T10:30')
  })

  it('returns an empty string for an empty input', () => {
    expect(toDatetimeLocalValue('')).toBe('')
  })

  it('preserves the date and time digits exactly', () => {
    const result = toDatetimeLocalValue('2026-12-31T23:59:59.999Z')
    expect(result).toBe('2026-12-31T23:59')
  })
})

// ---------------------------------------------------------------------------
// fromDatetimeLocalValue
// ---------------------------------------------------------------------------

describe('fromDatetimeLocalValue', () => {
  it('converts "YYYY-MM-DDTHH:mm" to a valid UTC ISO string', () => {
    expect(fromDatetimeLocalValue('2026-06-15T10:30')).toBe('2026-06-15T10:30:00.000Z')
  })

  it('returns an empty string for an empty input', () => {
    expect(fromDatetimeLocalValue('')).toBe('')
  })

  it('returns the value unchanged when it already ends with Z', () => {
    expect(fromDatetimeLocalValue('2026-06-15T10:30:00.000Z')).toBe('2026-06-15T10:30:00.000Z')
  })

  it('appends .000Z when value already has seconds (HH:mm:ss format)', () => {
    expect(fromDatetimeLocalValue('2026-06-15T10:30:45')).toBe('2026-06-15T10:30:45.000Z')
  })

  it('is a round-trip inverse of toDatetimeLocalValue for standard ISO strings', () => {
    const original = '2026-06-15T10:30:00.000Z'
    const roundTrip = fromDatetimeLocalValue(toDatetimeLocalValue(original))
    expect(roundTrip).toBe(original)
  })

  it('produces consistent UTC strings for midnight boundary values', () => {
    expect(fromDatetimeLocalValue('2026-01-01T00:00')).toBe('2026-01-01T00:00:00.000Z')
    expect(fromDatetimeLocalValue('2026-12-31T23:59')).toBe('2026-12-31T23:59:00.000Z')
  })
})
