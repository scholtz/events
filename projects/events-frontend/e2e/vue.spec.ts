/**
 * Full end-to-end flow:
 * registration → event submission → admin approval → listing + filter
 */
import { expect, test } from '@playwright/test'
import { makeAdminUser, makeTechCategory, setupMockApi } from './helpers/mock-api'

test('full flow: signup, submit event, approve, list and filter', async ({ page }) => {
  const state = setupMockApi(page, {
    users: [makeAdminUser()],
    categories: [makeTechCategory()],
  })

  const title = `Playwright Event ${Date.now()}`

  // ── Home page loads ──────────────────────────────────────────────────────
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Discover Events')

  // ── Sign up ──────────────────────────────────────────────────────────────
  await page.getByRole('link', { name: 'Login' }).click()
  await page.getByRole('button', { name: 'Sign Up' }).click()
  await page.getByLabel('Full Name').fill('Flow Tester')
  await page.getByLabel('Email').fill('flow.tester@example.com')
  await page.getByLabel('Password').fill('UserPass123!')
  await page.getByRole('button', { name: 'Create Account' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  // ── Submit event ─────────────────────────────────────────────────────────
  await page.getByRole('link', { name: '+ Submit Event' }).click()
  await expect(page.getByRole('heading', { name: 'Submit an Event' })).toBeVisible()

  await page.getByLabel('Event Title *').fill(title)
  await page.getByLabel('Description *').fill('End-to-end submitted event for UI coverage.')
  await page.getByLabel('Category *').selectOption('technology')
  await page.getByLabel('Organizer').fill('Flow Team')
  await page.getByLabel('Start Date *').fill('2026-03-15')
  await page.getByLabel('Venue Name').fill('Stitch Hall')
  await page.getByLabel('Address').fill('Design Street 123')
  await page.getByLabel('Latitude').fill('50.0755')
  await page.getByLabel('Longitude').fill('14.4378')
  await page.getByLabel('Website / Registration URL *').fill('https://example.com/event')
  await page.getByRole('button', { name: 'Submit Event' }).click()

  await expect(page.getByRole('heading', { name: 'Event Submitted!' })).toBeVisible()
  await page.getByRole('link', { name: 'Go to Dashboard' }).click()

  // ── Dashboard shows event as pending ────────────────────────────────────
  const pendingRow = page.locator('tr', { hasText: title })
  await expect(pendingRow).toContainText('pending')

  // ── Admin approves the event ─────────────────────────────────────────────
  await page.getByRole('button', { name: 'Logout' }).click()
  await page.getByRole('link', { name: 'Login' }).click()
  await page.getByLabel('Email').fill(state.users[0].email)
  await page.getByLabel('Password').fill(state.users[0].password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.getByRole('link', { name: 'Admin' }).click()
  const adminRow = page.locator('tr', { hasText: title })
  await adminRow.getByRole('button', { name: 'Approve' }).click()
  await expect(adminRow).toContainText('approved')

  // ── Approved event visible on home listing ───────────────────────────────
  await page.getByRole('link', { name: 'Browse' }).click()
  await expect(page.locator('.event-card', { hasText: title })).toBeVisible()

  // ── Search filter: no match ───────────────────────────────────────────────
  await page.getByLabel('Search').fill('no-match-value-xyz')
  await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()

  // ── Search filter: match ──────────────────────────────────────────────────
  await page.getByLabel('Search').fill(title)
  await expect(page.locator('.event-card', { hasText: title })).toBeVisible()
})
