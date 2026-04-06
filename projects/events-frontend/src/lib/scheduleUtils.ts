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
// Schedule form validation
// ---------------------------------------------------------------------------

/**
 * i18n key returned by `validateScheduleInput` when validation fails.
 * Callers translate this to a human-readable message via `t(key)`.
 */
export type ScheduleValidationError =
  | 'hubManage.schedules.errorSelectEvent'
  | 'hubManage.schedules.errorDatesRequired'
  | 'hubManage.schedules.errorStartBeforeEnd'

/**
 * Validates the three primary fields of a schedule form.
 *
 * Returns the i18n key of the first validation error found, or `null` when
 * all fields are valid.  The caller is responsible for translating the returned
 * key into a display string (e.g. via `t(key)`).
 *
 * @param eventId   - The selected event ID (empty string = nothing selected).
 * @param startsAt  - `datetime-local` input value for the window start.
 * @param endsAt    - `datetime-local` input value for the window end.
 */
export function validateScheduleInput(
  eventId: string,
  startsAt: string,
  endsAt: string,
): ScheduleValidationError | null {
  if (!eventId) return 'hubManage.schedules.errorSelectEvent'
  return validateScheduleDates(startsAt, endsAt)
}

/**
 * Validates only the date fields of a schedule form (used by the edit flow
 * where the event cannot be changed and needs no re-validation).
 *
 * Returns the i18n key of the first date-related error, or `null` if valid.
 *
 * @param startsAt  - `datetime-local` input value for the window start.
 * @param endsAt    - `datetime-local` input value for the window end.
 */
export function validateScheduleDates(
  startsAt: string,
  endsAt: string,
): 'hubManage.schedules.errorDatesRequired' | 'hubManage.schedules.errorStartBeforeEnd' | null {
  if (!startsAt || !endsAt) return 'hubManage.schedules.errorDatesRequired'
  if (new Date(fromDatetimeLocalValue(startsAt)) >= new Date(fromDatetimeLocalValue(endsAt)))
    return 'hubManage.schedules.errorStartBeforeEnd'
  return null
}

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
