import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeTechDomain,
  makeApprovedEvent,
  makePublicGroup,
  makePrivateGroup,
  makeContributorUser,
  makeActiveMembership,
  makePendingMembership,
  loginAs,
} from './helpers/mock-api'
import type { MockDomain, MockDomainCuratedCommunity, MockScheduledFeaturedEvent } from './helpers/mock-api'

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

  test('results summary names the hub explicitly for a single event', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-single', slug: 'e-single', name: 'Solo Event' })],
    })

    await page.goto('/category/technology')

    // Hub-scoped summary: "1 event in the Technology hub"
    await expect(page.locator('.results-summary')).toContainText('1 event in the Technology hub')
  })

  test('results summary names the hub explicitly for multiple events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-a', slug: 'e-a', name: 'Event A' }),
        makeApprovedEvent({ id: 'e-b', slug: 'e-b', name: 'Event B' }),
        makeApprovedEvent({ id: 'e-c', slug: 'e-c', name: 'Event C' }),
      ],
    })

    await page.goto('/category/technology')

    // Hub-scoped summary: "3 events in the Technology hub"
    await expect(page.locator('.results-summary')).toContainText('3 events in the Technology hub')
  })

  test('results summary has role status for accessibility', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-acc', slug: 'e-acc' })],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.results-summary')).toHaveAttribute('role', 'status')
  })

  test('results summary hub name is localized in German', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-de', slug: 'e-de', name: 'Tech Event DE' })],
    })
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })

    await page.goto('/category/technology')

    // German: "1 Veranstaltung im Technology-Hub"
    await expect(page.locator('.results-summary')).toContainText('im Technology-Hub')
  })

  test('results summary hub name is localized in Slovak', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-sk', slug: 'e-sk', name: 'Tech Event SK' })],
    })
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })

    await page.goto('/category/technology')

    // Slovak: "1 udalosť v hube Technology"
    await expect(page.locator('.results-summary')).toContainText('v hube Technology')
  })

  test('results summary is visible at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-m1', slug: 'e-m1', name: 'Mobile Event One' }),
        makeApprovedEvent({ id: 'e-m2', slug: 'e-m2', name: 'Mobile Event Two' }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.results-summary')).toBeVisible()
    await expect(page.locator('.results-summary')).toContainText('Technology hub')
  })

  test('navigates to home with domain filter when clicking Filter & Explore link', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-j1', slug: 'e-j1', name: 'Tech Journey Event' })],
    })

    await page.goto('/category/technology')

    // Click "Filter & Explore" — should navigate to /?domain=technology
    const filterLink = page.getByRole('link', { name: 'Filter & Explore' })
    await expect(filterLink).toBeVisible()
    await filterLink.click()

    await expect(page).toHaveURL(/\?domain=technology/)
  })

  test('shows zero-event count in results summary alongside empty state', async ({
    page,
  }) => {
    setupMockApi(page, { domains: [makeTechDomain()], events: [] })

    await page.goto('/category/technology')

    // Results summary shows "0 events in the Technology hub" — giving factual context
    // alongside the friendly empty state heading
    await expect(page.locator('.results-summary')).toBeVisible()
    await expect(page.locator('.results-summary')).toContainText('0 events in the Technology hub')
    await expect(page.getByRole('heading', { name: 'No upcoming events' })).toBeVisible()
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

  test('renders tagline when configured', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      tagline: 'Discover the future of technology events.',
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/category/technology')

    await expect(page.locator('.category-tagline')).toBeVisible()
    await expect(page.locator('.category-tagline')).toContainText(
      'Discover the future of technology events.',
    )
  })

  test('does not render tagline when domain has none', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      tagline: null,
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/category/technology')

    await expect(page.locator('.category-tagline')).toBeHidden()
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

// ---------------------------------------------------------------------------
// Hub navigation journey — circular navigation: hub page ↔ event detail
// ---------------------------------------------------------------------------

test.describe('Hub navigation journey', () => {
  test('public visitor navigates from hub page to event detail via event card', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      logoUrl: 'https://example.com/tech-logo.png',
      description: 'Premier tech events in Central Europe.',
      curatorCredit: 'Prague Tech Community',
      primaryColor: '#137fec',
    }
    const event = makeApprovedEvent({
      id: 'journey-event-1',
      name: 'Hub Journey Event',
      slug: 'hub-journey-event',
      domainId: domain.id,
      domain: {
        id: domain.id,
        name: domain.name,
        slug: domain.slug,
        subdomain: domain.subdomain,
        description: domain.description,
        logoUrl: domain.logoUrl,
        primaryColor: domain.primaryColor,
        curatorCredit: domain.curatorCredit,
      },
    })
    setupMockApi(page, { domains: [domain], events: [event] })

    // 1. Visit the branded hub page
    await page.goto('/category/technology')
    await expect(page.getByRole('heading', { name: 'Technology Events', level: 1 })).toBeVisible()
    await expect(page.locator('.category-logo')).toBeVisible()
    await expect(page.locator('.category-description')).toContainText(
      'Premier tech events in Central Europe.',
    )

    // 2. Click through to the event detail via the event title link
    await page.locator('.event-title-link', { hasText: 'Hub Journey Event' }).click()
    await expect(page).toHaveURL(/\/event\/hub-journey-event/)
  })

  test('public visitor returns to hub page via hub context card on event detail', async ({
    page,
  }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      logoUrl: 'https://example.com/tech-logo.png',
      description: 'Premier tech events in Central Europe.',
      curatorCredit: 'Prague Tech Community',
    }
    const event = makeApprovedEvent({
      id: 'journey-event-2',
      name: 'Hub Return Event',
      slug: 'hub-return-event',
      domainId: domain.id,
      domain: {
        id: domain.id,
        name: domain.name,
        slug: domain.slug,
        subdomain: domain.subdomain,
        description: domain.description,
        logoUrl: domain.logoUrl,
        curatorCredit: domain.curatorCredit,
      },
    })
    setupMockApi(page, { domains: [domain], events: [event] })

    // 1. Open event detail directly
    await page.goto(`/event/${event.slug}`)

    // 2. Hub context card should show domain identity
    await expect(page.locator('.hub-context')).toBeVisible()
    await expect(page.locator('.hub-context-name')).toContainText('Technology')
    await expect(page.locator('.hub-context-description')).toContainText(
      'Premier tech events in Central Europe.',
    )
    await expect(page.locator('.hub-context-logo')).toBeVisible()

    // 3. Click the hub context link to return to the category hub
    await page.locator('.hub-context-link').click()
    await expect(page).toHaveURL(/\/category\/technology/)
    await expect(page.getByRole('heading', { name: 'Technology Events', level: 1 })).toBeVisible()
  })

  test('full circular hub journey: hub page → event detail → back to hub', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      logoUrl: 'https://example.com/tech-logo.png',
      description: 'Premier tech events in Central Europe.',
      curatorCredit: 'Prague Tech Community',
      primaryColor: '#137fec',
    }
    const event = makeApprovedEvent({
      id: 'journey-event-full',
      name: 'Full Journey Event',
      slug: 'full-journey-event',
      domainId: domain.id,
      domain: {
        id: domain.id,
        name: domain.name,
        slug: domain.slug,
        subdomain: domain.subdomain,
        description: domain.description,
        logoUrl: domain.logoUrl,
        primaryColor: domain.primaryColor,
        curatorCredit: domain.curatorCredit,
      },
    })
    setupMockApi(page, { domains: [domain], events: [event] })

    // Step 1: Visit the branded hub page
    await page.goto('/category/technology')
    await expect(page.getByRole('heading', { name: 'Technology Events', level: 1 })).toBeVisible()
    await expect(page.locator('.category-logo')).toBeVisible()
    await expect(page.locator('.category-description')).toContainText(
      'Premier tech events in Central Europe.',
    )
    await expect(page.locator('.curator-credit')).toContainText('Prague Tech Community')

    // Step 2: Click through to the event detail
    await page.locator('.event-title-link', { hasText: 'Full Journey Event' }).click()
    await expect(page).toHaveURL(/\/event\/full-journey-event/)

    // Step 3: Confirm hub context card links back to hub
    await expect(page.locator('.hub-context')).toBeVisible()
    await expect(page.locator('.hub-context-name')).toContainText('Technology')
    const hubLink = page.locator('.hub-context-link')
    await expect(hubLink).toHaveAttribute('href', '/category/technology')

    // Step 4: Navigate back to the hub via hub context link
    await hubLink.click()
    await expect(page).toHaveURL(/\/category\/technology/)
    await expect(page.getByRole('heading', { name: 'Technology Events', level: 1 })).toBeVisible()
  })

  test('hub page empty state: page looks complete when domain has no events', async ({ page }) => {
    const domain: MockDomain = {
      ...makeTechDomain(),
      logoUrl: 'https://example.com/tech-logo.png',
      description: 'Premier tech events in Central Europe.',
      curatorCredit: 'Prague Tech Community',
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/category/technology')

    // Hub branding is still shown even with no events
    await expect(page.getByRole('heading', { name: 'Technology Events', level: 1 })).toBeVisible()
    await expect(page.locator('.category-logo')).toBeVisible()
    await expect(page.locator('.category-description')).toContainText(
      'Premier tech events in Central Europe.',
    )
    // Empty state message is visible
    await expect(page.getByRole('heading', { name: 'No upcoming events' })).toBeVisible()
    // Browse all link is present
    await expect(page.getByRole('link', { name: 'Browse All Events' })).toBeVisible()
    // Organizer CTA is still shown
    await expect(page.getByRole('link', { name: 'Submit an Event' })).toBeVisible()
  })

  test('hub page fallback: page renders without any brand assets', async ({ page }) => {
    // Domain with no branding configured at all
    const unbranded: MockDomain = {
      ...makeTechDomain(),
      logoUrl: null,
      bannerUrl: null,
      primaryColor: null,
      accentColor: null,
      description: null,
      curatorCredit: null,
      overviewContent: null,
      whatBelongsHere: null,
    }
    const event = makeApprovedEvent({
      id: 'unbranded-event',
      name: 'Unbranded Event',
      slug: 'unbranded-event',
    })
    setupMockApi(page, { domains: [unbranded], events: [event] })

    await page.goto('/category/technology')

    // Page heading is still visible
    await expect(page.getByRole('heading', { name: 'Technology Events', level: 1 })).toBeVisible()
    // No logo or banner shown
    await expect(page.locator('.category-logo')).toBeHidden()
    await expect(page.locator('.category-banner-wrap')).toBeHidden()
    // No description or curator sections
    await expect(page.locator('.category-description')).toBeHidden()
    await expect(page.locator('.curator-credit')).toBeHidden()
    // No hub modules
    await expect(page.locator('.hub-overview-modules')).toBeHidden()
    // Event list is still shown
    await expect(page.locator('.event-card', { hasText: 'Unbranded Event' })).toBeVisible()
  })

  test('hub page low-signal notice appears when only 1 event is available', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-only', name: 'Solo Tech Meetup', slug: 'solo-tech-meetup' })],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.low-signal-notice')).toBeVisible()
    await expect(page.locator('.low-signal-notice')).toHaveAttribute('role', 'status')
    // The notice includes a browse-all recovery link
    await expect(
      page.locator('.low-signal-notice .low-signal-action', { hasText: 'Browse all events' }),
    ).toBeVisible()
  })

  test('hub page low-signal notice is not shown when 4 or more events exist', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Event A', slug: 'event-a' }),
        makeApprovedEvent({ id: 'e-2', name: 'Event B', slug: 'event-b' }),
        makeApprovedEvent({ id: 'e-3', name: 'Event C', slug: 'event-c' }),
        makeApprovedEvent({ id: 'e-4', name: 'Event D', slug: 'event-d' }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.low-signal-notice')).toBeHidden()
  })

  test('hub page low-signal notice browse-all link navigates to home', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-only', name: 'Only Event', slug: 'only-event' })],
    })

    await page.goto('/category/technology')

    await page.locator('.low-signal-notice .low-signal-action').click()
    await expect(page).toHaveURL('/')
  })

  test('i18n: hub page low-signal browse-all action is localized in Slovak', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-only', name: 'Solo Event', slug: 'solo-event' })],
    })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })

    await page.goto('/category/technology')

    // Slovak translation of home.lowSignalBrowseAll
    await expect(
      page.locator('.low-signal-notice .low-signal-action', { hasText: 'Zobraziť všetky udalosti' }),
    ).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Rank context badge on hub pages
