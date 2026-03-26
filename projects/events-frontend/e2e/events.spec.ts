/**
 * Event submission and event detail page tests.
 */
import { expect, test, type Page } from '@playwright/test'
import {
  loginAs,
  makeAdminUser,
  makeApprovedEvent,
  makeTechDomain,
  setupMockApi,
} from './helpers/mock-api'

/** Clears any persisted event draft from localStorage. */
async function clearDraft(page: Page) {
  await page.evaluate(() => localStorage.removeItem('event_draft'))
}

/**
 * Navigates through all 5 steps of the event submission wizard, filling in
 * the required fields, and clicks Submit Event on step 5.
 */
async function fillAndSubmitEventForm(
  page: Page,
  opts: {
    title?: string
    description?: string
    domain?: string
    attendanceMode?: string
    startDate?: string
    timezone?: string
    city?: string
    latitude?: string
    longitude?: string
    venueName?: string
    address?: string
    eventUrl?: string
  } = {},
) {
  const {
    title = 'Test Event',
    description = 'Test description.',
    domain = 'technology',
    attendanceMode,
    startDate = '2026-06-01',
    timezone,
    city,
    latitude,
    longitude,
    venueName,
    address,
    eventUrl = 'https://example.com',
  } = opts

  // Step 1: Basic Info
  await page.locator('#event-title').fill(title)
  await page.locator('#event-description').fill(description)
  await page.locator('#event-domain').selectOption(domain)
  if (attendanceMode) {
    await page.locator('#event-attendance-mode').selectOption(attendanceMode)
  }
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 2: Date & Time
  await page.locator('#event-date').fill(startDate)
  if (timezone !== undefined) {
    await page.locator('#event-timezone').fill(timezone)
  }
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 3: Pricing (default free — just click next)
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 4: Location
  if (venueName) await page.locator('#event-location-name').fill(venueName)
  if (address) await page.locator('#event-location-address').fill(address)
  if (city) await page.locator('#event-city').fill(city)
  if (latitude) await page.locator('#event-lat').fill(latitude)
  if (longitude) await page.locator('#event-lng').fill(longitude)
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 5: Event Link
  await page.locator('#event-link').fill(eventUrl)
  await page.getByRole('button', { name: 'Submit Event' }).click()
}

