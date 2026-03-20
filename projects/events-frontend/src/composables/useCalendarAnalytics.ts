/**
 * useCalendarAnalytics – reusable analytics instrumentation for add-to-calendar actions.
 *
 * Records when users invoke an add-to-calendar entry point, capturing at minimum:
 *   - eventId and eventSlug (for future organiser reporting)
 *   - provider / export type ('google' | 'outlook' | 'ics')
 *   - timestamp (ISO-8601 UTC)
 *
 * The dispatch is intentionally fire-and-forget: it never blocks user navigation,
 * menu interactions, or file downloads.  Analytics failures are silently swallowed
 * to avoid degrading the attendee experience.
 *
 * Privacy: no personal data (user ID, email, IP) is collected here.  Only
 * aggregate product-usage signals are captured.
 */

import { gqlRequest } from '@/lib/graphql'

export type CalendarProvider = 'ics' | 'google' | 'outlook'

export interface CalendarAnalyticsEvent {
  eventId: string
  eventSlug: string
  provider: CalendarProvider
  triggeredAtUtc: string
}

const TRACK_CALENDAR_ACTION_MUTATION = `
  mutation TrackCalendarAction($input: TrackCalendarActionInput!) {
    trackCalendarAction(input: $input)
  }
`

/**
 * Dispatch an add-to-calendar analytics event via the GraphQL API.
 *
 * The function is async and fire-and-forget — callers MUST NOT await it in
 * the UI event handler.  Failures are silently swallowed.
 */
async function dispatchAnalyticsEvent(event: CalendarAnalyticsEvent): Promise<void> {
  // Map frontend lowercase provider to backend SCREAMING_SNAKE_CASE
  const provider = event.provider.toUpperCase()

  try {
    await gqlRequest<{ trackCalendarAction: boolean }>(TRACK_CALENDAR_ACTION_MUTATION, {
      input: { eventId: event.eventId, provider },
    })
  } catch {
    // Silently swallow analytics failures — never degrade the user experience
  }
}

/**
 * Composable that returns a `trackCalendarAction` helper bound to no particular
 * event.  Import this in EventDetailView (or any component that renders calendar
 * action buttons) and call the returned helper without awaiting it.
 *
 * @example
 * const { trackCalendarAction } = useCalendarAnalytics()
 * // In a click handler:
 * trackCalendarAction('google', event.id, event.slug)
 */
export function useCalendarAnalytics() {
  /**
   * Record a calendar action without blocking the caller.
   *
   * @param provider  Which calendar integration was invoked.
   * @param eventId   The UUID of the event being added to a calendar.
   * @param eventSlug The URL slug of the event (for human-readable log / reports).
   */
  function trackCalendarAction(provider: CalendarProvider, eventId: string, eventSlug: string): void {
    const payload: CalendarAnalyticsEvent = {
      eventId,
      eventSlug,
      provider,
      triggeredAtUtc: new Date().toISOString(),
    }
    // Fire-and-forget: intentionally not awaited so UI is never blocked
    dispatchAnalyticsEvent(payload).catch(() => {
      // Silently swallow analytics failures — never degrade the user experience
    })
  }

  return { trackCalendarAction }
}
