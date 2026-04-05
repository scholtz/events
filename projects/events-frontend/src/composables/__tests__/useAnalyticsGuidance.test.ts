/**
 * Unit tests for useAnalyticsGuidance.
 *
 * Verifies all pure decision functions that classify organizer-analytics data into
 * trend variants and recommendation types.  No i18n, Vue context, or network calls
 * are required because the composable contains only deterministic business logic.
 */

import { describe, expect, it } from 'vitest'
import {
  saveTrendVariant,
  calendarTrendVariant,
  daysUntilStart,
  daysSincePublished,
  eventRecommendationType,
  eventRecommendationVariant,
  type TrendVariant,
  type RecommendationType,
  type RecommendationVariant,
} from '@/composables/useAnalyticsGuidance'
import type { EventAnalyticsItem } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a minimal EventAnalyticsItem stub with sensible defaults.
 *
 * Defaults represent a "healthy" event with all optional metadata filled in
 * so that `eventRecommendationType` returns null by default when the event
 * has saves.  Override individual fields to test specific recommendation cases.
 */
function makeItem(overrides: Partial<EventAnalyticsItem> = {}): EventAnalyticsItem {
  return {
    eventId: 'evt-unit-1',
    eventName: 'Unit Test Event',
    eventSlug: 'unit-test-event',
    status: 'PUBLISHED',
    totalInterestedCount: 0,
    interestedLast7Days: 0,
    interestedLast30Days: 0,
    startsAtUtc: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
    totalCalendarActions: 0,
    calendarActionsLast7Days: 0,
    calendarActionsLast30Days: 0,
    calendarActionsByProvider: [],
    adminNotes: null,
    domainSlug: 'tech',
    language: 'en',
    timezone: 'Europe/London',
    publishedAtUtc: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // published 30 days ago
    ...overrides,
  }
}

// ── saveTrendVariant ─────────────────────────────────────────────────────────

describe('saveTrendVariant', () => {
  it('returns trend--active when interestedLast7Days > 0', () => {
    const variant: TrendVariant = saveTrendVariant({ interestedLast7Days: 3, interestedLast30Days: 5 })
    expect(variant).toBe('trend--active')
  })

  it('returns trend--active even when interestedLast30Days is 0 (7-day takes priority)', () => {
    expect(saveTrendVariant({ interestedLast7Days: 1, interestedLast30Days: 0 })).toBe('trend--active')
  })

  it('returns trend--recent when interestedLast7Days is 0 but interestedLast30Days > 0', () => {
    const variant: TrendVariant = saveTrendVariant({ interestedLast7Days: 0, interestedLast30Days: 2 })
    expect(variant).toBe('trend--recent')
  })

  it('returns trend--quiet when both window counts are zero', () => {
    const variant: TrendVariant = saveTrendVariant({ interestedLast7Days: 0, interestedLast30Days: 0 })
    expect(variant).toBe('trend--quiet')
  })

  it('returns trend--quiet for a brand new event with no saves at all', () => {
    expect(saveTrendVariant(makeItem())).toBe('trend--quiet')
  })
})

// ── calendarTrendVariant ─────────────────────────────────────────────────────

describe('calendarTrendVariant', () => {
  it('returns trend--active when calendarActionsLast7Days > 0', () => {
    expect(calendarTrendVariant({ calendarActionsLast7Days: 1, calendarActionsLast30Days: 3 })).toBe('trend--active')
  })

  it('returns trend--active when only 7-day window has actions', () => {
    expect(calendarTrendVariant({ calendarActionsLast7Days: 2, calendarActionsLast30Days: 0 })).toBe('trend--active')
  })

  it('returns trend--recent when calendarActionsLast7Days is 0 but calendarActionsLast30Days > 0', () => {
    expect(calendarTrendVariant({ calendarActionsLast7Days: 0, calendarActionsLast30Days: 4 })).toBe('trend--recent')
  })

  it('returns trend--quiet when both window counts are zero', () => {
    expect(calendarTrendVariant({ calendarActionsLast7Days: 0, calendarActionsLast30Days: 0 })).toBe('trend--quiet')
  })

  it('returns trend--quiet for an event with no calendar actions', () => {
    expect(calendarTrendVariant(makeItem())).toBe('trend--quiet')
  })
})

