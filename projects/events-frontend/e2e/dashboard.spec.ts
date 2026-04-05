import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeAdminUser,
  makeContributorUser,
  makeTechDomain,
  makeApprovedEvent,
  makePendingEvent,
  makeRejectedEvent,
  makeDraftEvent,
  makePublicGroup,
  makePrivateGroup,
  makeActiveMembership,
  loginAs,
  type MockFavoriteEvent,
  type MockCalendarAction,
  type MockDomainLink,
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

    // Should show "No recent saves" for event with no activity (saves momentum column)
    await expect(page.locator('.col-momentum .trend--quiet')).toBeVisible()
    await expect(page.locator('.col-momentum .trend--quiet')).toContainText('No recent saves')
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

    // Low-data guidance section should appear (scoped to avoid matching per-event recommendation rows)
    const guidanceSection = page.locator('.low-data-guidance')
    await expect(guidanceSection).toBeVisible()
    await expect(guidanceSection).toContainText(/No saves yet/)
    await expect(guidanceSection).toContainText(/Share the event link/)
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

  test('KPI cards show helper text describing what each metric measures', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-helper-1',
      slug: 'helper-event-1',
      name: 'Helper Text Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Each KPI card should have a .stat-helper element describing the metric
    await expect(page.locator('.stat-helper', { hasText: 'All events you have submitted' })).toBeVisible()
    await expect(page.locator('.stat-helper', { hasText: 'Live on the platform, visible to the public' })).toBeVisible()
    await expect(page.locator('.stat-helper', { hasText: 'Awaiting moderator approval' })).toBeVisible()
    await expect(page.locator('.stat-helper', { hasText: 'All-time saves across your published events' })).toBeVisible()
    await expect(page.locator('.stat-helper', { hasText: 'All-time calendar exports across your published events' })).toBeVisible()
  })

  test('shows guidance when saves exist but no calendar adds yet', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-cal-guidance-1',
      slug: 'cal-guidance-event-1',
      name: 'Saves No Cal Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const state = setupMockApi(page, { users: [user], domains: [domain], events: [event] })

    // Add saves but no calendar actions
    state.favoriteEvents.push(
      { id: 'fav-cg-1', userId: 'u1', eventId: event.id, createdAtUtc: new Date().toISOString() },
      { id: 'fav-cg-2', userId: 'u2', eventId: event.id, createdAtUtc: new Date().toISOString() },
    )

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Calendar guidance should appear (saves exist but no calendar adds)
    await expect(page.locator('.low-data-guidance--calendar')).toBeVisible()
    await expect(page.locator('.low-data-guidance--calendar')).toContainText(
      'Attendees are saving your events but none have added them to their calendar yet',
    )
  })

  test('calendar guidance does not appear when calendar adds exist', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-cal-no-guidance-1',
      slug: 'cal-no-guidance-event-1',
      name: 'Saves And Cal Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const state = setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    state.favoriteEvents.push({
      id: 'fav-ng-1', userId: 'u1', eventId: event.id, createdAtUtc: new Date().toISOString(),
    })
    state.calendarActions.push({
      id: 'ca-ng-1', eventId: event.id, provider: 'GOOGLE', triggeredAtUtc: new Date().toISOString(),
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Calendar guidance should NOT appear (calendar adds already exist)
    await expect(page.locator('.low-data-guidance--calendar')).toHaveCount(0)
  })

  test('dashboard is usable on mobile viewport', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-mobile-1',
      slug: 'mobile-event-1',
      name: 'Mobile Test Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })

    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // KPI cards should be visible on mobile
    await expect(page.getByText('Total Events')).toBeVisible()
    await expect(page.getByText('Total Saves')).toBeVisible()

    // Performance section heading should be visible
    await expect(page.getByRole('heading', { name: 'Event Performance' })).toBeVisible()

    // Event row should be visible (table horizontally scrollable)
    await expect(page.locator('.events-table')).toBeVisible()
  })

  test('shows missing-timezone recommendation for published event with saves but no timezone', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-tz-1',
      slug: 'tz-event-1',
      name: 'Timezone Missing Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      language: 'en',
      timezone: null,
    })

    const state = setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    state.favoriteEvents.push({
      id: 'fav-tz-1',
      userId: 'attendee-tz',
      eventId: event.id,
      createdAtUtc: new Date().toISOString(),
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // The recommendation row should mention timezone
    const recRows = page.locator('.event-recommendation-row')
    await expect(recRows).toBeVisible()
    await expect(recRows).toContainText("doesn't have a timezone set")
  })

  test('shows missing-domain recommendation for published event with saves, language, timezone but no domain', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-domain-1',
      slug: 'domain-event-1',
      name: 'No Domain Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      language: 'en',
      timezone: 'Europe/Bratislava',
      domain: null,
    })

    const state = setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    state.favoriteEvents.push({
      id: 'fav-dom-1',
      userId: 'attendee-dom',
      eventId: event.id,
      createdAtUtc: new Date().toISOString(),
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // The recommendation row should mention category
    const recRows = page.locator('.event-recommendation-row')
    await expect(recRows).toBeVisible()
    await expect(recRows).toContainText("isn't assigned to a category")
  })

  test('no metadata recommendation shown when event has saves, language, timezone, and domain', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-complete-1',
      slug: 'complete-event-1',
      name: 'Complete Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      language: 'en',
      timezone: 'Europe/Bratislava',
    })

    const state = setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    state.favoriteEvents.push({
      id: 'fav-complete-1',
      userId: 'attendee-complete',
      eventId: event.id,
      createdAtUtc: new Date().toISOString(),
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // No recommendation row should be visible (event is fully complete)
    await expect(page.locator('.event-recommendation-row')).toHaveCount(0)
  })
})

// ── Calendar Analytics dashboard tests ───────────────────────────────────────

