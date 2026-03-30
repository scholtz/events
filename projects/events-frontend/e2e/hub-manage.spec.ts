import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeAdminUser,
  makeContributorUser,
  makeTechDomain,
  makeApprovedEvent,
  loginAs,
} from './helpers/mock-api'
import type { MockDomainAdministrator } from './helpers/mock-api'

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
    await expect(page.getByRole('heading', { name: 'Featured Events' })).toBeVisible()
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
    await expect(page.getByRole('heading', { name: 'Featured Events' })).toBeVisible()

    // Wait for the event picker to populate, then select
    await expect(page.locator('.hub-featured-select option', { hasText: 'Prague Tech Summit' })).toBeAttached()
    await page.selectOption('.hub-featured-select', { label: 'Prague Tech Summit' })
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
})
