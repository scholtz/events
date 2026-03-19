/**
 * useCalendar – composable for generating calendar exports from a CatalogEvent.
 *
 * Supports:
 *  - ICS file download (standards-compliant, works with Apple Calendar, Google Calendar, Outlook)
 *  - Google Calendar deep-link
 *  - Outlook.com deep-link
 *
 * All date/time values are kept in UTC to avoid client-side time-zone drift.
 * Online events include the event URL in the LOCATION field so attendees have
 * the join link directly inside their calendar app.
 *
 * Extension point: to add more providers, add a new `build*Url` function that
 * accepts a `CalendarEventInput` and returns a URL string.
 */

import type { CatalogEvent } from '@/types'

/** Normalised event data used by all calendar providers. */
export interface CalendarEventInput {
  title: string
  description: string
  startUtc: string
  endUtc: string | null
  location: string
  url: string
  organizerName: string | null
  /** Slug used to generate a stable UID for the ICS VEVENT. */
  uid: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert an ISO-8601 UTC date string to the compact ICS/iCalendar format
 * (YYYYMMDDTHHMMSSZ).  The trailing "Z" indicates UTC so that calendar clients
 * treat the event correctly regardless of the user's local time zone.
 */
function toIcsDate(isoUtc: string): string {
  return isoUtc.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace(/Z$/, 'Z')
}

/**
 * Returns a sensible fallback end time when the event has no explicit end:
 * start + 1 hour.
 */
function fallbackEndUtc(startUtc: string): string {
  const d = new Date(startUtc)
  d.setHours(d.getHours() + 1)
  return d.toISOString()
}

/**
 * Fold long ICS lines to 75-octet chunks as required by RFC 5545.
 * Continuation lines are prefixed with a single SPACE.
 */
function foldLine(line: string): string {
  const MAX = 75
  if (line.length <= MAX) return line
  const chunks: string[] = []
  let offset = 0
  while (offset < line.length) {
    if (offset === 0) {
      chunks.push(line.slice(0, MAX))
      offset += MAX
    } else {
      chunks.push(' ' + line.slice(offset, offset + MAX - 1))
      offset += MAX - 1
    }
  }
  return chunks.join('\r\n')
}

/**
 * Escape special characters in ICS property values per RFC 5545 §3.3.11.
 * Commas, semicolons, and backslashes must be escaped; newlines become \\n.
 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
}

// ---------------------------------------------------------------------------
// Event normalization
// ---------------------------------------------------------------------------

/**
 * Build a CalendarEventInput from a CatalogEvent, normalising location for
 * online events and populating sensible fallbacks for optional fields.
 */
export function eventToCalendarInput(event: CatalogEvent): CalendarEventInput {
  const isOnline = event.attendanceMode === 'ONLINE'
  const isHybrid = event.attendanceMode === 'HYBRID'

  // Build location string: online events use the event URL so attendees have
  // the join link directly in their calendar.
  let location: string
  if (isOnline) {
    location = event.eventUrl || 'Online event'
  } else {
    const parts = [event.venueName, event.addressLine1, event.city, event.countryCode].filter(
      Boolean,
    )
    location = parts.length > 0 ? parts.join(', ') : isHybrid ? event.eventUrl || '' : ''
  }

  // Build description: append join link for hybrid events so it's visible.
  let description = event.description || ''
  if (isOnline) {
    // For online events, the URL is already the location — no need to repeat in description
  } else if (isHybrid && event.eventUrl) {
    description += `\n\nJoin online: ${event.eventUrl}`
  }
  if (event.eventUrl) {
    description += `\n\nEvent page: ${event.eventUrl}`
  }
  description = description.trim()

  return {
    title: event.name,
    description,
    startUtc: event.startsAtUtc,
    endUtc: event.endsAtUtc || null,
    location,
    url: event.eventUrl || '',
    organizerName: event.submittedBy?.displayName ?? null,
    uid: `${event.slug}@events-platform`,
  }
}

// ---------------------------------------------------------------------------
// ICS generation
// ---------------------------------------------------------------------------

/**
 * Generates a standards-compliant ICS string for a single event.
 * The output is RFC 5545 conformant and importable by Apple Calendar,
 * Google Calendar, Outlook, and most other calendar clients.
 */
export function buildIcsContent(input: CalendarEventInput): string {
  const dtstamp = toIcsDate(new Date().toISOString())
  const dtstart = toIcsDate(input.startUtc)
  const dtend = toIcsDate(input.endUtc ?? fallbackEndUtc(input.startUtc))

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Events Platform//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    foldLine(`UID:${escapeIcsText(input.uid)}`),
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    foldLine(`SUMMARY:${escapeIcsText(input.title)}`),
    foldLine(`DESCRIPTION:${escapeIcsText(input.description)}`),
    foldLine(`LOCATION:${escapeIcsText(input.location)}`),
    foldLine(`URL:${input.url}`),
  ]

  if (input.organizerName) {
    lines.push(foldLine(`ORGANIZER;CN=${escapeIcsText(input.organizerName)}:mailto:noreply@events-platform.com`))
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')

  // ICS files use CRLF line endings per RFC 5545 §3.1
  return lines.join('\r\n')
}

/**
 * Triggers a browser download of the ICS file for the given event.
 * Returns the generated ICS content string (useful for testing).
 */
export function downloadIcs(event: CatalogEvent): string {
  const input = eventToCalendarInput(event)
  const ics = buildIcsContent(input)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${event.slug}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return ics
}

// ---------------------------------------------------------------------------
// Provider deep-links
// ---------------------------------------------------------------------------

/**
 * Build a Google Calendar "Add event" deep-link URL.
 * Opens the Google Calendar event creation form pre-populated with event data.
 */
export function buildGoogleCalendarUrl(input: CalendarEventInput): string {
  const dtstart = toIcsDate(input.startUtc)
  const dtend = toIcsDate(input.endUtc ?? fallbackEndUtc(input.startUtc))
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${dtstart}/${dtend}`,
    details: input.description,
    location: input.location,
    sprop: `website:${input.url}`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * Build an Outlook.com "Add event" deep-link URL.
 */
export function buildOutlookCalendarUrl(input: CalendarEventInput): string {
  const params = new URLSearchParams({
    subject: input.title,
    startdt: input.startUtc,
    enddt: input.endUtc ?? fallbackEndUtc(input.startUtc),
    body: input.description,
    location: input.location,
    path: '/calendar/action/compose',
    rru: 'addevent',
  })
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

/**
 * Vue composable for the "Add to calendar" feature.
 * Import this in EventDetailView and call the returned helpers.
 *
 * @example
 * const { downloadEventIcs, googleCalendarUrl, outlookCalendarUrl } = useCalendar(event)
 */
export function useCalendar(event: CatalogEvent) {
  const calendarInput = eventToCalendarInput(event)

  return {
    /** Immediately triggers an ICS file download for the event. */
    downloadEventIcs: () => downloadIcs(event),
    /** Google Calendar add-event URL. */
    googleCalendarUrl: buildGoogleCalendarUrl(calendarInput),
    /** Outlook.com add-event URL. */
    outlookCalendarUrl: buildOutlookCalendarUrl(calendarInput),
  }
}