// ---------------------------------------------------------------------------

test.describe('Hub rank context badge', () => {
  test('shows "Ranked by date, quality & engagement" rank context badge when events are present', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Tech Meetup', slug: 'tech-meetup' }),
        makeApprovedEvent({ id: 'e-2', name: 'AI Workshop', slug: 'ai-workshop' }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.rank-context-badge')).toBeVisible()
    await expect(page.locator('.rank-context-badge')).toContainText('Ranked by date, quality & engagement')
  })

  test('rank context badge is not shown when hub has no events', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()], events: [] })

    await page.goto('/category/technology')

    await expect(page.locator('.rank-context-badge')).toBeHidden()
  })

  test('rank context badge is visible on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-1', name: 'Tech Event', slug: 'tech-event' })],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.rank-context-badge')).toBeVisible()
  })

  test('i18n: rank context badge is localized in German', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-1', name: 'Tech Meetup', slug: 'tech-meetup' })],
    })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })

    await page.goto('/category/technology')

    // German translation of home.rankContextUpcoming
    await expect(page.locator('.rank-context-badge')).toContainText('Nach Datum, Qualität und Engagement')
  })

  test('i18n: rank context badge is localized in Slovak', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-1', name: 'Tech Meetup', slug: 'tech-meetup' })],
    })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })

    await page.goto('/category/technology')

    // Slovak translation of home.rankContextUpcoming
    await expect(page.locator('.rank-context-badge')).toContainText('Zoradené: dátum, kvalita, záujem')
  })

  // ── Curated Community Groups on category page ─────────────────────────────

  test('shows curated communities section when hub has curated groups', async ({ page }) => {
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Prague Builders', slug: 'prague-builders', summary: 'Key builders group' })
    const curatedEntry: MockDomainCuratedCommunity = {
      id: 'cc-1',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: 'Core organizers of the Prague tech scene',
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [curatedEntry],
    })

    await page.goto('/category/technology')

    await expect(
      page.getByRole('heading', { name: 'Communities in this hub' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Prague Builders' })).toBeVisible()
    await expect(page.getByText('Core organizers of the Prague tech scene')).toBeVisible()
    await expect(page.getByText('Key builders group')).toBeVisible()
    // Explore community link
    await expect(page.getByRole('link', { name: 'Explore community' })).toBeVisible()
  })

  test('curated community explore link navigates to /community/:slug', async ({ page }) => {
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Tech Circle', slug: 'tech-circle' })
    const curatedEntry: MockDomainCuratedCommunity = {
      id: 'cc-nav',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [curatedEntry],
    })

    await page.goto('/category/technology')

    const exploreLink = page.getByRole('link', { name: 'Explore community' })
    await expect(exploreLink).toHaveAttribute('href', '/community/tech-circle')
  })

  test('curated communities section not shown when hub has no curated groups', async ({ page }) => {
    const domain = makeTechDomain()
    setupMockApi(page, {
      domains: [domain],
      events: [],
      communityGroups: [],
      domainCuratedCommunities: [],
    })

    await page.goto('/category/technology')

    await expect(
      page.locator('.curated-communities-section'),
    ).toBeHidden()
  })

  test('disabled curated community does not appear on public category page', async ({ page }) => {
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Hidden Group', slug: 'hidden-group' })
    const disabledEntry: MockDomainCuratedCommunity = {
      id: 'cc-disabled',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: false, // disabled
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [disabledEntry],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.curated-communities-section')).toBeHidden()
    await expect(page.getByRole('link', { name: 'Hidden Group' })).toBeHidden()
  })

  test('public community card shows Public badge', async ({ page }) => {
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Open Builders', slug: 'open-builders' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-public',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })

    await page.goto('/category/technology')

    const card = page.locator('.curated-community-card')
    await expect(card.locator('.visibility-public')).toBeVisible()
    await expect(card.locator('.visibility-public')).toContainText('Public')
  })

  test('private community card shows Private badge', async ({ page }) => {
    const domain = makeTechDomain()
    const group = makePrivateGroup({ name: 'Exclusive Guild', slug: 'exclusive-guild' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-private',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })

    await page.goto('/category/technology')

    const card = page.locator('.curated-community-card')
    await expect(card.locator('.visibility-private')).toBeVisible()
    await expect(card.locator('.visibility-private')).toContainText('Private')
  })

  test('anonymous user sees Sign in link instead of join button', async ({ page }) => {
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Open Community', slug: 'open-community' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-anon',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })

    await page.goto('/category/technology')

    // Should see "Sign in" link, not a join button
    await expect(page.locator('.curated-community-signin')).toBeVisible()
    await expect(page.locator('.curated-community-join-btn')).toBeHidden()
  })

  test('anonymous user sign-in link navigates to /login', async ({ page }) => {
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Open Community', slug: 'open-community' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-anon-nav',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.curated-community-signin')).toHaveAttribute('href', '/login')
  })

  test('authenticated user sees Join button for public group', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Tech Hub', slug: 'tech-hub' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-auth-public',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })

    await loginAs(page, user)
    await page.goto('/category/technology')

    await expect(page.locator('.curated-community-join-btn')).toBeVisible()
    await expect(page.locator('.curated-community-join-btn')).toContainText('Join')
    await expect(page.locator('.curated-community-signin')).toBeHidden()
  })

  test('authenticated user sees Request Access button for private group', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    const group = makePrivateGroup({ name: 'Private Club', slug: 'private-club' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-auth-private',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })

    await loginAs(page, user)
    await page.goto('/category/technology')

    await expect(page.locator('.curated-community-request-btn')).toBeVisible()
    await expect(page.locator('.curated-community-request-btn')).toContainText('Request Access')
    await expect(page.locator('.curated-community-signin')).toBeHidden()
  })

  test('authenticated user can join a public group from hub page', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Joinable Group', slug: 'joinable-group' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-join',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })

    await loginAs(page, user)
    await page.goto('/category/technology')

    await page.locator('.curated-community-join-btn').click()

    // After joining, the joined badge should appear
    await expect(page.locator('.community-joined-badge')).toBeVisible()
    await expect(page.locator('.community-joined-badge')).toContainText('Joined')
    await expect(page.locator('.curated-community-join-btn')).toBeHidden()
  })

  test('authenticated user can request access to private group from hub page', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    const group = makePrivateGroup({ name: 'Request Group', slug: 'request-group' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-request',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })

    await loginAs(page, user)
    await page.goto('/category/technology')

    await page.locator('.curated-community-request-btn').click()

    // After requesting, pending badge should appear
    await expect(page.locator('.community-pending-badge')).toBeVisible()
    await expect(page.locator('.community-pending-badge')).toContainText('Pending')
    await expect(page.locator('.curated-community-request-btn')).toBeHidden()
  })

  test('hub page shows community section and events together on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Mobile Event', slug: 'mobile-event' })
    const group = makePublicGroup({ name: 'Mobile Builders', slug: 'mobile-builders' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-mobile',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [event],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })

    await page.goto('/category/technology')

    // Both sections visible on mobile
    await expect(page.getByRole('heading', { name: 'Communities in this hub' })).toBeVisible()
    await expect(page.locator('.curated-community-card')).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Mobile Event' })).toBeVisible()
  })

  test('clicking through from hub community card to community page', async ({ page }) => {
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Navigate Group', slug: 'navigate-group' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-nav-full',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })

    await page.goto('/category/technology')

    // Click on the community name link
    await page.getByRole('link', { name: 'Navigate Group' }).click()
    await expect(page).toHaveURL(/\/community\/navigate-group/)
  })

  // ── Membership state persistence (regression tests for blocking issues) ────

  test('existing active member sees Joined badge on page load (not Join button)', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Already Joined Group', slug: 'already-joined' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-existing',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    const membership = makeActiveMembership(group.id, user.id)
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
      communityMemberships: [membership],
    })

    await loginAs(page, user)
    await page.goto('/category/technology')

    // Should show Joined badge, not Join button
    await expect(page.locator('.community-joined-badge')).toBeVisible()
    await expect(page.locator('.curated-community-join-btn')).toBeHidden()
  })

  test('existing pending member sees Pending Approval on page load (not Request Access)', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    const group = makePrivateGroup({ name: 'Pending Group', slug: 'pending-group' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-pending',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    const membership = makePendingMembership(group.id, user.id)
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
      communityMemberships: [membership],
    })

    await loginAs(page, user)
    await page.goto('/category/technology')

    // Should show pending badge, not Request Access button
    await expect(page.locator('.community-pending-badge')).toBeVisible()
    await expect(page.locator('.curated-community-request-btn')).toBeHidden()
  })

  test('explore community link is shown for public groups', async ({ page }) => {
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Open Circle', slug: 'open-circle' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-pub-explore',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, { domains: [domain], events: [], communityGroups: [group], domainCuratedCommunities: [entry] })

    await page.goto('/category/technology')

    await expect(page.locator('.curated-community-cta')).toBeVisible()
    await expect(page.locator('.curated-community-cta')).toHaveAttribute('href', '/community/open-circle')
  })

  test('explore community link is hidden for private groups when user is not a member', async ({ page }) => {
    const domain = makeTechDomain()
    const group = makePrivateGroup({ name: 'Hidden Guild', slug: 'hidden-guild' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-priv-no-explore',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, { domains: [domain], events: [], communityGroups: [group], domainCuratedCommunities: [entry] })

    await page.goto('/category/technology')

    // Explore link must be absent for non-members of a private group
    await expect(page.locator('.curated-community-cta')).toBeHidden()
  })

  test('explore community link shown for private group when user is an active member', async ({ page }) => {
    const user = makeContributorUser()
    const domain = makeTechDomain()
    const group = makePrivateGroup({ name: 'Members Only', slug: 'members-only' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-priv-member-explore',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    const membership = makeActiveMembership(group.id, user.id)
    setupMockApi(page, {
      users: [user],
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
      communityMemberships: [membership],
    })

    await loginAs(page, user)
    await page.goto('/category/technology')

    // Active member should see the explore link
    await expect(page.locator('.curated-community-cta')).toBeVisible()
    await expect(page.locator('.curated-community-cta')).toHaveAttribute('href', '/community/members-only')
  })

  // ── Upcoming event count display (privacy-safe aggregate) ─────────────────

  test('community card shows upcoming event count when community has upcoming events', async ({
    page,
  }) => {
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Event Rich Group', slug: 'event-rich-group' })
    const ev1 = makeApprovedEvent({
      id: 'ev-count-1',
      domainId: domain.id,
      startsAtUtc: new Date(Date.now() + 7 * 86400_000).toISOString(),
    })
    const ev2 = makeApprovedEvent({
      id: 'ev-count-2',
      domainId: domain.id,
      startsAtUtc: new Date(Date.now() + 14 * 86400_000).toISOString(),
    })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-count',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [ev1, ev2],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
      communityGroupEvents: [
        { groupId: group.id, eventId: ev1.id },
        { groupId: group.id, eventId: ev2.id },
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.curated-community-event-count')).toContainText('2 upcoming events')
  })

  test('community card shows no-upcoming-events message when count is zero', async ({ page }) => {
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Quiet Group', slug: 'quiet-group' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-quiet',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
      communityGroupEvents: [],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.curated-community-event-count')).toContainText(
      'No upcoming events right now',
    )
    await expect(page.locator('.curated-community-event-count--none')).toBeVisible()
  })

  test('community card shows singular "1 upcoming event"', async ({ page }) => {
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'One Event Group', slug: 'one-event-group' })
    const ev = makeApprovedEvent({
      id: 'ev-single',
      domainId: domain.id,
      startsAtUtc: new Date(Date.now() + 5 * 86400_000).toISOString(),
    })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-single',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [ev],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
      communityGroupEvents: [{ groupId: group.id, eventId: ev.id }],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.curated-community-event-count')).toContainText('1 upcoming event')
  })

  test('i18n: curated communities section heading is localized in Slovak', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Slovenská skupina', slug: 'slovenska-skupina' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-sk',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })

    await page.goto('/category/technology')

    await expect(
      page.getByRole('heading', { name: 'Komunity v tomto hube', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Preskúmať komunitu', exact: true })).toBeVisible()
  })

  test('i18n: curated communities section heading is localized in German', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })
    const domain = makeTechDomain()
    const group = makePublicGroup({ name: 'Deutsche Gruppe', slug: 'deutsche-gruppe' })
    const entry: MockDomainCuratedCommunity = {
      id: 'cc-de',
      domainId: domain.id,
      groupId: group.id,
      displayOrder: 0,
      isEnabled: true,
      annotation: null,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [domain],
      events: [],
      communityGroups: [group],
      domainCuratedCommunities: [entry],
    })

    await page.goto('/category/technology')

    await expect(
      page.getByRole('heading', { name: 'Communities in diesem Hub', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Community erkunden', exact: true })).toBeVisible()
  })
})

