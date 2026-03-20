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
 *
 * Extension point: replace `dispatchAnalyticsEvent` with a real analytics
 * transport (e.g. POST to /api/analytics, send to a tracking service) when
 * the backend infrastructure is ready.
 */

export type CalendarProvider = 'ics' | 'google' | 'outlook'

export interface CalendarAnalyticsEvent {
  eventId: string
  eventSlug: string
  provider: CalendarProvider
  triggeredAtUtc: string
}

/**
 * Dispatch an add-to-calendar analytics event.
 *
 * Currently logs to the console in development and is a no-op in production
 * until a real analytics transport is wired in.  The function is async and
 * fire-and-forget — callers MUST NOT await it in the UI event handler.
 */
async function dispatchAnalyticsEvent(event: CalendarAnalyticsEvent): Promise<void> {
  // TODO: replace this stub with a real analytics transport.
  // Example: await fetch('/api/analytics/calendar-action', { method: 'POST', body: JSON.stringify(event) })
  if (import.meta.env.DEV) {
    console.debug('[calendar-analytics]', event)
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
