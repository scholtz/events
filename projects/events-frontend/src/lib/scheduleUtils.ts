/**
 * scheduleUtils – pure utilities for evaluating scheduled featured-event state.
 *
 * These functions are extracted from HubManageView so they can be unit-tested
 * independently from the Vue component. All functions are pure (no store or
 * router access) and depend only on the passed-in timestamps and the Date API.
 *
 * Timezone assumption: all timestamps are UTC ISO strings (the API always
 * returns and accepts UTC via Z-suffix). `Date.now()` returns the same UTC
 * millisecond epoch, so comparisons are always zone-consistent.
 */

import type { ScheduleStatus } from '@/types'

// ---------------------------------------------------------------------------
// Schedule status classification
// ---------------------------------------------------------------------------

/**
 * Classifies a scheduled featured-event entry as `'upcoming'`, `'active'`, or
 * `'expired'` based on the current UTC time.
 *
 * - **upcoming** – `now < startsAtUtc`
 * - **active**   – `startsAtUtc <= now < endsAtUtc`
 * - **expired**  – `now >= endsAtUtc`
 *
 * The window is inclusive on the start and exclusive on the end, matching the
 * server-side `GetFeaturedEventsForDomainAsync` evaluation rule.
 */
export function scheduleStatus(s: {
  startsAtUtc: string
  endsAtUtc: string
}): ScheduleStatus {
  const now = Date.now()
  const starts = new Date(s.startsAtUtc).getTime()
  const ends = new Date(s.endsAtUtc).getTime()
  if (now < starts) return 'upcoming'
  if (now >= ends) return 'expired'
  return 'active'
}

// ---------------------------------------------------------------------------
// datetime-local input value helpers
// ---------------------------------------------------------------------------

/**
 * Converts a UTC ISO string (e.g. `"2026-06-15T10:00:00.000Z"`) to the
 * `"YYYY-MM-DDTHH:mm"` format required by `<input type="datetime-local">`.
 *
 * No timezone conversion is performed — the value is displayed and edited as
 * UTC in the admin UI so that administrators work in a single reference frame
 * regardless of their local timezone.
 */
export function toDatetimeLocalValue(utcIso: string): string {
  if (!utcIso) return ''
  return utcIso.slice(0, 16)
}

/**
 * Converts a `datetime-local` input value (`"YYYY-MM-DDTHH:mm"`) back to a
 * UTC ISO string suitable for the GraphQL API.
 *
 * - Already has a `Z` suffix → returned as-is.
 * - `HH:mm` format (no seconds) → appends `:00.000Z`.
 * - `HH:mm:ss` format (has seconds) → appends `.000Z`.
 *
 * This is the inverse of `toDatetimeLocalValue`.
 */
export function fromDatetimeLocalValue(value: string): string {
  if (!value) return ''
  if (value.endsWith('Z')) return value
  // Count colons after the 'T' separator to detect HH:mm vs HH:mm:ss format
  const timePart = value.split('T')[1] ?? ''
  const hasSeconds = (timePart.match(/:/g) ?? []).length >= 2
  return hasSeconds ? `${value}.000Z` : `${value}:00.000Z`
}
