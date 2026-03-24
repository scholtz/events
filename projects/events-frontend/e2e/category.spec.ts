import { test, expect } from '@playwright/test'
import { setupMockApi, makeTechDomain, makeApprovedEvent } from './helpers/mock-api'
import type { MockDomain } from './helpers/mock-api'

test.describe('Category landing page', () => {
  test('renders domain heading, description and event list', async ({ page }) => {
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Prague Tech Summit', slug: 'prague-tech-summit' })
    setupMockApi(page, { domains: [domain], events: [event] })

    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'Technology Events', level: 1 })).toBeVisible()
    await expect(page.getByText('Tech events')).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Prague Tech Summit' })).toBeVisible()
  })

  test('breadcrumb shows All Events link that navigates back to /', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()], events: [] })

    await page.goto('/category/technology')

    const breadcrumb = page.getByRole('link', { name: 'All Events', exact: true })
    await expect(breadcrumb).toBeVisible()
    await breadcrumb.click()
    await expect(page).toHaveURL('/')
  })

  test('Filter & Explore link navigates to /?domain=<slug>', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()], events: [makeApprovedEvent()] })

    await page.goto('/category/technology')

    const filterLink = page.getByRole('link', { name: 'Filter & Explore' })
    await expect(filterLink).toBeVisible()
    await expect(filterLink).toHaveAttribute('href', '/?domain=technology')
  })

  test('shows not-found state when slug does not match any domain', async ({ page }) => {
    setupMockApi(page, { domains: [], events: [] })

    await page.goto('/category/nonexistent-slug')

    await expect(page.getByRole('heading', { name: 'Category not found' })).toBeVisible()
    await expect(
      page.getByText(/The category "nonexistent-slug" does not exist/),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse All Events' })).toBeVisible()
  })

  test('shows empty state when domain exists but has no upcoming events', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()], events: [] })

    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'No upcoming events' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse All Events' })).toBeVisible()
  })

  test('shows error state with retry button when API fails', async ({ page }) => {
    // Override DomainBySlug to return an error
    setupMockApi(page, { domains: [], events: [] })
    await page.route('**/graphql', async (route) => {
      const body = route.request().postDataJSON()
      if (body?.query?.includes('DomainBySlug')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } }],
          }),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'Unable to load category' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('page title includes domain name for SEO', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()], events: [] })

    await page.goto('/category/technology')

    await expect(page).toHaveTitle(/Technology/)
  })

  test('event count uses singular for one event', async ({ page }) => {
    const event = makeApprovedEvent({ startsAtUtc: '2099-06-01T10:00:00Z' })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })

    await page.goto('/category/technology')

    await expect(page.getByText('1 upcoming event')).toBeVisible()
  })

  test('event count uses plural for multiple events', async ({ page }) => {
    const events = [
      makeApprovedEvent({ id: 'e1', slug: 'e1', startsAtUtc: '2099-06-01T10:00:00Z' }),
      makeApprovedEvent({
        id: 'e2',
        slug: 'e2',
        name: 'Second Event',
        startsAtUtc: '2099-07-01T10:00:00Z',
      }),
    ]
    setupMockApi(page, { domains: [makeTechDomain()], events })

    await page.goto('/category/technology')

    await expect(page.getByText('2 upcoming events')).toBeVisible()
  })

  test('renders hub overview modules when configured', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      overviewContent: 'Welcome to the premier tech hub.',
      whatBelongsHere: 'Conferences, hackathons, workshops, and meetups.',
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'About this hub' })).toBeVisible()
    await expect(page.getByText('Welcome to the premier tech hub.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What belongs here' })).toBeVisible()
    await expect(page.getByText('Conferences, hackathons, workshops, and meetups.')).toBeVisible()
  })

  test('does not render hub overview modules when not configured', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()], events: [] })

    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'About this hub' })).toBeHidden()
    await expect(page.getByRole('heading', { name: 'What belongs here' })).toBeHidden()
  })

  test('renders logo when configured', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      logoUrl: 'https://example.com/tech-logo.png',
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/category/technology')

    const logo = page.locator('.category-logo')
    await expect(logo).toBeVisible()
    await expect(logo).toHaveAttribute('src', 'https://example.com/tech-logo.png')
  })

  test('renders banner when configured', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      bannerUrl: 'https://example.com/tech-banner.jpg',
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/category/technology')

    const banner = page.locator('.category-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute('src', 'https://example.com/tech-banner.jpg')
  })

  test('renders curator credit when configured', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      curatorCredit: 'Prague Tech Community',
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/category/technology')

    await expect(page.getByText('Prague Tech Community')).toBeVisible()
  })

  test('shows default submit event CTA when none configured', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()], events: [] })

    await page.goto('/category/technology')

    await expect(page.getByRole('link', { name: 'Submit an Event' })).toBeVisible()
  })

  test('shows custom submit event CTA when configured', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      submitEventCta: 'Have a tech event? List it here!',
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/category/technology')

    await expect(page.getByText('Have a tech event? List it here!')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Submit an Event' })).toBeVisible()
  })

  test('mobile viewport: heading and event cards are both visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const event = makeApprovedEvent({ name: 'Mobile Test Event' })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })

    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'Technology Events', level: 1 })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Mobile Test Event' })).toBeVisible()
  })

  test('primary color is applied as CSS custom property', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      primaryColor: '#ff5500',
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/category/technology')

    const hero = page.locator('.category-hero')
    await expect(hero).toHaveAttribute('style', /--category-color:\s*#ff5500/)
  })

  test('accent color is applied as CSS custom property when configured', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      primaryColor: '#ff5500',
      accentColor: '#0055ff',
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/category/technology')

    const hero = page.locator('.category-hero')
    await expect(hero).toHaveAttribute('style', /--category-accent-color:\s*#0055ff/)
  })

  test('mobile viewport: branded header and hub overview are both visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const domain: MockDomain = {
      ...makeTechDomain(),
      primaryColor: '#e44d26',
      accentColor: '#f16529',
      overviewContent: 'Tech community for mobile test.',
      curatorCredit: 'Mobile Curator',
    }
    const event = makeApprovedEvent({ name: 'Mobile Branded Event' })
    setupMockApi(page, { domains: [domain], events: [event] })

    await page.goto('/category/technology')

    // Heading and event card should be visible on mobile
    await expect(page.getByRole('heading', { name: 'Technology Events', level: 1 })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Mobile Branded Event' })).toBeVisible()
    // Branding color is applied
    await expect(page.locator('.category-hero')).toHaveAttribute('style', /--category-color:\s*#e44d26/)
    // Hub overview module visible on mobile
    await expect(page.getByRole('heading', { name: 'About this hub' })).toBeVisible()
    // Curator credit visible
    await expect(page.locator('.curator-credit')).toContainText('Mobile Curator')
  })

  // ── Featured events on public category page ────────────────────────────────

  test('shows featured events section when featured events exist', async ({ page }) => {
    const domain = makeTechDomain()
    const featuredEvent = makeApprovedEvent({
      id: 'evt-feat-pub-1',
      name: 'Featured Keynote',
      slug: 'featured-keynote',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    const normalEvent = makeApprovedEvent({
      id: 'evt-normal-1',
      name: 'Regular Event',
      slug: 'regular-event',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    setupMockApi(page, {
      domains: [domain],
      events: [featuredEvent, normalEvent],
      featuredEvents: [{ domainSlug: domain.slug, eventId: featuredEvent.id, displayOrder: 0 }],
    })

    await page.goto('/category/technology')

    // Featured section heading is shown
    await expect(page.getByRole('heading', { name: 'Featured Events' })).toBeVisible()
    // Featured event appears in the featured section
    await expect(page.locator('.featured-grid .event-card', { hasText: 'Featured Keynote' })).toBeVisible()
    // Non-featured event is in the main grid (not featured)
    await expect(page.locator('.events-grid .event-card', { hasText: 'Regular Event' })).toBeVisible()
    // Featured event is NOT duplicated in the main grid
    await expect(page.locator('.events-grid .event-card', { hasText: 'Featured Keynote' })).toBeHidden()
  })

  test('does not show featured section when no featured events configured', async ({ page }) => {
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Plain Event', slug: 'plain-event' })
    setupMockApi(page, { domains: [domain], events: [event], featuredEvents: [] })

    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'Featured Events' })).toBeHidden()
    await expect(page.locator('.event-card', { hasText: 'Plain Event' })).toBeVisible()
  })

  test('featured event badge is visible on featured event card', async ({ page }) => {
    const domain = makeTechDomain()
    const featuredEvent = makeApprovedEvent({
      id: 'evt-badge',
      name: 'Badge Event',
      slug: 'badge-event',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    setupMockApi(page, {
      domains: [domain],
      events: [featuredEvent],
      featuredEvents: [{ domainSlug: domain.slug, eventId: featuredEvent.id, displayOrder: 0 }],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.featured-badge').first()).toBeVisible()
  })

  test('mobile viewport: featured section and main list are both visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const domain = makeTechDomain()
    const featuredEvent = makeApprovedEvent({
      id: 'evt-feat-mobile',
      name: 'Mobile Featured Event',
      slug: 'mobile-featured-event',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    const normalEvent = makeApprovedEvent({
      id: 'evt-normal-mobile',
      name: 'Mobile Normal Event',
      slug: 'mobile-normal-event',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    setupMockApi(page, {
      domains: [domain],
      events: [featuredEvent, normalEvent],
      featuredEvents: [{ domainSlug: domain.slug, eventId: featuredEvent.id, displayOrder: 0 }],
    })

    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'Featured Events' })).toBeVisible()
    await expect(page.locator('.featured-grid .event-card', { hasText: 'Mobile Featured Event' })).toBeVisible()
    await expect(page.locator('.events-grid .event-card', { hasText: 'Mobile Normal Event' })).toBeVisible()
  })
})