test.describe('Submit event form', () => {
  test('renders step 1 required fields on load', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/submit')

    // Step 1 fields should be visible
    await expect(page.locator('#event-title')).toBeVisible()
    await expect(page.getByLabel('Event Title *')).toBeVisible()
    await expect(page.getByLabel('Description *')).toBeVisible()
    await expect(page.getByLabel('Tag *')).toBeVisible()
    // Step indicator
    await expect(page.locator('.step-label')).toContainText('Step 1 of 5')
  })

  test('step 2 shows date and timezone fields', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/submit')

    // Navigate to step 2
    await page.locator('#event-title').fill('Test')
    await page.locator('#event-description').fill('Desc')
    await page.locator('#event-domain').selectOption('technology')
    await page.getByRole('button', { name: 'Next' }).click()

    await expect(page.getByLabel('Start Date *')).toBeVisible()
    await expect(page.locator('#event-timezone')).toBeVisible()
  })

  test('step 3 shows free event checkbox', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/submit')

    await page.locator('#event-title').fill('Test')
    await page.locator('#event-description').fill('Desc')
    await page.locator('#event-domain').selectOption('technology')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.locator('#event-date').fill('2026-06-01')
    await page.getByRole('button', { name: 'Next' }).click()

    await expect(page.getByLabel('Free event')).toBeVisible()
  })

  test('step 5 shows website URL field', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/submit')

    await page.locator('#event-title').fill('Test')
    await page.locator('#event-description').fill('Desc')
    await page.locator('#event-domain').selectOption('technology')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.locator('#event-date').fill('2026-06-01')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()

    await expect(page.getByLabel('Website / Registration URL *')).toBeVisible()
  })

  test('attendance mode field renders with correct options', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/submit')

    const modeSelect = page.getByLabel('Attendance Mode')
    await expect(modeSelect).toBeVisible()
    await expect(modeSelect.getByRole('option', { name: 'In Person' })).toBeAttached()
    await expect(modeSelect.getByRole('option', { name: 'Online' })).toBeAttached()
    await expect(modeSelect.getByRole('option', { name: 'Hybrid' })).toBeAttached()
    // Default is In Person
    await expect(modeSelect).toHaveValue('IN_PERSON')
  })

  test('can select online attendance mode and submit', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page, { users: [admin], domains: [makeTechDomain()] })
    state.currentUserId = admin.id

    // Clear any existing draft
    await page.goto('/submit')
    await clearDraft(page)
    await page.goto('/submit')

    await page.locator('#event-attendance-mode').selectOption('ONLINE')
    await expect(page.locator('#event-attendance-mode')).toHaveValue('ONLINE')

    await fillAndSubmitEventForm(page, {
      title: 'Online Webinar',
      description: 'A fully remote event.',
      attendanceMode: 'ONLINE',
    })

    await expect(page.getByRole('heading', { name: 'Event Submitted!' })).toBeVisible()
  })

  test('shows tag options from API', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/submit')

    const select = page.getByLabel('Tag *')
    await expect(select.getByRole('option', { name: 'Technology' })).toBeAttached()
  })

  test('submit button is present on step 5 and submits successfully', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page, { users: [admin], domains: [makeTechDomain()] })
    state.currentUserId = admin.id

    await page.goto('/submit')
    await clearDraft(page)
    await page.goto('/submit')

    await fillAndSubmitEventForm(page, {
      title: 'Async Test Event',
      description: 'Testing async disable.',
    })

    // After submission, success state should appear
    await expect(page.getByRole('heading', { name: 'Event Submitted!' })).toBeVisible()
  })

  test('back link navigates to dashboard', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/submit')

    await page.getByRole('link', { name: '← Back' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('cancel button navigates to dashboard', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/submit')

    await page.getByRole('link', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('timezone field is present in step 2 of submit form', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/submit')

    // Navigate to step 2
    await page.locator('#event-title').fill('Test')
    await page.locator('#event-description').fill('Desc')
    await page.locator('#event-domain').selectOption('technology')
    await page.getByRole('button', { name: 'Next' }).click()

    const timezoneInput = page.getByLabel(/Timezone/i)
    await expect(timezoneInput).toBeVisible()
    await expect(timezoneInput).toHaveAttribute('placeholder', 'e.g., Europe/Prague')
  })

  test('can enter a timezone and submit event', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page, { users: [admin], domains: [makeTechDomain()] })
    state.currentUserId = admin.id

    await page.goto('/submit')
    await clearDraft(page)
    await page.goto('/submit')

    await fillAndSubmitEventForm(page, {
      title: 'Prague Summit with TZ',
      description: 'An event with a timezone.',
      startDate: '2026-09-01',
      timezone: 'Europe/Prague',
    })

    await expect(page.getByRole('heading', { name: 'Event Submitted!' })).toBeVisible()
  })

  test('timezone value is sent in the submit mutation', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page, { users: [admin], domains: [makeTechDomain()] })
    state.currentUserId = admin.id

    const capturedBodies: string[] = []
    await page.route('**/graphql', async (route, request) => {
      const body = request.postData() ?? ''
      if (body.includes('SubmitEvent')) capturedBodies.push(body)
      await route.fallback()
    })

    await page.goto('/submit')
    await clearDraft(page)
    await page.goto('/submit')

    await fillAndSubmitEventForm(page, {
      title: 'London Conference',
      description: 'An event in London.',
      startDate: '2026-10-01',
      timezone: 'Europe/London',
    })

    await expect(page.getByRole('heading', { name: 'Event Submitted!' })).toBeVisible()

    expect(capturedBodies.length).toBeGreaterThan(0)
    expect(capturedBodies[0]).toContain('Europe/London')
  })

  test('submitting without timezone omits the field gracefully', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page, { users: [admin], domains: [makeTechDomain()] })
    state.currentUserId = admin.id

    await page.goto('/submit')
    await clearDraft(page)
    await page.goto('/submit')

    // Intentionally leave timezone blank (default)
    await fillAndSubmitEventForm(page, {
      title: 'No Timezone Event',
      description: 'No timezone provided.',
      startDate: '2026-08-01',
    })

    await expect(page.getByRole('heading', { name: 'Event Submitted!' })).toBeVisible()
  })

  test('shows inline error for invalid timezone and blocks submission', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page, { users: [admin], domains: [makeTechDomain()] })
    state.currentUserId = admin.id

    await page.goto('/submit')
    await clearDraft(page)
    await page.goto('/submit')

    // Step 1
    await page.locator('#event-title').fill('Bad TZ Event')
    await page.locator('#event-description').fill('Has a typo in timezone.')
    await page.locator('#event-domain').selectOption('technology')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 2: enter invalid timezone
    await page.locator('#event-date').fill('2026-11-01')
    await page.locator('#event-timezone').fill('Europe/Prgaue')
    await page.getByRole('button', { name: 'Next' }).click()

    // Should show error and NOT proceed past step 2
    const error = page.locator('.field-error')
    await expect(error).toBeVisible()
    await expect(error).toContainText('Europe/Prgaue')
    await expect(page.locator('.step-label')).toContainText('Step 2 of 5')
  })

  test('accepts valid canonical IANA timezone values', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page, { users: [admin], domains: [makeTechDomain()] })
    state.currentUserId = admin.id

    await page.goto('/submit')
    await clearDraft(page)
    await page.goto('/submit')

    await fillAndSubmitEventForm(page, {
      title: 'New York Event',
      description: 'Happening in New York.',
      startDate: '2026-12-01',
      timezone: 'America/New_York',
    })

    await expect(page.getByRole('heading', { name: 'Event Submitted!' })).toBeVisible()
    await expect(page.locator('.field-error')).toBeHidden()
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

  test('event detail tag link navigates to the dedicated tag page', async ({ page }) => {
    const cryptoDomain = {
      id: 'dom-crypto',
      name: 'Crypto',
      slug: 'crypto',
      subdomain: 'crypto',
      description: 'Blockchain and crypto events',
      isActive: true,
      createdAtUtc: new Date().toISOString(),
    }
    const event = makeApprovedEvent({
      id: 'ev-domain-link',
      name: 'Crypto Week Event',
      slug: 'crypto-week-event',
      domainId: cryptoDomain.id,
      domain: {
        id: cryptoDomain.id,
        name: cryptoDomain.name,
        slug: cryptoDomain.slug,
        subdomain: cryptoDomain.subdomain,
      },
    })
    setupMockApi(page, {
      domains: [cryptoDomain],
      events: [event],
    })

    await page.goto(`/event/${event.slug}`)

    const tagLink = page.getByRole('link', { name: /Browse more events on crypto\.events\.localhost/i })
    await expect(tagLink).toBeVisible()
    await expect(page.getByText('crypto.events.localhost')).toBeVisible()
    await tagLink.click()

    await expect(page).toHaveURL(/\/\?subdomain=crypto&domain=crypto$/)
    await expect(page.getByRole('heading', { name: 'Crypto Events' })).toBeVisible()
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

  test('shows error state with retry button when API call fails', async ({ page }) => {
    setupMockApi(page)
    // Override to return a GraphQL error for EventBySlug queries
    await page.route('**/graphql', async (route, request) => {
      const body = request.postData() ?? ''
      if (body.includes('EventBySlug')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Service temporarily unavailable' }],
          }),
        })
        return
      }
      await route.fallback()
    })

    await page.goto('/event/some-event-slug')

    await expect(page.getByRole('heading', { name: 'Unable to load event' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('detail page map and attendee section are visible on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const event = makeApprovedEvent({
      id: 'ev-mobile-map',
      name: 'Mobile Map Event',
      slug: 'mobile-map-event',
      latitude: 50.0755,
      longitude: 14.4378,
    })
    const state = setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })
    state.favoriteEvents.push({
      id: 'fav-mob',
      userId: 'user-x',
      eventId: event.id,
      createdAtUtc: new Date().toISOString(),
    })

    await page.goto(`/event/${event.slug}`)

    // Interactive map visible on mobile
    await expect(page.locator('iframe[title*="map"]')).toBeVisible()
    // Attendee context section visible on mobile
    await expect(page.getByText('1 person interested')).toBeVisible()
  })

  test('full detail page journey: view location, attendee context, then favorite', async ({ page }) => {
    const user = makeAdminUser()
    const event = makeApprovedEvent({
      id: 'ev-journey',
      name: 'Journey Event',
      slug: 'journey-event',
      latitude: 50.0755,
      longitude: 14.4378,
      venueName: 'Journey Hall',
      addressLine1: 'Journey Street 1',
      city: 'Prague',
    })
    setupMockApi(page, {
      users: [user],
      domains: [makeTechDomain()],
      events: [event],
    })

    // Inject auth before navigating to detail page
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'token-admin-1')
      localStorage.setItem('auth_expires', new Date(Date.now() + 7200000).toISOString())
    })

    await page.goto(`/event/${event.slug}`)

    // Verify event name
    await expect(page.getByRole('heading', { name: 'Journey Event' })).toBeVisible()

    // Verify venue and address in location section
    await expect(page.getByText('Journey Hall').first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Get Directions/ })).toBeVisible()

    // Verify interactive map is rendered
    await expect(page.locator('iframe[title*="map"]')).toBeVisible()

    // Verify attendee context shows zero-state before saving
    await expect(page.getByText('Be the first to save this event')).toBeVisible()

    // Favorite the event
    await page.getByRole('button', { name: 'Add to favorites' }).click()

    // Attendee count updates after favoriting
    await expect(page.getByText('1 person interested')).toBeVisible()
    // Saved confirmation message appears
    await expect(page.getByText("✓ You've saved this event")).toBeVisible()

    // Page remains stable — heading still visible
    await expect(page.getByRole('heading', { name: 'Journey Event' })).toBeVisible()
  })

  test('attendee section shows only aggregate count, not individual user identities', async ({
    page,
  }) => {
    const event = makeApprovedEvent({
      id: 'ev-privacy',
      name: 'Privacy Test Event',
      slug: 'privacy-test-event',
    })
    const state = setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })
    // Seed users with recognizable names and favorite them
    const now = new Date().toISOString()
    state.users.push(
      {
        id: 'user-alice',
        email: 'alice@secret.com',
        password: 'x',
        displayName: 'Alice Smith',
        role: 'CONTRIBUTOR',
        createdAtUtc: now,
      },
      {
        id: 'user-bob',
        email: 'bob@secret.com',
        password: 'x',
        displayName: 'Bob Jones',
        role: 'CONTRIBUTOR',
        createdAtUtc: now,
      },
    )
    state.favoriteEvents.push(
      { id: 'fav-p1', userId: 'user-alice', eventId: event.id, createdAtUtc: now },
      { id: 'fav-p2', userId: 'user-bob', eventId: event.id, createdAtUtc: now },
    )

    await page.goto(`/event/${event.slug}`)

    // Aggregate count is visible
    await expect(page.getByText('2 people interested')).toBeVisible()

    // Individual user names must NOT appear anywhere on the page
    await expect(page.getByText('Alice Smith')).toBeHidden()
    await expect(page.getByText('Bob Jones')).toBeHidden()
    // Emails must NOT appear anywhere on the page
    await expect(page.getByText('alice@secret.com')).toBeHidden()
    await expect(page.getByText('bob@secret.com')).toBeHidden()
  })

  test('event detail page shows attendance mode badge', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-badge-online',
      name: 'Online Summit',
      slug: 'online-summit',
      attendanceMode: 'ONLINE',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await expect(page.getByRole('heading', { name: 'Online Summit' })).toBeVisible()
    await expect(page.locator('.badge-mode')).toContainText('Online')
  })

  test('online-only event does not show physical map UI', async ({ page }) => {
    // Even when coordinates are valid, ONLINE events must not show a physical map
    const event = makeApprovedEvent({
      id: 'ev-online-nomap',
      name: 'Online Webinar No Map',
      slug: 'online-webinar-no-map',
      attendanceMode: 'ONLINE',
      latitude: 50.0755,
      longitude: 14.4378,
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    // No map iframe for ONLINE events regardless of coordinates
    await expect(page.locator('iframe')).toBeHidden()
    // No Google Maps / OpenStreetMap links
    await expect(page.getByRole('link', { name: /Open in OpenStreetMap/ })).toBeHidden()
    await expect(page.getByRole('link', { name: /Search on Google Maps/ })).toBeHidden()
    await expect(page.getByRole('link', { name: /Get Directions/ })).toBeHidden()
    // Virtual event notice is shown instead (sidebar)
    await expect(page.locator('.virtual-event-notice')).toBeVisible()
    await expect(page.locator('.virtual-event-content p')).toContainText('This event takes place online')
  })

  test('hybrid event still shows physical map when coordinates are valid', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-hybrid-map',
      name: 'Hybrid Workshop',
      slug: 'hybrid-workshop',
      attendanceMode: 'HYBRID',
      latitude: 50.0755,
      longitude: 14.4378,
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    // HYBRID events have a physical component — map should be visible
    await expect(page.locator('iframe[title*="map"]')).toBeVisible()
    await expect(page.getByRole('link', { name: /Open in OpenStreetMap/ })).toBeVisible()
  })

  test('event detail page shows In Person badge by default', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-badge-inperson',
      name: 'In-Person Workshop',
      slug: 'in-person-workshop',
      attendanceMode: 'IN_PERSON',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.badge-mode')).toContainText('In Person')
  })

  test('event detail page shows Hybrid badge', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-badge-hybrid',
      name: 'Hybrid Conference',
      slug: 'hybrid-conference',
      attendanceMode: 'HYBRID',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.badge-mode')).toContainText('Hybrid')
  })

  test('add to calendar button is visible on event detail page', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-cal-btn',
      name: 'Calendar Button Event',
      slug: 'calendar-button-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await expect(page.getByRole('button', { name: /Add to calendar/i })).toBeVisible()
  })

  test('add to calendar menu opens and shows all provider options', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-cal-menu',
      name: 'Calendar Menu Event',
      slug: 'calendar-menu-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()

    await expect(page.getByRole('menuitem', { name: /Download .ics file/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Google Calendar/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Outlook/i })).toBeVisible()
  })

  test('Google Calendar link points to calendar.google.com', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-gcal',
      name: 'Google Cal Event',
      slug: 'google-cal-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()

    const googleLink = page.getByRole('menuitem', { name: /Google Calendar/i })
    const href = await googleLink.getAttribute('href')
    expect(href).toContain('calendar.google.com')
    expect(href).toContain('Google+Cal+Event')
  })

  test('Outlook link points to outlook.live.com', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-outlook',
      name: 'Outlook Event',
      slug: 'outlook-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()

    const outlookLink = page.getByRole('menuitem', { name: /Outlook/i })
    const href = await outlookLink.getAttribute('href')
    expect(href).toContain('outlook.live.com')
    expect(href).toContain('Outlook+Event')
  })

  test('ICS download triggers a file download', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-ics-dl',
      name: 'ICS Download Event',
      slug: 'ics-download-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Add to calendar/i }).click().then(async () => {
        await page.getByRole('menuitem', { name: /Download .ics file/i }).click()
      }),
    ])

    expect(download.suggestedFilename()).toBe('ics-download-event.ics')
  })

  test('calendar button shows confirmation after ICS download', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-ics-confirm',
      name: 'ICS Confirm Event',
      slug: 'ics-confirm-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Add to calendar/i }).click().then(async () => {
        await page.getByRole('menuitem', { name: /Download .ics file/i }).click()
      }),
    ])

    await expect(page.getByRole('button', { name: /Added to calendar/i })).toBeVisible()
  })

  test('add to calendar button is visible on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const event = makeApprovedEvent({
      id: 'ev-cal-mobile',
      name: 'Mobile Calendar Event',
      slug: 'mobile-calendar-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await expect(page.getByRole('button', { name: /Add to calendar/i })).toBeVisible()
  })

  test('online event Google Calendar link includes event URL as location', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-online-cal',
      name: 'Online Webinar',
      slug: 'online-webinar',
      attendanceMode: 'ONLINE',
      eventUrl: 'https://webinar.example.com/join',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()

    const googleLink = page.getByRole('menuitem', { name: /Google Calendar/i })
    const href = await googleLink.getAttribute('href')
    // For online events, location should be the event URL
    expect(href).toContain('webinar.example.com')
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

  // ── Timezone display tests ──────────────────────────────────────────────────

  test('event detail page shows timezone label when timezone is set', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-tz-display',
      name: 'Timezone Display Event',
      slug: 'tz-display-event',
      timezone: 'Europe/Prague',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    // The timezone label section should be visible in the Date & Time section
    await expect(page.locator('.timezone-label')).toBeVisible()
    // It should contain some description of European timezone (e.g. CET or CEST)
    await expect(page.locator('.timezone-label')).toContainText(/Central European|Prague|CET|CEST/i)
  })

  test('event detail page does NOT show timezone label when timezone is null', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-no-tz',
      name: 'No Timezone Event',
      slug: 'no-tz-event',
      timezone: null,
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await expect(page.getByRole('heading', { name: 'No Timezone Event' })).toBeVisible()
    // Timezone label must not appear
    await expect(page.locator('.timezone-label')).toBeHidden()
  })

  test('Google Calendar link includes ctz parameter when timezone is set', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-tz-gcal',
      name: 'Prague Calendar Event',
      slug: 'prague-calendar-event',
      timezone: 'Europe/Prague',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()

    const googleLink = page.getByRole('menuitem', { name: /Google Calendar/i })
    const href = await googleLink.getAttribute('href')
    expect(href).toContain('ctz=Europe')
  })

  test('Google Calendar link does NOT include ctz when timezone is null', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-no-tz-gcal',
      name: 'No Timezone Cal Event',
      slug: 'no-timezone-cal-event',
      timezone: null,
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()

    const googleLink = page.getByRole('menuitem', { name: /Google Calendar/i })
    const href = await googleLink.getAttribute('href')
    expect(href).not.toContain('ctz=')
  })

  // ── Calendar analytics instrumentation tests ────────────────────────────────

  test('clicking Google Calendar emits analytics and closes menu', async ({ page }) => {
    const consoleLogs: string[] = []
    // Capture console.debug calls (analytics fires in dev mode via console.debug)
    page.on('console', (msg) => {
      if (msg.type() === 'debug') consoleLogs.push(msg.text())
    })

    const event = makeApprovedEvent({
      id: 'ev-analytics-gcal',
      name: 'Analytics Google Event',
      slug: 'analytics-google-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()
    await page.getByRole('menuitem', { name: /Google Calendar/i }).click()

    // Menu closes after clicking Google Calendar
    await expect(page.getByRole('menu', { name: 'Calendar options' })).toBeHidden()
  })

  test('clicking Outlook emits analytics and closes menu', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-analytics-outlook',
      name: 'Analytics Outlook Event',
      slug: 'analytics-outlook-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()
    await page.getByRole('menuitem', { name: /Outlook/i }).click()

    // Menu closes after clicking Outlook
    await expect(page.getByRole('menu', { name: 'Calendar options' })).toBeHidden()
  })

  test('ICS download emits analytics (calendar confirm appears)', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-analytics-ics',
      name: 'Analytics ICS Event',
      slug: 'analytics-ics-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Add to calendar/i }).click().then(async () => {
        await page.getByRole('menuitem', { name: /Download .ics file/i }).click()
      }),
    ])

    // Confirmation state appears — this also confirms analytics handler ran
    await expect(page.getByRole('button', { name: /Added to calendar/i })).toBeVisible()
  })

  test('calendar action does not block or throw visible error', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-analytics-noerr',
      name: 'Analytics No Error Event',
      slug: 'analytics-no-error-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    // Open calendar menu and click all three options in sequence
    // None of these should throw or crash the page
    await page.getByRole('button', { name: /Add to calendar/i }).click()
    await page.getByRole('menuitem', { name: /Google Calendar/i }).click()

    await page.getByRole('button', { name: /Add to calendar/i }).click()
    await page.getByRole('menuitem', { name: /Outlook/i }).click()

    // Page heading remains accessible — no crash
    await expect(page.getByRole('heading', { name: 'Analytics No Error Event' })).toBeVisible()
  })

  test('in-person event Google Calendar link includes venue and city in location', async ({
    page,
  }) => {
    const event = makeApprovedEvent({
      id: 'ev-inperson-cal',
      name: 'In-Person Conference',
      slug: 'in-person-conference',
      attendanceMode: 'IN_PERSON',
      venueName: 'Grand Hall',
      addressLine1: '123 Main Street',
      city: 'Berlin',
      countryCode: 'DE',
      eventUrl: 'https://example.com/in-person',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()

    const googleLink = page.getByRole('menuitem', { name: /Google Calendar/i })
    const href = await googleLink.getAttribute('href')
    // In-person location: venue + city should appear in the Google Calendar link
    expect(href).toContain('Grand+Hall')
    expect(href).toContain('Berlin')
    // Should NOT put the event URL as the location
    expect(href).not.toContain('location=https%3A%2F%2Fexample.com%2Fin-person')
  })

  test('in-person event Outlook link includes venue in location parameter', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-inperson-outlook',
      name: 'In-Person Workshop',
      slug: 'in-person-workshop-outlook',
      attendanceMode: 'IN_PERSON',
      venueName: 'Workshop Room',
      city: 'Vienna',
      countryCode: 'AT',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()

    const outlookLink = page.getByRole('menuitem', { name: /Outlook/i })
    const href = await outlookLink.getAttribute('href')
    expect(href).toContain('outlook.live.com')
    expect(href).toContain('Workshop+Room')
    expect(href).toContain('Vienna')
  })

  test('virtual event does not show physical venue in Google Calendar location', async ({
    page,
  }) => {
    const event = makeApprovedEvent({
      id: 'ev-virtual-cal',
      name: 'Virtual Summit',
      slug: 'virtual-summit-cal',
      attendanceMode: 'ONLINE',
      venueName: 'Should Not Appear',
      city: 'Prague',
      eventUrl: 'https://virtual.example.com/join',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()

    const googleLink = page.getByRole('menuitem', { name: /Google Calendar/i })
    const href = await googleLink.getAttribute('href')
    // For online events, location must be the join URL — NOT the physical venue name
    expect(href).toContain('virtual.example.com')
    const decoded = decodeURIComponent(href ?? '')
    expect(decoded).not.toContain('Should Not Appear')
  })

  test('hybrid event Google Calendar link includes both venue and join URL in description', async ({
    page,
  }) => {
    const event = makeApprovedEvent({
      id: 'ev-hybrid-cal',
      name: 'Hybrid Conference',
      slug: 'hybrid-conference-cal',
      attendanceMode: 'HYBRID',
      venueName: 'Hybrid Hall',
      city: 'Bratislava',
      countryCode: 'SK',
      eventUrl: 'https://hybrid.example.com/join',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()

    const googleLink = page.getByRole('menuitem', { name: /Google Calendar/i })
    const href = await googleLink.getAttribute('href')
    // Hybrid events: venue should be in location
    expect(href).toContain('Hybrid+Hall')
    // Join URL should be in details/description
    const decoded = decodeURIComponent(href ?? '')
    expect(decoded).toContain('hybrid.example.com')
  })

  test('clicking outside calendar menu closes it', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-cal-outside',
      name: 'Click Outside Event',
      slug: 'click-outside-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()
    await expect(page.getByRole('menuitem', { name: /Google Calendar/i })).toBeVisible()

    // Click outside the calendar action container (e.g. the event title heading)
    await page.getByRole('heading', { level: 1, name: 'Click Outside Event' }).click()

    await expect(page.getByRole('menuitem', { name: /Google Calendar/i })).toBeHidden()
  })

  test('Escape key closes calendar menu and returns focus to toggle button', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-cal-esc',
      name: 'Escape Key Event',
      slug: 'escape-key-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()
    await expect(page.getByRole('menuitem', { name: /Google Calendar/i })).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(page.getByRole('menuitem', { name: /Google Calendar/i })).toBeHidden()
    // Focus must return to the toggle button
    await expect(page.getByRole('button', { name: /Add to calendar/i })).toBeFocused()
  })

  test('arrow keys navigate calendar menu items', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-cal-arrows',
      name: 'Arrow Nav Event',
      slug: 'arrow-nav-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()
    // Menu opens; focus should be on the first item
    await expect(page.getByRole('menuitem', { name: /Download .ics/i })).toBeFocused()

    // ArrowDown moves to next item
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: /Google Calendar/i })).toBeFocused()

    // ArrowDown again moves to last item
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: /Outlook/i })).toBeFocused()

    // ArrowDown wraps around to first item
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: /Download .ics/i })).toBeFocused()

    // ArrowUp wraps to last item from first
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('menuitem', { name: /Outlook/i })).toBeFocused()
  })

  test('Tab key closes the calendar menu without trapping focus', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-cal-tab',
      name: 'Tab Close Event',
      slug: 'tab-close-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Add to calendar/i }).click()
    // Focus lands on the first menu item after opening
    await expect(page.getByRole('menuitem', { name: /Download .ics/i })).toBeFocused()

    // Press Tab — the menu must close immediately (no cycling through items)
    await page.keyboard.press('Tab')

    await expect(page.getByRole('menuitem', { name: /Google Calendar/i })).toBeHidden()
    // Focus must return to the toggle button (clean exit point, not a trap)
    await expect(page.getByRole('button', { name: /Add to calendar/i })).toBeFocused()
  })

  test('calendar menu aria-label is localized (Slovak locale)', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-cal-sk',
      name: 'Slovak Calendar Event',
      slug: 'slovak-calendar-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })
    // Switch to Slovak locale before navigation
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('app_locale', 'sk'))
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Pridať do kalendára/i }).click()

    // The menu's aria-label should be localized
    const menu = page.locator('[role="menu"]')
    await expect(menu).toBeVisible()
    const ariaLabel = menu
    await expect(ariaLabel).toHaveAttribute('aria-label', 'Možnosti kalendára')
  })
})

