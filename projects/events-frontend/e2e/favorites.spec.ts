import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  setupMockApi,
  makeTechDomain,
  makeApprovedEvent,
  makeAdminUser,
  loginAs,
} from './helpers/mock-api'

/**
 * Installs a deterministic browser-like push environment for reminder E2E tests.
 *
 * This mocks Notification permission state, PushManager subscription methods,
 * and navigator.serviceWorker.ready so the UI can exercise the real reminder
 * toggle logic without depending on an actual service worker or browser push
 * infrastructure inside Playwright.
 */
async function mockPushEnvironment(
  page: Page,
  options: {
    initialPermission?: 'default' | 'granted' | 'denied'
    requestedPermission?: 'granted' | 'denied'
    unsupported?: boolean
  } = {},
) {
  await page.addInitScript(
    ({
      initialPermission = 'default',
      requestedPermission = 'granted',
      unsupported = false,
    }) => {
      if (unsupported) {
        Reflect.deleteProperty(window, 'Notification')
        Reflect.deleteProperty(window, 'PushManager')
        return
      }

      let currentPermission = initialPermission
      const encoder = new TextEncoder()
      const fakeSubscription = {
        endpoint: 'https://push.example.com/browser-subscription',
        toJSON() {
          return { endpoint: this.endpoint }
        },
        getKey(name: string) {
          return encoder.encode(`${name}-test-key`).buffer
        },
        async unsubscribe() {
          return true
        },
      }

      Object.defineProperty(window, 'PushManager', {
        configurable: true,
        value: function PushManager() {},
      })

      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: {
          get permission() {
            return currentPermission
          },
          async requestPermission() {
            currentPermission = requestedPermission
            return currentPermission
          },
        },
      })

      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          ready: Promise.resolve({
            pushManager: {
              async subscribe() {
                return fakeSubscription
              },
              async getSubscription() {
                return currentPermission === 'granted' ? fakeSubscription : null
              },
            },
          }),
        },
      })
    },
    options,
  )
}

