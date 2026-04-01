import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeAdminUser,
  makeContributorUser,
  makeTechDomain,
  makeApprovedEvent,
  makePublicGroup,
  makePendingReviewClaim,
  loginAs,
} from './helpers/mock-api'
import type { MockDomainAdministrator, MockDomainLink } from './helpers/mock-api'

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

  test('invalid primary color shows inline error and does not save', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      domainAdministrators: [],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Branding' })).toBeVisible()

    // Enter an invalid color
    await page.locator('input[placeholder="#137fec"]').fill('red')
    await page.getByRole('button', { name: 'Save Style' }).click()

    // Inline error appears
    await expect(page.locator('.field-error').first()).toBeVisible()
    await expect(page.locator('.field-error').first()).toContainText(/hex/)

    // Success indicator must NOT appear (save was blocked)
    await expect(page.locator('.save-success')).toHaveCount(0)
  })

  test('invalid accent color shows inline error and does not save', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      domainAdministrators: [],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Branding' })).toBeVisible()

    // Leave primary blank; enter bad accent color
    await page.locator('input[placeholder="#ff5500"]').fill('rgb(255,0,0)')
    await page.getByRole('button', { name: 'Save Style' }).click()

    // Accent-color inline error appears
    await expect(page.locator('.field-error').first()).toBeVisible()
    await expect(page.locator('.field-error').first()).toContainText(/hex/)

    // Success indicator must NOT appear
    await expect(page.locator('.save-success')).toHaveCount(0)
  })

  test('valid hex color in admin view saves successfully without inline error', async ({
    page,
  }) => {
    const admin = makeAdminUser()
    setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      domainAdministrators: [],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Branding' })).toBeVisible()

    // Enter valid hex colors
    await page.locator('input[placeholder="#137fec"]').fill('#137fec')
    await page.locator('input[placeholder="#ff5500"]').fill('#ff5500')
    await page.getByRole('button', { name: 'Save Style' }).click()

    // No inline errors
    await expect(page.locator('.field-error')).toHaveCount(0)
    // Success indicator appears
    await expect(page.locator('.save-success')).toBeVisible()
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

  test('admin can set hub tagline and it appears on public category page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
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

    // Fill tagline field
    await page.getByLabel('Hub Tagline (optional)').fill('Discover the future of tech events.')
    await page.getByRole('button', { name: 'Save Overview' }).click()
    await expect(page.getByText('✓ Saved').first()).toBeVisible()

    // Navigate to public category page and confirm tagline appears
    await page.goto('/category/technology')
    await expect(page.locator('.category-tagline')).toContainText('Discover the future of tech events.')
  })

  test('tagline does not render when absent from domain', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const domain = { ...makeTechDomain(), tagline: null }
    setupMockApi(page, { domains: [domain] })

    await page.goto('/category/technology')

    await expect(page.locator('.category-tagline')).toHaveCount(0)
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

  // ── Community links curation ─────────────────────────────────────────────────

  test('domain detail panel shows Community Links section', async ({ page }) => {
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

    await expect(page.getByRole('heading', { name: 'Community Links' })).toBeVisible()
    await expect(page.getByText('No community links yet.')).toBeVisible()
  })

  test('admin can add a community link and save', async ({ page }) => {
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

    await expect(page.getByRole('heading', { name: 'Community Links' })).toBeVisible()

    // Fill in the new link form
    await page.locator('.add-community-link-form input[type="text"]').fill('Community Website')
    await page.locator('.add-community-link-form input[type="url"]').fill('https://community.example.com')
    await page.getByRole('button', { name: 'Add Link' }).click()

    // Link should appear in the list
    await expect(page.locator('.community-links-list').getByText('Community Website')).toBeVisible()

    // Save the links
    await page.getByRole('button', { name: 'Save Links' }).click()
    await expect(page.getByText('✓ Saved').last()).toBeVisible()
  })

  test('admin can remove a community link', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const domainLink: MockDomainLink = {
      id: 'link-1',
      domainId: domain.id,
      title: 'Community Discord',
      url: 'https://discord.gg/community',
      displayOrder: 0,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      domainLinks: [domainLink],
      domainAdministrators: [],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    // The existing link should be shown
    await expect(page.getByRole('heading', { name: 'Community Links' })).toBeVisible()
    await expect(page.locator('.community-links-list').getByText('Community Discord')).toBeVisible()

    // Remove the link
    await page.locator('.community-link-item').getByRole('button', { name: 'Remove' }).click()

    // Empty state should appear
    await expect(page.getByText('No community links yet.')).toBeVisible()

    // Save the cleared list
    await page.getByRole('button', { name: 'Save Links' }).click()
    await expect(page.getByText('✓ Saved').last()).toBeVisible()
  })

  test('community links appear on public category page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const domainLinks: MockDomainLink[] = [
      {
        id: 'link-1',
        domainId: domain.id,
        title: 'Community Website',
        url: 'https://community.example.com',
        displayOrder: 0,
        createdAtUtc: new Date().toISOString(),
      },
      {
        id: 'link-2',
        domainId: domain.id,
        title: 'Join our Discord',
        url: 'https://discord.gg/tech',
        displayOrder: 1,
        createdAtUtc: new Date().toISOString(),
      },
    ]
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      domainLinks,
      domainAdministrators: [],
    })

    await page.goto('/category/technology')

    // Community links section should be visible
    await expect(page.getByRole('heading', { name: 'Community Links' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Community Website' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Join our Discord' })).toBeVisible()

    // Links should point to the correct URLs
    await expect(page.getByRole('link', { name: 'Community Website' })).toHaveAttribute('href', 'https://community.example.com')
    await expect(page.getByRole('link', { name: 'Join our Discord' })).toHaveAttribute('href', 'https://discord.gg/tech')
  })

  test('community links section is hidden when no links configured', async ({ page }) => {
    const domain = makeTechDomain()
    setupMockApi(page, {
      domains: [domain],
    })

    await page.goto('/category/technology')

    // No community links section when no links are configured
    await expect(page.getByRole('heading', { name: 'Community Links' })).toBeHidden()
  })

  test('add community link form hidden when 10 links already added', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const domainLinks: MockDomainLink[] = Array.from({ length: 10 }, (_, i) => ({
      id: `link-${i}`,
      domainId: domain.id,
      title: `Link ${i + 1}`,
      url: `https://example.com/link-${i}`,
      displayOrder: i,
      createdAtUtc: new Date().toISOString(),
    }))
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      domainLinks,
      domainAdministrators: [],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Tags/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    // With 10 links, the add form should be hidden
    await expect(page.getByRole('heading', { name: 'Community Links' })).toBeVisible()
    await expect(page.locator('.add-community-link-form')).toBeHidden()
    // All 10 links are listed
    await expect(page.locator('.community-link-item')).toHaveCount(10)
  })
})