// ── Scheduled Featured Events on category landing page ──────────────────────

test.describe('Category landing page: scheduled featured events', () => {
  function makeActiveSfe(
    domain: ReturnType<typeof makeTechDomain>,
    event: ReturnType<typeof makeApprovedEvent>,
    overrides: Partial<MockScheduledFeaturedEvent> = {},
  ): MockScheduledFeaturedEvent {
    const now = Date.now()
    return {
      id: 'sfe-1',
      domainId: domain.id,
      eventId: event.id,
      startsAtUtc: new Date(now - 3_600_000).toISOString(), // started 1 h ago
      endsAtUtc: new Date(now + 86_400_000).toISOString(), // ends in 24 h
      priority: 0,
      isEnabled: true,
      displayLabel: null,
      createdAtUtc: new Date().toISOString(),
      createdByUserId: null,
      ...overrides,
    }
  }

  test('shows starred featured section when an active scheduled highlight exists', async ({ page }) => {
    const domain = makeTechDomain()
    const featured = makeApprovedEvent({
      id: 'ev-featured',
      name: 'Blockchain Summit',
      slug: 'blockchain-summit',
      domainId: domain.id,
    })
    setupMockApi(page, {
      domains: [domain],
      events: [featured],
      scheduledFeaturedEvents: [makeActiveSfe(domain, featured)],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.featured-section')).toBeVisible()
    await expect(
      page.locator('.featured-section .event-card', { hasText: 'Blockchain Summit' }),
    ).toBeVisible()
  })

  test('featured event is deduplicated from the regular event grid', async ({ page }) => {
    const domain = makeTechDomain()
    const featured = makeApprovedEvent({
      id: 'ev-featured',
      name: 'Blockchain Summit',
      slug: 'blockchain-summit',
      domainId: domain.id,
    })
    const other = makeApprovedEvent({
      id: 'ev-other',
      name: 'AI Meetup',
      slug: 'ai-meetup',
      domainId: domain.id,
    })
    setupMockApi(page, {
      domains: [domain],
      events: [featured, other],
      scheduledFeaturedEvents: [makeActiveSfe(domain, featured)],
    })

    await page.goto('/category/technology')

    // Featured event appears in the featured section
    await expect(
      page.locator('.featured-section .event-card', { hasText: 'Blockchain Summit' }),
    ).toBeVisible()
    // Featured event does NOT also appear in the regular grid
    await expect(
      page.locator('.events-grid .event-card', { hasText: 'Blockchain Summit' }),
    ).toBeHidden()
    // Other event appears only in the regular grid
    await expect(page.locator('.events-grid .event-card', { hasText: 'AI Meetup' })).toBeVisible()
  })

  test('no featured section when no active schedule and no static featured events', async ({
    page,
  }) => {
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ domainId: domain.id })
    setupMockApi(page, {
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [],
      featuredEvents: [],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.featured-section')).toBeHidden()
  })

  test('expired schedule does not show featured section (no static fallback)', async ({ page }) => {
    const now = Date.now()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ id: 'ev-expired', domainId: domain.id })
    const expiredSfe: MockScheduledFeaturedEvent = {
      id: 'sfe-expired',
      domainId: domain.id,
      eventId: event.id,
      startsAtUtc: new Date(now - 7_200_000).toISOString(), // started 2 h ago
      endsAtUtc: new Date(now - 3_600_000).toISOString(), // ended 1 h ago
      priority: 0,
      isEnabled: true,
      displayLabel: null,
      createdAtUtc: new Date().toISOString(),
      createdByUserId: null,
    }
    setupMockApi(page, {
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [expiredSfe],
      featuredEvents: [],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.featured-section')).toBeHidden()
  })

  test('upcoming (not yet started) schedule does not show featured section', async ({ page }) => {
    const now = Date.now()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ id: 'ev-upcoming', domainId: domain.id })
    const upcomingSfe: MockScheduledFeaturedEvent = {
      id: 'sfe-upcoming',
      domainId: domain.id,
      eventId: event.id,
      startsAtUtc: new Date(now + 3_600_000).toISOString(), // starts in 1 h
      endsAtUtc: new Date(now + 86_400_000).toISOString(), // ends in 24 h
      priority: 0,
      isEnabled: true,
      displayLabel: null,
      createdAtUtc: new Date().toISOString(),
      createdByUserId: null,
    }
    setupMockApi(page, {
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [upcomingSfe],
      featuredEvents: [],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.featured-section')).toBeHidden()
  })

  test('active schedule takes precedence over static featured events', async ({ page }) => {
    const domain = makeTechDomain()
    const scheduled = makeApprovedEvent({
      id: 'ev-scheduled',
      name: 'Scheduled Highlight',
      slug: 'scheduled-highlight',
      domainId: domain.id,
    })
    const staticFeatured = makeApprovedEvent({
      id: 'ev-static',
      name: 'Static Featured',
      slug: 'static-featured',
      domainId: domain.id,
    })
    setupMockApi(page, {
      domains: [domain],
      events: [scheduled, staticFeatured],
      scheduledFeaturedEvents: [makeActiveSfe(domain, scheduled)],
      featuredEvents: [{ domainSlug: domain.slug, eventId: staticFeatured.id, displayOrder: 0 }],
    })

    await page.goto('/category/technology')

    // Scheduled event appears in the featured section
    await expect(
      page.locator('.featured-section .event-card', { hasText: 'Scheduled Highlight' }),
    ).toBeVisible()
    // Static featured event does NOT appear in the featured section (overridden by schedule)
    await expect(
      page.locator('.featured-section .event-card', { hasText: 'Static Featured' }),
    ).toBeHidden()
  })

  test('disabled schedule falls back to static featured events', async ({ page }) => {
    const now = Date.now()
    const domain = makeTechDomain()
    const scheduledEvent = makeApprovedEvent({
      id: 'ev-scheduled',
      name: 'Should Not Feature',
      slug: 'should-not-feature',
      domainId: domain.id,
    })
    const staticEvent = makeApprovedEvent({
      id: 'ev-static',
      name: 'Static Fallback',
      slug: 'static-fallback',
      domainId: domain.id,
    })
    const disabledSfe: MockScheduledFeaturedEvent = {
      id: 'sfe-disabled',
      domainId: domain.id,
      eventId: scheduledEvent.id,
      startsAtUtc: new Date(now - 3_600_000).toISOString(),
      endsAtUtc: new Date(now + 86_400_000).toISOString(),
      priority: 0,
      isEnabled: false,
      displayLabel: null,
      createdAtUtc: new Date().toISOString(),
      createdByUserId: null,
    }
    setupMockApi(page, {
      domains: [domain],
      events: [scheduledEvent, staticEvent],
      scheduledFeaturedEvents: [disabledSfe],
      featuredEvents: [{ domainSlug: domain.slug, eventId: staticEvent.id, displayOrder: 0 }],
    })

    await page.goto('/category/technology')

    // Disabled scheduled event does not appear in the featured section
    await expect(
      page.locator('.featured-section .event-card', { hasText: 'Should Not Feature' }),
    ).toBeHidden()
    // Static fallback is shown instead
    await expect(
      page.locator('.featured-section .event-card', { hasText: 'Static Fallback' }),
    ).toBeVisible()
  })

  test('multiple active schedules rendered in priority order (lower value first)', async ({
    page,
  }) => {
    const now = Date.now()
    const domain = makeTechDomain()
    const ev1 = makeApprovedEvent({
      id: 'ev-prio1',
      name: 'Priority One Event',
      slug: 'prio-one',
      domainId: domain.id,
    })
    const ev0 = makeApprovedEvent({
      id: 'ev-prio0',
      name: 'Priority Zero Event',
      slug: 'prio-zero',
      domainId: domain.id,
    })
    const sfe1: MockScheduledFeaturedEvent = {
      id: 'sfe-prio1',
      domainId: domain.id,
      eventId: ev1.id,
      startsAtUtc: new Date(now - 3_600_000).toISOString(),
      endsAtUtc: new Date(now + 86_400_000).toISOString(),
      priority: 1,
      isEnabled: true,
      displayLabel: null,
      createdAtUtc: new Date().toISOString(),
      createdByUserId: null,
    }
    const sfe0: MockScheduledFeaturedEvent = {
      id: 'sfe-prio0',
      domainId: domain.id,
      eventId: ev0.id,
      startsAtUtc: new Date(now - 3_600_000).toISOString(),
      endsAtUtc: new Date(now + 86_400_000).toISOString(),
      priority: 0,
      isEnabled: true,
      displayLabel: null,
      createdAtUtc: new Date().toISOString(),
      createdByUserId: null,
    }
    setupMockApi(page, {
      domains: [domain],
      events: [ev1, ev0],
      scheduledFeaturedEvents: [sfe1, sfe0], // intentionally out of priority order
    })

    await page.goto('/category/technology')

    const cards = page.locator('.featured-section .event-card')
    await expect(cards).toHaveCount(2)
    // Priority 0 (lower value = higher precedence) appears first
    await expect(cards.nth(0)).toContainText('Priority Zero Event')
    await expect(cards.nth(1)).toContainText('Priority One Event')
  })

  test('featured section heading is localized in Slovak', async ({ page }) => {
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ id: 'ev-sk', domainId: domain.id })
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })
    setupMockApi(page, {
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [makeActiveSfe(domain, event)],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.featured-section')).toBeVisible()
    await expect(page.locator('.featured-title')).toContainText('Odporúčané podujatia')
  })

  test('featured section heading is localized in German', async ({ page }) => {
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ id: 'ev-de', domainId: domain.id })
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })
    setupMockApi(page, {
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [makeActiveSfe(domain, event)],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.featured-section')).toBeVisible()
    await expect(page.locator('.featured-title')).toContainText('Hervorgehobene Veranstaltungen')
  })
})

