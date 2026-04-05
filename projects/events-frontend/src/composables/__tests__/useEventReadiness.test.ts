import { describe, it, expect } from 'vitest'
import {
  computeEventReadiness,
  lifecycleStatusKey,
  lifecycleStatusVariant,
  MIN_DESCRIPTION_LENGTH,
  type EventFormSnapshot,
} from '../useEventReadiness'

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A fully complete form that should produce no blocking issues or recommendations. */
function makeCompleteForm(overrides: Partial<EventFormSnapshot> = {}): EventFormSnapshot {
  return {
    name: 'Prague Crypto Summit',
    description: 'A great conference covering blockchain technology in Central Europe with expert speakers.',
    domainSlug: 'crypto',
    startsAtUtc: '2026-07-15',
    eventUrl: 'https://example.com/event',
    timezone: 'Europe/Prague',
    attendanceMode: 'IN_PERSON',
    venueName: 'Prague Congress Centre',
    city: 'Prague',
    isFree: true,
    priceAmount: '',
    ...overrides,
  }
}

// ── canSubmit ─────────────────────────────────────────────────────────────────

describe('computeEventReadiness', () => {
  it('canSubmit is true for a fully complete form', () => {
    const result = computeEventReadiness(makeCompleteForm())
    expect(result.canSubmit).toBe(true)
    expect(result.blockingIssues).toHaveLength(0)
  })

  it('canSubmit is false when title is missing', () => {
    const result = computeEventReadiness(makeCompleteForm({ name: '' }))
    expect(result.canSubmit).toBe(false)
    expect(result.blockingIssues.some((i) => i.key === 'missingTitle')).toBe(true)
  })

  it('canSubmit is false when title is only whitespace', () => {
    const result = computeEventReadiness(makeCompleteForm({ name: '   ' }))
    expect(result.canSubmit).toBe(false)
    expect(result.blockingIssues.some((i) => i.key === 'missingTitle')).toBe(true)
  })

  it('canSubmit is false when description is missing', () => {
    const result = computeEventReadiness(makeCompleteForm({ description: '' }))
    expect(result.canSubmit).toBe(false)
    expect(result.blockingIssues.some((i) => i.key === 'missingDescription')).toBe(true)
  })

  it('canSubmit is false when domainSlug is missing', () => {
    const result = computeEventReadiness(makeCompleteForm({ domainSlug: '' }))
    expect(result.canSubmit).toBe(false)
    expect(result.blockingIssues.some((i) => i.key === 'missingDomain')).toBe(true)
  })

  it('canSubmit is false when startsAtUtc is missing', () => {
    const result = computeEventReadiness(makeCompleteForm({ startsAtUtc: '' }))
    expect(result.canSubmit).toBe(false)
    expect(result.blockingIssues.some((i) => i.key === 'missingStartDate')).toBe(true)
  })

  it('canSubmit is false when eventUrl is missing', () => {
    const result = computeEventReadiness(makeCompleteForm({ eventUrl: '' }))
    expect(result.canSubmit).toBe(false)
    expect(result.blockingIssues.some((i) => i.key === 'missingEventUrl')).toBe(true)
  })

  it('canSubmit is false when eventUrl is not a valid URL', () => {
    const result = computeEventReadiness(makeCompleteForm({ eventUrl: 'not-a-url' }))
    expect(result.canSubmit).toBe(false)
    expect(result.blockingIssues.some((i) => i.key === 'invalidEventUrl')).toBe(true)
  })

  it('canSubmit is false when event is paid with invalid price', () => {
    const result = computeEventReadiness(makeCompleteForm({ isFree: false, priceAmount: 'abc' }))
    expect(result.canSubmit).toBe(false)
    expect(result.blockingIssues.some((i) => i.key === 'invalidPrice')).toBe(true)
  })

  it('canSubmit is false when event is paid with negative price', () => {
    const result = computeEventReadiness(makeCompleteForm({ isFree: false, priceAmount: '-5' }))
    expect(result.canSubmit).toBe(false)
    expect(result.blockingIssues.some((i) => i.key === 'invalidPrice')).toBe(true)
  })

  it('canSubmit is true when event is paid with valid price', () => {
    const result = computeEventReadiness(makeCompleteForm({ isFree: false, priceAmount: '49.99' }))
    expect(result.canSubmit).toBe(true)
  })

  it('canSubmit is true when event is free even with empty priceAmount', () => {
    const result = computeEventReadiness(makeCompleteForm({ isFree: true, priceAmount: '' }))
    expect(result.canSubmit).toBe(true)
  })

  // ── Recommendations (non-blocking) ──────────────────────────────────────────

  it('recommends timezone when missing', () => {
    const result = computeEventReadiness(makeCompleteForm({ timezone: '' }))
    expect(result.canSubmit).toBe(true)
    expect(result.recommendations.some((i) => i.key === 'missingTimezone')).toBe(true)
  })

  it('recommends venue when IN_PERSON and venueName is empty', () => {
    const result = computeEventReadiness(makeCompleteForm({ attendanceMode: 'IN_PERSON', venueName: '' }))
    expect(result.canSubmit).toBe(true)
    expect(result.recommendations.some((i) => i.key === 'missingVenue')).toBe(true)
  })

  it('recommends venue when HYBRID and venueName is empty', () => {
    const result = computeEventReadiness(makeCompleteForm({ attendanceMode: 'HYBRID', venueName: '' }))
    expect(result.recommendations.some((i) => i.key === 'missingVenue')).toBe(true)
  })

  it('does not recommend venue when ONLINE', () => {
    const result = computeEventReadiness(makeCompleteForm({ attendanceMode: 'ONLINE', venueName: '' }))
    expect(result.recommendations.some((i) => i.key === 'missingVenue')).toBe(false)
  })

  it('recommends city when IN_PERSON and city is empty', () => {
    const result = computeEventReadiness(makeCompleteForm({ attendanceMode: 'IN_PERSON', city: '' }))
    expect(result.recommendations.some((i) => i.key === 'missingCity')).toBe(true)
  })

  it('does not recommend city when ONLINE', () => {
    const result = computeEventReadiness(makeCompleteForm({ attendanceMode: 'ONLINE', city: '' }))
    expect(result.recommendations.some((i) => i.key === 'missingCity')).toBe(false)
  })

  it('recommends longer description when description is non-empty but below min length', () => {
    const shortDesc = 'Short.'
    expect(shortDesc.length).toBeLessThan(MIN_DESCRIPTION_LENGTH)
    const result = computeEventReadiness(makeCompleteForm({ description: shortDesc }))
    expect(result.canSubmit).toBe(true)
    expect(result.recommendations.some((i) => i.key === 'shortDescription')).toBe(true)
  })

  it('does not recommend longer description when description is exactly min length', () => {
    const desc = 'A'.repeat(MIN_DESCRIPTION_LENGTH)
    const result = computeEventReadiness(makeCompleteForm({ description: desc }))
    expect(result.recommendations.some((i) => i.key === 'shortDescription')).toBe(false)
  })

  it('does not recommend longer description when description is missing (blocking issue takes precedence)', () => {
    const result = computeEventReadiness(makeCompleteForm({ description: '' }))
    expect(result.recommendations.some((i) => i.key === 'shortDescription')).toBe(false)
    expect(result.blockingIssues.some((i) => i.key === 'missingDescription')).toBe(true)
  })

  it('items list is ordered blocking first, then recommendations', () => {
    // Missing title (blocking) + missing timezone (recommended)
    const result = computeEventReadiness(makeCompleteForm({ name: '', timezone: '' }))
    const blockingIdx = result.items.findIndex((i) => i.key === 'missingTitle')
    const recIdx = result.items.findIndex((i) => i.key === 'missingTimezone')
    expect(blockingIdx).toBeLessThan(recIdx)
  })

  it('returns zero items for a perfect form', () => {
    const result = computeEventReadiness(makeCompleteForm())
    expect(result.items).toHaveLength(0)
  })
})

