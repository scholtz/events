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
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 0, startsAtUtc: far }),
          now,
        ),
      ).toBe('publishedNoSaves')
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

    it('returns null when event has saves and language is set (no recommendation needed)', () => {
      expect(
        eventRecommendationType(
          makeItem({ status: 'PUBLISHED', totalInterestedCount: 2, language: 'en' }),
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