// ---------------------------------------------------------------------------
// All events in past — category hub edge case
// ---------------------------------------------------------------------------

test.describe('Category landing page: all events in past', () => {
  const pastDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  test('shows all-in-past notice when every hub event has already taken place', async ({
    page,
  }) => {
    const domain = makeTechDomain()
    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Old Tech Summit', slug: 'old-tech-summit', startsAtUtc: pastDate, endsAtUtc: pastDate }),
        makeApprovedEvent({ id: 'e-2', name: 'Old Workshop', slug: 'old-workshop', startsAtUtc: pastDate, endsAtUtc: pastDate }),
      ],
    })
    await page.goto('/category/technology')

    await expect(page.locator('.all-in-past-notice')).toBeVisible()
    await expect(page.locator('.all-in-past-notice')).toContainText(
      'All listed events have already taken place',
    )
  })

  test('does not show all-in-past notice when at least one hub event is upcoming', async ({
    page,
  }) => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const domain = makeTechDomain()
    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({ id: 'e-past', name: 'Old Event', slug: 'old-event', startsAtUtc: pastDate, endsAtUtc: pastDate }),
        makeApprovedEvent({ id: 'e-future', name: 'Upcoming Event', slug: 'upcoming-event', startsAtUtc: futureDate, endsAtUtc: futureDate }),
      ],
    })
    await page.goto('/category/technology')

    await expect(page.locator('.all-in-past-notice')).toBeHidden()
  })

  test('does not show all-in-past notice when hub has no events (uses empty state instead)', async ({
    page,
  }) => {
    setupMockApi(page, { domains: [makeTechDomain()], events: [] })
    await page.goto('/category/technology')

    await expect(page.locator('.all-in-past-notice')).toBeHidden()
    await expect(page.locator('.empty-state')).toBeVisible()
  })

  test('all-in-past notice is accessible: has role status', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Past Hub Event', slug: 'past-hub-event', startsAtUtc: pastDate, endsAtUtc: pastDate }),
      ],
    })
    await page.goto('/category/technology')

    await expect(page.locator('[role="status"].all-in-past-notice')).toBeVisible()
  })

  test('all-in-past notice is visible at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Past Mobile Event', slug: 'past-mobile', startsAtUtc: pastDate, endsAtUtc: pastDate }),
      ],
    })
    await page.goto('/category/technology')

    await expect(page.locator('.all-in-past-notice')).toBeVisible()
  })

  test('i18n: all-in-past notice is localized in Slovak', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-sk', name: 'Past SK Event', slug: 'past-sk', startsAtUtc: pastDate, endsAtUtc: pastDate }),
      ],
    })
    await page.goto('/category/technology')

    await expect(page.locator('.all-in-past-notice')).toBeVisible()
    await expect(page.locator('.all-in-past-notice')).toContainText(
      'Všetky uvedené udalosti sa už uskutočnili',
    )
  })

  test('i18n: all-in-past notice is localized in German', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-de', name: 'Past DE Event', slug: 'past-de', startsAtUtc: pastDate, endsAtUtc: pastDate }),
      ],
    })
    await page.goto('/category/technology')

    await expect(page.locator('.all-in-past-notice')).toBeVisible()
    await expect(page.locator('.all-in-past-notice')).toContainText(
      'Alle aufgeführten Veranstaltungen haben bereits stattgefunden',
    )
  })
})