// ── daysUntilStart ───────────────────────────────────────────────────────────

describe('daysUntilStart', () => {
  it('returns positive count for a future event', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const starts = '2026-01-10T00:00:00Z'
    expect(daysUntilStart(starts, now)).toBe(9)
  })

  it('returns 1 for an event starting exactly 1 day from now (boundary)', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const starts = '2026-01-02T00:00:00Z'
    expect(daysUntilStart(starts, now)).toBe(1)
  })

  it('returns a negative number for an event that has already started', () => {
    const now = new Date('2026-01-15T00:00:00Z')
    const starts = '2026-01-10T00:00:00Z'
    expect(daysUntilStart(starts, now)).toBeLessThan(0)
  })

  it('returns 0 or rounds up fractional days to 1 for an event starting later today', () => {
    const now = new Date('2026-01-01T06:00:00Z')
    const starts = '2026-01-01T18:00:00Z' // same day, 12 h later — 0.5 days, ceil → 1
    const days = daysUntilStart(starts, now)
    // Math.ceil(0.5) = 1, so for any future same-day event we expect 1
    expect(days).toBe(1)
  })
})

// ── daysSincePublished ───────────────────────────────────────────────────────

describe('daysSincePublished', () => {
  it('returns 0 when published today', () => {
    const now = new Date('2026-01-10T12:00:00Z')
    const published = '2026-01-10T08:00:00Z' // same day
    expect(daysSincePublished(published, now)).toBe(0)
  })

  it('returns 7 when published exactly 7 days ago', () => {
    const now = new Date('2026-01-10T00:00:00Z')
    const published = '2026-01-03T00:00:00Z'
    expect(daysSincePublished(published, now)).toBe(7)
  })

  it('returns 30 when published 30 days ago', () => {
    const now = new Date('2026-01-31T00:00:00Z')
    const published = '2026-01-01T00:00:00Z'
    expect(daysSincePublished(published, now)).toBe(30)
  })

  it('returns MAX_SAFE_INTEGER when publishedAtUtc is null', () => {
    const now = new Date('2026-01-10T00:00:00Z')
    expect(daysSincePublished(null, now)).toBe(Number.MAX_SAFE_INTEGER)
  })
})

// ── eventRecommendationType ──────────────────────────────────────────────────

