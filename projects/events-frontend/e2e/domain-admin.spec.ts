import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeAdminUser,
  makeTechDomain,
  makeApprovedEvent,
  loginAs,
} from './helpers/mock-api'
import type { MockDomainAdministrator } from './helpers/mock-api'

test.describe('Domain admin management', () => {
  test('admin sees Manage button on domains tab', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, { users: [admin], domains: [makeTechDomain()] })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await expect(page.getByRole('button', { name: 'Manage' })).toBeVisible()
  })

  test('clicking Manage shows domain detail panel with style form and admin list', async ({
    page,
  }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const domainAdmin: MockDomainAdministrator = {
      id: 'da-1',
      domainId: domain.id,
      userId: admin.id,
      user: { displayName: admin.displayName, email: admin.email },
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      domainAdministrators: [domainAdmin],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    // Style form is visible
    await expect(page.getByRole('heading', { name: 'Hub Branding' })).toBeVisible()
    // Admin section is visible
    await expect(page.getByRole('heading', { name: 'Tag Administrators' })).toBeVisible()
    // Current admin is listed in the domain admins section
    await expect(
      page.locator('.domain-admins-section').getByText(admin.displayName),
    ).toBeVisible()
  })

  test('can add a domain administrator', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = {
      id: 'user-contrib',
      email: 'contrib@example.com',
      password: 'Pass123!',
      displayName: 'Contributor User',
      role: 'CONTRIBUTOR' as const,
      createdAtUtc: new Date().toISOString(),
    }
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin, contributor],
      domains: [domain],
      domainAdministrators: [],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    // Wait for admin overview to finish loading
    await expect(page.getByRole('button', { name: /Tags/ })).toBeVisible()
    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    // Wait for the admin form to be visible
    await expect(page.getByRole('heading', { name: 'Tag Administrators' })).toBeVisible()

    // Select user from dropdown and add
    const select = page.locator('.add-admin-form select')
    await expect(select).toBeVisible()
    // Wait for adminOverview users to be loaded (options populated)
    await expect(select.locator(`option[value="${contributor.id}"]`)).toBeAttached()
    await select.selectOption(contributor.id)
    await page.getByRole('button', { name: 'Add Admin' }).click()

    // New admin should appear in the list
    await expect(
      page.locator('.domain-admins-section').getByText('Contributor User'),
    ).toBeVisible()
  })

  test('can remove a domain administrator', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = {
      id: 'user-contrib',
      email: 'contrib@example.com',
      password: 'Pass123!',
      displayName: 'Contributor User',
      role: 'CONTRIBUTOR' as const,
      createdAtUtc: new Date().toISOString(),
    }
    const domain = makeTechDomain()
    const domainAdmin: MockDomainAdministrator = {
      id: 'da-contrib',
      domainId: domain.id,
      userId: contributor.id,
      user: { displayName: contributor.displayName, email: contributor.email },
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [admin, contributor],
      domains: [domain],
      domainAdministrators: [domainAdmin],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    // Should see the contributor as admin
    await expect(page.getByText('Contributor User')).toBeVisible()
    // Remove the contributor
    await page.getByRole('button', { name: 'Remove' }).click()

    // Contributor should no longer be in the admin list
    await expect(page.getByText('No administrators assigned')).toBeVisible()
  })

  test('can update domain style', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      domainAdministrators: [],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    // Fill style form
    await page.locator('input[placeholder="#137fec"]').fill('#ff5500')
    await page.locator('input[placeholder="#ff5500"]').fill('#0055ff')
    await page.getByRole('button', { name: 'Save Style' }).click()

    // Success indicator
    await expect(page.getByText('✓ Saved')).toBeVisible()
  })

  test('admin can set logo and banner URL; branding appears on public category page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      domainAdministrators: [],
      events: [
        {
          id: 'event-1',
          name: 'Tech Conference',
          slug: 'tech-conference',
          description: 'A tech event.',
          eventUrl: 'https://example.com',
          venueName: 'Tech Hall',
          addressLine1: '1 Tech St',
          city: 'Prague',
          countryCode: 'CZ',
          latitude: 50.0755,
          longitude: 14.4378,
          startsAtUtc: '2026-06-01T10:00:00Z',
          endsAtUtc: '2026-06-01T18:00:00Z',
          submittedAtUtc: new Date().toISOString(),
          updatedAtUtc: new Date().toISOString(),
          publishedAtUtc: new Date().toISOString(),
          adminNotes: null,
          status: 'PUBLISHED' as const,
          isFree: true,
          priceAmount: 0,
          currencyCode: 'EUR',
          domainId: domain.id,
          domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
          submittedByUserId: admin.id,
          submittedBy: { displayName: admin.displayName },
          reviewedByUserId: null,
          reviewedBy: null,
          mapUrl: '',
          interestedCount: 0,
          attendanceMode: 'IN_PERSON' as const,
          timezone: null,
          language: null,
        },
      ],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    // Navigate to domains tab and open manage panel
    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Branding' })).toBeVisible()

    // Set logo URL and banner URL
    await page.getByLabel('Logo URL').fill('https://example.com/logo.png')
    await page.getByLabel('Banner URL').fill('https://example.com/banner.jpg')
    await page.getByRole('button', { name: 'Save Style' }).click()
    await expect(page.getByText('✓ Saved')).toBeVisible()

    // Navigate to the public category page
    await page.goto('/category/technology')

    // Verify logo and banner are displayed
    await expect(page.locator('.category-logo')).toBeVisible()
    await expect(page.locator('.category-logo')).toHaveAttribute('src', 'https://example.com/logo.png')
    await expect(page.locator('.category-banner')).toBeVisible()
    await expect(page.locator('.category-banner')).toHaveAttribute('src', 'https://example.com/banner.jpg')
  })

  test('closing domain detail hides the panel', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, { users: [admin], domains: [makeTechDomain()] })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Branding' })).toBeVisible()

    // Click Close
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Branding' })).toBeHidden()
  })

  test('can update hub overview content', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      domainAdministrators: [],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Overview Content' })).toBeVisible()

    // Fill overview form
    await page.getByLabel('About this hub').fill('This hub is about technology events in Prague.')
    await page.getByLabel('What belongs here').fill('Tech talks, hackathons, and innovation meetups.')
    await page.getByRole('button', { name: 'Save Overview' }).click()

    // Success indicator (overview form's ✓ Saved - style form is not submitted here)
    await expect(page.getByText('✓ Saved').first()).toBeVisible()
  })

  test('hub overview content appears on public category page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const admin = makeAdminUser()
    const domain = {
      ...makeTechDomain(),
      overviewContent: 'Welcome to the Technology hub.',
      whatBelongsHere: 'Tech conferences, hackathons, and workshops.',
      curatorCredit: 'Prague Tech Community',
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      domainAdministrators: [],
    })

    await page.goto('/category/technology')

    // Hub overview modules should be visible
    await expect(page.getByRole('heading', { name: 'About this hub' })).toBeVisible()
    await expect(page.getByText('Welcome to the Technology hub.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What belongs here' })).toBeVisible()
    await expect(page.getByText('Tech conferences, hackathons, and workshops.')).toBeVisible()
    // Curator credit
    await expect(page.getByText('Prague Tech Community')).toBeVisible()
  })

  test('non-admin contributor cannot access domain branding controls', async ({ page }) => {
    const contributor = {
      id: 'user-contrib',
      email: 'contrib@example.com',
      password: 'Pass123!',
      displayName: 'Contributor User',
      role: 'CONTRIBUTOR' as const,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [contributor],
      domains: [makeTechDomain()],
      domainAdministrators: [],
    })
    await loginAs(page, contributor)
    await page.goto('/admin')

    // Non-admin sees the access-required gate, not the domain branding form
    await expect(page.getByRole('heading', { name: 'Admin access required' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Hub Branding' })).toBeHidden()
  })

  test('mobile viewport: domain branding admin form is usable on small screens', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      domainAdministrators: [],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    // Branding form is visible and inputs are accessible on mobile
    await expect(page.getByRole('heading', { name: 'Hub Branding' })).toBeVisible()
    await page.locator('input[placeholder="#137fec"]').fill('#e44d26')
    await page.getByRole('button', { name: 'Save Style' }).click()
    await expect(page.getByText('✓ Saved')).toBeVisible()
  })

  // ── Featured events curation ────────────────────────────────────────────────

  test('domain detail panel shows Featured Events section', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      domainAdministrators: [],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    await expect(page.getByRole('heading', { name: 'Featured Events' })).toBeVisible()
    await expect(page.getByText('No featured events yet')).toBeVisible()
  })

  test('admin can add a featured event and save', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'evt-feat-1',
      name: 'Featured Summit',
      slug: 'featured-summit',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      domainAdministrators: [],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    await expect(page.getByRole('heading', { name: 'Featured Events' })).toBeVisible()

    // Select event from picker and click Add (scoped to the form to avoid ambiguity with other Add buttons)
    await page.locator('.add-featured-form select').selectOption({ label: 'Featured Summit' })
    await page.locator('.add-featured-form').getByRole('button', { name: 'Add', exact: true }).click()

    // Event should now appear in the featured list
    await expect(page.locator('.featured-events-list').getByText('Featured Summit')).toBeVisible()

    // Save featured events
    await page.getByRole('button', { name: 'Save Featured Events' }).click()
    await expect(page.getByText('✓ Saved')).toBeVisible()
  })

  test('admin can remove a featured event', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'evt-feat-remove',
      name: 'Event To Remove',
      slug: 'event-to-remove',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      featuredEvents: [{ domainSlug: domain.slug, eventId: event.id, displayOrder: 0 }],
      domainAdministrators: [],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    // After loading, the featured event should be listed (loaded via FeaturedEventsForDomain query)
    await expect(page.getByRole('heading', { name: 'Featured Events' })).toBeVisible()
    await expect(page.locator('.featured-events-list').getByText('Event To Remove')).toBeVisible()

    // Click the Remove button to remove the event from the list
    await page.locator('.featured-events-list').getByRole('button', { name: 'Remove', exact: true }).click()

    // Event should disappear from the list and empty message should appear
    await expect(page.locator('.featured-events-list').getByText('Event To Remove')).toBeHidden()
    await expect(page.getByText('No featured events yet')).toBeVisible()

    // Save the cleared list
    await page.getByRole('button', { name: 'Save Featured Events' }).click()
    await expect(page.getByText('✓ Saved')).toBeVisible()
  })

  test('add featured event picker is hidden when 5 events are already featured', async ({
    page,
  }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const events = Array.from({ length: 5 }, (_, i) =>
      makeApprovedEvent({
        id: `evt-max-${i}`,
        name: `Max Event ${i + 1}`,
        slug: `max-event-${i}`,
        domainId: domain.id,
        domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
      }),
    )
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events,
      featuredEvents: events.map((e, i) => ({
        domainSlug: domain.slug,
        eventId: e.id,
        displayOrder: i,
      })),
      domainAdministrators: [],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    // All 5 are featured — add picker should be hidden
    await expect(page.getByRole('heading', { name: 'Featured Events' })).toBeVisible()
    await expect(page.locator('.add-featured-form')).toBeHidden()
    // All 5 events are listed
    await expect(page.locator('.featured-events-list .featured-event-item')).toHaveCount(5)
  })
})