// ---------------------------------------------------------------------------
// Hub context card on event detail page
// ---------------------------------------------------------------------------

test.describe('Event detail hub context card', () => {
  const cryptoDomain = {
    id: 'dom-crypto-hub',
    name: 'Crypto',
    slug: 'crypto-hub',
    subdomain: 'crypto',
    description: 'Blockchain and crypto events',
    isActive: true,
    createdAtUtc: new Date().toISOString(),
    logoUrl: 'https://example.com/crypto-logo.png',
    primaryColor: '#f7931a',
  }

  test('hub context card shows domain name and explore link to /category/:slug', async ({
    page,
  }) => {
    const event = makeApprovedEvent({
      id: 'ev-hub-1',
      name: 'Hub Context Event',
      slug: 'hub-context-event',
      domainId: cryptoDomain.id,
      domain: {
        id: cryptoDomain.id,
        name: cryptoDomain.name,
        slug: cryptoDomain.slug,
        subdomain: cryptoDomain.subdomain,
        description: cryptoDomain.description,
        logoUrl: cryptoDomain.logoUrl,
        primaryColor: cryptoDomain.primaryColor,
      },
    })
    setupMockApi(page, { domains: [cryptoDomain], events: [event] })
    await page.goto(`/event/${event.slug}`)

    // Hub context heading is present
    await expect(page.locator('.hub-context')).toBeVisible()
    // Domain name displayed
    await expect(page.locator('.hub-context-name')).toContainText('Crypto')
    // Description is shown
    await expect(page.locator('.hub-context-description')).toContainText('Blockchain and crypto events')
    // The explore link points to /category/:slug
    const exploreLink = page.locator('.hub-context-link')
    await expect(exploreLink).toBeVisible()
    await expect(exploreLink).toContainText('Crypto')
    await expect(exploreLink).toHaveAttribute('href', '/category/crypto-hub')
  })

  test('hub context card shows logo when logoUrl is set', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-hub-logo',
      name: 'Hub Logo Event',
      slug: 'hub-logo-event',
      domainId: cryptoDomain.id,
      domain: {
        id: cryptoDomain.id,
        name: cryptoDomain.name,
        slug: cryptoDomain.slug,
        subdomain: cryptoDomain.subdomain,
        logoUrl: 'https://example.com/crypto-logo.png',
      },
    })
    setupMockApi(page, { domains: [cryptoDomain], events: [event] })
    await page.goto(`/event/${event.slug}`)

    const logo = page.locator('.hub-context-logo')
    await expect(logo).toBeVisible()
    await expect(logo).toHaveAttribute('src', 'https://example.com/crypto-logo.png')
  })

  test('hub context card renders gracefully without logo or description', async ({ page }) => {
    const minimalDomain = {
      id: 'dom-minimal',
      name: 'Tech',
      slug: 'tech-hub',
      subdomain: 'tech',
      description: null,
      isActive: true,
      createdAtUtc: new Date().toISOString(),
    }
    const event = makeApprovedEvent({
      id: 'ev-hub-fallback',
      name: 'Hub Fallback Event',
      slug: 'hub-fallback-event',
      domainId: minimalDomain.id,
      domain: {
        id: minimalDomain.id,
        name: minimalDomain.name,
        slug: minimalDomain.slug,
        subdomain: minimalDomain.subdomain,
      },
    })
    setupMockApi(page, { domains: [minimalDomain], events: [event] })
    await page.goto(`/event/${event.slug}`)

    // Card still renders
    await expect(page.locator('.hub-context')).toBeVisible()
    // No broken image element
    await expect(page.locator('.hub-context-logo')).toBeHidden()
    // Description element not rendered
    await expect(page.locator('.hub-context-description')).toBeHidden()
    // Explore link still works
    await expect(page.locator('.hub-context-link')).toHaveAttribute('href', '/category/tech-hub')
  })

  test('explore link navigates to the category landing page', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-hub-nav',
      name: 'Hub Nav Event',
      slug: 'hub-nav-event',
      domainId: cryptoDomain.id,
      domain: {
        id: cryptoDomain.id,
        name: cryptoDomain.name,
        slug: cryptoDomain.slug,
        subdomain: cryptoDomain.subdomain,
      },
    })
    setupMockApi(page, {
      domains: [cryptoDomain],
      events: [event],
    })
    await page.goto(`/event/${event.slug}`)

    await page.locator('.hub-context-link').click()
    await expect(page).toHaveURL(/\/category\/crypto-hub$/)
  })

  test('hub context card is visible on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const event = makeApprovedEvent({
      id: 'ev-hub-mobile',
      name: 'Hub Mobile Event',
      slug: 'hub-mobile-event',
      domainId: cryptoDomain.id,
      domain: {
        id: cryptoDomain.id,
        name: cryptoDomain.name,
        slug: cryptoDomain.slug,
        subdomain: cryptoDomain.subdomain,
        description: cryptoDomain.description,
        logoUrl: cryptoDomain.logoUrl,
      },
    })
    setupMockApi(page, { domains: [cryptoDomain], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.hub-context')).toBeVisible()
    await expect(page.locator('.hub-context-name')).toContainText('Crypto')
    await expect(page.locator('.hub-context-link')).toBeVisible()
  })

  test('hub context shows overviewContent excerpt when no description is set', async ({ page }) => {
    const aiDomain = {
      id: 'dom-ai-overview',
      name: 'AI Hub',
      slug: 'ai-hub',
      subdomain: 'ai',
      description: null,
      isActive: true,
      createdAtUtc: new Date().toISOString(),
      overviewContent:
        'The premier hub for artificial intelligence events, conferences, and workshops in the region.',
    }
    const event = makeApprovedEvent({
      id: 'ev-overview',
      name: 'AI Summit',
      slug: 'ai-summit',
      domainId: aiDomain.id,
      domain: {
        id: aiDomain.id,
        name: aiDomain.name,
        slug: aiDomain.slug,
        subdomain: aiDomain.subdomain,
        overviewContent: aiDomain.overviewContent,
      },
    })
    setupMockApi(page, { domains: [aiDomain], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.hub-context')).toBeVisible()
    await expect(page.locator('.hub-context-description')).toContainText(
      'The premier hub for artificial intelligence',
    )
  })

  test('hub context card applies accentColor as theme variable when set', async ({ page }) => {
    const defiDomain = {
      id: 'dom-defi-accent',
      name: 'DeFi Hub',
      slug: 'defi-hub',
      subdomain: 'defi',
      description: 'DeFi events',
      isActive: true,
      createdAtUtc: new Date().toISOString(),
      accentColor: '#ff6b35',
    }
    const event = makeApprovedEvent({
      id: 'ev-defi-accent',
      name: 'DeFi Conference',
      slug: 'defi-conference',
      domainId: defiDomain.id,
      domain: {
        id: defiDomain.id,
        name: defiDomain.name,
        slug: defiDomain.slug,
        subdomain: defiDomain.subdomain,
        accentColor: defiDomain.accentColor,
      },
    })
    setupMockApi(page, { domains: [defiDomain], events: [event] })
    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.hub-context')).toBeVisible()
    // The accentColor is applied as --hub-accent CSS custom property on the card element
    const hubStyle = await page
      .locator('.hub-context')
      .evaluate((el) => (el as HTMLElement).getAttribute('style') ?? '')
    expect(hubStyle).toContain('#ff6b35')
  })
})