// ---------------------------------------------------------------------------
// Related hubs — low-signal and empty state discovery guidance
// ---------------------------------------------------------------------------

test.describe('Category landing page: related hubs', () => {
  function makeCryptoDomain(): MockDomain {
    return {
      id: 'dom-crypto',
      name: 'Crypto',
      slug: 'crypto',
      subdomain: 'crypto',
      description: 'Blockchain and crypto events',
      isActive: true,
      createdAtUtc: new Date().toISOString(),
    }
  }

  function makeAiDomain(): MockDomain {
    return {
      id: 'dom-ai',
      name: 'AI & Machine Learning',
      slug: 'ai',
      subdomain: 'ai',
      description: 'Artificial intelligence meetups and talks',
      isActive: true,
      createdAtUtc: new Date().toISOString(),
    }
  }

  test('related hubs section appears when hub has no events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain(), makeAiDomain()],
      events: [],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.related-hubs')).toBeVisible()
  })

  test('related hubs section appears when hub has only 1 event (low-signal)', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [makeApprovedEvent({ id: 'e-only', name: 'Solo Tech Event', slug: 'solo-tech-event' })],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.related-hubs')).toBeVisible()
  })

  test('related hubs section appears when hub has 3 events (at threshold)', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Event A', slug: 'event-a' }),
        makeApprovedEvent({ id: 'e-2', name: 'Event B', slug: 'event-b' }),
        makeApprovedEvent({ id: 'e-3', name: 'Event C', slug: 'event-c' }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.related-hubs')).toBeVisible()
  })

  test('related hubs section is NOT shown when hub has 4 or more events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Event A', slug: 'event-a' }),
        makeApprovedEvent({ id: 'e-2', name: 'Event B', slug: 'event-b' }),
        makeApprovedEvent({ id: 'e-3', name: 'Event C', slug: 'event-c' }),
        makeApprovedEvent({ id: 'e-4', name: 'Event D', slug: 'event-d' }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.related-hubs')).toBeHidden()
  })

  test('related hubs shows other domains, not the current one', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain(), makeAiDomain()],
      events: [],
    })

    await page.goto('/category/technology')

    const relatedSection = page.locator('.related-hubs')
    await expect(relatedSection).toBeVisible()
    // The current hub (Technology) should NOT appear in related hubs
    await expect(relatedSection.locator('.related-hub-name', { hasText: 'Technology' })).toBeHidden()
    // Other hubs should appear
    await expect(relatedSection.locator('.related-hub-name', { hasText: 'Crypto' })).toBeVisible()
    await expect(relatedSection.locator('.related-hub-name', { hasText: 'AI & Machine Learning' })).toBeVisible()
  })

  test('related hub cards link to the correct category page', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [],
    })

    await page.goto('/category/technology')

    const cryptoCard = page.locator('.related-hub-card', { hasText: 'Crypto' })
    await expect(cryptoCard).toBeVisible()
    await expect(cryptoCard).toHaveAttribute('href', '/category/crypto')
  })

  test('clicking a related hub card navigates to that hub page', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [],
    })

    await page.goto('/category/technology')

    await page.locator('.related-hub-card', { hasText: 'Crypto' }).click()

    await expect(page).toHaveURL('/category/crypto')
  })

  test('related hubs section shows title and description', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.related-hubs-title')).toContainText('You might also explore')
    await expect(page.locator('.related-hubs-desc')).toContainText('related community hubs')
  })

  test('related hubs shows at most 3 other hubs', async ({ page }) => {
    setupMockApi(page, {
      domains: [
        makeTechDomain(),
        makeCryptoDomain(),
        makeAiDomain(),
        { id: 'dom-web3', name: 'Web3', slug: 'web3', subdomain: 'web3', description: null, isActive: true, createdAtUtc: new Date().toISOString() } as MockDomain,
        { id: 'dom-defi', name: 'DeFi', slug: 'defi', subdomain: 'defi', description: null, isActive: true, createdAtUtc: new Date().toISOString() } as MockDomain,
      ],
      events: [],
    })

    await page.goto('/category/technology')

    const cards = page.locator('.related-hub-card')
    await expect(cards).toHaveCount(3)
  })

  test('mobile viewport: related hubs section is visible and tappable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.related-hubs')).toBeVisible()
    await expect(page.locator('.related-hub-card', { hasText: 'Crypto' })).toBeVisible()
  })

  test('related hubs is not shown when only one domain exists', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [],
    })

    await page.goto('/category/technology')

    // The empty state shows but no related hubs (no other domains to suggest)
    await expect(page.locator('.empty-state')).toBeVisible()
    await expect(page.locator('.related-hubs')).toBeHidden()
  })

  test('i18n: related hubs title is localized in Slovak', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.related-hubs-title')).toContainText('Možno vás zaujmú aj tieto')
  })

  test('i18n: related hubs title is localized in German', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.related-hubs-title')).toContainText('Das könnte Sie auch interessieren')
  })
})

