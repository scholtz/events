import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeAdminUser,
  makeContributorUser,
  makeTechDomain,
  makeApprovedEvent,
  makePublicGroup,
  makePrivateGroup,
  loginAs,
  seedAuthAndLocale,
} from './helpers/mock-api'
import type {
  MockDomainAdministrator,
  MockDomainCuratedCommunity,
  MockScheduledFeaturedEvent,
} from './helpers/mock-api'

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
    const scheduledEvent = makeApprovedEvent({ id: 'ev-scheduled', name: 'Scheduled Hub Event', domainId: domain.id })
    const staticEvent = makeApprovedEvent({ id: 'ev-static', name: 'Static Hub Event', domainId: domain.id })
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
    const staticEvent = makeApprovedEvent({ id: 'ev-static', name: 'Static Featured Event', domainId: domain.id })
    const expiredEvent = makeApprovedEvent({ id: 'ev-expired', name: 'Expired Scheduled Event', domainId: domain.id })
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
    const disabledEvent = makeApprovedEvent({ id: 'ev-disabled', name: 'Disabled Schedule Event', domainId: domain.id })
    const staticEvent = makeApprovedEvent({ id: 'ev-static', name: 'Static Fallback Event', domainId: domain.id })
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
  })

  test('disabled schedule does not appear as featured on category page (falls back to static)', async ({ page }) => {
    const domain = makeTechDomain()
    const disabledEvent = makeApprovedEvent({ id: 'ev-disabled', name: 'Disabled Schedule Event', domainId: domain.id })
    const staticEvent = makeApprovedEvent({ id: 'ev-static', name: 'Static Fallback Event', domainId: domain.id })
    const now = new Date()
    setupMockApi(page, {
      domains: [domain],
      events: [disabledEvent, staticEvent],
      featuredEvents: [{ domainSlug: domain.slug, eventId: staticEvent.id, displayOrder: 0 }],
      scheduledFeaturedEvents: [
        {
          id: 'sfe-disabled-cat',
          domainId: domain.id,
          eventId: disabledEvent.id,
          startsAtUtc: new Date(now.getTime() - 3600_000).toISOString(),
          endsAtUtc: new Date(now.getTime() + 86400_000).toISOString(),
          priority: 0,
          isEnabled: false,
          displayLabel: null,
          createdAtUtc: now.toISOString(),
          createdByUserId: null,
        },
      ],
    })

    await page.goto('/category/technology')

    // Category page falls back to static — disabled schedule is ignored
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

  test('lower-priority schedule takes precedence over higher-priority on category page', async ({ page }) => {
    const domain = makeTechDomain()
    const highPriorityEvent = makeApprovedEvent({ id: 'ev-high', name: 'High Priority Event', domainId: domain.id })
    const lowPriorityEvent = makeApprovedEvent({ id: 'ev-low', name: 'Low Priority Event', domainId: domain.id })
    const now = new Date()
    setupMockApi(page, {
      domains: [domain],
      events: [highPriorityEvent, lowPriorityEvent],
      scheduledFeaturedEvents: [
        {
          id: 'sfe-prio-high',
          domainId: domain.id,
          eventId: highPriorityEvent.id,
          startsAtUtc: new Date(now.getTime() - 3600_000).toISOString(),
          endsAtUtc: new Date(now.getTime() + 86400_000).toISOString(),
          priority: 5,
          isEnabled: true,
          displayLabel: null,
          createdAtUtc: now.toISOString(),
          createdByUserId: null,
        },
        {
          id: 'sfe-prio-low',
          domainId: domain.id,
          eventId: lowPriorityEvent.id,
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

    // The lower-priority value (0) should appear first in the featured section
    const featuredSection = page.locator('.featured-section')
    await expect(featuredSection).toBeVisible()
    const cards = featuredSection.locator('.event-card')
    await expect(cards).toHaveCount(2)
    await expect(cards.first()).toContainText('Low Priority Event')
    await expect(cards.nth(1)).toContainText('High Priority Event')
  })

  // ── Localization: Slovak ──────────────────────────────────────────────────
  test('Scheduled Featured Events section headings are localized in Slovak', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    await seedAuthAndLocale(page, admin, 'sk')
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      scheduledFeaturedEvents: [],
    })

    await page.goto('/hub/technology/manage')

    // The section heading and hint should be in Slovak
    await expect(
      page.getByRole('heading', { name: 'Naplánované featured podujatia' }),
    ).toBeVisible()
    await expect(
      page.getByText('Propagujte vybrané podujatia počas definovaného časového okna.', { exact: false }),
    ).toBeVisible()
    // Empty state message should be in Slovak
    await expect(
      page.locator('.hub-schedule-list').getByText('Žiadne naplánované zvýraznenia.'),
    ).toBeVisible()
    // "Add scheduled highlight" summary label should be in Slovak
    await expect(page.locator('.hub-schedule-create-summary')).toContainText(
      '+ Pridať naplánované zvýraznenie',
    )
  })

  // ── Localization: German ──────────────────────────────────────────────────
  test('Scheduled Featured Events section headings are localized in German', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    await seedAuthAndLocale(page, admin, 'de')
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      scheduledFeaturedEvents: [],
    })

    await page.goto('/hub/technology/manage')

    // The section heading and hint should be in German
    await expect(page.getByRole('heading', { name: 'Geplante Featured-Events' })).toBeVisible()
    await expect(
      page.getByText('Fördern Sie bestimmte Events in einem definierten Zeitfenster.', {
        exact: false,
      }),
    ).toBeVisible()
    // Empty state message should be in German
    await expect(
      page.locator('.hub-schedule-list').getByText('Noch keine geplanten Highlights.'),
    ).toBeVisible()
    // "Add scheduled highlight" summary label should be in German
    await expect(page.locator('.hub-schedule-create-summary')).toContainText(
      '+ Geplantes Highlight hinzufügen',
    )
  })

  // ── Localization: Slovak status badges ───────────────────────────────────
  test('schedule status badges are localized in Slovak', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Lokalizovaná Udalosť', domainId: domain.id })
    const now = new Date()
    const sfe: MockScheduledFeaturedEvent = {
      id: 'sfe-sk-1',
      domainId: domain.id,
      eventId: event.id,
      startsAtUtc: new Date(now.getTime() - 3_600_000).toISOString(),
      endsAtUtc: new Date(now.getTime() + 86_400_000).toISOString(),
      priority: 0,
      isEnabled: true,
      displayLabel: null,
      createdAtUtc: now.toISOString(),
      createdByUserId: admin.id,
    }
    await seedAuthAndLocale(page, admin, 'sk')
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [sfe],
    })

    await page.goto('/hub/technology/manage')

    await expect(
      page.locator('.hub-schedule-event-name', { hasText: 'Lokalizovaná Udalosť' }),
    ).toBeVisible()
    // Active badge should be in Slovak: "Aktívne"
    await expect(page.locator('.hub-schedule-status-badge--active')).toContainText('Aktívne')
    // Edit/Remove buttons should be in Slovak
    await expect(
      page.locator('.hub-schedule-item').first().getByRole('button', { name: 'Upraviť' }),
    ).toBeVisible()
    await expect(
      page.locator('.hub-schedule-item').first().getByRole('button', { name: 'Odstrániť' }),
    ).toBeVisible()
  })

  // ── Curated Community Groups ──────────────────────────────────────────────

  test('curated communities section is shown to admin', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      communityGroups: [],
      domainCuratedCommunities: [],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    await expect(
      page.getByRole('heading', { name: 'Curated Community Groups' }),
    ).toBeVisible()
    await expect(
      page.getByText('No community groups curated yet.'),
    ).toBeVisible()
  })

  test('curated community is shown in the list after loading', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Prague Builders', slug: 'prague-builders' })
    const curatedEntry: MockDomainCuratedCommunity = {
      id: 'cc-1',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: 'Core organizer group',
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      communityGroups: [group],
      domainCuratedCommunities: [curatedEntry],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    const list = page.locator('.hub-curated-community-list')
    await expect(list).toBeVisible()
    const item = list.locator('.hub-curated-community-item').first()
    await expect(item.getByRole('link', { name: 'Prague Builders' })).toBeVisible()
    // Annotation input should have the steward note pre-filled
    await expect(item.locator('.hub-curated-community-annotation-input')).toHaveValue(
      'Core organizer group',
    )
    // Enabled badge should be shown
    await expect(item.locator('.badge--enabled')).toBeVisible()
  })

  test('admin can add a public community group from the picker', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Blockchain Collective', slug: 'blockchain-collective' })
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      communityGroups: [group],
      domainCuratedCommunities: [],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    // Select the group from the picker
    await page
      .locator('.hub-curated-community-select')
      .selectOption({ label: 'Blockchain Collective' })
    await page.getByRole('button', { name: 'Add community' }).click()

    // The group should appear in the list
    const list = page.locator('.hub-curated-community-list')
    await expect(list.locator('.hub-curated-community-item')).toHaveCount(1)
    await expect(list.getByRole('link', { name: 'Blockchain Collective' })).toBeVisible()
  })

  test('admin can remove a curated community', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Removable Group', slug: 'removable-group' })
    const curatedEntry: MockDomainCuratedCommunity = {
      id: 'cc-remove',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      communityGroups: [group],
      domainCuratedCommunities: [curatedEntry],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    const list = page.locator('.hub-curated-community-list')
    await expect(list.locator('.hub-curated-community-item')).toHaveCount(1)

    // Click Remove
    await list.locator('.hub-curated-community-item').first().getByRole('button', { name: 'Remove' }).click()

    // Should show empty state
    await expect(page.getByText('No community groups curated yet.')).toBeVisible()
  })

  test('no eligible groups message shown when no public groups exist', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const privateGroup = makePrivateGroup({ name: 'Secret Group', slug: 'secret-group' })
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      communityGroups: [privateGroup],
      domainCuratedCommunities: [],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    await expect(
      page.getByText('No public community groups are available to add.'),
    ).toBeVisible()
  })

  test('admin can reorder curated communities using move up/down buttons', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const groupA = makePublicGroup({ id: 'group-a', name: 'Alpha Group', slug: 'alpha-group' })
    const groupB = makePublicGroup({ id: 'group-b', name: 'Beta Group', slug: 'beta-group' })
    const entryA: MockDomainCuratedCommunity = {
      id: 'cc-a',
      domainId: domain.id,
      groupId: groupA.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    const entryB: MockDomainCuratedCommunity = {
      id: 'cc-b',
      domainId: domain.id,
      groupId: groupB.id,
      displayOrder: 1,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      communityGroups: [groupA, groupB],
      domainCuratedCommunities: [entryA, entryB],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    const list = page.locator('.hub-curated-community-list')
    await expect(list).toBeVisible()

    // Initially Alpha is first, Beta is second
    const items = list.locator('.hub-curated-community-item')
    await expect(items.nth(0).getByRole('link', { name: 'Alpha Group' })).toBeVisible()
    await expect(items.nth(1).getByRole('link', { name: 'Beta Group' })).toBeVisible()

    // Move Alpha down (Beta should become first)
    await items.nth(0).getByRole('button', { name: 'Move Alpha Group down' }).click()

    // Now Beta is first, Alpha is second
    await expect(items.nth(0).getByRole('link', { name: 'Beta Group' })).toBeVisible()
    await expect(items.nth(1).getByRole('link', { name: 'Alpha Group' })).toBeVisible()

    // Move Alpha back up
    await items.nth(1).getByRole('button', { name: 'Move Alpha Group up' }).click()

    // Alpha is first again
    await expect(items.nth(0).getByRole('link', { name: 'Alpha Group' })).toBeVisible()
    await expect(items.nth(1).getByRole('link', { name: 'Beta Group' })).toBeVisible()
  })

  test('admin can disable a curated community entry via checkbox', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Toggle Group', slug: 'toggle-group' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-toggle',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    const list = page.locator('.hub-curated-community-list')
    const item = list.locator('.hub-curated-community-item').first()

    // Initially enabled badge is shown
    await expect(item.locator('.badge--enabled')).toBeVisible()
    await expect(item.locator('.badge--disabled')).toBeHidden()

    // Uncheck the enabled checkbox to disable
    await item.getByLabel('Enabled (show publicly)').uncheck()

    // Disabled badge is now shown
    await expect(item.locator('.badge--disabled')).toBeVisible()
    await expect(item.locator('.badge--enabled')).toBeHidden()
  })

  test('admin can save curated communities and sees success message', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Save Test Group', slug: 'save-test-group' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-save',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    // Click Save Curated Communities and wait for the mutation to complete
    const saveResponse = page.waitForResponse((resp) =>
      resp.url().includes('/graphql') && resp.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Save Curated Communities' }).click()
    await saveResponse

    // Success message should appear
    await expect(page.getByText('✓ Saved')).toBeVisible()
  })

  test('Curated Community Groups section is localized in Slovak', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    await seedAuthAndLocale(page, admin, 'sk')
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      communityGroups: [],
      domainCuratedCommunities: [],
    })

    await page.goto('/hub/technology/manage')

    await expect(
      page.getByRole('heading', { name: 'Kurácie komunitných skupín' }),
    ).toBeVisible()
    await expect(
      page.getByText('Zatiaľ žiadne kurácie komunitných skupín.'),
    ).toBeVisible()
  })

  test('Curated Community Groups section is localized in German', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    await seedAuthAndLocale(page, admin, 'de')
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      communityGroups: [],
      domainCuratedCommunities: [],
    })

    await page.goto('/hub/technology/manage')

    await expect(
      page.getByRole('heading', { name: 'Kuratierte Community-Gruppen' }),
    ).toBeVisible()
    await expect(
      page.getByText('Noch keine kuratierten Community-Gruppen.'),
    ).toBeVisible()
  })

  // ── Hub inclusion request workflow ────────────────────────────────────────
  test('pending inclusion request is shown to domain admin', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Requesting Group', slug: 'requesting-group' })
    const pendingEntry: MockDomainCuratedCommunity = {
      id: 'cc-pending',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: false,
      annotation: 'We organize weekly blockchain meetups.',
      status: 'PENDING',
      requestedByUserId: 'other-user-id',
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      communityGroups: [group],
      domainCuratedCommunities: [pendingEntry],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    // Pending requests section should be visible
    await expect(page.getByRole('heading', { name: /Pending inclusion requests/i })).toBeVisible()
    // The requesting group should appear in the pending list
    await expect(page.locator('.hub-pending-request-list').getByRole('link', { name: 'Requesting Group' })).toBeVisible()
    // The annotation/note should show
    await expect(page.locator('.hub-pending-request-note')).toContainText('We organize weekly blockchain meetups.')
  })

  test('domain admin can approve a pending inclusion request', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Approvable Group', slug: 'approvable-group' })
    const pendingEntry: MockDomainCuratedCommunity = {
      id: 'cc-pending-approve',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: false,
      annotation: null,
      status: 'PENDING',
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      communityGroups: [group],
      domainCuratedCommunities: [pendingEntry],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    // Click Approve button in the pending requests section
    await page.locator('.hub-pending-request-list').getByRole('button', { name: 'Approve' }).click()

    // The pending section should disappear (no more pending entries)
    await expect(page.locator('.hub-pending-requests')).toBeHidden()
    // The approved group should now appear in the curated list
    await expect(page.locator('.hub-curated-community-list').getByRole('link', { name: 'Approvable Group' })).toBeVisible()
  })

  test('domain admin can reject a pending inclusion request with a note', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Rejectable Group', slug: 'rejectable-group' })
    const pendingEntry: MockDomainCuratedCommunity = {
      id: 'cc-pending-reject',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: false,
      annotation: null,
      status: 'PENDING',
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      communityGroups: [group],
      domainCuratedCommunities: [pendingEntry],
    })
    await loginAs(page, admin)

    await page.goto('/hub/technology/manage')

    // Type rejection note and reject
    await page.locator('.hub-pending-reject-input').fill('Not aligned with hub focus.')
    await page.locator('.hub-pending-request-list').getByRole('button', { name: 'Reject' }).click()

    // The pending section should disappear
    await expect(page.locator('.hub-pending-requests')).toBeHidden()
    // The empty message should be shown
    await expect(page.getByText('No community groups curated yet.')).toBeVisible()
  })

  test('pending entry does not appear in the public curated communities section', async ({ page }) => {
    // This tests that the mock-api correctly filters pending entries from the public query
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Hidden Pending Group', slug: 'hidden-pending' })
    const pendingEntry: MockDomainCuratedCommunity = {
      id: 'cc-hidden-pending',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: false,
      annotation: null,
      status: 'PENDING',
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      communityGroups: [group],
      domainCuratedCommunities: [pendingEntry],
    })

    await page.goto('/category/technology')

    // The pending group should NOT appear publicly
    await expect(page.getByText('Hidden Pending Group')).toBeHidden()
  })
})
