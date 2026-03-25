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

  test('shows "all events featured" note when every domain event is featured', async ({ page }) => {
    const domain = makeTechDomain()
    const featuredEvent = makeApprovedEvent({
      id: 'evt-only-featured',
      name: 'Only Featured Event',
      slug: 'only-featured-event',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    setupMockApi(page, {
      domains: [domain],
      events: [featuredEvent],
      featuredEvents: [{ domainSlug: domain.slug, eventId: featuredEvent.id, displayOrder: 0 }],
    })

    await page.goto('/category/technology')

    // Featured section shows the event
    await expect(page.locator('.featured-grid .event-card', { hasText: 'Only Featured Event' })).toBeVisible()
    // No duplicate in main grid — instead shows count note
    await expect(page.locator('.events-grid .event-card', { hasText: 'Only Featured Event' })).toBeHidden()
    await expect(page.locator('.all-featured-note')).toBeVisible()
  })

  test('featured events appear in displayOrder', async ({ page }) => {
    const domain = makeTechDomain()
    const eventA = makeApprovedEvent({
      id: 'ord-a',
      name: 'Event Order A',
      slug: 'event-order-a',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    const eventB = makeApprovedEvent({
      id: 'ord-b',
      name: 'Event Order B',
      slug: 'event-order-b',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    setupMockApi(page, {
      domains: [domain],
      events: [eventA, eventB],
      // B has lower displayOrder (0) so it should appear first, then A (1)
      featuredEvents: [
        { domainSlug: domain.slug, eventId: eventB.id, displayOrder: 0 },
        { domainSlug: domain.slug, eventId: eventA.id, displayOrder: 1 },
      ],
    })

    await page.goto('/category/technology')

    const cards = page.locator('.featured-grid .event-card')
    await expect(cards.nth(0)).toContainText('Event Order B')
    await expect(cards.nth(1)).toContainText('Event Order A')
  })

  test('featured events for other domains do not appear on this page', async ({ page }) => {
    const domain = makeTechDomain()
    const otherDomainEvent = makeApprovedEvent({
      id: 'other-domain-event',
      name: 'Other Domain Featured',
      slug: 'other-domain-featured',
    })
    setupMockApi(page, {
      domains: [domain],
      events: [otherDomainEvent],
      // Featured for a different domain slug, not "technology"
      featuredEvents: [{ domainSlug: 'crypto', eventId: otherDomainEvent.id, displayOrder: 0 }],
    })

    await page.goto('/category/technology')

    // No featured section since the technology domain has no featured events
    await expect(page.getByRole('heading', { name: 'Featured Events' })).toBeHidden()
  })

  test('i18n: Slovak locale shows translated featured events heading', async ({ page }) => {
    const domain = makeTechDomain()
    const featuredEvent = makeApprovedEvent({
      id: 'evt-i18n-feat',
      name: 'I18n Featured Event',
      slug: 'i18n-featured-event',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
    })
    setupMockApi(page, {
      domains: [domain],
      events: [featuredEvent],
      featuredEvents: [{ domainSlug: domain.slug, eventId: featuredEvent.id, displayOrder: 0 }],
    })

    // Set Slovak locale before navigation
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })

    await page.goto('/category/technology')

    // Slovak translation: "Odporúčané podujatia"
    await expect(page.getByRole('heading', { name: 'Odporúčané podujatia' })).toBeVisible()
  })

  // ── Open Graph / Twitter Card meta tag tests ────────────────────────────

  test('sets og:title meta tag from domain name', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()], events: [] })
    await page.goto('/category/technology')
    await page.waitForFunction(() => document.title.includes('Technology'))
    const ogTitle = await page.evaluate(
      () => document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '',
    )
    expect(ogTitle).toContain('Technology')
  })

  test('sets og:description meta tag from domain description', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      description: 'The best tech events in Central Europe.',
    }
    setupMockApi(page, { domains: [domain], events: [] })
    await page.goto('/category/technology')
    await page.waitForFunction(() => !!document.querySelector('meta[property="og:description"]'))
    const ogDesc = await page.evaluate(
      () => document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '',
    )
    expect(ogDesc).toContain('The best tech events in Central Europe.')
  })

  test('sets og:image from bannerUrl when present', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      bannerUrl: 'https://cdn.example.com/tech-banner.jpg',
    }
    setupMockApi(page, { domains: [domain], events: [] })
    await page.goto('/category/technology')
    await page.waitForFunction(() => !!document.querySelector('meta[property="og:image"]'))
    const ogImage = await page.evaluate(
      () => document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '',
    )
    expect(ogImage).toBe('https://cdn.example.com/tech-banner.jpg')
  })

  test('falls back og:image to logoUrl when no bannerUrl', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      bannerUrl: null,
      logoUrl: 'https://cdn.example.com/tech-logo.png',
    }
    setupMockApi(page, { domains: [domain], events: [] })
    await page.goto('/category/technology')
    await page.waitForFunction(() => !!document.querySelector('meta[property="og:image"]'))
    const ogImage = await page.evaluate(
      () => document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '',
    )
    expect(ogImage).toBe('https://cdn.example.com/tech-logo.png')
  })

  test('sets twitter:card to summary_large_image when image is available', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      bannerUrl: 'https://cdn.example.com/tech-banner.jpg',
    }
    setupMockApi(page, { domains: [domain], events: [] })
    await page.goto('/category/technology')
    await page.waitForFunction(() => !!document.querySelector('meta[name="twitter:card"]'))
    const twitterCard = await page.evaluate(
      () => document.querySelector('meta[name="twitter:card"]')?.getAttribute('content') ?? '',
    )
    expect(twitterCard).toBe('summary_large_image')
  })

  test('sets twitter:card to summary when no image is available', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      bannerUrl: null,
      logoUrl: null,
    }
    setupMockApi(page, { domains: [domain], events: [] })
    await page.goto('/category/technology')
    await page.waitForFunction(() => !!document.querySelector('meta[name="twitter:card"]'))
    const twitterCard = await page.evaluate(
      () => document.querySelector('meta[name="twitter:card"]')?.getAttribute('content') ?? '',
    )
    expect(twitterCard).toBe('summary')
  })

  test('shows publishedEventCount from server in event count badge', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      publishedEventCount: 17,
    }
    // No events in the response (the count comes from the server field, not from the event list)
    setupMockApi(page, { domains: [domain], events: [] })
    await page.goto('/category/technology')
    // The count badge reflects the server-side publishedEventCount
    await expect(page.locator('.category-event-count')).toContainText('17')
  })
})