// ---------------------------------------------------------------------------
// Category hub: featured events first, then ranked non-featured events
// ---------------------------------------------------------------------------

test.describe('Category hub: featured events precede ranked non-featured events', () => {
  test('featured events appear in starred section; non-featured events follow in upcoming order', async ({
    page,
  }) => {
    const domain = makeTechDomain()
    const now = new Date()
    const nearFuture = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()
    const farFuture = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString()
    const past = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()

    const featuredEvent = makeApprovedEvent({
      id: 'feat-1',
      name: 'Featured Keynote',
      slug: 'featured-keynote',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
      startsAtUtc: farFuture,
      endsAtUtc: farFuture,
    })
    const nearUpcoming = makeApprovedEvent({
      id: 'non-feat-near',
      name: 'Near Upcoming Talk',
      slug: 'near-upcoming-talk',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
      startsAtUtc: nearFuture,
      endsAtUtc: nearFuture,
    })
    const pastEvent = makeApprovedEvent({
      id: 'non-feat-past',
      name: 'Past Workshop',
      slug: 'past-workshop',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
      startsAtUtc: past,
      endsAtUtc: past,
    })

    setupMockApi(page, {
      domains: [domain],
      events: [featuredEvent, nearUpcoming, pastEvent],
      featuredEvents: [{ domainSlug: domain.slug, eventId: featuredEvent.id, displayOrder: 0 }],
    })

    await page.goto('/category/technology')

    // Featured section shows the featured event with its badge
    await expect(page.locator('.featured-grid .event-card', { hasText: 'Featured Keynote' })).toBeVisible()
    await expect(page.locator('.featured-badge')).toBeVisible()

    // Non-featured events appear in the main grid in UPCOMING order (nearest first)
    const mainCards = page.locator('.events-grid .event-card')
    // Near-upcoming event appears before the past event
    await expect(mainCards.first()).toContainText('Near Upcoming Talk')
    await expect(mainCards.nth(1)).toContainText('Past Workshop')

    // Rank context badge confirms ordering is explained
    await expect(page.locator('.rank-context-badge')).toBeVisible()
    await expect(page.locator('.rank-context-badge')).toContainText('Ranked by date, quality & engagement')
  })

  test('all-in-past notice appears on category page when all non-featured events are past', async ({
    page,
  }) => {
    const domain = makeTechDomain()
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({
          id: 'old-1',
          name: 'Old Tech Event',
          slug: 'old-tech-event',
          domainId: domain.id,
          domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain },
          startsAtUtc: past,
          endsAtUtc: past,
        }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.event-card', { hasText: 'Old Tech Event' })).toBeVisible()
    await expect(page.locator('.all-in-past-notice')).toBeVisible()
    await expect(page.locator('.all-in-past-action')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Per-event ranking cue badges — explains why individual events surface where they do
// ---------------------------------------------------------------------------

test.describe('Category hub: per-event ranking cue badges', () => {
  test('shows "Upcoming soon" badge on event starting within 7 days', async ({ page }) => {
    const domain = makeTechDomain()
    const inSixDays = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({
          id: 'near-event',
          name: 'Near Future Talk',
          slug: 'near-future-talk',
          startsAtUtc: inSixDays,
          endsAtUtc: inSixDays,
          publishedAtUtc: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.rank-cue-badge--upcoming')).toBeVisible()
    await expect(page.locator('.rank-cue-badge--upcoming')).toContainText('Upcoming soon')
  })

  test('shows "Recently added" badge on event published within 14 days', async ({ page }) => {
    const domain = makeTechDomain()
    const inSixMonths = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({
          id: 'fresh-event',
          name: 'Fresh Conference',
          slug: 'fresh-conference',
          startsAtUtc: inSixMonths,
          endsAtUtc: inSixMonths,
          publishedAtUtc: fiveDaysAgo,
        }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.rank-cue-badge--recent')).toBeVisible()
    await expect(page.locator('.rank-cue-badge--recent')).toContainText('Recently added')
  })

  test('shows "Upcoming soon" (not "Recently added") when event qualifies for both', async ({
    page,
  }) => {
    const domain = makeTechDomain()
    const inFiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({
          id: 'dual-qualify',
          name: 'Dual Qualify Event',
          slug: 'dual-qualify-event',
          startsAtUtc: inFiveDays,
          endsAtUtc: inFiveDays,
          publishedAtUtc: threeDaysAgo,
        }),
      ],
    })

    await page.goto('/category/technology')

    // Only "Upcoming soon" should appear — "Recently added" is suppressed when upcomingSoon applies
    await expect(page.locator('.rank-cue-badge--upcoming')).toBeVisible()
    await expect(page.locator('.rank-cue-badge--recent')).toBeHidden()
  })

  test('no ranking cue badge for past event with old publication date', async ({ page }) => {
    const domain = makeTechDomain()
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({
          id: 'old-event',
          name: 'Old Summit',
          slug: 'old-summit',
          startsAtUtc: twoMonthsAgo,
          endsAtUtc: twoMonthsAgo,
          publishedAtUtc: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.rank-cue-badge--upcoming')).toBeHidden()
    await expect(page.locator('.rank-cue-badge--recent')).toBeHidden()
  })

  test('no ranking cue badge for far-future event with old publication date', async ({ page }) => {
    const domain = makeTechDomain()
    const inOneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({
          id: 'far-future',
          name: 'Far Future Event',
          slug: 'far-future-event',
          startsAtUtc: inOneYear,
          endsAtUtc: inOneYear,
          publishedAtUtc: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.rank-cue-badge--upcoming')).toBeHidden()
    await expect(page.locator('.rank-cue-badge--recent')).toBeHidden()
  })

  test('mobile viewport: ranking cue badge is visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const domain = makeTechDomain()
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({
          id: 'mobile-near',
          name: 'Mobile Near Event',
          slug: 'mobile-near-event',
          startsAtUtc: inThreeDays,
          endsAtUtc: inThreeDays,
        }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.rank-cue-badge--upcoming')).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Mobile Near Event' })).toBeVisible()
  })

  test('i18n: ranking cue badges are localized in Slovak', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_locale', 'sk'))
    const domain = makeTechDomain()
    const inFourDays = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({
          id: 'sk-near',
          name: 'Slovak Near Event',
          slug: 'slovak-near-event',
          startsAtUtc: inFourDays,
          endsAtUtc: inFourDays,
        }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.rank-cue-badge--upcoming')).toBeVisible()
    await expect(page.locator('.rank-cue-badge--upcoming')).toContainText('Čoskoro')
  })

  test('i18n: "Recently added" cue is localized in German', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_locale', 'de'))
    const domain = makeTechDomain()
    const inSixMonths = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({
          id: 'de-fresh',
          name: 'German Fresh Event',
          slug: 'german-fresh-event',
          startsAtUtc: inSixMonths,
          endsAtUtc: inSixMonths,
          publishedAtUtc: threeDaysAgo,
        }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.rank-cue-badge--recent')).toBeVisible()
    await expect(page.locator('.rank-cue-badge--recent')).toContainText('Neu hinzugefügt')
  })

  test('multiple events: each shows appropriate cue independently', async ({ page }) => {
    const domain = makeTechDomain()
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    const inSixMonths = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()
    const oldPublication = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const recentPublication = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({
          id: 'near-1',
          name: 'Upcoming Event',
          slug: 'upcoming-event',
          startsAtUtc: inThreeDays,
          endsAtUtc: inThreeDays,
          publishedAtUtc: oldPublication,
        }),
        makeApprovedEvent({
          id: 'fresh-1',
          name: 'Fresh Event',
          slug: 'fresh-event',
          startsAtUtc: inSixMonths,
          endsAtUtc: inSixMonths,
          publishedAtUtc: recentPublication,
        }),
        makeApprovedEvent({
          id: 'plain-1',
          name: 'Plain Event',
          slug: 'plain-event',
          startsAtUtc: inSixMonths,
          endsAtUtc: inSixMonths,
          publishedAtUtc: oldPublication,
        }),
      ],
    })

    await page.goto('/category/technology')

    // One "Upcoming soon" badge and one "Recently added" badge
    await expect(page.locator('.rank-cue-badge--upcoming')).toHaveCount(1)
    await expect(page.locator('.rank-cue-badge--recent')).toHaveCount(1)
    // The plain event has no badge
    const eventCardWraps = page.locator('.event-card-wrap')
    await expect(eventCardWraps).toHaveCount(3)
  })

  test('server-provided rankingCue drives the badge over local date heuristics', async ({
    page,
  }) => {
    // The event's own dates (far-future start, old publication) would locally compute to
    // NO cue. The server-provided rankingCue must take precedence so ranking stays
    // consistent with the API instead of being reproduced on the client.
    const domain = makeTechDomain()
    const inOneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    const longAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({
          id: 'server-cue',
          name: 'Server Cue Event',
          slug: 'server-cue-event',
          startsAtUtc: inOneYear,
          endsAtUtc: inOneYear,
          publishedAtUtc: longAgo,
          rankingCue: 'UPCOMING_SOON',
        }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.rank-cue-badge--upcoming')).toBeVisible()
    await expect(page.locator('.rank-cue-badge--upcoming')).toContainText('Upcoming soon')
  })
})

// ---------------------------------------------------------------------------
// Category hub: domain-fit ranking — primary domain before secondary-tagged events
// ---------------------------------------------------------------------------

test.describe('Category hub: domain-fit ranking', () => {
  test('primary-domain event appears before secondary-tagged event on hub page', async ({
    page,
  }) => {
    const sameStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const techDomain = makeTechDomain()
    const cryptoDomain = { ...makeTechDomain(), id: 'dom-crypto', name: 'Crypto', slug: 'crypto', subdomain: 'crypto' }

    // Event A: primary domain = technology (sparse metadata)
    const primaryEvent = makeApprovedEvent({
      id: 'e-primary',
      name: 'Primary Tech Talk',
      slug: 'primary-tech-talk',
      startsAtUtc: sameStart,
      endsAtUtc: sameStart,
      venueName: '',
      city: '',
      eventUrl: '',
    })

    // Event B: primary domain = crypto, but tagged with technology (rich metadata)
    const taggedEvent = makeApprovedEvent({
      id: 'e-tagged',
      name: 'Tagged Crypto Talk',
      slug: 'tagged-crypto-talk',
      startsAtUtc: sameStart,
      endsAtUtc: sameStart,
      domainId: cryptoDomain.id,
      domain: { id: cryptoDomain.id, name: cryptoDomain.name, slug: cryptoDomain.slug, subdomain: cryptoDomain.subdomain },
      venueName: 'Crypto HQ',
      city: 'Prague',
      eventUrl: 'https://crypto.example.com',
      eventTags: [{ id: 'tag-1', domain: { id: techDomain.id, name: techDomain.name, slug: techDomain.slug, subdomain: techDomain.subdomain } }],
    })

    setupMockApi(page, {
      domains: [techDomain, cryptoDomain],
      events: [taggedEvent, primaryEvent], // intentionally reversed to verify sort
    })

    await page.goto('/category/technology')

    const cards = page.locator('.event-card')
    await expect(cards).toHaveCount(2)
    // Primary-domain event must appear first despite having less metadata
    await expect(cards.nth(0)).toContainText('Primary Tech Talk')
    await expect(cards.nth(1)).toContainText('Tagged Crypto Talk')
  })

  test('without domain filter, events are ranked purely by date regardless of domain', async ({
    page,
  }) => {
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    const later = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    const techDomain = makeTechDomain()
    const cryptoDomain = { ...makeTechDomain(), id: 'dom-crypto', name: 'Crypto', slug: 'crypto', subdomain: 'crypto' }

    setupMockApi(page, {
      domains: [techDomain, cryptoDomain],
      events: [
        makeApprovedEvent({
          id: 'e-tech-soon',
          name: 'Tech Meetup Soon',
          slug: 'tech-meetup-soon',
          startsAtUtc: soon,
          endsAtUtc: soon,
          domainId: techDomain.id,
          domain: { id: techDomain.id, name: techDomain.name, slug: techDomain.slug, subdomain: techDomain.subdomain },
        }),
        makeApprovedEvent({
          id: 'e-crypto-later',
          name: 'Crypto Summit Later',
          slug: 'crypto-summit-later',
          startsAtUtc: later,
          endsAtUtc: later,
          domainId: cryptoDomain.id,
          domain: { id: cryptoDomain.id, name: cryptoDomain.name, slug: cryptoDomain.slug, subdomain: cryptoDomain.subdomain },
        }),
      ],
    })

    // Visit tech hub — only tech event visible, correct order
    await page.goto('/category/technology')
    await expect(page.locator('.event-card')).toHaveCount(1)
    await expect(page.locator('.event-card').nth(0)).toContainText('Tech Meetup Soon')
  })

  test('mobile viewport: primary domain event appears first on hub page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const sameStart = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    const techDomain = makeTechDomain()
    const cryptoDomain = { ...makeTechDomain(), id: 'dom-crypto2', name: 'Crypto', slug: 'crypto2', subdomain: 'crypto2' }

    const primaryEvent = makeApprovedEvent({
      id: 'e-primary-m',
      name: 'Mobile Primary Tech',
      slug: 'mobile-primary-tech',
      startsAtUtc: sameStart,
      endsAtUtc: sameStart,
      venueName: '',
      city: '',
      eventUrl: '',
    })
    const taggedEvent = makeApprovedEvent({
      id: 'e-tagged-m',
      name: 'Mobile Tagged Crypto',
      slug: 'mobile-tagged-crypto',
      startsAtUtc: sameStart,
      endsAtUtc: sameStart,
      domainId: cryptoDomain.id,
      domain: { id: cryptoDomain.id, name: cryptoDomain.name, slug: cryptoDomain.slug, subdomain: cryptoDomain.subdomain },
      venueName: 'Crypto Hall',
      city: 'Brno',
      eventUrl: 'https://crypto2.example.com',
      eventTags: [{ id: 'tag-2', domain: { id: techDomain.id, name: techDomain.name, slug: techDomain.slug, subdomain: techDomain.subdomain } }],
    })

    setupMockApi(page, {
      domains: [techDomain, cryptoDomain],
      events: [taggedEvent, primaryEvent],
    })

    await page.goto('/category/technology')
    const cards = page.locator('.event-card')
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(0)).toContainText('Mobile Primary Tech')
    await expect(cards.nth(1)).toContainText('Mobile Tagged Crypto')
  })
})

// ---------------------------------------------------------------------------
// Category hub: hub-specific low-signal copy
// ---------------------------------------------------------------------------

test.describe('Category hub: hub-specific low-signal copy', () => {
  test('hub low-signal notice shows hub-specific message (not generic filter message)', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-solo', name: 'Solo Tech Event', slug: 'solo-tech-event' })],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.low-signal-notice')).toBeVisible()
    // Hub-specific message should mention "hub" — not "filters"
    await expect(page.locator('.low-signal-notice')).toContainText('hub')
    await expect(page.locator('.low-signal-notice')).not.toContainText('filter')
  })

  test('hub low-signal notice with 2 events shows plural hub-specific message', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-a', name: 'Event Alpha', slug: 'event-alpha' }),
        makeApprovedEvent({ id: 'e-b', name: 'Event Beta', slug: 'event-beta' }),
      ],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.low-signal-notice')).toBeVisible()
    await expect(page.locator('.low-signal-notice')).toContainText('2')
    await expect(page.locator('.low-signal-notice')).toContainText('hub')
  })

  test('i18n: hub low-signal notice is localized in Slovak', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_locale', 'sk'))

    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-sk', name: 'Slovak Hub Event', slug: 'slovak-hub-event' })],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.low-signal-notice')).toBeVisible()
    // Slovak text should include "hub" (lowercase, as in the Slovak translation)
    await expect(page.locator('.low-signal-notice')).toContainText('hub')
    // Should NOT contain English-only phrasing
    await expect(page.locator('.low-signal-notice')).not.toContainText('still growing')
  })

  test('i18n: hub low-signal notice is localized in German', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_locale', 'de'))

    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-de', name: 'German Hub Event', slug: 'german-hub-event' })],
    })

    await page.goto('/category/technology')

    await expect(page.locator('.low-signal-notice')).toBeVisible()
    // German text should include Hub
    await expect(page.locator('.low-signal-notice')).toContainText('Hub')
    await expect(page.locator('.low-signal-notice')).not.toContainText('still growing')
  })
})