test.describe('Calendar analytics dashboard', () => {
  test('shows Calendar Adds KPI card with correct total', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-cal-kpi',
      slug: 'cal-kpi-event',
      name: 'Calendar KPI Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const state = setupMockApi(page, { users: [user], domains: [domain], events: [event] })

    const actions: MockCalendarAction[] = [
      { id: 'ca-1', eventId: event.id, provider: 'GOOGLE', triggeredAtUtc: new Date().toISOString() },
      { id: 'ca-2', eventId: event.id, provider: 'ICS', triggeredAtUtc: new Date().toISOString() },
      { id: 'ca-3', eventId: event.id, provider: 'GOOGLE', triggeredAtUtc: new Date().toISOString() },
    ]
    state.calendarActions.push(...actions)

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    const calCard = page.locator('.stat-card', {
      has: page.locator('.stat-label', { hasText: 'Calendar Adds' }),
    })
    await expect(calCard).toBeVisible()
    await expect(calCard.locator('.stat-number--calendar')).toContainText('3')
  })

  test('shows calendar trend "this week" when actions in last 7 days', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-cal-trend-week',
      slug: 'cal-trend-week',
      name: 'Cal Trend Week Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const state = setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    state.calendarActions.push({
      id: 'ca-week-1',
      eventId: event.id,
      provider: 'GOOGLE',
      triggeredAtUtc: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Cal trend badge should show "this week"
    const calTrendCells = page.locator('.col-cal-trend .trend--active')
    await expect(calTrendCells.first()).toBeVisible()
    await expect(calTrendCells.first()).toContainText('this week')
  })

  test('shows calendar trend "this month" when actions in last 30 but not 7 days', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-cal-trend-month',
      slug: 'cal-trend-month',
      name: 'Cal Trend Month Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const state = setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    state.calendarActions.push({
      id: 'ca-month-1',
      eventId: event.id,
      provider: 'OUTLOOK',
      triggeredAtUtc: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    const calTrendCells = page.locator('.col-cal-trend .trend--recent')
    await expect(calTrendCells.first()).toBeVisible()
    await expect(calTrendCells.first()).toContainText('this month')
  })

  test('shows "No recent adds" when no calendar actions in last 30 days', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-cal-quiet',
      slug: 'cal-quiet-event',
      name: 'Cal Quiet Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    const calTrendCells = page.locator('.col-cal-trend .trend--quiet')
    await expect(calTrendCells.first()).toBeVisible()
    await expect(calTrendCells.first()).toContainText('No recent adds')
  })

  test('shows provider breakdown chips for events with calendar actions', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-cal-providers',
      slug: 'cal-providers-event',
      name: 'Cal Providers Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const state = setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    state.calendarActions.push(
      { id: 'ca-p1', eventId: event.id, provider: 'GOOGLE', triggeredAtUtc: new Date().toISOString() },
      { id: 'ca-p2', eventId: event.id, provider: 'GOOGLE', triggeredAtUtc: new Date().toISOString() },
      { id: 'ca-p3', eventId: event.id, provider: 'ICS', triggeredAtUtc: new Date().toISOString() },
    )

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Provider breakdown chips should be visible
    await expect(page.locator('.provider-chip', { hasText: 'Google 2' })).toBeVisible()
    await expect(page.locator('.provider-chip', { hasText: 'ICS 1' })).toBeVisible()
  })

  test('Calendar Adds KPI only counts published events', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    const publishedEvent = makeApprovedEvent({
      id: 'ev-cal-pub',
      slug: 'cal-pub-event',
      name: 'Published Cal Event',
      status: 'PUBLISHED',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })
    const pendingEvent = makeApprovedEvent({
      id: 'ev-cal-pend',
      slug: 'cal-pend-event',
      name: 'Pending Cal Event',
      status: 'PENDING_APPROVAL',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const state = setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [publishedEvent, pendingEvent],
    })
    state.calendarActions.push(
      { id: 'ca-pub-1', eventId: publishedEvent.id, provider: 'GOOGLE', triggeredAtUtc: new Date().toISOString() },
      { id: 'ca-pend-1', eventId: pendingEvent.id, provider: 'ICS', triggeredAtUtc: new Date().toISOString() },
    )

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // KPI should only count published event's action (1, not 2)
    const calCard = page.locator('.stat-card', {
      has: page.locator('.stat-label', { hasText: 'Calendar Adds' }),
    })
    await expect(calCard.locator('.stat-number--calendar')).toContainText('1')
  })

  test('calendar analytics column shows 0 for event with no actions', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-cal-zero',
      slug: 'cal-zero-event',
      name: 'Cal Zero Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Calendar column shows 0
    const calCell = page.locator('.col-calendar .saves-count')
    await expect(calCell.first()).toContainText('0')

    // No provider chips visible
    await expect(page.locator('.provider-chip')).toHaveCount(0)
  })

  test('unauthenticated user sees sign-in prompt, no calendar analytics shown', async ({
    page,
  }) => {
    const domain = makeTechDomain()
    setupMockApi(page, { domains: [domain] })

    await page.goto('/dashboard')

    await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible()
    await expect(page.locator('.col-calendar')).toHaveCount(0)
  })

  test('organizer only sees their own events calendar analytics', async ({ page }) => {
    const organizer = makeAdminUser()
    const domain = makeTechDomain()

    const myEvent = makeApprovedEvent({
      id: 'ev-cal-mine',
      slug: 'cal-my-event',
      name: 'My Cal Event',
      submittedByUserId: organizer.id,
      submittedBy: { displayName: organizer.displayName },
    })
    const otherEvent = makeApprovedEvent({
      id: 'ev-cal-other',
      slug: 'cal-other-event',
      name: "Other's Cal Event",
      submittedByUserId: 'other-organizer-99',
      submittedBy: { displayName: 'Other Organizer' },
    })

    const state = setupMockApi(page, {
      users: [organizer],
      domains: [domain],
      events: [myEvent, otherEvent],
    })
    // 5 actions on other's event, 1 on mine
    state.calendarActions.push(
      { id: 'ca-mine', eventId: myEvent.id, provider: 'GOOGLE', triggeredAtUtc: new Date().toISOString() },
      { id: 'ca-o1', eventId: otherEvent.id, provider: 'ICS', triggeredAtUtc: new Date().toISOString() },
      { id: 'ca-o2', eventId: otherEvent.id, provider: 'ICS', triggeredAtUtc: new Date().toISOString() },
      { id: 'ca-o3', eventId: otherEvent.id, provider: 'GOOGLE', triggeredAtUtc: new Date().toISOString() },
    )

    await loginAs(page, organizer)
    await page.waitForURL(/\/dashboard$/)

    // KPI should only count my event's action (1)
    const calCard = page.locator('.stat-card', {
      has: page.locator('.stat-label', { hasText: 'Calendar Adds' }),
    })
    await expect(calCard.locator('.stat-number--calendar')).toContainText('1')

    // Other organizer's event should not appear in table
    await expect(page.getByText("Other's Cal Event")).toBeHidden()
  })

  test('dashboard shows explanatory copy describing what calendar adds measure', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-cal-explain',
      slug: 'cal-explain-event',
      name: 'Cal Explain Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // The performance description must explain what "calendar adds" means in plain language
    await expect(
      page.locator('.performance-description'),
    ).toContainText('Calendar adds show how many attendees added an event to their personal calendar')
  })
})

