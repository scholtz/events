/**
 * Unit tests for useCalendar utilities.
 *
 * Covers:
 *  - eventToCalendarInput: ONLINE / HYBRID / IN_PERSON location normalisation,
 *    description building, missing optional fields, organizer metadata
 *  - buildIcsContent: RFC 5545 structure, CRLF endings, UTC timestamps,
 *    text escaping (commas / semicolons / newlines / backslashes),
 *    75-octet line folding, fallback DTEND, organizer property
 *  - buildGoogleCalendarUrl / buildOutlookCalendarUrl: URL structure and params
 */

import { describe, expect, it } from 'vitest'
import {
  buildGoogleCalendarUrl,
  buildIcsContent,
  buildOutlookCalendarUrl,
  eventToCalendarInput,
} from '@/composables/useCalendar'
import type { CalendarEventInput } from '@/composables/useCalendar'
import type { CatalogEvent } from '@/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Build a minimal valid CatalogEvent for testing. */
function makeEvent(overrides: Partial<CatalogEvent> = {}): CatalogEvent {
  return {
    id: 'evt-1',
    name: 'Test Summit',
    slug: 'test-summit',
    description: 'A test event.',
    eventUrl: 'https://example.com/event',
    venueName: 'Grand Hall',
    addressLine1: '123 Main Street',
    city: 'Prague',
    countryCode: 'CZ',
    latitude: 50.075,
    longitude: 14.437,
    startsAtUtc: '2026-06-15T10:00:00Z',
    endsAtUtc: '2026-06-15T18:00:00Z',
    submittedAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
    publishedAtUtc: '2026-01-02T00:00:00Z',
    adminNotes: null,
    status: 'PUBLISHED',
    isFree: true,
    priceAmount: null,
    currencyCode: 'EUR',
    domainId: 'dom-1',
    domain: { id: 'dom-1', name: 'Technology', slug: 'technology' },
    submittedByUserId: 'user-1',
    submittedBy: { displayName: 'Alice Organizer' },
    reviewedByUserId: null,
    reviewedBy: null,
    mapUrl: 'https://osm.org',
    interestedCount: 0,
    attendanceMode: 'IN_PERSON',
    timezone: null,
    ...overrides,
  }
}

