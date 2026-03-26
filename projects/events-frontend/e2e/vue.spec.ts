/**
 * Full end-to-end flow:
 * registration → event submission → admin approval → listing + filter
 */
import { expect, test } from '@playwright/test'
import {
  makeAdminUser,
  makeApprovedEvent,
  makeTechDomain,
  setupMockApi,
} from './helpers/mock-api'

test('full flow: signup, submit event, approve, list and filter', async ({ page }) => {
  const state = setupMockApi(page, {
    users: [makeAdminUser()],
    domains: [makeTechDomain()],
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
  await page.getByLabel('Tag *').selectOption('technology')
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 2: Date & Time
  await page.getByLabel('Start Date *').fill('2026-03-15')
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 3: Pricing (free — default)
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 4: Location
  await page.getByLabel('Venue Name').fill('Stitch Hall')
  await page.getByLabel('Address').fill('Design Street 123')
  await page.getByLabel('City').fill('Prague')
  await page.getByLabel('Latitude').fill('50.0755')
  await page.getByLabel('Longitude').fill('14.4378')
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 5: Event Link
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
  await expect(adminRow).toContainText('published')

  // ── Published event visible on home listing ───────────────────────────────
  await page.getByRole('link', { name: 'Browse' }).click()
  await expect(page.locator('.event-card', { hasText: title })).toBeVisible()

  // ── Search filter: no match ───────────────────────────────────────────────
  await page.getByLabel('Keyword').fill('no-match-value-xyz')
  await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()

  // ── Search filter: match ──────────────────────────────────────────────────
  await page.getByLabel('Keyword').fill(title)
  await expect(page.locator('.event-card', { hasText: title })).toBeVisible()
})

// ── Attendee calendar export journey ─────────────────────────────────────────
test('attendee calendar journey: discover event, open detail, add to calendar', async ({
  page,
}) => {
  const domain = makeTechDomain()
  const event = makeApprovedEvent({
    id: 'ev-cal-journey',
    name: 'Blockchain Prague 2026',
    slug: 'blockchain-prague-2026',
    startsAtUtc: '2026-09-10T09:00:00Z',
    endsAtUtc: '2026-09-10T18:00:00Z',
    timezone: 'Europe/Prague',
    attendanceMode: 'IN_PERSON',
    venueName: 'Forum Karlin',
    addressLine1: 'Pernerova 51',
    city: 'Prague',
    countryCode: 'CZ',
  })
  const state = setupMockApi(page, { domains: [domain], events: [event] })

  // ── Home page: discover event ─────────────────────────────────────────────
  await page.goto('/')
  await expect(page.locator('.event-card', { hasText: 'Blockchain Prague 2026' })).toBeVisible()

  // ── Navigate to event detail ──────────────────────────────────────────────
  await page.goto(`/event/${event.slug}`)
  await expect(page.getByRole('heading', { name: 'Blockchain Prague 2026' })).toBeVisible()

  // ── "Add to calendar" button is visible ──────────────────────────────────
  const calBtn = page.getByRole('button', { name: /Add to calendar/i })
  await expect(calBtn).toBeVisible()

  // ── Open calendar menu ────────────────────────────────────────────────────
  await calBtn.click()
  await expect(page.locator('.calendar-menu')).toBeVisible()

  // ── All three provider options are present ────────────────────────────────
  await expect(page.getByRole('menuitem', { name: /Download .ics/i })).toBeVisible()
  const googleLink = page.getByRole('menuitem', { name: /Google Calendar/i })
  await expect(googleLink).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Outlook/i })).toBeVisible()

  // ── Google Calendar link has correct domain ───────────────────────────────
  const href = (await googleLink.getAttribute('href')) ?? ''
  expect(href).toContain('calendar.google.com')
  expect(href).toContain('Blockchain+Prague+2026')

  // ── ICS download shows confirmation state ────────────────────────────────
  // Intercept the anchor-click download (Blob URL) by overriding document.createElement
  await page.evaluate(() => {
    const orig = document.createElement.bind(document)
    ;(document as unknown as Record<string, unknown>).__calendarDownloadTriggered = false
    document.createElement = function (tag: string) {
      const el = orig(tag)
      if (tag === 'a') {
        const origClick = el.click.bind(el)
        el.click = function () {
          ;(document as unknown as Record<string, unknown>).__calendarDownloadTriggered = true
          origClick()
        }
      }
      return el
    }
  })

  await page.getByRole('menuitem', { name: /Download .ics/i }).click()

  // Confirmation button should appear ("Added to calendar ✓")
  await expect(page.getByRole('button', { name: /Added to calendar/i })).toBeVisible()

  // Analytics action should have been recorded
  const calendarActionsRecorded = state.calendarActions.length
  expect(calendarActionsRecorded).toBeGreaterThanOrEqual(1)
  expect(state.calendarActions[state.calendarActions.length - 1].provider).toBe('ICS')
})

// ── Attendee calendar journey: online event uses event URL as location ────────
test('attendee calendar journey: online event shows join link in Google Calendar URL', async ({
  page,
}) => {
  const domain = makeTechDomain()
  const event = makeApprovedEvent({
    id: 'ev-online-cal',
    name: 'Remote AI Workshop',
    slug: 'remote-ai-workshop',
    startsAtUtc: '2026-10-20T14:00:00Z',
    endsAtUtc: '2026-10-20T17:00:00Z',
    attendanceMode: 'ONLINE',
    eventUrl: 'https://zoom.example.com/join/ai-workshop',
  })
  setupMockApi(page, { domains: [domain], events: [event] })

  await page.goto(`/event/${event.slug}`)
  await expect(page.getByRole('heading', { name: 'Remote AI Workshop' })).toBeVisible()

  await page.getByRole('button', { name: /Add to calendar/i }).click()
  await expect(page.locator('.calendar-menu')).toBeVisible()

  const googleLink = page.getByRole('menuitem', { name: /Google Calendar/i })
  const href = (await googleLink.getAttribute('href')) ?? ''

  // For online events the location should be the join URL, not venue details
  expect(decodeURIComponent(href)).toContain('zoom.example.com/join/ai-workshop')
})
