import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeAdminUser,
  makeTechDomain,
  makeApprovedEvent,
  loginAs,
  type MockFavoriteEvent,
} from './helpers/mock-api'

test.describe('Organizer analytics dashboard', () => {
  test('shows analytics KPIs and event performance table for authenticated organizer', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-analytics-1',
      slug: 'analytics-event-1',
      name: 'Analytics Test Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const state = setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [event],
    })

    // Two saves for the event
    const fav1: MockFavoriteEvent = {
      id: 'fav-a1',
      userId: 'other-user-1',
      eventId: event.id,
      createdAtUtc: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    }
    const fav2: MockFavoriteEvent = {
      id: 'fav-a2',
      userId: 'other-user-2',
      eventId: event.id,
      createdAtUtc: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
    }
    state.favoriteEvents.push(fav1, fav2)

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // KPI cards should be visible
    await expect(page.getByText('Total Events')).toBeVisible()
    await expect(page.locator('.stat-label', { hasText: 'Published' })).toBeVisible()
    await expect(page.getByText('Total Saves')).toBeVisible()

    // Section heading
    await expect(page.getByRole('heading', { name: 'Event Performance' })).toBeVisible()

    // Event row in table
    await expect(page.getByRole('link', { name: 'Analytics Test Event' })).toBeVisible()

    // Saves count (2 total)
    await expect(page.locator('td .saves-count', { hasText: '2' }).first()).toBeVisible()
  })

  test('shows momentum trend badge for events with recent saves (this week)', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-trend-1',
      slug: 'trend-event-1',
      name: 'Trending Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const state = setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [event],
    })

    // Save within the last 7 days
    state.favoriteEvents.push({
      id: 'fav-trend-1',
      userId: 'attendee-1',
      eventId: event.id,
      createdAtUtc: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Should show "this week" trend badge
    await expect(page.locator('.trend--active')).toBeVisible()
    await expect(page.locator('.trend--active')).toContainText('this week')
  })

  test('shows momentum trend badge for events with saves in last 30 days (this month)', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-month-1',
      slug: 'month-event-1',
      name: 'Monthly Trend Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const state = setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [event],
    })

    // Save between 7 and 30 days ago (no activity in last 7 days)
    state.favoriteEvents.push({
      id: 'fav-month-1',
      userId: 'attendee-2',
      eventId: event.id,
      createdAtUtc: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Should show "this month" trend badge (saves in last 30 but not last 7)
    await expect(page.locator('.trend--recent')).toBeVisible()
    await expect(page.locator('.trend--recent')).toContainText('this month')
  })

  test('shows quiet trend badge when no saves in last 30 days', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-quiet-1',
      slug: 'quiet-event-1',
      name: 'Quiet Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [event],
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Should show "No recent saves" for event with no activity
    await expect(page.locator('.trend--quiet')).toBeVisible()
    await expect(page.locator('.trend--quiet')).toContainText('No recent saves')
  })

  test('shows low-data guidance when no saves exist for published events', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-lowdata-1',
      slug: 'lowdata-event-1',
      name: 'New Event No Saves',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [event],
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Low-data guidance should appear
    await expect(page.getByText(/No saves yet/)).toBeVisible()
    await expect(page.getByText(/Share your event link/)).toBeVisible()
  })

  test('shows empty state when organizer has no events', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [],
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.getByRole('heading', { name: 'No events yet' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Submit your first event' })).toBeVisible()
  })

  test('shows sign-in prompt for unauthenticated users', async ({ page }) => {
    const domain = makeTechDomain()
    setupMockApi(page, { domains: [domain] })
    await page.goto('/dashboard')

    await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Log In' })).toBeVisible()
  })

  test('shows error state with retry button when API fails', async ({ page }) => {
    const user = makeAdminUser()

    // Set up mock but override the MyDashboard query to fail
    setupMockApi(page, {
      users: [user],
      domains: [makeTechDomain()],
    })

    // Inject a broken-auth token so MyDashboard returns an error
    // We do this by making the mock return an error after login
    let _dashboardCallCount = 0
    page.route('**/graphql', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}')
      if ((body.query || '').includes('MyDashboard')) {
        _dashboardCallCount++
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Server error loading dashboard' }] }),
        })
        return
      }
      // Pass through other requests
      await route.fallback()
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Error state should be displayed
    await expect(page.locator('.error-message')).toBeVisible()
    // Retry button should be present
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('dashboard only shows events belonging to the current organizer', async ({ page }) => {
    const organizer = makeAdminUser()
    const domain = makeTechDomain()

    const myEvent = makeApprovedEvent({
      id: 'ev-mine',
      slug: 'my-event',
      name: 'My Own Event',
      submittedByUserId: organizer.id,
      submittedBy: { displayName: organizer.displayName },
    })

    const otherEvent = makeApprovedEvent({
      id: 'ev-other',
      slug: 'other-event',
      name: "Someone Else's Event",
      submittedByUserId: 'other-organizer-99',
      submittedBy: { displayName: 'Other Organizer' },
    })

    setupMockApi(page, {
      users: [organizer],
      domains: [domain],
      events: [myEvent, otherEvent],
    })

    await loginAs(page, organizer)
    await page.waitForURL(/\/dashboard$/)

    // Only the organizer's own event should appear in the analytics table
    await expect(page.getByRole('link', { name: 'My Own Event' })).toBeVisible()
    await expect(page.getByText("Someone Else's Event")).toBeHidden()
  })

  test('total saves KPI reflects aggregate count across all published events', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    const event1 = makeApprovedEvent({
      id: 'ev-kpi-1',
      slug: 'kpi-event-1',
      name: 'KPI Event One',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })
    const event2 = makeApprovedEvent({
      id: 'ev-kpi-2',
      slug: 'kpi-event-2',
      name: 'KPI Event Two',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const state = setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [event1, event2],
    })

    // 3 saves across two events
    state.favoriteEvents.push(
      { id: 'fav-kpi-1', userId: 'u1', eventId: event1.id, createdAtUtc: new Date().toISOString() },
      { id: 'fav-kpi-2', userId: 'u2', eventId: event1.id, createdAtUtc: new Date().toISOString() },
      { id: 'fav-kpi-3', userId: 'u1', eventId: event2.id, createdAtUtc: new Date().toISOString() },
    )

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // KPI card "Total Saves" should show 3
    const savesCard = page.locator('.stat-card', { has: page.locator('.stat-label', { hasText: 'Total Saves' }) })
    await expect(savesCard.locator('.stat-number--primary')).toContainText('3')
  })
})