/** Minimal CalendarEventInput for testing buildIcsContent directly. */
function makeInput(overrides: Partial<CalendarEventInput> = {}): CalendarEventInput {
  return {
    title: 'Test Summit',
    description: 'A test event.',
    startUtc: '2026-06-15T10:00:00Z',
    endUtc: '2026-06-15T18:00:00Z',
    location: 'Grand Hall, 123 Main Street, Prague, CZ',
    url: 'https://example.com/event',
    organizerName: 'Alice Organizer',
    uid: 'test-summit@events-platform',
    timezone: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// eventToCalendarInput
// ---------------------------------------------------------------------------

describe('eventToCalendarInput', () => {
  describe('IN_PERSON events', () => {
    it('builds location from venue + address + city + countryCode', () => {
      const input = eventToCalendarInput(makeEvent({ attendanceMode: 'IN_PERSON' }))
      expect(input.location).toBe('Grand Hall, 123 Main Street, Prague, CZ')
    })

    it('omits empty location parts', () => {
      const input = eventToCalendarInput(
        makeEvent({ attendanceMode: 'IN_PERSON', venueName: '', addressLine1: '', city: 'Berlin', countryCode: 'DE' }),
      )
      expect(input.location).toBe('Berlin, DE')
    })

    it('returns empty string when all location fields are empty', () => {
      const input = eventToCalendarInput(
        makeEvent({ attendanceMode: 'IN_PERSON', venueName: '', addressLine1: '', city: '', countryCode: '' }),
      )
      expect(input.location).toBe('')
    })

    it('appends event URL to description as "Event page:" link', () => {
      const input = eventToCalendarInput(makeEvent({ attendanceMode: 'IN_PERSON' }))
      expect(input.description).toContain('Event page: https://example.com/event')
    })

    it('does not repeat join link in description for in-person events', () => {
      const input = eventToCalendarInput(makeEvent({ attendanceMode: 'IN_PERSON' }))
      expect(input.description).not.toContain('Join online:')
    })
  })

  describe('ONLINE events', () => {
    it('uses the event URL as location', () => {
      const input = eventToCalendarInput(
        makeEvent({ attendanceMode: 'ONLINE', eventUrl: 'https://zoom.example.com/join' }),
      )
      expect(input.location).toBe('https://zoom.example.com/join')
    })

    it('falls back to "Online event" when eventUrl is empty', () => {
      const input = eventToCalendarInput(makeEvent({ attendanceMode: 'ONLINE', eventUrl: '' }))
      expect(input.location).toBe('Online event')
    })

    it('does not include "Event page:" line in description for online events', () => {
      // For online events the URL is already the location, no need to repeat in description
      const input = eventToCalendarInput(
        makeEvent({ attendanceMode: 'ONLINE', eventUrl: 'https://zoom.example.com/join' }),
      )
      expect(input.description).not.toContain('Event page:')
    })

    it('does not include "Join online:" in description for online events', () => {
      const input = eventToCalendarInput(
        makeEvent({ attendanceMode: 'ONLINE', eventUrl: 'https://zoom.example.com/join' }),
      )
      expect(input.description).not.toContain('Join online:')
    })
  })

  describe('HYBRID events', () => {
    it('uses physical address as location', () => {
      const input = eventToCalendarInput(makeEvent({ attendanceMode: 'HYBRID' }))
      expect(input.location).toBe('Grand Hall, 123 Main Street, Prague, CZ')
    })

    it('falls back to event URL as location when no physical address', () => {
      const input = eventToCalendarInput(
        makeEvent({
          attendanceMode: 'HYBRID',
          venueName: '',
          addressLine1: '',
          city: '',
          countryCode: '',
          eventUrl: 'https://streaming.example.com',
        }),
      )
      expect(input.location).toBe('https://streaming.example.com')
    })

    it('appends "Join online:" link to description', () => {
      const input = eventToCalendarInput(
        makeEvent({ attendanceMode: 'HYBRID', eventUrl: 'https://stream.example.com' }),
      )
      expect(input.description).toContain('Join online: https://stream.example.com')
    })

    it('also appends "Event page:" link to description', () => {
      const input = eventToCalendarInput(
        makeEvent({ attendanceMode: 'HYBRID', eventUrl: 'https://stream.example.com' }),
      )
      expect(input.description).toContain('Event page: https://stream.example.com')
    })
  })

  describe('metadata mapping', () => {
    it('maps event name to title', () => {
      const input = eventToCalendarInput(makeEvent({ name: 'My Big Conference' }))
      expect(input.title).toBe('My Big Conference')
    })

    it('maps slug to uid with @events-platform suffix', () => {
      const input = eventToCalendarInput(makeEvent({ slug: 'my-big-conf' }))
      expect(input.uid).toBe('my-big-conf@events-platform')
    })

    it('maps submittedBy.displayName to organizerName', () => {
      const input = eventToCalendarInput(
        makeEvent({ submittedBy: { displayName: 'Bob Host' } }),
      )
      expect(input.organizerName).toBe('Bob Host')
    })

    it('maps startsAtUtc to startUtc', () => {
      const input = eventToCalendarInput(makeEvent({ startsAtUtc: '2026-09-01T08:30:00Z' }))
      expect(input.startUtc).toBe('2026-09-01T08:30:00Z')
    })

    it('maps endsAtUtc to endUtc', () => {
      const input = eventToCalendarInput(makeEvent({ endsAtUtc: '2026-09-01T16:00:00Z' }))
      expect(input.endUtc).toBe('2026-09-01T16:00:00Z')
    })

    it('sets endUtc to null when endsAtUtc is empty string', () => {
      const input = eventToCalendarInput(makeEvent({ endsAtUtc: '' }))
      expect(input.endUtc).toBeNull()
    })

    it('maps event URL to url field', () => {
      const input = eventToCalendarInput(makeEvent({ eventUrl: 'https://myevent.com' }))
      expect(input.url).toBe('https://myevent.com')
    })

    it('sets url to empty string when eventUrl is empty', () => {
      const input = eventToCalendarInput(makeEvent({ eventUrl: '' }))
      expect(input.url).toBe('')
    })
  })
})

// ---------------------------------------------------------------------------
// buildIcsContent – structure
// ---------------------------------------------------------------------------

describe('buildIcsContent', () => {
  describe('basic structure', () => {
    it('starts with BEGIN:VCALENDAR and ends with END:VCALENDAR', () => {
      const ics = buildIcsContent(makeInput())
      expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
      expect(ics.endsWith('END:VCALENDAR')).toBe(true)
    })

    it('contains required VCALENDAR properties', () => {
      const ics = buildIcsContent(makeInput())
      expect(ics).toContain('VERSION:2.0')
      expect(ics).toContain('CALSCALE:GREGORIAN')
      expect(ics).toContain('METHOD:PUBLISH')
      expect(ics).toContain('PRODID:-//Events Platform//Events//EN')
    })

    it('contains a single VEVENT block', () => {
      const ics = buildIcsContent(makeInput())
      expect(ics).toContain('BEGIN:VEVENT')
      expect(ics).toContain('END:VEVENT')
    })

    it('includes UID from input', () => {
      const ics = buildIcsContent(makeInput({ uid: 'my-slug@events-platform' }))
      expect(ics).toContain('UID:my-slug@events-platform')
    })

    it('includes SUMMARY from title', () => {
      const ics = buildIcsContent(makeInput({ title: 'Tech Summit 2026' }))
      expect(ics).toContain('SUMMARY:Tech Summit 2026')
    })

    it('includes URL property', () => {
      const ics = buildIcsContent(makeInput({ url: 'https://example.com/event' }))
      expect(ics).toContain('URL:https://example.com/event')
    })
  })

  describe('line endings', () => {
    it('uses CRLF line endings throughout (RFC 5545 §3.1)', () => {
      const ics = buildIcsContent(makeInput())
      // Every line must end with \r\n
      const lines = ics.split('\r\n')
      expect(lines.length).toBeGreaterThan(5)
      // No bare \n without preceding \r
      expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
    })
  })

  describe('UTC date formatting', () => {
    it('formats DTSTART as YYYYMMDDTHHMMSSZ', () => {
      const ics = buildIcsContent(makeInput({ startUtc: '2026-06-15T10:30:00Z' }))
      expect(ics).toContain('DTSTART:20260615T103000Z')
    })

    it('formats DTEND as YYYYMMDDTHHMMSSZ', () => {
      const ics = buildIcsContent(makeInput({ endUtc: '2026-06-15T18:45:00Z' }))
      expect(ics).toContain('DTEND:20260615T184500Z')
    })

    it('strips fractional seconds from timestamps', () => {
      const ics = buildIcsContent(makeInput({ startUtc: '2026-06-15T10:30:00.000Z' }))
      expect(ics).toContain('DTSTART:20260615T103000Z')
      // The dot-prefixed fractional part must be removed (e.g. ".000" should not appear)
      expect(ics).not.toContain('.000Z')
    })

    it('uses fallback DTEND of start + 1 hour when endUtc is null', () => {
      const ics = buildIcsContent(makeInput({ startUtc: '2026-06-15T10:00:00Z', endUtc: null }))
      // start + 1 hour = 11:00
      expect(ics).toContain('DTEND:20260615T110000Z')
    })

    it('handles midnight boundary for fallback DTEND', () => {
      // Start at 23:00 → end at 00:00 next day
      const ics = buildIcsContent(makeInput({ startUtc: '2026-06-15T23:00:00Z', endUtc: null }))
      expect(ics).toContain('DTEND:20260616T000000Z')
    })
  })

  describe('text escaping (RFC 5545 §3.3.11)', () => {
    it('escapes commas in SUMMARY', () => {
      const ics = buildIcsContent(makeInput({ title: 'Summit, Workshop' }))
      expect(ics).toContain('SUMMARY:Summit\\, Workshop')
    })

    it('escapes semicolons in SUMMARY', () => {
      const ics = buildIcsContent(makeInput({ title: 'Day 1; Day 2' }))
      expect(ics).toContain('SUMMARY:Day 1\\; Day 2')
    })

    it('escapes backslashes in DESCRIPTION', () => {
      const ics = buildIcsContent(makeInput({ description: 'Path: C:\\Events\\2026' }))
      expect(ics).toContain('DESCRIPTION:Path: C:\\\\Events\\\\2026')
    })

    it('escapes newlines in DESCRIPTION as \\n', () => {
      const ics = buildIcsContent(makeInput({ description: 'Line 1\nLine 2' }))
      expect(ics).toContain('DESCRIPTION:Line 1\\nLine 2')
    })

    it('strips carriage returns from DESCRIPTION', () => {
      const ics = buildIcsContent(makeInput({ description: 'Line 1\r\nLine 2' }))
      // \r is stripped, \n is escaped as \n
      expect(ics).toContain('DESCRIPTION:Line 1\\nLine 2')
    })

    it('escapes commas in LOCATION', () => {
      const ics = buildIcsContent(makeInput({ location: 'Hall A, Room 1, Prague' }))
      expect(ics).toContain('LOCATION:Hall A\\, Room 1\\, Prague')
    })

    it('escapes semicolons in LOCATION', () => {
      const ics = buildIcsContent(makeInput({ location: 'Venue; Annex' }))
      expect(ics).toContain('LOCATION:Venue\\; Annex')
    })
  })

  describe('line folding (RFC 5545 §3.1)', () => {
    it('does not fold short lines', () => {
      const ics = buildIcsContent(makeInput({ title: 'Short Title' }))
      const summaryLine = ics.split('\r\n').find((l) => l.startsWith('SUMMARY:'))
      expect(summaryLine).toBeDefined()
      expect(summaryLine!.length).toBeLessThanOrEqual(75)
    })

    it('folds SUMMARY lines longer than 75 octets', () => {
      const longTitle = 'A'.repeat(80)
      const ics = buildIcsContent(makeInput({ title: longTitle }))
      const lines = ics.split('\r\n')
      const summaryIdx = lines.findIndex((l) => l.startsWith('SUMMARY:'))
      expect(summaryIdx).toBeGreaterThanOrEqual(0)
      // First chunk must be exactly 75 characters
      expect(lines[summaryIdx].length).toBe(75)
      // Continuation line starts with a space
      expect(lines[summaryIdx + 1].startsWith(' ')).toBe(true)
    })

    it('folds DESCRIPTION lines longer than 75 octets', () => {
      const longDesc = 'X'.repeat(200)
      const ics = buildIcsContent(makeInput({ description: longDesc }))
      const lines = ics.split('\r\n')
      const descIdx = lines.findIndex((l) => l.startsWith('DESCRIPTION:'))
      expect(descIdx).toBeGreaterThanOrEqual(0)
      expect(lines[descIdx].length).toBe(75)
      expect(lines[descIdx + 1].startsWith(' ')).toBe(true)
    })

    it('ensures no individual line exceeds 75 octets', () => {
      const ics = buildIcsContent(
        makeInput({
          title: 'A'.repeat(200),
          description: 'B'.repeat(300),
          location: 'C'.repeat(150),
        }),
      )
      const lines = ics.split('\r\n')
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(75)
      }
    })
  })

  describe('organizer property', () => {
    it('includes ORGANIZER when organizerName is provided', () => {
      const ics = buildIcsContent(makeInput({ organizerName: 'Alice Organizer' }))
      expect(ics).toContain('ORGANIZER;CN=Alice Organizer:mailto:')
    })

    it('omits ORGANIZER when organizerName is null', () => {
      const ics = buildIcsContent(makeInput({ organizerName: null }))
      expect(ics).not.toContain('ORGANIZER')
    })

    it('escapes commas in organizer name', () => {
      const ics = buildIcsContent(makeInput({ organizerName: 'Smith, Alice' }))
      expect(ics).toContain('ORGANIZER;CN=Smith\\, Alice:mailto:')
    })
  })

  describe('DTSTAMP', () => {
    it('includes a DTSTAMP property', () => {
      const ics = buildIcsContent(makeInput())
      expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/)
    })
  })
})

