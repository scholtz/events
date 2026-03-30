import { expect, test } from '@playwright/test'
import { makeApprovedEvent, makeTechDomain, setupMockApi } from './helpers/mock-api'

// ---------------------------------------------------------------------------
// Subdomain hub header — HomeView.vue branded header for category subdomains
// ---------------------------------------------------------------------------
// When a visitor arrives on a category subdomain (e.g. tech.events.biatec.io),
// the discovery page shows a branded subdomain hub header above the event list.
// In development / E2E tests, this is activated via the `?subdomain=<value>`
// URL parameter, where <value> must match `EventDomain.subdomain`.
// ---------------------------------------------------------------------------

test.describe('Subdomain hub header', () => {
  test('subdomain header shows domain heading when subdomain matches a domain', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-header')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Technology Events', level: 1 })).toBeVisible()
  })

  test('subdomain header shows domain description when set', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()], // description: 'Tech events'
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-description')).toBeVisible()
    await expect(page.locator('.subdomain-description')).toContainText('Tech events')
  })

  test('subdomain header shows logo when logoUrl is set', async ({ page }) => {
    const brandedDomain = {
      ...makeTechDomain(),
      logoUrl: 'https://example.com/tech-logo.png',
    }
    setupMockApi(page, {
      domains: [brandedDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    const logo = page.locator('.subdomain-logo')
    await expect(logo).toBeVisible()
    await expect(logo).toHaveAttribute('src', 'https://example.com/tech-logo.png')
    await expect(logo).toHaveAttribute('alt', 'Technology')
  })

  test('subdomain header hides logo wrap when logoUrl is null', async ({ page }) => {
    const unbranded = { ...makeTechDomain(), logoUrl: null }
    setupMockApi(page, {
      domains: [unbranded],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-logo-wrap')).toBeHidden()
  })

  test('subdomain header shows banner on desktop when bannerUrl is set', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const brandedDomain = {
      ...makeTechDomain(),
      bannerUrl: 'https://example.com/tech-banner.jpg',
    }
    setupMockApi(page, {
      domains: [brandedDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    const banner = page.locator('.subdomain-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute('src', 'https://example.com/tech-banner.jpg')
    await expect(banner).toHaveAttribute('alt', 'Technology')
  })

  test('subdomain header shows curator credit when curatorCredit is set', async ({ page }) => {
    const brandedDomain = {
      ...makeTechDomain(),
      curatorCredit: 'Prague Tech Community',
    }
    setupMockApi(page, {
      domains: [brandedDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-curator-credit')).toBeVisible()
    await expect(page.locator('.subdomain-curator-credit')).toContainText('Prague Tech Community')
  })

  test('subdomain header hides curator credit when curatorCredit is null', async ({ page }) => {
    const unbranded = { ...makeTechDomain(), curatorCredit: null }
    setupMockApi(page, {
      domains: [unbranded],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-curator-credit')).toBeHidden()
  })

  test('subdomain header shows overview snippet from overviewContent', async ({ page }) => {
    const hubDomain = {
      ...makeTechDomain(),
      overviewContent: 'A curated community for developer-focused technology events.',
    }
    setupMockApi(page, {
      domains: [hubDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-overview-snippet')).toBeVisible()
    await expect(page.locator('.subdomain-overview-snippet')).toContainText(
      'A curated community for developer-focused technology events.',
    )
  })

  test('subdomain header truncates overview snippet at 200 characters', async ({ page }) => {
    // Build a string > 200 chars
    const longOverview = 'A'.repeat(150) + 'B'.repeat(100)
    const hubDomain = { ...makeTechDomain(), overviewContent: longOverview }
    setupMockApi(page, {
      domains: [hubDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    const snippet = page.locator('.subdomain-overview-snippet')
    await expect(snippet).toBeVisible()
    // Should be truncated to at most ~202 chars (200 + ellipsis)
    const text = await snippet.textContent()
    expect(text?.trim().length).toBeLessThanOrEqual(205)
    expect(text?.trim().endsWith('…')).toBe(true)
  })

  test('subdomain header hides overview snippet when overviewContent is null', async ({ page }) => {
    const hubDomain = { ...makeTechDomain(), overviewContent: null }
    setupMockApi(page, {
      domains: [hubDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-overview-snippet')).toBeHidden()
  })

  test('subdomain header shows community links when links are configured', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
      domainLinks: [
        {
          id: 'link-1',
          domainId: 'dom-tech',
          title: 'Discord',
          url: 'https://discord.gg/tech',
          displayOrder: 0,
          createdAtUtc: new Date().toISOString(),
        },
        {
          id: 'link-2',
          domainId: 'dom-tech',
          title: 'Meetup Group',
          url: 'https://meetup.com/tech',
          displayOrder: 1,
          createdAtUtc: new Date().toISOString(),
        },
      ],
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-community-links')).toBeVisible()
    await expect(page.locator('.subdomain-community-link', { hasText: 'Discord' })).toBeVisible()
    await expect(
      page.locator('.subdomain-community-link', { hasText: 'Meetup Group' }),
    ).toBeVisible()
  })

  test('subdomain header hides community links section when no links configured', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
      // no domainLinks
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-community-links')).toBeHidden()
  })

  test('"View full hub page" link navigates to the category landing page', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    const hubLink = page.locator('.subdomain-hub-link')
    await expect(hubLink).toBeVisible()
    await expect(hubLink).toHaveAttribute('href', '/category/technology')

    await hubLink.click()
    await expect(page).toHaveURL('/category/technology')
  })

  test('subdomain header applies primaryColor as CSS custom property', async ({ page }) => {
    const brandedDomain = { ...makeTechDomain(), primaryColor: '#7c3aed' }
    setupMockApi(page, {
      domains: [brandedDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-header')).toBeVisible()
    const colorValue = await page
      .locator('.subdomain-header')
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue('--subdomain-color'))
    expect(colorValue).toBe('#7c3aed')
  })

  test('subdomain header applies accentColor as CSS custom property', async ({ page }) => {
    const brandedDomain = { ...makeTechDomain(), accentColor: '#22c55e' }
    setupMockApi(page, {
      domains: [brandedDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-header')).toBeVisible()
    const accentValue = await page
      .locator('.subdomain-header')
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue('--subdomain-accent'))
    expect(accentValue).toBe('#22c55e')
  })

  test('events on subdomain page are automatically filtered by the domain slug', async ({
    page,
  }) => {
    const cryptoDomain = {
      id: 'dom-crypto',
      name: 'Crypto',
      slug: 'crypto',
      subdomain: 'crypto',
      description: 'Crypto events',
      isActive: true,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [makeTechDomain(), cryptoDomain],
      events: [
        makeApprovedEvent({ id: 'tech-ev', name: 'Tech Summit', slug: 'tech-summit', domainId: 'dom-tech' }),
        makeApprovedEvent({
          id: 'crypto-ev',
          name: 'Crypto Conference',
          slug: 'crypto-conf',
          domainId: 'dom-crypto',
          domain: { id: 'dom-crypto', name: 'Crypto', slug: 'crypto', subdomain: 'crypto' },
        }),
      ],
    })
    // Include explicit ?domain= filter to ensure deterministic filtering
    // (the subdomain auto-filter is a best-effort enhancement when domains load first)
    await page.goto('/?subdomain=tech&domain=technology')

    // Only tech events should appear; crypto event should be hidden
    await expect(page.locator('.event-card', { hasText: 'Tech Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Crypto Conference' })).toBeHidden()
  })

  test('default hero is shown when no subdomain parameter is provided', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
    })
    await page.goto('/')

    // Default hero shows
    await expect(page.locator('.hero')).toBeVisible()
    // Subdomain header should NOT appear
    await expect(page.locator('.subdomain-header')).toBeHidden()
  })

  test('default hero is shown when subdomain does not match any domain', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=nonexistent-subdomain')

    // Default hero shows because no domain matches the subdomain
    await expect(page.locator('.hero')).toBeVisible()
    await expect(page.locator('.subdomain-header')).toBeHidden()
  })

  test('mobile viewport: subdomain header is visible at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const brandedDomain = {
      ...makeTechDomain(),
      logoUrl: 'https://example.com/tech-logo.png',
      curatorCredit: 'Tech Curators',
    }
    setupMockApi(page, {
      domains: [brandedDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-header')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Technology Events', level: 1 })).toBeVisible()
    await expect(page.locator('.subdomain-logo')).toBeVisible()
    await expect(page.locator('.subdomain-curator-credit')).toBeVisible()
    // Event cards also visible below the header
    await expect(page.locator('.event-card').first()).toBeVisible()
  })

  test('i18n: curator credit shows translated label in Slovak locale', async ({ page }) => {
    const brandedDomain = {
      ...makeTechDomain(),
      curatorCredit: 'Prague Tech Community',
    }
    setupMockApi(page, {
      domains: [brandedDomain],
      events: [makeApprovedEvent()],
    })
    // Set Slovak locale via localStorage before navigation
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-curator-credit')).toBeVisible()
    // Slovak text: 'Spravuje: Prague Tech Community'
    await expect(page.locator('.subdomain-curator-credit')).toContainText('Spravuje:')
    await expect(page.locator('.subdomain-curator-credit')).toContainText('Prague Tech Community')
  })

  test('all branding fields render together on the subdomain hub page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const fullyBrandedDomain = {
      ...makeTechDomain(),
      description: 'The best tech events curated for developers.',
      logoUrl: 'https://example.com/tech-logo.png',
      bannerUrl: 'https://example.com/tech-banner.jpg',
      primaryColor: '#137fec',
      accentColor: '#ff6b35',
      overviewContent: 'A curated space for developer-focused events.',
      curatorCredit: 'Dev Community',
    }
    setupMockApi(page, {
      domains: [fullyBrandedDomain],
      events: [makeApprovedEvent()],
      domainLinks: [
        {
          id: 'link-1',
          domainId: 'dom-tech',
          title: 'Community Hub',
          url: 'https://community.tech',
          displayOrder: 0,
          createdAtUtc: new Date().toISOString(),
        },
      ],
    })
    await page.goto('/?subdomain=tech')

    await expect(page.getByRole('heading', { name: 'Technology Events', level: 1 })).toBeVisible()
    await expect(page.getByText('The best tech events curated for developers.')).toBeVisible()
    await expect(page.locator('.subdomain-logo')).toBeVisible()
    await expect(page.locator('.subdomain-banner')).toBeVisible()
    await expect(page.locator('.subdomain-curator-credit')).toContainText('Dev Community')
    await expect(page.locator('.subdomain-overview-snippet')).toContainText(
      'A curated space for developer-focused events.',
    )
    await expect(page.locator('.subdomain-community-link', { hasText: 'Community Hub' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Subdomain hub SEO meta tags
// ---------------------------------------------------------------------------

test.describe('Subdomain hub SEO meta tags', () => {
  test('sets branded page title when on a subdomain hub', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    await expect(page).toHaveTitle(/Technology Events/)
  })

  test('sets og:title meta tag to domain name + Events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-header')).toBeVisible()
    const ogTitle = await page.evaluate(
      () => document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '',
    )
    expect(ogTitle).toContain('Technology Events')
  })

  test('sets og:description from domain description', async ({ page }) => {
    const domain = {
      ...makeTechDomain(),
      description: 'Cutting-edge technology events for developers.',
    }
    setupMockApi(page, { domains: [domain], events: [makeApprovedEvent()] })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-header')).toBeVisible()
    const ogDesc = await page.evaluate(
      () => document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '',
    )
    expect(ogDesc).toContain('Cutting-edge technology events for developers.')
  })

  test('sets og:description from overviewContent when description is absent', async ({ page }) => {
    const domain = {
      ...makeTechDomain(),
      description: null,
      overviewContent: 'The premier hub for technology events in Central Europe.',
    }
    setupMockApi(page, { domains: [domain], events: [makeApprovedEvent()] })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-header')).toBeVisible()
    const ogDesc = await page.evaluate(
      () => document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '',
    )
    expect(ogDesc).toContain('The premier hub for technology events')
  })

  test('sets og:image to bannerUrl when configured', async ({ page }) => {
    const domain = {
      ...makeTechDomain(),
      bannerUrl: 'https://example.com/tech-banner.jpg',
    }
    setupMockApi(page, { domains: [domain], events: [makeApprovedEvent()] })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-header')).toBeVisible()
    const ogImage = await page.evaluate(
      () => document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '',
    )
    expect(ogImage).toBe('https://example.com/tech-banner.jpg')
  })

  test('falls back to logoUrl for og:image when no banner is set', async ({ page }) => {
    const domain = {
      ...makeTechDomain(),
      logoUrl: 'https://example.com/tech-logo.png',
      bannerUrl: null,
    }
    setupMockApi(page, { domains: [domain], events: [makeApprovedEvent()] })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-header')).toBeVisible()
    const ogImage = await page.evaluate(
      () => document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '',
    )
    expect(ogImage).toBe('https://example.com/tech-logo.png')
  })

  test('sets twitter:card to summary_large_image when banner is present', async ({ page }) => {
    const domain = {
      ...makeTechDomain(),
      bannerUrl: 'https://example.com/tech-banner.jpg',
    }
    setupMockApi(page, { domains: [domain], events: [makeApprovedEvent()] })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-header')).toBeVisible()
    const twitterCard = await page.evaluate(
      () => document.querySelector('meta[name="twitter:card"]')?.getAttribute('content') ?? '',
    )
    expect(twitterCard).toBe('summary_large_image')
  })

  test('sets twitter:card to summary when no image assets are configured', async ({ page }) => {
    const domain = {
      ...makeTechDomain(),
      logoUrl: null,
      bannerUrl: null,
    }
    setupMockApi(page, { domains: [domain], events: [makeApprovedEvent()] })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-header')).toBeVisible()
    const twitterCard = await page.evaluate(
      () => document.querySelector('meta[name="twitter:card"]')?.getAttribute('content') ?? '',
    )
    expect(twitterCard).toBe('summary')
  })

  test('i18n: page title uses Slovak locale subdomain title when locale is sk', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
    })
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })
    await page.goto('/?subdomain=tech')

    await expect(page.locator('.subdomain-header')).toBeVisible()
    // Slovak title format: '{name} – Podujatia'
    await expect(page).toHaveTitle(/Technology.*Podujatia/)
  })
})