// ---------------------------------------------------------------------------
// Hub Management section (domain admin panel in dashboard)
// ---------------------------------------------------------------------------

test.describe('Hub Management section in dashboard', () => {
  test('hub management section is not visible for users with no managed domains', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [],
      events: [],
    })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.locator('.hub-management-section')).toBeHidden()
  })

  test('hub management section appears when user is a domain administrator', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events: [],
    })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.locator('.hub-management-section')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Hub Management' }),
    ).toBeVisible()
    await expect(page.locator('.hub-card')).toBeVisible()
    await expect(page.locator('.hub-card-name')).toContainText('Technology')
  })

  test('contributor domain admin can update hub branding via dashboard and see it on the public hub', async ({
    page,
  }) => {
    const user = makeContributorUser()
    const domain = {
      ...makeTechDomain(),
      logoUrl: null,
      bannerUrl: null,
      overviewContent: null,
      curatorCredit: null,
    }
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events: [],
    })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.locator('.hub-management-section')).toBeVisible()

    // Fill in style and overview content from the contributor-owned hub panel
    const primaryColorInput = page.locator('.hub-style-form input[placeholder="#137fec"]')
    await primaryColorInput.fill('#ff5500')
    await page.getByLabel('Logo URL').fill('https://example.com/contributor-logo.png')
    await page.getByLabel('Banner URL').fill('https://example.com/contributor-banner.jpg')
    await page.locator('.hub-style-form').getByRole('button', { name: 'Save Style' }).click()
    await expect(page.locator('.hub-save-success').first()).toBeVisible()

    const overviewTextarea = page.locator('.hub-overview-form textarea').first()
    await overviewTextarea.fill('This is the Technology hub — curated for developers.')
    await page.getByLabel('Curator credit').fill('Contributor Curator')
    await page.locator('.hub-overview-form').getByRole('button', { name: 'Save Content' }).click()
    await expect(page.locator('.hub-overview-form .hub-save-success')).toBeVisible()

    await page.goto('/category/technology')

    await expect(page.locator('.category-logo')).toHaveAttribute(
      'src',
      'https://example.com/contributor-logo.png',
    )
    await expect(page.locator('.category-banner')).toHaveAttribute(
      'src',
      'https://example.com/contributor-banner.jpg',
    )
    await expect(page.getByText('This is the Technology hub — curated for developers.')).toBeVisible()
    await expect(page.getByText('Contributor Curator')).toBeVisible()
  })

  test('contributor domain admin can update hub tagline and see it on the public hub', async ({
    page,
  }) => {
    const user = makeContributorUser()
    const domain = {
      ...makeTechDomain(),
      tagline: null,
    }
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events: [],
    })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.locator('.hub-management-section')).toBeVisible()

    // Fill in the tagline via the hub overview form
    const taglineInput = page.locator('.hub-overview-form input[type="text"]').first()
    await taglineInput.fill('Premier tech events in Central Europe.')
    await page.locator('.hub-overview-form').getByRole('button', { name: 'Save Content' }).click()
    await expect(page.locator('.hub-overview-form .hub-save-success')).toBeVisible()

    // Navigate to the public category hub page and verify the tagline is shown
    await page.goto('/category/technology')

    await expect(page.locator('.category-tagline')).toBeVisible()
    await expect(page.locator('.category-tagline')).toContainText('Premier tech events in Central Europe.')
  })

  test('hub management shows an explicit error when saving fails', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events: [],
    })

    await page.route('**/graphql', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}')
      if ((body.query || '').includes('UpdateDomainStyle')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'You must be a global administrator or a domain administrator.' }],
          }),
        })
        return
      }
      await route.fallback()
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await page.locator('.hub-style-form input[placeholder="#137fec"]').fill('#ff5500')
    await page.locator('.hub-style-form').getByRole('button', { name: 'Save Style' }).click()

    await expect(page.getByText('Failed to save. Please try again.')).toBeVisible()
  })

  test('hub management section shows View hub link to category page', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events: [],
    })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.locator('.hub-management-section')).toBeVisible()
    const viewHubLink = page.locator('.hub-card').getByRole('link', { name: 'View hub' })
    await expect(viewHubLink).toBeVisible()
    await expect(viewHubLink).toHaveAttribute('href', /\/category\/technology/)
  })

  test('domain admin can manage curated links via dashboard and see them on the public hub', async ({
    page,
  }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    const existingLink: MockDomainLink = {
      id: 'link-tech-site',
      domainId: domain.id,
      title: 'Community Site',
      url: 'https://tech.example.com',
      displayOrder: 0,
      createdAtUtc: new Date().toISOString(),
    }

    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      domainLinks: [existingLink],
      events: [],
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.locator('.hub-management-section')).toBeVisible()
    await expect(page.getByText('Community Site')).toBeVisible()

    await page.getByRole('textbox', { name: 'Label', exact: true }).fill('Discord')
    await page.getByRole('textbox', { name: 'URL', exact: true }).fill('https://discord.gg/tech')
    await page.getByRole('button', { name: 'Add Link' }).click()
    await page.getByRole('button', { name: 'Save Links' }).click()

    await expect(page.getByText('✓ Saved')).toBeVisible()

    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'Community Links' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Community Site' })).toHaveAttribute(
      'href',
      'https://tech.example.com',
    )
    await expect(page.getByRole('link', { name: 'Discord' })).toHaveAttribute(
      'href',
      'https://discord.gg/tech',
    )
  })

  test('invalid hex primary color shows inline error and does not save', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events: [],
    })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Enter an invalid color value
    await page.locator('.hub-style-form input[placeholder="#137fec"]').fill('red')
    await page.locator('.hub-style-form').getByRole('button', { name: 'Save Style' }).click()

    // Inline error appears
    await expect(page.locator('.field-error').first()).toBeVisible()
    await expect(page.locator('.field-error').first()).toContainText(/hex/)

    // Success indicator must NOT appear (save was blocked)
    await expect(page.locator('.hub-save-success')).toHaveCount(0)
  })

  test('invalid hex accent color shows inline error', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events: [],
    })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Leave primary color blank; enter bad accent color
    await page.locator('.hub-style-form input[placeholder="#ff5500"]').fill('rgb(255,0,0)')
    await page.locator('.hub-style-form').getByRole('button', { name: 'Save Style' }).click()

    // Accent-color inline error appears (primary is blank so only one field-error is rendered)
    await expect(page.locator('.field-error').first()).toBeVisible()
    await expect(page.locator('.field-error').first()).toContainText(/hex/)
  })

  test('valid hex color saves successfully without inline error', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events: [],
    })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await page.locator('.hub-style-form input[placeholder="#137fec"]').fill('#137fec')
    await page.locator('.hub-style-form').getByRole('button', { name: 'Save Style' }).click()

    // Success indicator should appear; no field-level errors
    await expect(page.locator('.hub-style-form .hub-save-success')).toBeVisible()
    await expect(page.locator('.field-error')).toHaveCount(0)
  })

  test('hub style form shows localized color error in Slovak', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events: [],
    })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Switch to Slovak
    await page.getByRole('combobox', { name: 'Language' }).selectOption('sk')

    await page.locator('.hub-style-form input[placeholder="#137fec"]').fill('notacolor')
    await page.locator('.hub-style-form').getByRole('button', { name: /Uložiť štýl/ }).click()

    // Slovak error message should appear
    await expect(page.locator('.field-error').first()).toBeVisible()
    await expect(page.locator('.field-error').first()).toContainText(/hex/)
  })

  test('hub management section is usable on mobile viewport', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events: [],
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Hub management section is visible on mobile
    await expect(page.locator('.hub-management-section')).toBeVisible()
    // Primary color input is accessible
    await expect(page.locator('.hub-style-form input[placeholder="#137fec"]')).toBeVisible()
    // Save button is accessible
    await expect(
      page.locator('.hub-style-form').getByRole('button', { name: 'Save Style' }),
    ).toBeVisible()
  })

  test('hub management shows Featured Events section with empty state', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events: [],
    })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.locator('.hub-management-section')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Featured Events' })).toBeVisible()
    await expect(page.getByText('No featured events yet.')).toBeVisible()
  })

  test('domain admin can add and save a featured event from the dashboard', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      name: 'Blockchain Summit',
      slug: 'blockchain-summit',
      submittedByUserId: user.id,
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events: [event],
    })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.locator('.hub-management-section')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Featured Events' })).toBeVisible()

    // Select the event from the dropdown
    const select = page.locator('.hub-featured-select')
    await expect(select).toBeVisible()
    await select.selectOption(event.id)
    await page.locator('.hub-add-featured-form').getByRole('button', { name: 'Add' }).click()

    // Event should appear in the featured list
    await expect(
      page.locator('.hub-featured-events-list').getByText('Blockchain Summit'),
    ).toBeVisible()

    // Save featured events
    await page.getByRole('button', { name: 'Save Featured Events' }).click()
    await expect(page.locator('.hub-save-success').last()).toBeVisible()
  })

  test('domain admin can remove a featured event from the dashboard', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      name: 'Web3 Conference',
      slug: 'web3-conference',
      submittedByUserId: user.id,
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events: [event],
      featuredEvents: [{ domainSlug: domain.slug, eventId: event.id, displayOrder: 0 }],
    })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.locator('.hub-management-section')).toBeVisible()
    // Featured event should be loaded
    await expect(
      page.locator('.hub-featured-events-list').getByText('Web3 Conference'),
    ).toBeVisible()

    // Remove it
    await page.locator('.hub-featured-event-item').getByRole('button', { name: 'Remove' }).click()

    // Empty state should appear
    await expect(page.getByText('No featured events yet.')).toBeVisible()

    // Save
    await page.getByRole('button', { name: 'Save Featured Events' }).click()
    await expect(page.locator('.hub-save-success').last()).toBeVisible()
  })

  test('featured events picker is hidden when 5 events are already featured', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    const events = Array.from({ length: 5 }, (_, i) =>
      makeApprovedEvent({
        id: `event-feat-${i}`,
        name: `Featured Event ${i + 1}`,
        slug: `featured-event-${i}`,
        submittedByUserId: user.id,
        domainId: domain.id,
        domain: {
          id: domain.id,
          name: domain.name,
          slug: domain.slug,
          subdomain: domain.subdomain,
        },
      }),
    )
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      domainAdministrators: [
        {
          id: 'da-1',
          domainId: domain.id,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email },
          createdAtUtc: new Date().toISOString(),
        },
      ],
      events,
      featuredEvents: events.map((e, i) => ({
        domainSlug: domain.slug,
        eventId: e.id,
        displayOrder: i,
      })),
    })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.locator('.hub-management-section')).toBeVisible()
    // All 5 featured events should be listed
    await expect(page.locator('.hub-featured-event-item')).toHaveCount(5)
    // The add picker should be hidden since we are at max
    await expect(page.locator('.hub-add-featured-form')).toBeHidden()
  })
})