test.describe('Favorites', () => {
  test('signed-out user sees sign-in prompt on favorites page', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
    })

    await page.goto('/favorites')

    await expect(page.getByRole('heading', { name: 'My Saved Events' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sign in to view saved events' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible()
  })

  test('authenticated user with no favorites sees empty state and link to browse', async ({
    page,
  }) => {
    const admin = makeAdminUser()
    setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
    })

    await loginAs(page, admin)
    await page.goto('/favorites')

    await expect(page.getByRole('heading', { name: 'My Saved Events' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No saved events yet' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse Events' })).toBeVisible()
  })

  test('favorite button appears on event cards when signed in', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Cool Summit', slug: 'cool-summit' })],
    })

    await loginAs(page, admin)
    await page.goto('/')

    await expect(page.getByRole('button', { name: 'Add to favorites' })).toBeVisible()
  })

  test('user can favorite an event from discovery and see it in favorites list', async ({
    page,
  }) => {
    const admin = makeAdminUser()
    setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Cool Summit', slug: 'cool-summit' })],
    })

    await loginAs(page, admin)
    await page.goto('/')

    // Favorite the event
    const favoriteBtn = page.getByRole('button', { name: 'Add to favorites' })
    await expect(favoriteBtn).toBeVisible()
    await favoriteBtn.click()

    // Button should now show "Remove from favorites"
    await expect(page.getByRole('button', { name: 'Remove from favorites' })).toBeVisible()

    // Navigate to favorites
    await page.getByRole('link', { name: 'Saved' }).click()
    await page.waitForURL(/\/favorites$/)

    // Event should appear in the favorites list
    await expect(page.locator('.favorite-item', { hasText: 'Cool Summit' })).toBeVisible()
  })

  test('user can unfavorite an event from the favorites list', async ({ page }) => {
    const admin = makeAdminUser()
    const event = makeApprovedEvent({ name: 'Cool Summit', slug: 'cool-summit' })
    const state = setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [event],
    })

    // Pre-seed a favorite
    state.favoriteEvents = [
      {
        id: 'fav-1',
        userId: admin.id,
        eventId: event.id,
        createdAtUtc: new Date().toISOString(),
      },
    ]
    state.currentUserId = admin.id
    state.currentToken = `token-${admin.id}`

    await loginAs(page, admin)
    await page.goto('/favorites')

    // Event should be in favorites
    await expect(page.locator('.favorite-item', { hasText: 'Cool Summit' })).toBeVisible()

    // Remove it
    await page.getByRole('button', { name: 'Remove from favorites' }).click()

    // Empty state should appear
    await expect(page.getByRole('heading', { name: 'No saved events yet' })).toBeVisible()
  })

  test('user can unfavorite an event from the event detail page', async ({ page }) => {
    const admin = makeAdminUser()
    const event = makeApprovedEvent({ name: 'Cool Summit', slug: 'cool-summit' })
    const state = setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [event],
    })

    // Pre-seed a favorite
    state.favoriteEvents = [
      {
        id: 'fav-1',
        userId: admin.id,
        eventId: event.id,
        createdAtUtc: new Date().toISOString(),
      },
    ]
    state.currentUserId = admin.id
    state.currentToken = `token-${admin.id}`

    await loginAs(page, admin)
    await page.goto('/event/cool-summit')

    // Detail page should show "Saved" state
    await expect(page.getByRole('button', { name: 'Remove from favorites' })).toBeVisible()

    // Click to unfavorite
    await page.getByRole('button', { name: 'Remove from favorites' }).click()

    // Should now show "Save event"
    await expect(page.getByRole('button', { name: 'Add to favorites' })).toBeVisible()
  })

  test('favorites nav link appears for authenticated users', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [],
    })

    await loginAs(page, admin)

    await expect(page.getByRole('link', { name: 'Saved' })).toBeVisible()
  })

  test('favorites nav link is not shown for anonymous users', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [],
    })

    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Saved' })).toBeHidden()
  })

  test('favorited events are grouped as upcoming on favorites page', async ({ page }) => {
    const admin = makeAdminUser()
    const futureEvent = makeApprovedEvent({
      id: 'event-future',
      name: 'Future Summit',
      slug: 'future-summit',
      startsAtUtc: '2030-06-15T10:00:00Z',
      endsAtUtc: '2030-06-15T18:00:00Z',
    })
    const state = setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [futureEvent],
    })

    state.favoriteEvents = [
      {
        id: 'fav-1',
        userId: admin.id,
        eventId: futureEvent.id,
        createdAtUtc: new Date().toISOString(),
      },
    ]
    state.currentUserId = admin.id
    state.currentToken = `token-${admin.id}`

    await loginAs(page, admin)
    await page.goto('/favorites')

    await expect(page.getByRole('heading', { name: /Upcoming/ })).toBeVisible()
    await expect(page.locator('.favorite-item', { hasText: 'Future Summit' })).toBeVisible()
  })

  test('favorite state persists after page reload', async ({ page }) => {
    const admin = makeAdminUser()
    const event = makeApprovedEvent({ name: 'Cool Summit', slug: 'cool-summit' })
    const state = setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [event],
    })

    // Pre-seed a favorite
    state.favoriteEvents = [
      {
        id: 'fav-1',
        userId: admin.id,
        eventId: event.id,
        createdAtUtc: new Date().toISOString(),
      },
    ]
    state.currentUserId = admin.id
    state.currentToken = `token-${admin.id}`

    await loginAs(page, admin)
    await page.goto('/favorites')

    // Verify the event appears in favorites
    await expect(page.locator('.favorite-item', { hasText: 'Cool Summit' })).toBeVisible()

    // Reload the page
    await page.reload()

    // Favorite should still be there after reload
    await expect(page.locator('.favorite-item', { hasText: 'Cool Summit' })).toBeVisible()
  })

  test('favorite button works correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    const admin = makeAdminUser()
    setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Mobile Summit', slug: 'mobile-summit' })],
    })

    await loginAs(page, admin)
    await page.goto('/')

    // Favorite button should be visible on mobile
    const favoriteBtn = page.getByRole('button', { name: 'Add to favorites' })
    await expect(favoriteBtn).toBeVisible()

    // Click to favorite
    await favoriteBtn.click()

    // Button should update to show favorited state
    await expect(page.getByRole('button', { name: 'Remove from favorites' })).toBeVisible()

    // Navigate to favorites on mobile
    await page.getByRole('link', { name: 'Saved' }).click()
    await page.waitForURL(/\/favorites$/)

    // Event should appear in favorites
    await expect(page.locator('.favorite-item', { hasText: 'Mobile Summit' })).toBeVisible()
  })

  test('attendance mode badge is shown for each saved event', async ({ page }) => {
    const admin = makeAdminUser()
    const onlineEvent = makeApprovedEvent({
      id: 'ev-online',
      name: 'Online Summit',
      slug: 'online-summit',
      attendanceMode: 'ONLINE',
      startsAtUtc: '2030-07-01T09:00:00Z',
      endsAtUtc: '2030-07-01T17:00:00Z',
    })
    const hybridEvent = makeApprovedEvent({
      id: 'ev-hybrid',
      name: 'Hybrid Summit',
      slug: 'hybrid-summit',
      attendanceMode: 'HYBRID',
      startsAtUtc: '2030-08-01T09:00:00Z',
      endsAtUtc: '2030-08-01T17:00:00Z',
    })
    const inPersonEvent = makeApprovedEvent({
      id: 'ev-inperson',
      name: 'In-Person Summit',
      slug: 'inperson-summit',
      attendanceMode: 'IN_PERSON',
      startsAtUtc: '2030-09-01T09:00:00Z',
      endsAtUtc: '2030-09-01T17:00:00Z',
    })
    const state = setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [onlineEvent, hybridEvent, inPersonEvent],
    })

    state.favoriteEvents = [
      { id: 'fav-1', userId: admin.id, eventId: onlineEvent.id, createdAtUtc: new Date().toISOString() },
      { id: 'fav-2', userId: admin.id, eventId: hybridEvent.id, createdAtUtc: new Date().toISOString() },
      { id: 'fav-3', userId: admin.id, eventId: inPersonEvent.id, createdAtUtc: new Date().toISOString() },
    ]
    state.currentUserId = admin.id
    state.currentToken = `token-${admin.id}`

    await loginAs(page, admin)
    await page.goto('/favorites')

    await expect(page.locator('.favorite-item', { hasText: 'Online Summit' }).locator('.badge-mode')).toContainText('Online')
    await expect(page.locator('.favorite-item', { hasText: 'Hybrid Summit' }).locator('.badge-mode')).toContainText('Hybrid')
    await expect(page.locator('.favorite-item', { hasText: 'In-Person Summit' }).locator('.badge-mode')).toContainText('In Person')
  })

  test('user can enable a reminder for a saved event from favorites', async ({ page }) => {
    await mockPushEnvironment(page, {
      initialPermission: 'default',
      requestedPermission: 'granted',
    })

    const admin = makeAdminUser()
    const event = makeApprovedEvent({
      id: 'event-reminder',
      name: 'Reminder Summit',
      slug: 'reminder-summit',
      startsAtUtc: '2030-10-01T10:00:00Z',
      endsAtUtc: '2030-10-01T18:00:00Z',
    })
    const state = setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [event],
    })

    state.favoriteEvents = [
      { id: 'fav-reminder', userId: admin.id, eventId: event.id, createdAtUtc: new Date().toISOString() },
    ]
    state.currentUserId = admin.id
    state.currentToken = `token-${admin.id}`

    await loginAs(page, admin)
    await page.goto('/favorites')

    const reminderCard = page.locator('.favorite-item', { hasText: 'Reminder Summit' })
    await expect(reminderCard.getByRole('button', { name: 'Remind me' })).toBeVisible()

    await reminderCard.getByRole('button', { name: 'Remind me' }).click()

    await expect(reminderCard.getByRole('button', { name: 'Cancel reminder' })).toBeVisible()
    await expect(reminderCard).toContainText(
      "You'll receive a notification 24 hours before this event starts.",
    )
    await expect.poll(() => state.pushSubscriptions.length).toBe(1)
    await expect.poll(() => state.eventReminders.length).toBe(1)
  })

  test('blocked notification permission shows recovery messaging', async ({ page }) => {
    await mockPushEnvironment(page, {
      initialPermission: 'default',
      requestedPermission: 'denied',
    })

    const admin = makeAdminUser()
    const event = makeApprovedEvent({
      id: 'event-blocked',
      name: 'Blocked Reminder Summit',
      slug: 'blocked-reminder-summit',
      startsAtUtc: '2030-11-01T10:00:00Z',
      endsAtUtc: '2030-11-01T18:00:00Z',
    })
    const state = setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [event],
    })

    state.favoriteEvents = [
      { id: 'fav-blocked', userId: admin.id, eventId: event.id, createdAtUtc: new Date().toISOString() },
    ]
    state.currentUserId = admin.id
    state.currentToken = `token-${admin.id}`

    await loginAs(page, admin)
    await page.goto('/favorites')

    const reminderCard = page.locator('.favorite-item', { hasText: 'Blocked Reminder Summit' })
    await reminderCard.getByRole('button', { name: 'Remind me' }).click()

    await expect(reminderCard).toContainText(
      'Notifications are blocked in your browser. To enable reminders, open your browser settings and allow notifications for this site.',
    )
    await expect(reminderCard.getByRole('button', { name: 'Remind me' })).toBeVisible()
    await expect.poll(() => state.pushSubscriptions.length).toBe(0)
    await expect.poll(() => state.eventReminders.length).toBe(0)
  })

  test('unsupported browser shows reminder unavailable state', async ({ page }) => {
    await mockPushEnvironment(page, { unsupported: true })

    const admin = makeAdminUser()
    const event = makeApprovedEvent({
      id: 'event-unsupported',
      name: 'Unsupported Reminder Summit',
      slug: 'unsupported-reminder-summit',
      startsAtUtc: '2030-12-01T10:00:00Z',
      endsAtUtc: '2030-12-01T18:00:00Z',
    })
    const state = setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [event],
    })

    state.favoriteEvents = [
      { id: 'fav-unsupported', userId: admin.id, eventId: event.id, createdAtUtc: new Date().toISOString() },
    ]
    state.currentUserId = admin.id
    state.currentToken = `token-${admin.id}`

    await loginAs(page, admin)
    await page.goto('/favorites')

    await expect(page.locator('.favorite-item', { hasText: 'Unsupported Reminder Summit' })).toContainText(
      'Push reminders are not supported in this browser. Try using Chrome, Edge, or Firefox on a supported device.',
    )
    await expect(page.getByRole('button', { name: 'Remind me' })).toHaveCount(0)
  })

  test('user can disable an existing reminder from the event detail page', async ({ page }) => {
    await mockPushEnvironment(page, {
      initialPermission: 'granted',
      requestedPermission: 'granted',
    })

    const admin = makeAdminUser()
    const event = makeApprovedEvent({
      id: 'event-detail-reminder',
      name: 'Detail Reminder Summit',
      slug: 'detail-reminder-summit',
      startsAtUtc: '2031-01-01T10:00:00Z',
      endsAtUtc: '2031-01-01T18:00:00Z',
    })
    const state = setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [event],
    })

    state.favoriteEvents = [
      { id: 'fav-detail-reminder', userId: admin.id, eventId: event.id, createdAtUtc: new Date().toISOString() },
    ]
    state.pushSubscriptions = [
      {
        id: 'push-existing',
        userId: admin.id,
        endpoint: 'https://push.example.com/existing',
        p256dh: 'existing-key',
        auth: 'existing-auth',
        createdAtUtc: new Date().toISOString(),
        updatedAtUtc: new Date().toISOString(),
      },
    ]
    state.eventReminders = [
      {
        id: 'reminder-existing',
        userId: admin.id,
        eventId: event.id,
        offsetHours: 24,
        scheduledForUtc: '2030-12-31T10:00:00Z',
        sentAtUtc: null,
        createdAtUtc: new Date().toISOString(),
      },
    ]
    state.currentUserId = admin.id
    state.currentToken = `token-${admin.id}`

    await loginAs(page, admin)
    await page.goto(`/event/${event.slug}`)

    await expect(page.getByRole('button', { name: 'Cancel reminder' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel reminder' }).click()
    await expect(page.getByRole('button', { name: 'Remind me' })).toBeVisible()
    await expect.poll(() => state.eventReminders.length).toBe(0)
  })
})
