import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeAdminUser,
  makeTechDomain,
  loginAs,
} from './helpers/mock-api'
import type { MockDomainAdministrator } from './helpers/mock-api'

test.describe('Domain admin management', () => {
  test('admin sees Manage button on domains tab', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, { users: [admin], domains: [makeTechDomain()] })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Domains/ }).click()
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

    await page.getByRole('button', { name: /Domains/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    // Style form is visible
    await expect(page.getByRole('heading', { name: 'Tag Style' })).toBeVisible()
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
    await expect(page.getByRole('button', { name: /Domains/ })).toBeVisible()
    await page.getByRole('button', { name: /Domains/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    // Wait for the admin form to be visible
    await expect(page.getByRole('heading', { name: 'Tag Administrators' })).toBeVisible()

    // Select user from dropdown and add
    const select = page.locator('.add-admin-form select')
    await expect(select).toBeVisible()
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

    await page.getByRole('button', { name: /Domains/ }).click()
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

    await page.getByRole('button', { name: /Domains/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()

    // Fill style form
    await page.locator('input[placeholder="#137fec"]').fill('#ff5500')
    await page.locator('input[placeholder="#ff5500"]').fill('#0055ff')
    await page.getByRole('button', { name: 'Save Style' }).click()

    // Success indicator
    await expect(page.getByText('✓ Saved')).toBeVisible()
  })

  test('closing domain detail hides the panel', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, { users: [admin], domains: [makeTechDomain()] })
    await loginAs(page, admin)
    await page.goto('/admin')

    await page.getByRole('button', { name: /Domains/ }).click()
    await page.getByRole('button', { name: 'Manage' }).click()
    await expect(page.getByRole('heading', { name: 'Tag Style' })).toBeVisible()

    // Click Close
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('heading', { name: 'Tag Style' })).toBeHidden()
  })
})