// ── Per-event recommendations and guidance tests ──────────────────────────────

test.describe('Per-event recommendations and guidance', () => {
  test('shows recommendation for rejected event with admin notes', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeRejectedEvent({
      id: 'ev-rej-rec-1',
      slug: 'rejected-rec-event',
      name: 'Rejected Rec Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      adminNotes: 'Please add more venue details.',
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Recommendation row for rejected event should be visible
    await expect(page.locator('.event-recommendation-row.rec--rejected')).toBeVisible()
    await expect(page.locator('.rec-text')).toContainText(/rejected/)
    // Admin notes should be shown inline
    await expect(page.locator('.rec-admin-notes')).toContainText('Please add more venue details.')
  })

  test('shows recommendation for draft event', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeDraftEvent({
      id: 'ev-draft-rec-1',
      slug: 'draft-rec-event',
      name: 'Draft Rec Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Recommendation row for draft event should be visible
    await expect(page.locator('.event-recommendation-row.rec--draft')).toBeVisible()
    await expect(page.locator('.rec-text')).toContainText(/draft/)
  })

  test('shows recommendation for pending approval event', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makePendingEvent({
      id: 'ev-pend-rec-1',
      slug: 'pending-rec-event',
      name: 'Pending Rec Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Recommendation row for pending event should be visible
    await expect(page.locator('.event-recommendation-row.rec--pending')).toBeVisible()
    await expect(page.locator('.rec-text')).toContainText(/awaiting moderator review/)
  })

  test('shows per-event recommendation for published event with no saves', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    // Use a far-future start date (>7 days) so the standard guidance shows instead of urgent
    // Default publishedAtUtc is 30 days ago, so it shows "No saves yet" (not newly-published)
    const event = makeApprovedEvent({
      id: 'ev-pub-nosaves-1',
      slug: 'pub-nosaves-event',
      name: 'Published No Saves Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      startsAtUtc: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      endsAtUtc: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Per-event guidance recommendation for published event with zero saves
    await expect(page.locator('.event-recommendation-row.rec--guidance')).toBeVisible()
    await expect(page.locator('.rec-text')).toContainText(/No saves yet/)
  })

  test('shows newly-published guidance for organizer with recently published event and no saves', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    // Event published 2 days ago with a start date > 7 days from now → newly-published guidance
    const event = makeApprovedEvent({
      id: 'ev-newly-pub-1',
      slug: 'newly-pub-event',
      name: 'Newly Published Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      startsAtUtc: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      endsAtUtc: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      publishedAtUtc: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // published 2 days ago
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Newly-published guidance should appear (not "No saves yet")
    await expect(page.locator('.event-recommendation-row.rec--guidance')).toBeVisible()
    await expect(page.locator('.rec-text')).toContainText(/just published/)
    // The standard "No saves yet" message should NOT appear
    await expect(page.locator('.rec-text')).not.toContainText(/No saves yet/)
  })

  test('does not show per-event recommendation for published event that already has saves', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-pub-saves-1',
      slug: 'pub-saves-event',
      name: 'Published With Saves Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const state = setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    state.favoriteEvents.push({
      id: 'fav-ps-1',
      userId: 'u1',
      eventId: event.id,
      createdAtUtc: new Date().toISOString(),
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // No per-event recommendation row should appear (event has saves)
    await expect(page.locator('.event-recommendation-row')).toHaveCount(0)
  })

  test('shows first-event welcome guidance when organizer has one pending event and no published events', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makePendingEvent({
      id: 'ev-first-welcome',
      slug: 'first-welcome-event',
      name: 'First Welcome Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // First-event welcome card should appear
    await expect(page.locator('.first-event-welcome')).toBeVisible()
    await expect(page.locator('.first-event-welcome')).toContainText(/first event/)
  })

  test('all-time total label is shown on Total Saves and Calendar Adds KPI cards', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-alltime-1',
      slug: 'alltime-event',
      name: 'All-time Label Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // "All-time total" label should appear in both the Total Saves and Calendar Adds KPI cards
    const savesCard = page.locator('.stat-card', {
      has: page.locator('.stat-label', { hasText: 'Total Saves' }),
    })
    await expect(savesCard.locator('.stat-timeframe')).toBeVisible()
    await expect(savesCard.locator('.stat-timeframe')).toContainText('All-time total')

    const calCard = page.locator('.stat-card', {
      has: page.locator('.stat-label', { hasText: 'Calendar Adds' }),
    })
    await expect(calCard.locator('.stat-timeframe')).toBeVisible()
    await expect(calCard.locator('.stat-timeframe')).toContainText('All-time total')
  })

  test('per-event recommendations are visible on mobile viewport', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeRejectedEvent({
      id: 'ev-mobile-rec-1',
      slug: 'mobile-rec-event',
      name: 'Mobile Rec Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      adminNotes: 'Add more detail.',
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Recommendation row should still be visible on mobile
    await expect(page.locator('.event-recommendation-row')).toBeVisible()
  })

  test('shows urgent approaching-soon recommendation for published event starting within 7 days with no saves', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    // Event starts 3 days from now
    const soonDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    const event = makeApprovedEvent({
      id: 'ev-approaching-nosaves',
      slug: 'approaching-nosaves-event',
      name: 'Approaching No Saves Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      startsAtUtc: soonDate,
      endsAtUtc: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Urgent recommendation row should appear with rec--urgent class
    await expect(page.locator('.event-recommendation-row.rec--urgent')).toBeVisible()
    await expect(page.locator('.rec-text')).toContainText(/less than a week/)
  })

  test('does not show urgent recommendation for published event starting in more than 7 days with no saves', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    // Event starts 14 days from now
    const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    const event = makeApprovedEvent({
      id: 'ev-future-nosaves',
      slug: 'future-nosaves-event',
      name: 'Future No Saves Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      startsAtUtc: futureDate,
      endsAtUtc: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Standard (non-urgent) recommendation row should appear
    await expect(page.locator('.event-recommendation-row.rec--guidance')).toBeVisible()
    // Should NOT have the urgent class
    await expect(page.locator('.event-recommendation-row.rec--urgent')).toHaveCount(0)
    await expect(page.locator('.rec-text')).toContainText(/No saves yet/)
  })

  test('shows missing-language recommendation for published event with saves but no language set', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-no-language',
      slug: 'no-language-event',
      name: 'No Language Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      language: null,
    })

    const state = setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    // Add a save so the zero-saves recommendation is suppressed
    state.favoriteEvents.push({
      id: 'fav-lang-1',
      userId: 'u1',
      eventId: event.id,
      createdAtUtc: new Date().toISOString(),
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Missing-language recommendation should appear
    await expect(page.locator('.event-recommendation-row.rec--guidance')).toBeVisible()
    await expect(page.locator('.rec-text')).toContainText(/language/)
  })

  test('does not show missing-language recommendation when language is already set', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-has-language',
      slug: 'has-language-event',
      name: 'Has Language Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      language: 'en',
    })

    const state = setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    state.favoriteEvents.push({
      id: 'fav-lang-set-1',
      userId: 'u1',
      eventId: event.id,
      createdAtUtc: new Date().toISOString(),
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // No recommendation row should appear (has saves AND has language)
    await expect(page.locator('.event-recommendation-row')).toHaveCount(0)
  })
})

// ── My Communities section ────────────────────────────────────────────────────

test.describe('Dashboard – My Communities section', () => {
  test('shows empty state when user has no community memberships', async ({ page }) => {
    const user = makeContributorUser()
    setupMockApi(page, { users: [user] })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.getByRole('heading', { name: 'My Communities' })).toBeVisible()
    await expect(page.getByText("You haven't joined any community yet.")).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse Communities', exact: true }).first()).toBeVisible()
  })

  test('shows active community memberships with role badges', async ({ page }) => {
    const user = makeContributorUser()
    const group = makePublicGroup({ id: 'grp-dash-1', name: 'Blockchain Builders', slug: 'blockchain-builders' })
    const state = setupMockApi(page, { users: [user] })
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, user.id, 'MEMBER'))

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.getByRole('heading', { name: 'My Communities' })).toBeVisible()
    await expect(page.locator('.community-item-name', { hasText: 'Blockchain Builders' })).toBeVisible()
    await expect(page.locator('.community-role-badge', { hasText: 'Member' })).toBeVisible()
  })

  test('shows admin role badge for group admin', async ({ page }) => {
    const user = makeContributorUser()
    const group = makePublicGroup({ id: 'grp-admin-dash', name: 'Admin Circle', slug: 'admin-circle' })
    const state = setupMockApi(page, { users: [user] })
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, user.id, 'ADMIN'))

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.locator('.community-role-badge', { hasText: 'Admin' })).toBeVisible()
  })

  test('shows event manager role badge for event manager member', async ({ page }) => {
    const user = makeContributorUser()
    const group = makePublicGroup({ id: 'grp-em-dash', name: 'Event Organizers', slug: 'event-organizers' })
    const state = setupMockApi(page, { users: [user] })
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, user.id, 'EVENT_MANAGER'))

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await expect(page.locator('.community-role-badge', { hasText: 'Event Manager' })).toBeVisible()
  })

  test('community item links to group detail page', async ({ page }) => {
    const user = makeContributorUser()
    const group = makePublicGroup({ id: 'grp-link-dash', name: 'Link Test Group', slug: 'link-test-group' })
    const state = setupMockApi(page, { users: [user] })
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, user.id))

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await page.locator('.community-item', { hasText: 'Link Test Group' }).click()
    await expect(page).toHaveURL(/\/community\/link-test-group/)
  })

  test('does not show pending memberships in My Communities', async ({ page }) => {
    const user = makeContributorUser()
    const publicGroup = makePublicGroup({ id: 'grp-active-only', name: 'Active Only Group', slug: 'active-only-group' })
    const privateGroup = makePrivateGroup({ id: 'grp-pending-only', name: 'Pending Group', slug: 'pending-group' })
    const state = setupMockApi(page, { users: [user] })
    state.communityGroups.push(publicGroup, privateGroup)
    state.communityMemberships.push(makeActiveMembership(publicGroup.id, user.id))
    // Add a PENDING membership for the private group
    state.communityMemberships.push({
      id: 'mem-pending-dash',
      groupId: privateGroup.id,
      userId: user.id,
      role: 'MEMBER',
      status: 'PENDING',
      createdAtUtc: new Date().toISOString(),
      reviewedAtUtc: null,
      reviewedByUserId: null,
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Active group shown, pending group NOT shown
    await expect(page.locator('.community-item-name', { hasText: 'Active Only Group' })).toBeVisible()
    await expect(page.locator('.community-item-name', { hasText: 'Pending Group' })).toHaveCount(0)
  })

  test('unauthenticated user does not see My Communities section', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/dashboard')

    await expect(page.getByRole('heading', { name: 'My Communities' })).toHaveCount(0)
    // Not-logged-in prompt is visible
    await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible()
  })

  test('shows error state with retry button when membership fetch fails', async ({ page }) => {
    const user = makeContributorUser()
    // Set up mocks FIRST, then register the override
    setupMockApi(page, { users: [user] })
    await page.route('**/graphql', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}')
      if (body.query?.includes('MyCommunityMemberships')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Service temporarily unavailable' }] }),
        })
      } else {
        await route.fallback()
      }
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Error state must be shown — not the empty state
    await expect(page.locator('.communities-error')).toBeVisible()
    await expect(page.locator('.communities-error')).toContainText('Unable to load your communities')
    await expect(page.locator('.communities-error').getByRole('button', { name: 'Try again' })).toBeVisible()

    // Empty state must NOT be shown
    await expect(page.locator('.communities-empty')).toHaveCount(0)
  })
})

