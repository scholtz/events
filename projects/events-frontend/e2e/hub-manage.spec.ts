import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeAdminUser,
  makeContributorUser,
  makeTechDomain,
  makeApprovedEvent,
  loginAs,
} from './helpers/mock-api'
import type { MockDomainAdministrator, MockScheduledFeaturedEvent } from './helpers/mock-api'

test.describe('Hub Manage page (/hub/:slug/manage)', () => {
  // ── Unauthenticated gate ───────────────────────────────────────────────────
  test('unauthenticated user sees sign-in prompt on /hub/:slug/manage', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })

    await page.goto('/hub/technology/manage')

    await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Log in|Sign in/i })).toBeVisible()
  })

  // ── Non-admin contributor sees unauthorized ───────────────────────────────
  test('contributor who is not a domain admin sees access denied state', async ({ page }) => {
    const contributor = makeContributorUser()
    setupMockApi(page, {
      users: [contributor],
      domains: [makeTechDomain()],
      domainAdministrators: [],
    })
    await loginAs(page, contributor)

    await page.goto('/hub/technology/manage')

    await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to Dashboard' })).toBeVisible()
  })

  // ── Domain admin sees the management form ─────────────────────────────────
  test('domain admin can access the hub manage page', async ({ page }) => {
    const contributor = makeContributorUser()
    const domain = makeTechDomain()
    const domainAdmin: MockDomainAdministrator = {
      id: 'da-1',
      domainId: domain.id,
      userId: contributor.id,
      user: { displayName: contributor.displayName, email: contributor.email },
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [contributor],
      domains: [domain],
      domainAdministrators: [domainAdmin],
    })
    await loginAs(page, contributor)

    await page.goto('/hub/technology/manage')

    await expect(page.getByRole('heading', { name: 'Manage Technology' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Style & Branding' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Hub Content' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Featured Events', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Community Links' })).toBeVisible()
  })

  // ── Global admin can access any hub ───────────────────────────────────────
  test('global admin can access hub manage page for any domain', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      domainAdministrators: [],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    await expect(page.getByRole('heading', { name: 'Manage Technology' })).toBeVisible()
  })

  // ── Breadcrumb navigation ──────────────────────────────────────────────────
  test('breadcrumb links navigate correctly', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    await expect(page.locator('.hub-breadcrumb').getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(page.locator('.hub-breadcrumb').getByRole('link', { name: 'Technology' })).toBeVisible()
  })

  // ── Style form saves ───────────────────────────────────────────────────────
  test('domain admin can save hub style', async ({ page }) => {
    const contributor = makeContributorUser()
    const domain = makeTechDomain()
    const domainAdmin: MockDomainAdministrator = {
      id: 'da-1',
      domainId: domain.id,
      userId: contributor.id,
      user: { displayName: contributor.displayName, email: contributor.email },
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [contributor],
      domains: [domain],
      domainAdministrators: [domainAdmin],
    })
    await loginAs(page, contributor)

    await page.goto('/hub/technology/manage')
    await expect(page.getByRole('heading', { name: 'Style & Branding' })).toBeVisible()

    await page
      .locator('.hub-style-form input[placeholder="#137fec"]')
      .fill('#2563eb')
    await page.locator('.hub-style-form').getByRole('button', { name: 'Save Style' }).click()

    await expect(page.locator('.hub-save-success').first()).toBeVisible()
  })

  // ── Invalid hex color shows inline error ──────────────────────────────────
  test('invalid primary color shows inline validation error', async ({ page }) => {
    const contributor = makeContributorUser()
    const domain = makeTechDomain()
    const domainAdmin: MockDomainAdministrator = {
      id: 'da-1',
      domainId: domain.id,
      userId: contributor.id,
      user: { displayName: contributor.displayName, email: contributor.email },
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [contributor],
      domains: [domain],
      domainAdministrators: [domainAdmin],
    })
    await loginAs(page, contributor)

    await page.goto('/hub/technology/manage')
    await expect(page.getByRole('heading', { name: 'Style & Branding' })).toBeVisible()

    await page
      .locator('.hub-style-form input[placeholder="#137fec"]')
      .fill('not-a-color')
    await page.locator('.hub-style-form').getByRole('button', { name: 'Save Style' }).click()

    await expect(
      page.locator('.field-error').filter({ hasText: /hex/i }),
    ).toBeVisible()
  })

  // ── Overview form saves ────────────────────────────────────────────────────
  test('domain admin can save hub overview content', async ({ page }) => {
    const contributor = makeContributorUser()
    const domain = makeTechDomain()
    const domainAdmin: MockDomainAdministrator = {
      id: 'da-1',
      domainId: domain.id,
      userId: contributor.id,
      user: { displayName: contributor.displayName, email: contributor.email },
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [contributor],
      domains: [domain],
      domainAdministrators: [domainAdmin],
    })
    await loginAs(page, contributor)

    await page.goto('/hub/technology/manage')
    await expect(page.getByRole('heading', { name: 'Hub Content' })).toBeVisible()

    const textarea = page.locator('.hub-overview-form textarea').first()
    await textarea.fill('Welcome to the Technology hub.')
    await page.locator('.hub-overview-form').getByRole('button', { name: 'Save Content' }).click()

    await expect(
      page.locator('.hub-overview-form').locator('.hub-save-success'),
    ).toBeVisible()
  })

  // ── "View hub" link goes to the public page ───────────────────────────────
  test('View hub link navigates to the public category page', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    const viewLink = page.getByRole('link', { name: 'View hub' })
    await expect(viewLink).toBeVisible()
    await expect(viewLink).toHaveAttribute('href', '/category/technology')
  })

  // ── "Manage Hub" button on category page ──────────────────────────────────
  test('Manage Hub button is visible on category page for domain admin', async ({ page }) => {
    const contributor = makeContributorUser()
    const domain = makeTechDomain()
    const domainAdmin: MockDomainAdministrator = {
      id: 'da-1',
      domainId: domain.id,
      userId: contributor.id,
      user: { displayName: contributor.displayName, email: contributor.email },
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [contributor],
      domains: [domain],
      domainAdministrators: [domainAdmin],
      events: [makeApprovedEvent({ domainId: domain.id })],
    })
    await loginAs(page, contributor)

    await page.goto('/category/technology')

    const manageBtn = page.getByRole('link', { name: /Manage Hub/i })
    await expect(manageBtn).toBeVisible()
    await expect(manageBtn).toHaveAttribute('href', '/hub/technology/manage')
  })

  // ── "Manage Hub" button is NOT visible for non-admins ────────────────────
  test('Manage Hub button is not visible to unauthenticated users on category page', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
    })

    await page.goto('/category/technology')

    await expect(page.getByRole('link', { name: /Manage Hub/i })).toBeHidden()
  })

  // ── Not-found slug shows unauthorized ─────────────────────────────────────
  test('hub manage page for non-existent slug shows access denied', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, {
      users: [admin],
      domains: [],
    })
    await loginAs(page, admin)

    await page.goto('/hub/nonexistent-slug/manage')

    await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
  })

  // ── Mobile viewport ────────────────────────────────────────────────────────
  test('hub manage page is usable on mobile viewport', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
    })
    await loginAs(page, admin)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/hub/technology/manage')

    await expect(page.getByRole('heading', { name: 'Manage Technology' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Style & Branding' })).toBeVisible()
  })

  // ── Featured events management ─────────────────────────────────────────────
  test('domain admin can add a featured event on hub manage page', async ({ page }) => {
    const contributor = makeContributorUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      name: 'Prague Tech Summit',
      slug: 'prague-tech-summit',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    const domainAdmin: MockDomainAdministrator = {
      id: 'da-1',
      domainId: domain.id,
      userId: contributor.id,
      user: { displayName: contributor.displayName, email: contributor.email },
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [contributor],
      domains: [domain],
      events: [event],
      domainAdministrators: [domainAdmin],
    })
    await loginAs(page, contributor)

    await page.goto('/hub/technology/manage')
    await expect(page.getByRole('heading', { name: 'Featured Events', exact: true })).toBeVisible()

    // Wait for the event picker to populate, then select
    await expect(page.locator('.hub-featured-select option', { hasText: 'Prague Tech Summit' })).toBeAttached()
    await page.locator('.hub-featured-select').selectOption({ label: 'Prague Tech Summit' })
    await page
      .locator('.hub-add-featured-form')
      .getByRole('button', { name: 'Add' })
      .click()
    await expect(page.locator('.hub-featured-event-name', { hasText: 'Prague Tech Summit' })).toBeVisible()
  })

  // ── Community links management ─────────────────────────────────────────────
  test('domain admin can add a community link on hub manage page', async ({ page }) => {
    const contributor = makeContributorUser()
    const domain = makeTechDomain()
    const domainAdmin: MockDomainAdministrator = {
      id: 'da-1',
      domainId: domain.id,
      userId: contributor.id,
      user: { displayName: contributor.displayName, email: contributor.email },
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [contributor],
      domains: [domain],
      domainAdministrators: [domainAdmin],
    })
    await loginAs(page, contributor)

    await page.goto('/hub/technology/manage')
    await expect(page.getByRole('heading', { name: 'Community Links' })).toBeVisible()

    // Fill in the add-link form
    await page.locator('.hub-add-community-link-form input[type="text"]').fill('Discord')
    await page.locator('.hub-add-community-link-form input[type="url"]').fill('https://discord.gg/tech')
    await page.getByRole('button', { name: 'Add Link', exact: true }).click()

    await expect(page.locator('.hub-community-link-item', { hasText: 'Discord' })).toBeVisible()
  })

  // ── Full journey: admin navigates hub page → manage page ──────────────────
  test('admin can navigate from category page to hub manage page via Manage Hub button', async ({
    page,
  }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      domainAdministrators: [],
      events: [makeApprovedEvent({ domainId: domain.id })],
    })
    await loginAs(page, admin)

    await page.goto('/category/technology')

    const manageBtn = page.getByRole('link', { name: /Manage Hub/i })
    await expect(manageBtn).toBeVisible()
    await manageBtn.click()

    await expect(page).toHaveURL('/hub/technology/manage')
    await expect(page.getByRole('heading', { name: 'Manage Technology' })).toBeVisible()
  })

  // ── Scheduled Featured Events ──────────────────────────────────────────────

  test('hub manage page shows the Scheduled Featured Events section', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    await expect(page.getByRole('heading', { name: 'Scheduled Featured Events' })).toBeVisible()
  })

  test('shows empty state when no schedules exist', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      scheduledFeaturedEvents: [],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')
    await expect(page.getByRole('heading', { name: 'Scheduled Featured Events' })).toBeVisible()

    await expect(page.locator('.hub-schedule-list').getByText('No scheduled highlights yet.')).toBeVisible()
  })

  test('shows an active scheduled entry with active badge', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Active Featured Event', domainId: domain.id })
    const now = new Date()
    const sfe: MockScheduledFeaturedEvent = {
      id: 'sfe-active-1',
      domainId: domain.id,
      eventId: event.id,
      startsAtUtc: new Date(now.getTime() - 3600_000).toISOString(),
      endsAtUtc: new Date(now.getTime() + 86400_000).toISOString(),
      priority: 0,
      isEnabled: true,
      displayLabel: null,
      createdAtUtc: now.toISOString(),
      createdByUserId: admin.id,
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [sfe],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')
    await expect(page.getByRole('heading', { name: 'Scheduled Featured Events' })).toBeVisible()

    await expect(page.locator('.hub-schedule-event-name', { hasText: 'Active Featured Event' })).toBeVisible()
    await expect(page.locator('.hub-schedule-status-badge--active')).toBeVisible()
  })

  test('shows an upcoming scheduled entry with upcoming badge', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Upcoming Featured Event', domainId: domain.id })
    const now = new Date()
    const sfe: MockScheduledFeaturedEvent = {
      id: 'sfe-upcoming-1',
      domainId: domain.id,
      eventId: event.id,
      startsAtUtc: new Date(now.getTime() + 86400_000).toISOString(),
      endsAtUtc: new Date(now.getTime() + 2 * 86400_000).toISOString(),
      priority: 0,
      isEnabled: true,
      displayLabel: null,
      createdAtUtc: now.toISOString(),
      createdByUserId: admin.id,
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [sfe],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    await expect(page.locator('.hub-schedule-event-name', { hasText: 'Upcoming Featured Event' })).toBeVisible()
    await expect(page.locator('.hub-schedule-status-badge--upcoming')).toBeVisible()
  })

  test('shows an expired scheduled entry with expired badge', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Expired Featured Event', domainId: domain.id })
    const now = new Date()
    const sfe: MockScheduledFeaturedEvent = {
      id: 'sfe-expired-1',
      domainId: domain.id,
      eventId: event.id,
      startsAtUtc: new Date(now.getTime() - 10 * 86400_000).toISOString(),
      endsAtUtc: new Date(now.getTime() - 86400_000).toISOString(),
      priority: 0,
      isEnabled: true,
      displayLabel: null,
      createdAtUtc: now.toISOString(),
      createdByUserId: admin.id,
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [sfe],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    await expect(page.locator('.hub-schedule-event-name', { hasText: 'Expired Featured Event' })).toBeVisible()
    await expect(page.locator('.hub-schedule-status-badge--expired')).toBeVisible()
  })

  test('domain admin can create a new scheduled featured event', async ({ page }) => {
    const contributor = makeContributorUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Schedulable Event', domainId: domain.id })
    const domainAdmin: MockDomainAdministrator = {
      id: 'da-1',
      domainId: domain.id,
      userId: contributor.id,
      user: { displayName: contributor.displayName, email: contributor.email },
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [contributor],
      domains: [domain],
      events: [event],
      domainAdministrators: [domainAdmin],
    })
    await loginAs(page, contributor)

    await page.goto('/hub/technology/manage')
    await expect(page.getByRole('heading', { name: 'Scheduled Featured Events' })).toBeVisible()

    // Open the "Add scheduled highlight" details panel
    await page.locator('.hub-schedule-create-summary').click()

    // Select the event
    await page.locator('.hub-schedule-create-form select').selectOption({ label: 'Schedulable Event' })

    // Fill in dates — use tomorrow and next week in datetime-local format
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    const toLocalISO = (d: Date) => d.toISOString().slice(0, 16)

    const startsInput = page.locator('.hub-schedule-create-form input[type="datetime-local"]').first()
    const endsInput = page.locator('.hub-schedule-create-form input[type="datetime-local"]').last()
    await startsInput.fill(toLocalISO(tomorrow))
    await endsInput.fill(toLocalISO(nextWeek))

    await page.locator('.hub-schedule-create-form').getByRole('button', { name: 'Schedule' }).click()

    await expect(page.locator('.hub-save-success', { hasText: 'Schedule created.' })).toBeVisible()
    await expect(page.locator('.hub-schedule-event-name', { hasText: 'Schedulable Event' })).toBeVisible()
  })

  test('shows validation error when start date is after end date', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Validation Test Event', domainId: domain.id })
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')
    await page.locator('.hub-schedule-create-summary').click()

    await page.locator('.hub-schedule-create-form select').selectOption({ label: 'Validation Test Event' })

    // Set endsAt BEFORE startsAt
    const now = new Date()
    const toLocalISO = (d: Date) => d.toISOString().slice(0, 16)
    const future = new Date(now.getTime() + 7 * 86400_000)
    const closer = new Date(now.getTime() + 86400_000)
    const startsInput = page.locator('.hub-schedule-create-form input[type="datetime-local"]').first()
    const endsInput = page.locator('.hub-schedule-create-form input[type="datetime-local"]').last()
    await startsInput.fill(toLocalISO(future))
    await endsInput.fill(toLocalISO(closer))

    await page.locator('.hub-schedule-create-form').getByRole('button', { name: 'Schedule' }).click()

    await expect(page.locator('.hub-schedule-create-form .field-error')).toBeVisible()
    await expect(page.locator('.hub-schedule-create-form .field-error')).toContainText('Start must be before end')
  })

  test('domain admin can remove a scheduled featured event', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Remove Me Event', domainId: domain.id })
    const now = new Date()
    const sfe: MockScheduledFeaturedEvent = {
      id: 'sfe-remove-1',
      domainId: domain.id,
      eventId: event.id,
      startsAtUtc: new Date(now.getTime() + 86400_000).toISOString(),
      endsAtUtc: new Date(now.getTime() + 2 * 86400_000).toISOString(),
      priority: 0,
      isEnabled: true,
      displayLabel: null,
      createdAtUtc: now.toISOString(),
      createdByUserId: admin.id,
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [sfe],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')
    await expect(page.locator('.hub-schedule-event-name', { hasText: 'Remove Me Event' })).toBeVisible()

    await page.locator('.hub-schedule-item').first().getByRole('button', { name: 'Remove' }).click()

    await expect(page.locator('.hub-schedule-event-name', { hasText: 'Remove Me Event' })).toBeHidden()
    await expect(page.locator('.hub-schedule-list').getByText('No scheduled highlights yet.')).toBeVisible()
  })

  test('domain admin can edit a scheduled featured event', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Editable Schedule Event', domainId: domain.id })
    const now = new Date()
    const sfe: MockScheduledFeaturedEvent = {
      id: 'sfe-edit-1',
      domainId: domain.id,
      eventId: event.id,
      startsAtUtc: new Date(now.getTime() + 86400_000).toISOString(),
      endsAtUtc: new Date(now.getTime() + 3 * 86400_000).toISOString(),
      priority: 0,
      isEnabled: true,
      displayLabel: null,
      createdAtUtc: now.toISOString(),
      createdByUserId: admin.id,
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [sfe],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')
    await expect(page.locator('.hub-schedule-event-name', { hasText: 'Editable Schedule Event' })).toBeVisible()

    await page.locator('.hub-schedule-item').first().getByRole('button', { name: 'Edit' }).click()

    // Edit form is now visible
    await expect(page.locator('.hub-schedule-edit-form')).toBeVisible()

    // Update priority to 2
    await page.locator('.hub-schedule-edit-form input[type="number"]').fill('2')
    await page.locator('.hub-schedule-edit-form').getByRole('button', { name: 'Save changes' }).click()

    // Edit form should be gone
    await expect(page.locator('.hub-schedule-edit-form')).toBeHidden()
  })

  test('active scheduled event appears featured on category landing page', async ({ page }) => {
    const domain = makeTechDomain()
    const scheduledEvent = makeApprovedEvent({ name: 'Scheduled Hub Event', domainId: domain.id })
    const staticEvent = makeApprovedEvent({ name: 'Static Hub Event', domainId: domain.id })
    const now = new Date()
    setupMockApi(page, {
      domains: [domain],
      events: [scheduledEvent, staticEvent],
      featuredEvents: [{ domainSlug: domain.slug, eventId: staticEvent.id, displayOrder: 0 }],
      scheduledFeaturedEvents: [
        {
          id: 'sfe-cat-1',
          domainId: domain.id,
          eventId: scheduledEvent.id,
          startsAtUtc: new Date(now.getTime() - 3600_000).toISOString(),
          endsAtUtc: new Date(now.getTime() + 86400_000).toISOString(),
          priority: 0,
          isEnabled: true,
          displayLabel: null,
          createdAtUtc: now.toISOString(),
          createdByUserId: null,
        },
      ],
    })

    await page.goto('/category/technology')

    // The scheduled event should appear in the featured section — not the static one
    const featuredSection = page.locator('.featured-section')
    await expect(featuredSection).toBeVisible()
    await expect(featuredSection.locator('.event-card', { hasText: 'Scheduled Hub Event' })).toBeVisible()
    await expect(featuredSection.locator('.event-card', { hasText: 'Static Hub Event' })).toBeHidden()
  })

  test('fallback to static featured events when no active schedule', async ({ page }) => {
    const domain = makeTechDomain()
    const staticEvent = makeApprovedEvent({ name: 'Static Featured Event', domainId: domain.id })
    const expiredEvent = makeApprovedEvent({ name: 'Expired Scheduled Event', domainId: domain.id })
    const now = new Date()
    setupMockApi(page, {
      domains: [domain],
      events: [staticEvent, expiredEvent],
      featuredEvents: [{ domainSlug: domain.slug, eventId: staticEvent.id, displayOrder: 0 }],
      scheduledFeaturedEvents: [
        {
          id: 'sfe-expired-cat',
          domainId: domain.id,
          eventId: expiredEvent.id,
          startsAtUtc: new Date(now.getTime() - 10 * 86400_000).toISOString(),
          endsAtUtc: new Date(now.getTime() - 86400_000).toISOString(), // expired
          priority: 0,
          isEnabled: true,
          displayLabel: null,
          createdAtUtc: now.toISOString(),
          createdByUserId: null,
        },
      ],
    })

    await page.goto('/category/technology')

    // Falls back to static featured — expired schedule is ignored
    const featuredSection = page.locator('.featured-section')
    await expect(featuredSection).toBeVisible()
    await expect(featuredSection.locator('.event-card', { hasText: 'Static Featured Event' })).toBeVisible()
  })

  test('disabled schedule shows Disabled badge and does not appear on category page', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const disabledEvent = makeApprovedEvent({ name: 'Disabled Schedule Event', domainId: domain.id })
    const staticEvent = makeApprovedEvent({ name: 'Static Fallback Event', domainId: domain.id })
    const now = new Date()
    const sfe: MockScheduledFeaturedEvent = {
      id: 'sfe-disabled-1',
      domainId: domain.id,
      eventId: disabledEvent.id,
      startsAtUtc: new Date(now.getTime() - 3600_000).toISOString(),
      endsAtUtc: new Date(now.getTime() + 86400_000).toISOString(),
      priority: 0,
      isEnabled: false,
      displayLabel: null,
      createdAtUtc: now.toISOString(),
      createdByUserId: admin.id,
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [disabledEvent, staticEvent],
      featuredEvents: [{ domainSlug: domain.slug, eventId: staticEvent.id, displayOrder: 0 }],
      scheduledFeaturedEvents: [sfe],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    // Management UI shows the entry with Disabled badge
    await expect(page.locator('.hub-schedule-event-name', { hasText: 'Disabled Schedule Event' })).toBeVisible()
    await expect(page.locator('.hub-schedule-disabled-badge')).toBeVisible()

    // Category page falls back to static — disabled schedule is ignored
    await page.goto('/category/technology')
    const featuredSection = page.locator('.featured-section')
    await expect(featuredSection).toBeVisible()
    await expect(featuredSection.locator('.event-card', { hasText: 'Static Fallback Event' })).toBeVisible()
    await expect(featuredSection.locator('.event-card', { hasText: 'Disabled Schedule Event' })).toBeHidden()
  })

  test('schedule with display label shows label in management list', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Labelled Event', domainId: domain.id })
    const now = new Date()
    const sfe: MockScheduledFeaturedEvent = {
      id: 'sfe-label-1',
      domainId: domain.id,
      eventId: event.id,
      startsAtUtc: new Date(now.getTime() + 86400_000).toISOString(),
      endsAtUtc: new Date(now.getTime() + 5 * 86400_000).toISOString(),
      priority: 0,
      isEnabled: true,
      displayLabel: 'Campaign A launch',
      createdAtUtc: now.toISOString(),
      createdByUserId: admin.id,
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [sfe],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    await expect(page.locator('.hub-schedule-event-name', { hasText: 'Labelled Event' })).toBeVisible()
    await expect(page.locator('.hub-schedule-label', { hasText: 'Campaign A launch' })).toBeVisible()
  })

  test('domain admin can enable/disable a scheduled entry via edit form', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Toggle Enable Event', domainId: domain.id })
    const now = new Date()
    const sfe: MockScheduledFeaturedEvent = {
      id: 'sfe-toggle-1',
      domainId: domain.id,
      eventId: event.id,
      startsAtUtc: new Date(now.getTime() + 86400_000).toISOString(),
      endsAtUtc: new Date(now.getTime() + 5 * 86400_000).toISOString(),
      priority: 0,
      isEnabled: true,
      displayLabel: null,
      createdAtUtc: now.toISOString(),
      createdByUserId: admin.id,
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [sfe],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')
    await expect(page.locator('.hub-schedule-event-name', { hasText: 'Toggle Enable Event' })).toBeVisible()

    // No disabled badge initially (entry is enabled)
    await expect(page.locator('.hub-schedule-disabled-badge')).toBeHidden()

    // Open edit form and uncheck the Enabled checkbox
    await page.locator('.hub-schedule-item').first().getByRole('button', { name: 'Edit' }).click()
    await expect(page.locator('.hub-schedule-edit-form')).toBeVisible()

    const enableCheckbox = page.locator('.hub-schedule-edit-form .hub-schedule-toggle-input')
    await expect(enableCheckbox).toBeChecked()
    await enableCheckbox.uncheck()

    await page.locator('.hub-schedule-edit-form').getByRole('button', { name: 'Save changes' }).click()

    // Edit form closes and disabled badge appears
    await expect(page.locator('.hub-schedule-edit-form')).toBeHidden()
    await expect(page.locator('.hub-schedule-disabled-badge')).toBeVisible()
  })
})