// ── External source claim review (admin) ──────────────────────────────────────

test.describe('Admin – external source claim review', () => {
  test('admin sees Source Claims tab with pending count', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    setupMockApi(page, { users: [admin], communityGroups: [group], externalSourceClaims: [claim] })

    await loginAs(page, admin)
    await page.goto('/admin')

    await expect(page.getByRole('button', { name: /Source Claims/ })).toBeVisible()
  })

  test('admin sees pending claim in Source Claims tab', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    setupMockApi(page, { users: [admin], communityGroups: [group], externalSourceClaims: [claim] })

    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Source Claims/ }).click()

    await expect(page.locator('.claim-row')).toHaveCount(1)
    await expect(page.locator('.source-type-badge')).toContainText('MEETUP')
    await expect(page.getByRole('link', { name: group.name })).toBeVisible()
  })

  test('admin can verify a pending claim', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    setupMockApi(page, { users: [admin], communityGroups: [group], externalSourceClaims: [claim] })

    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Source Claims/ }).click()

    await page.locator('.claim-row').getByRole('button', { name: /Verify/i }).click()

    // After verifying, claim moves out of pending list → empty state shown
    await expect(page.locator('.claim-row')).toHaveCount(0)
    await expect(page.locator('.empty-table')).toBeVisible()
  })

  test('admin can reject a pending claim', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    setupMockApi(page, { users: [admin], communityGroups: [group], externalSourceClaims: [claim] })

    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Source Claims/ }).click()

    await page.locator('.claim-row').getByRole('button', { name: /Reject/i }).click()

    // After rejection, claim moves out of pending list → empty state shown
    await expect(page.locator('.claim-row')).toHaveCount(0)
    await expect(page.locator('.empty-table')).toBeVisible()
  })

  test('shows empty state when no pending claims', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, { users: [admin] })

    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Source Claims/ }).click()

    await expect(page.locator('.empty-table')).toBeVisible()
  })

  test('non-admin does not see Source Claims tab', async ({ page }) => {
    const contributor = makeContributorUser()
    setupMockApi(page, { users: [contributor] })

    await loginAs(page, contributor)
    await page.goto('/admin')

    // Non-admin sees login prompt, not admin tabs
    await expect(page.getByRole('button', { name: /Source Claims/ })).toBeHidden()
  })

  test('Verify button has accessible aria-label with group name', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    setupMockApi(page, { users: [admin], communityGroups: [group], externalSourceClaims: [claim] })

    await loginAs(page, admin)
    await page.goto('/admin')
    await page.getByRole('button', { name: /Source Claims/ }).click()

    // Wait for claim row to appear before asserting aria-label
    await expect(page.locator('.claim-row')).toHaveCount(1)
    const verifyBtn = page.locator('.claim-row').getByRole('button', { name: /Verify/i })
    await expect(verifyBtn).toHaveAttribute('aria-label', new RegExp(group.name))
  })

  test('Reject button has accessible aria-label with group name', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    setupMockApi(page, { users: [admin], communityGroups: [group], externalSourceClaims: [claim] })

    await loginAs(page, admin)
    await page.goto('/admin')
    await page.getByRole('button', { name: /Source Claims/ }).click()

    // Wait for claim row to appear before asserting aria-label
    await expect(page.locator('.claim-row')).toHaveCount(1)
    const rejectBtn = page.locator('.claim-row').getByRole('button', { name: /Reject/i })
    await expect(rejectBtn).toHaveAttribute('aria-label', new RegExp(group.name))
  })

  test('shows localized error banner when review mutation fails', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    setupMockApi(page, { users: [admin], communityGroups: [group], externalSourceClaims: [claim] })

    // Override the review mutation to return an error
    await page.route('**/graphql', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}')
      if (body.query?.includes('ReviewExternalSourceClaim')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Internal server error' }] }),
        })
      } else {
        await route.fallback()
      }
    })

    await loginAs(page, admin)
    await page.goto('/admin')
    await page.getByRole('button', { name: /Source Claims/ }).click()

    await page.locator('.claim-row').getByRole('button', { name: /Verify/i }).click()

    // Error banner should appear with localized (English) error text
    await expect(page.locator('.error-banner[role="alert"]')).toBeVisible()
    await expect(page.locator('.error-banner[role="alert"]')).toContainText(/Failed to review claim/)
  })
})