describe('eventRecommendationType', () => {
  const now = new Date('2026-06-01T00:00:00Z')

  it('returns "rejected" for REJECTED events regardless of other fields', () => {
    const type: RecommendationType = eventRecommendationType(
      makeItem({ status: 'REJECTED', totalInterestedCount: 5 }),
      now,
    )
    expect(type).toBe('rejected')
  })

  it('returns "draft" for DRAFT events', () => {
    expect(eventRecommendationType(makeItem({ status: 'DRAFT' }), now)).toBe('draft')
  })

  it('returns "pending" for PENDING_APPROVAL events', () => {
    expect(
      eventRecommendationType(makeItem({ status: 'PENDING_APPROVAL' }), now),
    ).toBe('pending')
  })

  describe('PUBLISHED events', () => {
    it('returns "publishedApproachingSoon" when event starts within 7 days and has no saves', () => {
      const soon = new Date('2026-06-05T00:00:00Z').toISOString() // 4 days after now
      const type = eventRecommendationType(
        makeItem({ status: 'PUBLISHED', totalInterestedCount: 0, startsAtUtc: soon }),
        now,
      )
      expect(type).toBe('publishedApproachingSoon')
    })

    it('returns "publishedApproachingSoon" when event starts exactly in 7 days with no saves', () => {
      const exactly7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 0, startsAtUtc: exactly7 }),
          now,
        ),
      ).toBe('publishedApproachingSoon')
    })

    it('returns "publishedNoSaves" when event starts in more than 7 days and has no saves', () => {
      const far = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
      // Published 30 days ago (default from makeItem), so NOT newly published → publishedNoSaves
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 0, startsAtUtc: far }),
          now,
        ),
      ).toBe('publishedNoSaves')
    })

    it('returns "publishedNewlyPublished" when event was published within 7 days, has no saves, and starts in more than 7 days', () => {
      const far = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
      const recentlyPublished = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 0, startsAtUtc: far, publishedAtUtc: recentlyPublished }),
          now,
        ),
      ).toBe('publishedNewlyPublished')
    })

    it('returns "publishedNewlyPublished" when published exactly 7 days ago', () => {
      const far = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
      const exactly7DaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 0, startsAtUtc: far, publishedAtUtc: exactly7DaysAgo }),
          now,
        ),
      ).toBe('publishedNewlyPublished')
    })

    it('returns "publishedNoSaves" when published more than 7 days ago and has no saves', () => {
      const far = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
      const olderPublished = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString() // 8 days ago
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 0, startsAtUtc: far, publishedAtUtc: olderPublished }),
          now,
        ),
      ).toBe('publishedNoSaves')
    })

    it('returns "publishedNoSaves" when publishedAtUtc is null and has no saves', () => {
      const far = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 0, startsAtUtc: far, publishedAtUtc: null }),
          now,
        ),
      ).toBe('publishedNoSaves')
    })

    it('publishedApproachingSoon takes priority over publishedNewlyPublished when starting within 7 days', () => {
      const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()
      const recentlyPublished = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 0, startsAtUtc: soon, publishedAtUtc: recentlyPublished }),
          now,
        ),
      ).toBe('publishedApproachingSoon')
    })

    it('returns "publishedNoSaves" for a past event that still has no saves', () => {
      const past = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 0, startsAtUtc: past }),
          now,
        ),
      ).toBe('publishedNoSaves')
    })

    it('returns "publishedMissingLanguage" when event has saves but no language set', () => {
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 3, language: null }),
          now,
        ),
      ).toBe('publishedMissingLanguage')
    })

    it('returns "publishedMissingTimezone" when event has saves and language but no timezone', () => {
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 3, language: 'en', timezone: null }),
          now,
        ),
      ).toBe('publishedMissingTimezone')
    })

    it('returns "publishedMissingTimezone" even when domainSlug is set if timezone is missing', () => {
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 1, language: 'sk', timezone: null, domainSlug: 'tech' }),
          now,
        ),
      ).toBe('publishedMissingTimezone')
    })

    it('returns "publishedMissingDomain" when event has saves, language, and timezone but no domain', () => {
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 2, language: 'de', timezone: 'Europe/Berlin', domainSlug: null }),
          now,
        ),
      ).toBe('publishedMissingDomain')
    })

    it('returns null when event has saves, language, timezone, and domain (no recommendation needed)', () => {
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 2, language: 'en', timezone: 'Europe/London', domainSlug: 'tech' }),
          now,
        ),
      ).toBeNull()
    })

    it('returns null when event has many saves even without approaching-soon condition', () => {
      const far = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 10, language: 'sk', startsAtUtc: far }),
          now,
        ),
      ).toBeNull()
    })

    it('does NOT return "publishedApproachingSoon" when saves > 0 even if starting within 7 days', () => {
      const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()
      const type = eventRecommendationType(
        makeItem({ status: 'PUBLISHED', totalInterestedCount: 1, startsAtUtc: soon, language: 'en' }),
        now,
      )
      expect(type).toBeNull()
    })
  })
})

// ── eventRecommendationVariant ───────────────────────────────────────────────

