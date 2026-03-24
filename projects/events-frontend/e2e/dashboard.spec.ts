import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeAdminUser,
  makeTechDomain,
  makeApprovedEvent,
  loginAs,
  type MockFavoriteEvent,
  type MockCalendarAction,
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
    const user = makeAdminUser()
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

  test('domain admin can update hub style via dashboard', async ({ page }) => {
    const user = makeAdminUser()
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

    // Fill in primary color and save
    const primaryColorInput = page.locator('.hub-style-form input[placeholder="#137fec"]')
    await primaryColorInput.fill('#ff5500')
    await page.locator('.hub-style-form').getByRole('button', { name: 'Save Style' }).click()

    await expect(page.locator('.hub-save-success').first()).toBeVisible()
  })

  test('domain admin can update hub content via dashboard', async ({ page }) => {
    const user = makeAdminUser()
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

    // Fill in overview content and save
    const overviewTextarea = page.locator('.hub-overview-form textarea').first()
    await overviewTextarea.fill('This is the Technology hub — curated for developers.')
    await page.locator('.hub-overview-form').getByRole('button', { name: 'Save Content' }).click()

    await expect(page.locator('.hub-overview-form .hub-save-success')).toBeVisible()
  })

  test('hub management section shows View hub link to category page', async ({ page }) => {
    const user = makeAdminUser()
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
})