// ── Analytics state banners ───────────────────────────────────────────────────

test.describe('Dashboard analytics state banners', () => {
  test('shows early-data banner when all published events are newly live and saves are low', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    // Published just 3 days ago — newly live, no saves
    const event = makeApprovedEvent({
      id: 'ev-early-state',
      slug: 'early-state-event',
      name: 'Early State Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      publishedAtUtc: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Early-data banner should be visible
    const banner = page.locator('.analytics-state-banner--early')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText(/newly published|just published|still forming|Data is still forming/i)
  })

  test('shows low-signal banner when published event is older and has few saves', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    // Published 30 days ago (default) — not newly published, but no saves
    const event = makeApprovedEvent({
      id: 'ev-low-signal-state',
      slug: 'low-signal-state-event',
      name: 'Low Signal State Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Low-signal banner should be visible (not early because > 14 days old)
    const banner = page.locator('.analytics-state-banner--low-signal')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText(/limited saves|limited distribution|low engagement/i)
  })

  test('does not show analytics state banner for events with normal signal (≥5 saves)', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-normal-state',
      slug: 'normal-state-event',
      name: 'Normal State Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const state = setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    // 5 saves → normal signal
    for (let i = 0; i < 5; i++) {
      state.favoriteEvents.push({
        id: `fav-normal-${i}`,
        userId: `u-${i}`,
        eventId: event.id,
        createdAtUtc: new Date().toISOString(),
      })
    }

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // No analytics state banners should appear for a normal-signal dashboard
    await expect(page.locator('.analytics-state-banner--early')).toHaveCount(0)
    await expect(page.locator('.analytics-state-banner--low-signal')).toHaveCount(0)
  })

  test('does not show analytics state banner when there are no events at all', async ({ page }) => {
    const user = makeAdminUser()
    setupMockApi(page, { users: [user] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Empty state is shown instead; no analytics state banners
    await expect(page.locator('.analytics-state-banner--early')).toHaveCount(0)
    await expect(page.locator('.analytics-state-banner--low-signal')).toHaveCount(0)
  })

  test('shows early-data banner for multi-event organizer when all events are newly published', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const recentPublished = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()

    const events = [
      makeApprovedEvent({
        id: 'ev-multi-early-1',
        slug: 'multi-early-1',
        name: 'Multi Early Event One',
        submittedByUserId: user.id,
        submittedBy: { displayName: user.displayName },
        publishedAtUtc: recentPublished,
      }),
      makeApprovedEvent({
        id: 'ev-multi-early-2',
        slug: 'multi-early-2',
        name: 'Multi Early Event Two',
        submittedByUserId: user.id,
        submittedBy: { displayName: user.displayName },
        publishedAtUtc: recentPublished,
      }),
    ]

    setupMockApi(page, { users: [user], domains: [domain], events })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Both events are newly published → early-data banner
    await expect(page.locator('.analytics-state-banner--early')).toBeVisible()
  })

  test('shows low-signal banner when one event is new but another is older (mixed freshness)', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    const events = [
      makeApprovedEvent({
        id: 'ev-mix-new',
        slug: 'mix-new-event',
        name: 'New Event',
        submittedByUserId: user.id,
        submittedBy: { displayName: user.displayName },
        publishedAtUtc: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days old
      }),
      makeApprovedEvent({
        id: 'ev-mix-old',
        slug: 'mix-old-event',
        name: 'Older Event',
        submittedByUserId: user.id,
        submittedBy: { displayName: user.displayName },
        publishedAtUtc: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days old
      }),
    ]

    setupMockApi(page, { users: [user], domains: [domain], events })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Mixed age → not ALL newly published → low_signal, not early
    await expect(page.locator('.analytics-state-banner--low-signal')).toBeVisible()
    await expect(page.locator('.analytics-state-banner--early')).toHaveCount(0)
  })
})

// ── Freshness indicator ───────────────────────────────────────────────────────

test.describe('Dashboard freshness indicator', () => {
  test('freshness indicator does not appear immediately after load (data is fresh)', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-fresh-1',
      slug: 'fresh-event-1',
      name: 'Fresh Data Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // The freshness indicator should NOT be visible right after loading
    await expect(page.locator('.freshness-indicator')).toHaveCount(0)
  })

  test('freshness indicator appears after 6 minutes and shows a refresh button', async ({
    page,
  }) => {
    // Install a fake clock starting at a known time so we can fast-forward deterministically.
    await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') })

    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-stale-clock-1',
      slug: 'stale-clock-event',
      name: 'Stale Clock Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Freshness indicator should be absent immediately after load
    await expect(page.locator('.freshness-indicator')).toHaveCount(0)

    // Advance the fake clock by 6 minutes and run all due timers (including the 60-s interval).
    await page.clock.fastForward('06:00')

    // The freshness indicator should now be visible (data is > 5 minutes old)
    await expect(page.locator('.freshness-indicator')).toBeVisible()
    await expect(page.locator('.freshness-refresh-btn')).toBeVisible()
  })

  test('clicking Refresh button reloads dashboard and hides the freshness indicator', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') })

    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-refresh-clock-1',
      slug: 'refresh-clock-event',
      name: 'Refresh Clock Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Advance time past staleness threshold
    await page.clock.fastForward('06:00')
    await expect(page.locator('.freshness-refresh-btn')).toBeVisible()

    // Click the Refresh button — this calls fetchDashboard() which resets lastFetchedAt
    await page.locator('.freshness-refresh-btn').click()

    // After a successful refresh, the freshness indicator should disappear
    await expect(page.locator('.freshness-indicator')).toHaveCount(0)
    // Dashboard content is still visible
    await expect(page.getByText('Total Events')).toBeVisible()
  })
})

