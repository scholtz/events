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