// ---------------------------------------------------------------------------
// buildGoogleCalendarUrl
// ---------------------------------------------------------------------------

describe('buildGoogleCalendarUrl', () => {
  it('returns a URL pointing to calendar.google.com', () => {
    const url = buildGoogleCalendarUrl(makeInput())
    expect(url).toContain('https://calendar.google.com/calendar/render')
  })

  it('includes action=TEMPLATE parameter', () => {
    const url = buildGoogleCalendarUrl(makeInput())
    expect(url).toContain('action=TEMPLATE')
  })

  it('includes the event title in text param', () => {
    const url = buildGoogleCalendarUrl(makeInput({ title: 'Tech Conference' }))
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('text')).toBe('Tech Conference')
  })

  it('includes dates in YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ format', () => {
    const url = buildGoogleCalendarUrl(
      makeInput({ startUtc: '2026-06-15T10:00:00Z', endUtc: '2026-06-15T18:00:00Z' }),
    )
    expect(decodeURIComponent(url)).toContain('dates=20260615T100000Z/20260615T180000Z')
  })

  it('uses fallback end time when endUtc is null', () => {
    const url = buildGoogleCalendarUrl(makeInput({ startUtc: '2026-06-15T10:00:00Z', endUtc: null }))
    expect(decodeURIComponent(url)).toContain('dates=20260615T100000Z/20260615T110000Z')
  })

  it('includes location param', () => {
    const url = buildGoogleCalendarUrl(makeInput({ location: 'Grand Hall, Prague' }))
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('location')).toBe('Grand Hall, Prague')
  })

  it('includes event URL in sprop param', () => {
    const url = buildGoogleCalendarUrl(makeInput({ url: 'https://example.com/event' }))
    expect(decodeURIComponent(url)).toContain('website:https://example.com/event')
  })

  it('uses event URL as location for online events', () => {
    const onlineEvent = makeEvent({
      attendanceMode: 'ONLINE',
      eventUrl: 'https://zoom.example.com/join/123',
    })
    const input = eventToCalendarInput(onlineEvent)
    const url = buildGoogleCalendarUrl(input)
    expect(decodeURIComponent(url)).toContain('location=https://zoom.example.com/join/123')
  })
})