// ── Lifecycle helpers ─────────────────────────────────────────────────────────

describe('lifecycleStatusKey', () => {
  it('returns draft for DRAFT', () => {
    expect(lifecycleStatusKey('DRAFT')).toBe('draft')
  })
  it('returns pending for PENDING_APPROVAL', () => {
    expect(lifecycleStatusKey('PENDING_APPROVAL')).toBe('pending')
  })
  it('returns published for PUBLISHED', () => {
    expect(lifecycleStatusKey('PUBLISHED')).toBe('published')
  })
  it('returns rejected for REJECTED', () => {
    expect(lifecycleStatusKey('REJECTED')).toBe('rejected')
  })
})

describe('lifecycleStatusVariant', () => {
  it('returns status--draft for DRAFT', () => {
    expect(lifecycleStatusVariant('DRAFT')).toBe('status--draft')
  })
  it('returns status--pending for PENDING_APPROVAL', () => {
    expect(lifecycleStatusVariant('PENDING_APPROVAL')).toBe('status--pending')
  })
  it('returns status--published for PUBLISHED', () => {
    expect(lifecycleStatusVariant('PUBLISHED')).toBe('status--published')
  })
  it('returns status--rejected for REJECTED', () => {
    expect(lifecycleStatusVariant('REJECTED')).toBe('status--rejected')
  })
})
