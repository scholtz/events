import { test, expect, type Page } from '@playwright/test'
import {
  setupMockApi,
  makeAdminUser,
  makeTechDomain,
  makeApprovedEvent,
  loginAs,
  type MockCalendarAction,
} from './helpers/mock-api'

/** Clears any persisted event draft from localStorage. */
async function clearDraft(page: Page) {
  await page.evaluate(() => localStorage.removeItem('event_draft'))
}

test.describe('Mobile-first organizer event creation', () => {
  test('shows 5-step wizard with progress bar on /submit', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain] })

    await loginAs(page, user)
    await page.goto('/submit')

    // Progress bar should be visible
    await expect(page.locator('.step-progress-bar')).toBeVisible()
    await expect(page.locator('.step-progress-fill')).toBeVisible()

    // Step indicators (5 dots)
    await expect(page.locator('.step-dot')).toHaveCount(5)

    // Step label should say "Step 1 of 5"
    await expect(page.locator('.step-label')).toContainText('Step 1 of 5')

    // First step section should be visible
    await expect(page.getByRole('group', { name: 'Basic Information' })).toBeVisible()
  })

  test('step 1 shows inline validation when required fields are empty', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain] })
    await loginAs(page, user)
    await page.goto('/submit')

    // Click Next without filling anything
    await page.getByRole('button', { name: 'Next' }).click()

    // Should see validation errors
    await expect(page.locator('.field-error').first()).toBeVisible()
    // Should still be on step 1
    await expect(page.locator('.step-label')).toContainText('Step 1 of 5')
  })

  test('can navigate forward through all 5 steps', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain] })
    await loginAs(page, user)
    await page.goto('/submit')

    // Step 1: Basic Info
    await page.locator('#event-title').fill('My Test Event')
    await page.locator('#event-description').fill('Event description here')
    await page.locator('#event-domain').selectOption({ label: domain.name })
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 2: Date & Time
    await expect(page.locator('.step-label')).toContainText('Step 2 of 5')
    await page.locator('#event-date').fill('2026-08-15')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 3: Pricing
    await expect(page.locator('.step-label')).toContainText('Step 3 of 5')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 4: Location
    await expect(page.locator('.step-label')).toContainText('Step 4 of 5')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 5: Event Link + Preview
    await expect(page.locator('.step-label')).toContainText('Step 5 of 5')
    await expect(page.locator('.preview-summary')).toBeVisible()
    await expect(page.locator('.preview-title')).toContainText('Review Your Event')
  })

  test('can go back to a previous step', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain] })
    await loginAs(page, user)
    await page.goto('/submit')

    // Step 1 → 2
    await page.locator('#event-title').fill('My Test Event')
    await page.locator('#event-description').fill('Description')
    await page.locator('#event-domain').selectOption({ label: domain.name })
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.locator('.step-label')).toContainText('Step 2 of 5')

    // Go back
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.locator('.step-label')).toContainText('Step 1 of 5')
    // Previous input preserved
    await expect(page.locator('#event-title')).toHaveValue('My Test Event')
  })

  test('completed steps show checkmark and can be clicked to go back', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain] })
    await loginAs(page, user)
    await page.goto('/submit')

    await page.locator('#event-title').fill('My Test Event')
    await page.locator('#event-description').fill('Description')
    await page.locator('#event-domain').selectOption({ label: domain.name })
    await page.getByRole('button', { name: 'Next' }).click()

    // First dot should show checkmark (done state)
    await expect(page.locator('.step-dot--done').first()).toBeVisible()
    await expect(page.locator('.step-dot--done').first()).toContainText('✓')

    // Click on completed step dot to go back
    await page.locator('.step-dot--done').first().click()
    await expect(page.locator('.step-label')).toContainText('Step 1 of 5')
  })

  test('Save Draft button persists form data and shows confirmation', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain] })
    await loginAs(page, user)
    await page.goto('/submit')

    await page.locator('#event-title').fill('Draft Event Title')
    await page.locator('#event-description').fill('Draft description')

    // Click Save Draft
    await page.getByRole('button', { name: 'Save Draft' }).click()

    // Draft saved notice should appear briefly
    await expect(page.locator('.notice--success')).toBeVisible()
    await expect(page.locator('.notice--success')).toContainText('Draft saved!')
  })

  test('draft is restored when revisiting the submit form', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain] })
    await loginAs(page, user)
    await page.goto('/submit')

    // Fill in title and save draft
    await page.locator('#event-title').fill('Persisted Draft Title')
    await page.locator('#event-description').fill('Persisted description')
    await page.getByRole('button', { name: 'Save Draft' }).click()
    await expect(page.locator('.notice--success')).toBeVisible()

    // Navigate away and back
    await page.goto('/dashboard')
    await page.goto('/submit')

    // Draft loaded notice should appear
    await expect(page.locator('.notice--info')).toBeVisible()
    // Form should be pre-filled
    await expect(page.locator('#event-title')).toHaveValue('Persisted Draft Title')
    await expect(page.locator('#event-description')).toHaveValue('Persisted description')
  })

  test('full create flow submits event and shows success', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain] })
    await loginAs(page, user)
    await page.goto('/submit')

    // Clear any existing draft
    await clearDraft(page)
    await page.goto('/submit')

    // Step 1
    await page.locator('#event-title').fill('Full Create Test Event')
    await page.locator('#event-description').fill('Description for full create flow')
    await page.locator('#event-domain').selectOption({ label: domain.name })
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 2
    await page.locator('#event-date').fill('2026-10-01')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 3 (free event — default)
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 4 (location optional)
    await page.locator('#event-city').fill('Prague')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 5 - fill URL and submit
    await page.locator('#event-link').fill('https://example.com/full-create-test')
    await page.getByRole('button', { name: 'Submit Event' }).click()

    // Success state
    await expect(page.locator('.success-card')).toBeVisible()
    await expect(page.locator('.success-card')).toContainText('Event Submitted!')
  })

  test('shows error state when API fails on submit', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain] })

    // Override submit to fail
    page.route('**/graphql', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}')
      if ((body.query || '').includes('SubmitEvent')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Server error during event submission' }] }),
        })
        return
      }
      await route.fallback()
    })

    await loginAs(page, user)
    await page.goto('/submit')

    await clearDraft(page)
    await page.goto('/submit')

    // Fill all steps
    await page.locator('#event-title').fill('Error Test Event')
    await page.locator('#event-description').fill('Description')
    await page.locator('#event-domain').selectOption({ label: domain.name })
    await page.getByRole('button', { name: 'Next' }).click()
    await page.locator('#event-date').fill('2026-10-01')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.locator('#event-link').fill('https://example.com/error-test')
    await page.getByRole('button', { name: 'Submit Event' }).click()

    // Should show error
    await expect(page.locator('.submit-error')).toBeVisible()
    await expect(page.locator('.submit-error')).toContainText('Server error during event submission')
  })

  test('mobile viewport: form is single-column and sticky actions visible', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain] })
    await loginAs(page, user)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/submit')

    // Form and header should be visible
    await expect(page.locator('.step-progress')).toBeVisible()
    await expect(page.locator('.submit-form')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()

    // Form group should take full width (single column)
    const formGroup = page.locator('.form-group').first()
    const box = await formGroup.boundingBox()
    // Should be close to viewport width (allowing for padding) — use non-null assertion
    expect(box?.width ?? 0).toBeGreaterThan(300)
  })

  test('step 5 preview shows entered event details before submit', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain] })
    await loginAs(page, user)
    await page.goto('/submit')

    await clearDraft(page)
    await page.goto('/submit')

    // Fill all steps
    await page.locator('#event-title').fill('Preview Test Event')
    await page.locator('#event-description').fill('Preview description')
    await page.locator('#event-domain').selectOption({ label: domain.name })
    await page.getByRole('button', { name: 'Next' }).click()

    await page.locator('#event-date').fill('2026-11-20')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()

    await page.locator('#event-city').fill('Bratislava')
    await page.getByRole('button', { name: 'Next' }).click()

    // Preview should show entered values
    await expect(page.locator('.preview-summary')).toContainText('Preview Test Event')
    await expect(page.locator('.preview-summary')).toContainText('2026-11-20')
    await expect(page.locator('.preview-summary')).toContainText('Bratislava')
  })
})