// ---------------------------------------------------------------------------
// buildOutlookCalendarUrl
// ---------------------------------------------------------------------------

describe('buildOutlookCalendarUrl', () => {
  it('returns a URL pointing to outlook.live.com', () => {
    const url = buildOutlookCalendarUrl(makeInput())
    expect(url).toContain('https://outlook.live.com/calendar')
  })

  it('includes rru=addevent parameter', () => {
    const url = buildOutlookCalendarUrl(makeInput())
    expect(url).toContain('rru=addevent')
  })

  it('includes the event title in subject param', () => {
    const url = buildOutlookCalendarUrl(makeInput({ title: 'Tech Conference' }))
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('subject')).toBe('Tech Conference')
  })

  it('includes start date in ISO format', () => {
    const url = buildOutlookCalendarUrl(makeInput({ startUtc: '2026-06-15T10:00:00Z' }))
    expect(decodeURIComponent(url)).toContain('startdt=2026-06-15T10:00:00Z')
  })

  it('includes end date in ISO format', () => {
    const url = buildOutlookCalendarUrl(makeInput({ endUtc: '2026-06-15T18:00:00Z' }))
    expect(decodeURIComponent(url)).toContain('enddt=2026-06-15T18:00:00Z')
  })

  it('uses fallback end time when endUtc is null', () => {
    const url = buildOutlookCalendarUrl(makeInput({ startUtc: '2026-06-15T10:00:00Z', endUtc: null }))
    expect(decodeURIComponent(url)).toContain('enddt=2026-06-15T11:00:00.000Z')
  })

  it('includes location param', () => {
    const url = buildOutlookCalendarUrl(makeInput({ location: 'Grand Hall, Prague' }))
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('location')).toBe('Grand Hall, Prague')
  })

  it('uses event URL as location for online events', () => {
    const onlineEvent = makeEvent({
      attendanceMode: 'ONLINE',
      eventUrl: 'https://teams.example.com/meet/abc',
    })
    const input = eventToCalendarInput(onlineEvent)
    const url = buildOutlookCalendarUrl(input)
    expect(decodeURIComponent(url)).toContain('location=https://teams.example.com/meet/abc')
  })
})