describe('eventRecommendationVariant', () => {
  const now = new Date('2026-06-01T00:00:00Z')

  it('returns rec--rejected for REJECTED events', () => {
    const variant: RecommendationVariant = eventRecommendationVariant(
      makeItem({ status: 'REJECTED' }),
      now,
    )
    expect(variant).toBe('rec--rejected')
  })

  it('returns rec--draft for DRAFT events', () => {
    expect(eventRecommendationVariant(makeItem({ status: 'DRAFT' }), now)).toBe('rec--draft')
  })

  it('returns rec--pending for PENDING_APPROVAL events', () => {
    expect(eventRecommendationVariant(makeItem({ status: 'PENDING_APPROVAL' }), now)).toBe('rec--pending')
  })

  it('returns rec--urgent for PUBLISHED event starting within 7 days with no saves', () => {
    const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(
      eventRecommendationVariant(
        makeItem({ status: 'PUBLISHED', totalInterestedCount: 0, startsAtUtc: soon }),
        now,
      ),
    ).toBe('rec--urgent')
  })

  it('returns rec--guidance for PUBLISHED event with no saves starting in more than 7 days', () => {
    const far = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
    expect(
      eventRecommendationVariant(
        makeItem({ status: 'PUBLISHED', totalInterestedCount: 0, startsAtUtc: far }),
        now,
      ),
    ).toBe('rec--guidance')
  })

  it('returns rec--guidance for PUBLISHED event with saves but missing language', () => {
    expect(
      eventRecommendationVariant(
        makeItem({ status: 'PUBLISHED', totalInterestedCount: 5, language: null }),
        now,
      ),
    ).toBe('rec--guidance')
  })

  it('returns rec--guidance when no specific condition is met (fallback)', () => {
    // PUBLISHED, has saves, has language — eventRecommendationType returns null
    // but the variant function still returns rec--guidance as the CSS fallback class
    expect(
      eventRecommendationVariant(
        makeItem({ status: 'PUBLISHED', totalInterestedCount: 3, language: 'en' }),
        now,
      ),
    ).toBe('rec--guidance')
  })

  it('returns rec--guidance for PUBLISHED event with saves but missing timezone', () => {
    expect(
      eventRecommendationVariant(
        makeItem({ status: 'PUBLISHED', totalInterestedCount: 5, language: 'en', timezone: null }),
        now,
      ),
    ).toBe('rec--guidance')
  })

  it('returns rec--guidance for PUBLISHED event with saves, language, timezone but missing domain', () => {
    expect(
      eventRecommendationVariant(
        makeItem({ status: 'PUBLISHED', totalInterestedCount: 3, language: 'de', timezone: 'Europe/Berlin', domainSlug: null }),
        now,
      ),
    ).toBe('rec--guidance')
  })

  it('does NOT return rec--urgent when PUBLISHED event has saves even if starting soon', () => {
    const soon = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(
      eventRecommendationVariant(
        makeItem({ status: 'PUBLISHED', totalInterestedCount: 1, startsAtUtc: soon }),
        now,
      ),
    ).toBe('rec--guidance')
  })
})

// ── Integration: combined guidance scenario ───────────────────────────────────

describe('Analytics guidance — combined scenario coverage', () => {
  it('high saves + recent calendar adds → no recommendation, active cal trend', () => {
    const now = new Date()
    const item = makeItem({
      status: 'PUBLISHED',
      totalInterestedCount: 20,
      interestedLast7Days: 5,
      totalCalendarActions: 4,
      calendarActionsLast7Days: 2,
      language: 'en',
    })
    expect(eventRecommendationType(item, now)).toBeNull()
    expect(saveTrendVariant(item)).toBe('trend--active')
    expect(calendarTrendVariant(item)).toBe('trend--active')
  })

  it('saves exist but zero calendar adds → no recommendation, quiet cal trend', () => {
    const now = new Date()
    const item = makeItem({
      status: 'PUBLISHED',
      totalInterestedCount: 8,
      interestedLast30Days: 3,
      totalCalendarActions: 0,
      calendarActionsLast7Days: 0,
      calendarActionsLast30Days: 0,
      language: 'sk',
    })
    expect(eventRecommendationType(item, now)).toBeNull()
    expect(saveTrendVariant(item)).toBe('trend--recent')
    expect(calendarTrendVariant(item)).toBe('trend--quiet')
  })

  it('zero saves + recent calendar actions → publishedNoSaves recommendation (calendar adds alone do not satisfy the save count)', () => {
    const now = new Date('2026-06-01T00:00:00Z')
    const far = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString()
    const item = makeItem({
      status: 'PUBLISHED',
      totalInterestedCount: 0,
      totalCalendarActions: 3,
      calendarActionsLast7Days: 3,
      startsAtUtc: far,
      language: 'en',
    })
    expect(eventRecommendationType(item, now)).toBe('publishedNoSaves')
    expect(calendarTrendVariant(item)).toBe('trend--active')
    expect(eventRecommendationVariant(item, now)).toBe('rec--guidance')
  })
})