test.describe('Edit event flow', () => {
  test('edit page loads existing event data pre-filled', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-edit-1',
      slug: 'edit-test-event',
      name: 'Edit Test Event',
      description: 'Original description',
      city: 'Prague',
      eventUrl: 'https://example.com/edit-test',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      status: 'PUBLISHED',
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.goto(`/edit/${event.id}`)

    // Should load event and show step 1 pre-filled
    await expect(page.locator('#event-title')).toHaveValue('Edit Test Event')
    await expect(page.locator('#event-description')).toHaveValue('Original description')
  })

  test('edit page shows step wizard with same navigation', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-edit-2',
      slug: 'edit-test-2',
      name: 'Edit Flow Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.goto(`/edit/${event.id}`)

    await expect(page.locator('.step-dot')).toHaveCount(5)
    await expect(page.locator('.step-label')).toContainText('Step 1 of 5')
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
  })

  test('can save changes on edit page and see success', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-edit-3',
      slug: 'edit-save-event',
      name: 'Save Changes Event',
      description: 'Original',
      city: 'Prague',
      eventUrl: 'https://example.com/edit-save',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.goto(`/edit/${event.id}`)

    // Modify title
    await page.locator('#event-title').fill('Updated Event Title')
    // Navigate through all steps
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 5 — Save Changes
    await page.getByRole('button', { name: 'Save Changes' }).click()

    // Should show success
    await expect(page.locator('.success-card')).toBeVisible()
    await expect(page.locator('.success-card')).toContainText('Event Updated!')
  })

  test('dashboard shows Edit button for each event', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-dash-edit-1',
      slug: 'dash-edit-event',
      name: 'Dashboard Edit Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Edit button should be visible for the event
    await expect(page.locator('.btn-edit').first()).toBeVisible()
    await expect(page.locator('.btn-edit').first()).toContainText('Edit')
  })

  test('clicking Edit button in dashboard navigates to /edit/:id', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-dash-edit-2',
      slug: 'dash-edit-nav-event',
      name: 'Nav Edit Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    await page.locator('.btn-edit').first().click()
    await expect(page).toHaveURL(new RegExp(`/edit/${event.id}`))
  })

  test('edit page shows error when event not found', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain], events: [] })
    await loginAs(page, user)
    await page.goto('/edit/nonexistent-id')

    await expect(page.locator('.error-state')).toBeVisible()
  })

  test('edit page shows error state when API fails to load', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain], events: [] })

    page.route('**/graphql', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}')
      if ((body.query || '').includes('EventById')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Internal server error' }] }),
        })
        return
      }
      await route.fallback()
    })

    await loginAs(page, user)
    await page.goto('/edit/some-event-id')

    await expect(page.locator('.error-state')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('mobile viewport: edit form works at 390x844', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-mobile-edit',
      slug: 'mobile-edit-event',
      name: 'Mobile Edit Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    setupMockApi(page, { users: [user], domains: [domain], events: [event] })
    await loginAs(page, user)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/edit/${event.id}`)

    // Form should be visible and functional
    await expect(page.locator('.step-progress')).toBeVisible()
    await expect(page.locator('#event-title')).toBeVisible()
    await expect(page.locator('#event-title')).toHaveValue('Mobile Edit Event')
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
  })
})

// ── Organizer calendar analytics journey ─────────────────────────────────────

test.describe('Organizer calendar analytics journey', () => {
  test('organizer sees calendar add count for their published event in dashboard', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-org-cal-1',
      slug: 'org-cal-event-1',
      name: 'Organizer Cal Test Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const actions: MockCalendarAction[] = [
      {
        id: 'ca-org-1',
        eventId: event.id,
        provider: 'GOOGLE',
        triggeredAtUtc: new Date().toISOString(),
      },
      {
        id: 'ca-org-2',
        eventId: event.id,
        provider: 'ICS',
        triggeredAtUtc: new Date().toISOString(),
      },
    ]

    const state = setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [event],
    })
    state.calendarActions.push(...actions)

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Calendar Adds KPI card shows total count
    const calCard = page.locator('.stat-card', {
      has: page.locator('.stat-label', { hasText: 'Calendar Adds' }),
    })
    await expect(calCard).toBeVisible()
    await expect(calCard.locator('.stat-number--calendar')).toContainText('2')

    // Event analytics table shows calendar count for the event
    const eventRow = page.locator('.events-table tr', { hasText: 'Organizer Cal Test Event' })
    await expect(eventRow).toBeVisible()
  })

  test('organizer sees provider breakdown chips for their event', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-org-cal-2',
      slug: 'org-cal-event-2',
      name: 'Provider Breakdown Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    const actions: MockCalendarAction[] = [
      {
        id: 'ca-pb-1',
        eventId: event.id,
        provider: 'GOOGLE',
        triggeredAtUtc: new Date().toISOString(),
      },
      {
        id: 'ca-pb-2',
        eventId: event.id,
        provider: 'GOOGLE',
        triggeredAtUtc: new Date().toISOString(),
      },
      {
        id: 'ca-pb-3',
        eventId: event.id,
        provider: 'OUTLOOK',
        triggeredAtUtc: new Date().toISOString(),
      },
    ]

    const state = setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [event],
    })
    state.calendarActions.push(...actions)

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Dashboard shows provider breakdown chips
    const row = page.locator('.events-table tr', { hasText: 'Provider Breakdown Event' })
    await expect(row).toBeVisible()

    // Provider breakdown should mention Google (2 actions)
    await expect(row.locator('.provider-chip', { hasText: 'Google' })).toBeVisible()
  })

  test('organizer dashboard shows guidance when saves exist but no calendar adds yet', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-org-cal-guidance',
      slug: 'org-cal-guidance-event',
      name: 'Guidance Test Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })

    // Add a favorite but no calendar actions
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [event],
      favoriteEvents: [
        {
          id: 'fav-guidance-1',
          userId: 'any-user',
          eventId: event.id,
          createdAtUtc: new Date().toISOString(),
        },
      ],
    })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Guidance message should mention calendar adds
    await expect(
      page.locator('.low-data-guidance--calendar'),
    ).toBeVisible()
  })

  test('calendar adds KPI is zero when organizer has no published events', async ({ page }) => {
    const user = makeAdminUser()
    const domain = makeTechDomain()

    setupMockApi(page, { users: [user], domains: [domain] })

    await loginAs(page, user)
    await page.waitForURL(/\/dashboard$/)

    // Empty state should be shown when no events
    await expect(page.locator('.empty-state')).toBeVisible()

    // Calendar KPI card still shows 0 (not missing)
    const calCard = page.locator('.stat-card', {
      has: page.locator('.stat-label', { hasText: 'Calendar Adds' }),
    })
    await expect(calCard).toBeVisible()
    await expect(calCard.locator('.stat-number--calendar')).toContainText('0')
  })

  test('calendar analytics only counts actions for the authenticated organizer\'s events', async ({
    page,
  }) => {
    const organizer = makeAdminUser()
    const domain = makeTechDomain()

    // Organizer's own event
    const ownEvent = makeApprovedEvent({
      id: 'ev-isolation-own',
      slug: 'isolation-own-event',
      name: 'Isolation Own Event',
      submittedByUserId: organizer.id,
      submittedBy: { displayName: organizer.displayName },
    })

    // Another user's event (different submittedByUserId)
    const otherEvent = makeApprovedEvent({
      id: 'ev-isolation-other',
      slug: 'isolation-other-event',
      name: 'Isolation Other Event',
      submittedByUserId: 'other-user-id',
      submittedBy: { displayName: 'Other Organizer' },
    })

    const state = setupMockApi(page, {
      users: [organizer],
      domains: [domain],
      events: [ownEvent, otherEvent],
    })

    // 1 action on own event, 3 on other event
    state.calendarActions.push(
      {
        id: 'ca-iso-1',
        eventId: ownEvent.id,
        provider: 'ICS',
        triggeredAtUtc: new Date().toISOString(),
      },
      {
        id: 'ca-iso-2',
        eventId: otherEvent.id,
        provider: 'GOOGLE',
        triggeredAtUtc: new Date().toISOString(),
      },
      {
        id: 'ca-iso-3',
        eventId: otherEvent.id,
        provider: 'GOOGLE',
        triggeredAtUtc: new Date().toISOString(),
      },
      {
        id: 'ca-iso-4',
        eventId: otherEvent.id,
        provider: 'ICS',
        triggeredAtUtc: new Date().toISOString(),
      },
    )

    await loginAs(page, organizer)
    await page.waitForURL(/\/dashboard$/)

    // KPI should only show 1 (own event) not 4 (all events)
    const calCard = page.locator('.stat-card', {
      has: page.locator('.stat-label', { hasText: 'Calendar Adds' }),
    })
    await expect(calCard.locator('.stat-number--calendar')).toContainText('1')
  })
})