// ---------------------------------------------------------------------------
// End-to-end: eventToCalendarInput → buildIcsContent integration
// ---------------------------------------------------------------------------

describe('ICS generation end-to-end', () => {
  it('generates valid ICS for a typical in-person event', () => {
    const event = makeEvent()
    const input = eventToCalendarInput(event)
    const ics = buildIcsContent(input)

    expect(ics).toContain('SUMMARY:Test Summit')
    expect(ics).toContain('LOCATION:Grand Hall\\, 123 Main Street\\, Prague\\, CZ')
    expect(ics).toContain('DTSTART:20260615T100000Z')
    expect(ics).toContain('DTEND:20260615T180000Z')
    expect(ics).toContain('URL:https://example.com/event')
    expect(ics).toContain('ORGANIZER;CN=Alice Organizer:mailto:')
  })

  it('generates valid ICS for an online event with join URL as location', () => {
    const event = makeEvent({
      attendanceMode: 'ONLINE',
      eventUrl: 'https://zoom.example.com/j/123456',
    })
    const input = eventToCalendarInput(event)
    const ics = buildIcsContent(input)

    // Location must be the join URL
    expect(ics).toContain('LOCATION:https://zoom.example.com/j/123456')
    // Description should not contain "Event page:" or "Join online:" for ONLINE events
    expect(ics).not.toContain('Event page:')
    expect(ics).not.toContain('Join online:')
  })

  it('generates valid ICS for a hybrid event with both physical address and join link', () => {
    const event = makeEvent({
      attendanceMode: 'HYBRID',
      eventUrl: 'https://stream.example.com/live',
    })
    const input = eventToCalendarInput(event)
    const ics = buildIcsContent(input)

    // Location uses physical address for hybrid
    expect(ics).toContain('LOCATION:Grand Hall\\, 123 Main Street\\, Prague\\, CZ')
    // Description includes both join link and event page
    expect(ics).toContain('Join online: https://stream.example.com/live')
    expect(ics).toContain('Event page: https://stream.example.com/live')
  })

  it('applies fallback DTEND when event has no end time', () => {
    const event = makeEvent({ startsAtUtc: '2026-09-20T14:00:00Z', endsAtUtc: '' })
    const input = eventToCalendarInput(event)
    const ics = buildIcsContent(input)

    expect(ics).toContain('DTSTART:20260920T140000Z')
    expect(ics).toContain('DTEND:20260920T150000Z')
  })

  it('omits ORGANIZER line when organizerName is null', () => {
    const event = makeEvent()
    const input = eventToCalendarInput(event)
    const inputNoOrganizer: CalendarEventInput = { ...input, organizerName: null }
    const ics = buildIcsContent(inputNoOrganizer)

    expect(ics).not.toContain('ORGANIZER')
  })

  it('ICS is importable structure: all required VEVENT fields present', () => {
    const event = makeEvent()
    const ics = buildIcsContent(eventToCalendarInput(event))

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toMatch(/UID:.+/)
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/)
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/)
    expect(ics).toMatch(/DTEND:\d{8}T\d{6}Z/)
    expect(ics).toMatch(/SUMMARY:.+/)
    expect(ics).toContain('END:VEVENT')
    expect(ics).toContain('END:VCALENDAR')
  })
})

