/**
 * Event submission and event detail page tests.
 */
import { expect, test } from '@playwright/test'
import {
  loginAs,
  makeAdminUser,
  makeApprovedEvent,
  makeTechDomain,
  setupMockApi,
} from './helpers/mock-api'

test.describe('Submit event form', () => {
  test('renders all required fields', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/submit')

    await expect(page.getByLabel('Event Title *')).toBeVisible()
    await expect(page.getByLabel('Description *')).toBeVisible()
    await expect(page.getByLabel('Domain *')).toBeVisible()
    await expect(page.getByLabel('Start Date *')).toBeVisible()
    await expect(page.getByLabel('Free event')).toBeVisible()
    await expect(page.getByLabel('Website / Registration URL *')).toBeVisible()
  })

  test('shows domain options from API', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/submit')

    const select = page.getByLabel('Domain *')
    await expect(select.getByRole('option', { name: 'Technology' })).toBeAttached()
  })

  test('submit button is disabled mid-submission', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page, { users: [admin], domains: [makeTechDomain()] })
    state.currentUserId = admin.id

    await page.goto('/submit')

    await page.getByLabel('Event Title *').fill('Async Test Event')
    await page.getByLabel('Description *').fill('Testing async disable.')
    await page.getByLabel('Domain *').selectOption('technology')
    await page.getByLabel('Start Date *').fill('2026-05-01')
    await page.getByLabel('Website / Registration URL *').fill('https://example.com')

    const submitBtn = page.getByRole('button', { name: 'Submit Event' })
    await submitBtn.click()
    // After submission, success state should appear (button is replaced)
    await expect(page.getByRole('heading', { name: 'Event Submitted!' })).toBeVisible()
  })

  test('back link navigates to home', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/submit')

    await page.getByRole('link', { name: '← Back' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('cancel button navigates to home', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/submit')

    await page.getByRole('link', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('Event detail page', () => {
  test('shows event details for a known event', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-detail-1',
      name: 'Detail Page Summit',
      slug: 'detail-page-summit',
      description: 'A great event you should attend.',
      submittedBy: { displayName: 'Detail Organizers' },
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })

    await page.goto(`/event/${event.slug}`)

    await expect(page.getByRole('heading', { name: 'Detail Page Summit' })).toBeVisible()
    await expect(page.getByText('Submitted by Detail Organizers')).toBeVisible()
    await expect(page.getByText('A great event you should attend.')).toBeVisible()
    await expect(page.getByText('Free')).toBeVisible()
    await expect(page.getByRole('link', { name: /Visit Event Page/ })).toBeVisible()
  })

  test('shows "Event not found" for unknown event slug', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/event/nonexistent-slug')

    await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse Events' })).toBeVisible()
  })

  test('back link returns to home listing', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-back',
      name: 'Back Button Event',
      slug: 'back-button-event',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })

    await page.goto(`/event/${event.slug}`)
    await page.getByRole('link', { name: '← Back to events' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('shows location info when available', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-loc',
      name: 'Location Event',
      slug: 'location-event',
      venueName: 'Grand Venue',
      addressLine1: '123 Main St',
      city: 'Prague',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })

    await page.goto(`/event/${event.slug}`)

    await expect(page.getByText('Grand Venue')).toBeVisible()
    await expect(page.getByText('123 Main St, Prague, CZ')).toBeVisible()
  })

  test('shows interactive map when coordinates are available', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-map',
      name: 'Map Event',
      slug: 'map-event',
      latitude: 50.0755,
      longitude: 14.4378,
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })

    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('iframe[title*="map"]')).toBeVisible()
    await expect(page.getByRole('link', { name: /Open in OpenStreetMap/ })).toBeVisible()
  })

  test('shows location fallback when coordinates are zero/unavailable', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-nocoords',
      name: 'No Coords Event',
      slug: 'no-coords-event',
      latitude: 0,
      longitude: 0,
      venueName: 'Mystery Venue',
      city: 'Vienna',
      countryCode: 'AT',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })

    await page.goto(`/event/${event.slug}`)

    // No map iframe in fallback mode
    await expect(page.locator('iframe')).toBeHidden()
    // Fallback shows venue and directions link
    await expect(page.getByRole('link', { name: /Search on Google Maps/ })).toBeVisible()
  })

  test('shows get directions link on event detail page', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-directions',
      name: 'Directions Event',
      slug: 'directions-event',
      latitude: 50.0755,
      longitude: 14.4378,
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })

    await page.goto(`/event/${event.slug}`)

    await expect(page.getByRole('link', { name: /Get Directions/ })).toBeVisible()
  })

  test('shows attendee context section with interested count', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-attendee',
      name: 'Attendee Context Event',
      slug: 'attendee-context-event',
    })
    const state = setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })
    // Seed 2 favorites so the dynamic count returns "2 people interested"
    state.favoriteEvents.push(
      { id: 'fav-a', userId: 'user-a', eventId: event.id, createdAtUtc: new Date().toISOString() },
      { id: 'fav-b', userId: 'user-b', eventId: event.id, createdAtUtc: new Date().toISOString() },
    )

    await page.goto(`/event/${event.slug}`)

    await expect(page.getByText('2 people interested')).toBeVisible()
  })

  test('shows zero-state attendee message when no one is interested', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-zero-interest',
      name: 'Zero Interest Event',
      slug: 'zero-interest-event',
      interestedCount: 0,
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })

    await page.goto(`/event/${event.slug}`)

    await expect(page.getByText('Be the first to save this event')).toBeVisible()
  })

  test('shows time alongside date on event detail page', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-time',
      name: 'Time Display Event',
      slug: 'time-display-event',
      startsAtUtc: '2026-06-15T14:00:00Z',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })

    await page.goto(`/event/${event.slug}`)

    // The date section heading should now say "Date & Time"
    await expect(page.getByRole('heading', { name: /Date/i }).or(page.getByText('Date & Time'))).toBeVisible()
  })

  test('shows sign-in prompt for attendee context when unauthenticated', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-auth-cta',
      name: 'Auth CTA Event',
      slug: 'auth-cta-event',
      interestedCount: 3,
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })

    await page.goto(`/event/${event.slug}`)

    await expect(page.getByRole('link', { name: /Sign in/ })).toBeVisible()
    await expect(page.getByText(/to save this event and show your interest/)).toBeVisible()
  })

  test('interest count updates after favoriting on detail page', async ({ page }) => {
    const user = makeAdminUser()
    const event = makeApprovedEvent({
      id: 'ev-count-update',
      name: 'Count Update Event',
      slug: 'count-update-event',
    })
    setupMockApi(page, {
      users: [user],
      domains: [makeTechDomain()],
      events: [event],
    })

    // Navigate to home first so mock routes are active, then inject auth into localStorage
    // so checkAuth() succeeds on the subsequent page.goto without going through login flow
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'token-admin-1')
      localStorage.setItem('auth_expires', new Date(Date.now() + 7200000).toISOString())
    })

    await page.goto(`/event/${event.slug}`)

    // Initially shows zero-state message
    await expect(page.getByText('Be the first to save this event')).toBeVisible()

    // Save the event - button uses aria-label "Add to favorites"
    await page.getByRole('button', { name: 'Add to favorites' }).click()

    // After toggle, EventBySlug is re-fetched — the mock computes count from favoriteEvents
    await expect(page.getByText('1 person interested')).toBeVisible()

    // Unsave the event
    await page.getByRole('button', { name: 'Remove from favorites' }).click()

    // Count should drop back to zero-state
    await expect(page.getByText('Be the first to save this event')).toBeVisible()
  })

  test('favorites list query does not request interestedCount', async ({ page }) => {
    const user = makeAdminUser()
    const event = makeApprovedEvent({ id: 'ev-fav-fields', slug: 'fav-fields-event' })
    const state = setupMockApi(page, {
      users: [user],
      domains: [makeTechDomain()],
      events: [event],
    })
    state.favoriteEvents.push({
      id: 'fav-1',
      userId: user.id,
      eventId: event.id,
      createdAtUtc: new Date().toISOString(),
    })

    // Register an interceptor AFTER setupMockApi so it runs first (Playwright LIFO order)
    // and can record the request body before calling route.fallback() to the mock handler
    const capturedBodies: string[] = []
    await page.route('**/graphql', async (route, request) => {
      const body = request.postData() ?? ''
      if (body.includes('MyFavoriteEvents')) {
        capturedBodies.push(body)
      }
      await route.fallback()
    })

    await loginAs(page, user)
    await page.goto('/favorites')

    // The favorites list should render
    await expect(page.getByRole('heading', { name: 'Saved Events' })).toBeVisible()

    // The MyFavoriteEvents query must NOT request interestedCount
    expect(capturedBodies.length).toBeGreaterThan(0)
    for (const body of capturedBodies) {
      expect(body).not.toContain('interestedCount')
    }
  })

  test('admin can reject an event from admin panel', async ({ page }) => {
    const admin = makeAdminUser()
    const event = makeApprovedEvent({
      id: 'ev-reject',
      name: 'To Be Rejected',
      slug: 'to-be-rejected',
    })
    setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [event],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    const row = page.locator('tr', { hasText: 'To Be Rejected' })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Reject' }).click()
    await expect(row).toContainText('rejected')
  })
})
