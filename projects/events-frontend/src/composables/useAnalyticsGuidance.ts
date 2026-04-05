/**
 * useAnalyticsGuidance – pure decision logic for organizer analytics guidance.
 *
 * Provides deterministic, testable helpers that classify event analytics items into
 * trend variants and recommendation types. All functions are pure (no side-effects,
 * no network calls) and accept an optional `now` parameter for deterministic testing.
 *
 * Intentionally decoupled from i18n so the logic can be unit-tested without a Vue
 * application context.  Callers (e.g. DashboardView.vue) map returned types to
 * locale-specific text via the existing `t()` helper.
 */

import type { DashboardOverview, EventAnalyticsItem } from '@/types'

// ── Trend variant ────────────────────────────────────────────────────────────

/**
 * CSS class variant for a save / interested-count trend badge.
 * - `trend--active`  : activity recorded in the last 7 days
 * - `trend--recent`  : activity recorded in the last 30 days (but not 7)
 * - `trend--quiet`   : no activity in the last 30 days
 */
export type TrendVariant = 'trend--active' | 'trend--recent' | 'trend--quiet'

/**
 * Returns the trend variant for attendee saves on a single event.
 * Priority: 7-day > 30-day > quiet.
 */
export function saveTrendVariant(
  item: Pick<EventAnalyticsItem, 'interestedLast7Days' | 'interestedLast30Days'>,
): TrendVariant {
  if (item.interestedLast7Days > 0) return 'trend--active'
  if (item.interestedLast30Days > 0) return 'trend--recent'
  return 'trend--quiet'
}

/**
 * Returns the trend variant for add-to-calendar actions on a single event.
 * Priority: 7-day > 30-day > quiet.
 */
export function calendarTrendVariant(
  item: Pick<EventAnalyticsItem, 'calendarActionsLast7Days' | 'calendarActionsLast30Days'>,
): TrendVariant {
  if (item.calendarActionsLast7Days > 0) return 'trend--active'
  if (item.calendarActionsLast30Days > 0) return 'trend--recent'
  return 'trend--quiet'
}

// ── Per-event recommendation ─────────────────────────────────────────────────

/**
 * CSS class variant for a per-event recommendation row.
 */
export type RecommendationVariant =
  | 'rec--rejected'
  | 'rec--draft'
  | 'rec--pending'
  | 'rec--urgent'
  | 'rec--guidance'

/**
 * Semantic type key that identifies which recommendation message to show.
 * Null means no recommendation is needed for this event.
 */
export type RecommendationType =
  | 'rejected'
  | 'draft'
  | 'pending'
  | 'publishedApproachingSoon'
  | 'publishedNewlyPublished'
  | 'publishedNoSaves'
  | 'publishedMissingLanguage'
  | 'publishedMissingTimezone'
  | 'publishedMissingDomain'
  | null

/**
 * Number of whole days remaining until an event starts, rounded up.
 * Returns 0 for events that started less than 24 hours ago (ceil of a small
 * negative fraction rounds up to 0), and a negative integer for events that
 * started 24+ hours in the past.
 *
 * @param startsAtUtc ISO-8601 UTC date-time string
 * @param now         Reference instant (defaults to `new Date()` for testability)
 */