// ── Dashboard localization (SK / DE) ──────────────────────────────────────────

test.describe('Dashboard i18n – Slovak locale', () => {
  test('shows dashboard KPI labels in Slovak', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, { users: [user], domains: [domain] })

    // Switch to Slovak locale before loading the page
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Key Slovak KPI labels
    await expect(page.locator('.stat-label', { hasText: 'Zverejnené' })).toBeVisible()
    await expect(page.locator('.stat-label', { hasText: 'Celkom uložení' })).toBeVisible()
  })

  test('shows per-event guidance in Slovak when event has no saves', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-sk-guidance',
      slug: 'sk-guidance-event',
      name: 'SK Guidance Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Slovak recommendation text for an event with no saves
    await expect(page.locator('.rec-text')).toContainText(/Žiadne uloženia|zdieľ|uložení/i)
  })

  test('shows low-signal banner in Slovak when published event has low engagement', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    // Published 30 days ago (default), no saves → low_signal state
    const event = makeApprovedEvent({
      id: 'ev-sk-low-signal',
      slug: 'sk-low-signal-event',
      name: 'SK Low Signal Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    const banner = page.locator('.analytics-state-banner--low-signal')
    await expect(banner).toBeVisible()
    // Banner title should be in Slovak
    await expect(banner).toContainText(/Zatiaľ nízke zapojenie/)
  })
})

