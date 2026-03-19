import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeTechDomain,
  makeApprovedEvent,
  makeAdminUser,
  loginAs,
} from './helpers/mock-api'

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

    await expect(page.getByRole('link', { name: 'Saved' })).not.toBeVisible()
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
})