export function daysUntilStart(startsAtUtc: string, now: Date = new Date()): number {
  return Math.ceil((new Date(startsAtUtc).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Number of whole days that have elapsed since an event was published, rounded down.
 * Returns 0 for events published today, and a negative number if publishedAtUtc is in the future
 * (which should not happen in practice).
 *
 * @param publishedAtUtc ISO-8601 UTC date-time string, or null if not yet published
 * @param now            Reference instant (defaults to `new Date()` for testability)
 */
export function daysSincePublished(publishedAtUtc: string | null, now: Date = new Date()): number {
  if (!publishedAtUtc) return Number.MAX_SAFE_INTEGER
  return Math.floor((now.getTime() - new Date(publishedAtUtc).getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Determines which recommendation type (if any) applies to the given event analytics item.
 *
 * Decision rules (in priority order):
 * 1. REJECTED  → show rejection guidance with admin notes
 * 2. DRAFT     → prompt to submit for review
 * 3. PENDING_APPROVAL → reassure organizer no action needed yet
 * 4. PUBLISHED + zero saves + starting within 7 days → urgent share prompt
 * 5. PUBLISHED + zero saves + published within last 7 days → newly-published patience message
 * 6. PUBLISHED + zero saves → standard share prompt
 * 7. PUBLISHED + has saves + no language set → language-tag improvement hint
 * 8. PUBLISHED + has saves + has language + no timezone → timezone improvement hint
 * 9. PUBLISHED + has saves + has language + has timezone + no domain → category assignment hint
 * 10. Otherwise → no recommendation
 *
 * @param item Analytics item for the event
 * @param now  Reference instant (defaults to `new Date()` for testability)
 */
export function eventRecommendationType(
  item: Pick<
    EventAnalyticsItem,
    'status' | 'totalInterestedCount' | 'startsAtUtc' | 'language' | 'timezone' | 'domainSlug' | 'publishedAtUtc'
  >,
  now: Date = new Date(),
): RecommendationType {
  if (item.status === 'REJECTED') return 'rejected'
  if (item.status === 'DRAFT') return 'draft'
  if (item.status === 'PENDING_APPROVAL') return 'pending'
  if (item.status === 'PUBLISHED') {
    if (item.totalInterestedCount === 0) {
      const days = daysUntilStart(item.startsAtUtc, now)
      if (days > 0 && days <= 7) return 'publishedApproachingSoon'
      const daysSince = daysSincePublished(item.publishedAtUtc, now)
      if (daysSince <= 7) return 'publishedNewlyPublished'
      return 'publishedNoSaves'
    }
    if (!item.language) return 'publishedMissingLanguage'
    if (!item.timezone) return 'publishedMissingTimezone'
    if (!item.domainSlug) return 'publishedMissingDomain'
  }
  return null
}

/**
 * Returns the CSS variant class for a per-event recommendation row.
 * When no recommendation is needed the caller should suppress the row entirely
 * (the variant is 'rec--guidance' but eventRecommendationType will return null).
 *
 * @param item Analytics item for the event
 * @param now  Reference instant (defaults to `new Date()` for testability)
 */
export function eventRecommendationVariant(
  item: Pick<
    EventAnalyticsItem,
    'status' | 'totalInterestedCount' | 'startsAtUtc' | 'language' | 'timezone' | 'domainSlug' | 'publishedAtUtc'
  >,
  now: Date = new Date(),
): RecommendationVariant {
  if (item.status === 'REJECTED') return 'rec--rejected'
  if (item.status === 'DRAFT') return 'rec--draft'
  if (item.status === 'PENDING_APPROVAL') return 'rec--pending'
  if (item.status === 'PUBLISHED' && item.totalInterestedCount === 0) {
    const days = daysUntilStart(item.startsAtUtc, now)
    if (days > 0 && days <= 7) return 'rec--urgent'
  }
  return 'rec--guidance'
}

// ── Dashboard-level analytics state ──────────────────────────────────────────

/**
 * High-level classification of the organizer's overall analytics dashboard state.
 *
 * - `empty`      : No published events; organizer has not yet launched anything live.
 * - `early`      : At least one published event but all are newly published (≤14 days) and
 *                  total saves are very low (< 3). Data is still forming — patience message.
 * - `low_signal` : Has published events with some activity but total saves are below the
 *                  normal-signal threshold (< 5). Likely a niche or lightly-distributed event.
 * - `normal`     : Sufficient engagement signal (≥ 5 total saves across published events).
 *                  Standard analytics view without extra explanation.
 */
export type DashboardAnalyticsState = 'empty' | 'early' | 'low_signal' | 'normal'

/** Minimum total saves to be considered "normal signal". */
const NORMAL_SIGNAL_THRESHOLD = 5

/** Maximum age in days for a published event to be considered "newly published". */
const NEWLY_PUBLISHED_DAYS = 14

/**
 * Classifies the organizer's dashboard into a high-level analytics state based on their
 * published-event count and aggregate engagement.
 *
 * Decision rules (in priority order):
 * 1. No published events → `empty`
 * 2. Published events + total saves ≥ NORMAL_SIGNAL_THRESHOLD → `normal`
 * 3. All published events are newly published (≤14 days old) + total saves < NORMAL_SIGNAL_THRESHOLD → `early`
 * 4. Otherwise (has older published events but low saves) → `low_signal`
 *
 * @param overview Subset of the dashboard overview needed for classification.
 * @param now      Reference instant (defaults to `new Date()` for testability).
 */
export function classifyDashboardAnalyticsState(
  overview: Pick<DashboardOverview, 'publishedEvents' | 'totalInterestedCount' | 'eventAnalytics'>,
  now: Date = new Date(),
): DashboardAnalyticsState {
  if (overview.publishedEvents === 0) return 'empty'
  if (overview.totalInterestedCount >= NORMAL_SIGNAL_THRESHOLD) return 'normal'

  // Check whether every published event is still within the "newly published" window.
  const publishedAnalytics = overview.eventAnalytics.filter((e) => e.status === 'PUBLISHED')
  const allNewlyPublished =
    publishedAnalytics.length > 0 &&
    publishedAnalytics.every((e) => daysSincePublished(e.publishedAtUtc, now) <= NEWLY_PUBLISHED_DAYS)

  return allNewlyPublished ? 'early' : 'low_signal'
}