// ── classifyDashboardAnalyticsState ──────────────────────────────────────────

import {
  classifyDashboardAnalyticsState,
  type DashboardAnalyticsState,
} from '@/composables/useAnalyticsGuidance'
import type { DashboardOverview } from '@/types'

/** Minimal DashboardOverview stub for classifier tests. */
function makeOverview(
  overrides: Partial<
    Pick<DashboardOverview, 'publishedEvents' | 'totalInterestedCount' | 'eventAnalytics'>
  > = {},
): Pick<DashboardOverview, 'publishedEvents' | 'totalInterestedCount' | 'eventAnalytics'> {
  return {
    publishedEvents: 0,
    totalInterestedCount: 0,
    eventAnalytics: [],
    ...overrides,
  }
}

/** Creates a single published EventAnalyticsItem for use in overview.eventAnalytics. */
function makePublishedAnalyticsItem(publishedDaysAgo: number, now: Date): EventAnalyticsItem {
  const publishedAtUtc = new Date(now.getTime() - publishedDaysAgo * 24 * 60 * 60 * 1000).toISOString()
  return makeItem({ status: 'PUBLISHED', publishedAtUtc })
}

describe('classifyDashboardAnalyticsState', () => {
  const now = new Date('2026-06-01T00:00:00Z')

  // ── empty state ────────────────────────────────────────────────────────────

  it('returns "empty" when there are no published events', () => {
    const state: DashboardAnalyticsState = classifyDashboardAnalyticsState(
      makeOverview({ publishedEvents: 0, totalInterestedCount: 0, eventAnalytics: [] }),
      now,
    )
    expect(state).toBe('empty')
  })

  it('returns "empty" when publishedEvents is 0 even if totalInterestedCount > 0', () => {
    // Defensive: totalInterestedCount should be 0 when there are no published events,
    // but the classifier should not trust that and uses publishedEvents as the gate.
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({ publishedEvents: 0, totalInterestedCount: 10, eventAnalytics: [] }),
        now,
      ),
    ).toBe('empty')
  })

  // ── normal state ───────────────────────────────────────────────────────────

  it('returns "normal" when totalInterestedCount >= 5 (threshold)', () => {
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({
          publishedEvents: 1,
          totalInterestedCount: 5,
          eventAnalytics: [makePublishedAnalyticsItem(30, now)],
        }),
        now,
      ),
    ).toBe('normal')
  })

  it('returns "normal" when totalInterestedCount is well above threshold', () => {
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({
          publishedEvents: 2,
          totalInterestedCount: 42,
          eventAnalytics: [
            makePublishedAnalyticsItem(20, now),
            makePublishedAnalyticsItem(5, now),
          ],
        }),
        now,
      ),
    ).toBe('normal')
  })

  it('returns "normal" for a single published event with enough saves even if newly published', () => {
    // "normal" takes priority over "early" regardless of freshness
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({
          publishedEvents: 1,
          totalInterestedCount: 5,
          eventAnalytics: [makePublishedAnalyticsItem(2, now)], // published 2 days ago
        }),
        now,
      ),
    ).toBe('normal')
  })

  // ── early state ────────────────────────────────────────────────────────────

  it('returns "early" when all published events are within 14 days old and saves < 5', () => {
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({
          publishedEvents: 1,
          totalInterestedCount: 0,
          eventAnalytics: [makePublishedAnalyticsItem(7, now)],
        }),
        now,
      ),
    ).toBe('early')
  })

  it('returns "early" when two events both published within 14 days with low saves', () => {
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({
          publishedEvents: 2,
          totalInterestedCount: 2,
          eventAnalytics: [
            makePublishedAnalyticsItem(3, now),
            makePublishedAnalyticsItem(10, now),
          ],
        }),
        now,
      ),
    ).toBe('early')
  })

  it('returns "early" for an event published exactly 14 days ago (boundary included)', () => {
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({
          publishedEvents: 1,
          totalInterestedCount: 1,
          eventAnalytics: [makePublishedAnalyticsItem(14, now)],
        }),
        now,
      ),
    ).toBe('early')
  })

  it('returns "early" when newly published event has a few calendar adds but no saves', () => {
    const item = {
      ...makeItem({ status: 'PUBLISHED', publishedAtUtc: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString() }),
      totalCalendarActions: 2,
      calendarActionsLast7Days: 2,
    }
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({ publishedEvents: 1, totalInterestedCount: 0, eventAnalytics: [item] }),
        now,
      ),
    ).toBe('early')
  })

  // ── low_signal state ───────────────────────────────────────────────────────

  it('returns "low_signal" when event is older than 14 days with zero saves', () => {
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({
          publishedEvents: 1,
          totalInterestedCount: 0,
          eventAnalytics: [makePublishedAnalyticsItem(15, now)],
        }),
        now,
      ),
    ).toBe('low_signal')
  })

  it('returns "low_signal" when has 1-4 saves but event is older than 14 days (niche signal)', () => {
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({
          publishedEvents: 1,
          totalInterestedCount: 3,
          eventAnalytics: [makePublishedAnalyticsItem(30, now)],
        }),
        now,
      ),
    ).toBe('low_signal')
  })

  it('returns "low_signal" when one event is new and another is old (not ALL are newly published)', () => {
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({
          publishedEvents: 2,
          totalInterestedCount: 1,
          eventAnalytics: [
            makePublishedAnalyticsItem(5, now),  // new
            makePublishedAnalyticsItem(30, now), // old — breaks the "all new" condition
          ],
        }),
        now,
      ),
    ).toBe('low_signal')
  })

  it('returns "low_signal" when event published exactly 15 days ago (just outside early window)', () => {
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({
          publishedEvents: 1,
          totalInterestedCount: 0,
          eventAnalytics: [makePublishedAnalyticsItem(15, now)],
        }),
        now,
      ),
    ).toBe('low_signal')
  })

  it('returns "low_signal" when publishedAtUtc is null (unknown age → treated as old)', () => {
    // daysSincePublished(null) returns MAX_SAFE_INTEGER → > 14 days → not newly published
    const item = makeItem({ status: 'PUBLISHED', publishedAtUtc: null, totalInterestedCount: 0 })
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({ publishedEvents: 1, totalInterestedCount: 0, eventAnalytics: [item] }),
        now,
      ),
    ).toBe('low_signal')
  })

  // ── State progression scenario ─────────────────────────────────────────────

  it('full progression: empty → early → low_signal → normal as saves accumulate over time', () => {
    // Step 1: no published events yet
    expect(classifyDashboardAnalyticsState(makeOverview(), now)).toBe('empty')

    // Step 2: newly published, no saves
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({
          publishedEvents: 1,
          totalInterestedCount: 0,
          eventAnalytics: [makePublishedAnalyticsItem(3, now)],
        }),
        now,
      ),
    ).toBe('early')

    // Step 3: 2 saves after 20 days
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({
          publishedEvents: 1,
          totalInterestedCount: 2,
          eventAnalytics: [makePublishedAnalyticsItem(20, now)],
        }),
        now,
      ),
    ).toBe('low_signal')

    // Step 4: 5+ saves → normal
    expect(
      classifyDashboardAnalyticsState(
        makeOverview({
          publishedEvents: 1,
          totalInterestedCount: 5,
          eventAnalytics: [makePublishedAnalyticsItem(20, now)],
        }),
        now,
      ),
    ).toBe('normal')
  })
})