test.describe('Dashboard i18n – German locale', () => {
  test('shows dashboard KPI labels in German', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, { users: [user], domains: [domain] })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Key German KPI labels
    await expect(page.locator('.stat-label', { hasText: 'Veröffentlicht' })).toBeVisible()
    await expect(page.locator('.stat-label', { hasText: 'Gesamte Speicherungen' })).toBeVisible()
  })

  test('shows per-event guidance in German when event has no saves', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-de-guidance',
      slug: 'de-guidance-event',
      name: 'DE Guidance Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // German recommendation text
    await expect(page.locator('.rec-text')).toContainText(/Speicherungen|Link/i)
  })

  test('shows early-data banner in German for newly published event', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-de-early',
      slug: 'de-early-event',
      name: 'DE Early Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      publishedAtUtc: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    const banner = page.locator('.analytics-state-banner--early')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText(/Daten werden noch gesammelt/)
  })
})

// ── Multi-event organizer attention scan ──────────────────────────────────────

test.describe('Multi-event organizer attention scan', () => {
  test('organizer can distinguish events with and without recommendations', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    const needsAttentionEvent = makeRejectedEvent({
      id: 'ev-multi-attention',
      slug: 'multi-attention-event',
      name: 'Needs Attention Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      adminNotes: 'Please add venue details.',
    })

    const healthyEvent = makeApprovedEvent({
      id: 'ev-multi-healthy',
      slug: 'multi-healthy-event',
      name: 'Healthy Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      language: 'en',
      timezone: 'Europe/Bratislava',
    })

    const state = setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [needsAttentionEvent, healthyEvent],
    })
    // Give the healthy event enough saves for normal signal
    for (let i = 0; i < 5; i++) {
      state.favoriteEvents.push({
        id: `fav-healthy-${i}`,
        userId: `u-${i}`,
        eventId: healthyEvent.id,
        createdAtUtc: new Date().toISOString(),
      })
    }

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Rejected event should have a recommendation row (needs attention)
    await expect(page.locator('.event-recommendation-row.rec--rejected')).toBeVisible()

    // The healthy event should NOT have a recommendation row
    // (it has saves, language, timezone, and domain)
    // There should be exactly 1 recommendation row total (only for the rejected event)
    await expect(page.locator('.event-recommendation-row')).toHaveCount(1)
  })

  test('multi-event organizer sees per-event recommendations for each event state', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    const draftEvent = makeDraftEvent({
      id: 'ev-scan-draft',
      slug: 'scan-draft',
      name: 'Draft Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const pendingEvent = makePendingEvent({
      id: 'ev-scan-pending',
      slug: 'scan-pending',
      name: 'Pending Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const publishedNoSavesEvent = makeApprovedEvent({
      id: 'ev-scan-pub-nosaves',
      slug: 'scan-pub-nosaves',
      name: 'Published No Saves',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [draftEvent, pendingEvent, publishedNoSavesEvent],
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // All three events should have recommendation rows
    await expect(page.locator('.event-recommendation-row')).toHaveCount(3)

    // Each row should have an appropriate class
    await expect(page.locator('.event-recommendation-row.rec--draft')).toHaveCount(1)
    await expect(page.locator('.event-recommendation-row.rec--pending')).toHaveCount(1)
    await expect(page.locator('.event-recommendation-row.rec--guidance')).toHaveCount(1)
  })
})