// ---------------------------------------------------------------------------
// Timezone-aware calendar export
// ---------------------------------------------------------------------------

describe('timezone-aware ICS generation', () => {
  it('uses DTSTART;TZID= format when timezone is provided', () => {
    const ics = buildIcsContent(
      makeInput({ timezone: 'Europe/Prague', startUtc: '2026-06-15T10:00:00Z' }),
    )
    // Must use TZID format, not UTC Z-suffix for DTSTART
    expect(ics).toContain('DTSTART;TZID=Europe/Prague:')
    expect(ics).not.toContain('DTSTART:20260615T')
  })

  it('uses DTEND;TZID= format when timezone is provided', () => {
    const ics = buildIcsContent(
      makeInput({ timezone: 'Europe/Prague', endUtc: '2026-06-15T18:00:00Z' }),
    )
    expect(ics).toContain('DTEND;TZID=Europe/Prague:')
    expect(ics).not.toContain('DTEND:20260615T')
  })

  it('includes X-WR-TIMEZONE header when timezone is provided', () => {
    const ics = buildIcsContent(makeInput({ timezone: 'America/New_York' }))
    expect(ics).toContain('X-WR-TIMEZONE:America/New_York')
  })

  it('does NOT include X-WR-TIMEZONE when timezone is null', () => {
    const ics = buildIcsContent(makeInput({ timezone: null }))
    expect(ics).not.toContain('X-WR-TIMEZONE')
  })

  it('falls back to UTC Z-suffix when timezone is null', () => {
    const ics = buildIcsContent(
      makeInput({ timezone: null, startUtc: '2026-06-15T10:00:00Z' }),
    )
    expect(ics).toContain('DTSTART:20260615T100000Z')
  })

  it('correctly converts UTC time to Prague local time (UTC+2 in June)', () => {
    // Prague is UTC+2 in June (CEST).  10:00 UTC → 12:00 Prague local.
    const ics = buildIcsContent(
      makeInput({ timezone: 'Europe/Prague', startUtc: '2026-06-15T10:00:00Z' }),
    )
    expect(ics).toContain('DTSTART;TZID=Europe/Prague:20260615T120000')
  })

  it('correctly converts UTC time to New York local time (UTC-4 in June)', () => {
    // New York is UTC-4 in June (EDT).  14:00 UTC → 10:00 New York local.
    const ics = buildIcsContent(
      makeInput({ timezone: 'America/New_York', startUtc: '2026-06-15T14:00:00Z' }),
    )
    expect(ics).toContain('DTSTART;TZID=America/New_York:20260615T100000')
  })

  it('uses fallback DTEND with TZID when endUtc is null', () => {
    const ics = buildIcsContent(
      makeInput({
        timezone: 'Europe/Prague',
        startUtc: '2026-06-15T10:00:00Z',
        endUtc: null,
      }),
    )
    // Fallback end = start + 1h = 11:00 UTC → 13:00 Prague local (UTC+2)
    expect(ics).toContain('DTEND;TZID=Europe/Prague:20260615T130000')
  })

  it('eventToCalendarInput maps timezone from event to input', () => {
    const event = makeEvent({ timezone: 'Europe/Prague' })
    const input = eventToCalendarInput(event)
    expect(input.timezone).toBe('Europe/Prague')
  })

  it('eventToCalendarInput sets timezone to null when event has no timezone', () => {
    const event = makeEvent({ timezone: null })
    const input = eventToCalendarInput(event)
    expect(input.timezone).toBeNull()
  })
})

describe('timezone-aware Google Calendar URL', () => {
  it('includes ctz parameter when timezone is provided', () => {
    const url = buildGoogleCalendarUrl(makeInput({ timezone: 'Europe/Prague' }))
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('ctz')).toBe('Europe/Prague')
  })

  it('does NOT include ctz parameter when timezone is null', () => {
    const url = buildGoogleCalendarUrl(makeInput({ timezone: null }))
    expect(url).not.toContain('ctz=')
  })

  it('sets correct ctz for America/New_York', () => {
    const url = buildGoogleCalendarUrl(makeInput({ timezone: 'America/New_York' }))
    expect(decodeURIComponent(url)).toContain('ctz=America/New_York')
  })
})
