/**
 * Login and sign-up page tests.
 */
import { expect, test } from '@playwright/test'
import { loginAs, makeAdminUser, setupMockApi } from './helpers/mock-api'

test.describe('Login page', () => {
  test('renders the sign-in form by default', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
    // Full Name field should NOT be visible on login mode
    await expect(page.getByLabel('Full Name')).toBeHidden()
  })

  test('toggles to sign-up form', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/login')

    await page.getByRole('button', { name: 'Sign Up' }).click()

    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
    await expect(page.getByLabel('Full Name')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible()
  })

  test('toggles back to sign-in from sign-up', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/login')

    await page.getByRole('button', { name: 'Sign Up' }).click()
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.getByLabel('Full Name')).toBeHidden()
  })

  test('shows error message for invalid credentials', async ({ page }) => {
    setupMockApi(page, { users: [makeAdminUser()] })
    await page.goto('/login')

    await page.getByLabel('Email').fill('admin@example.com')
    await page.getByLabel('Password').fill('wrong-password')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('alert')).toBeVisible()
  })

  test('successful login redirects to dashboard', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, { users: [admin] })
    await page.goto('/login')

    await page.getByLabel('Email').fill(admin.email)
    await page.getByLabel('Password').fill(admin.password)
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('successful signup redirects to dashboard', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/login')

    await page.getByRole('button', { name: 'Sign Up' }).click()
    await page.getByLabel('Full Name').fill('New User')
    await page.getByLabel('Email').fill('new@example.com')
    await page.getByLabel('Password').fill('NewPass123!')
    await page.getByRole('button', { name: 'Create Account' }).click()

    await expect(page).toHaveURL(/\/dashboard$/)
  })
})

test.describe('Dashboard', () => {
  test('shows sign-in prompt when not logged in', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/dashboard')

    await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Log In' })).toBeVisible()
  })

  test('shows welcome message when logged in', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, { users: [admin] })
    await loginAs(page, admin)

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText(`Welcome back, ${admin.name}`)).toBeVisible()
  })
})

test.describe('Admin panel', () => {
  test('shows access-required prompt when not admin', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/admin')

    await expect(page.getByRole('heading', { name: 'Admin access required' })).toBeVisible()
  })

  test('shows events and categories tabs when admin', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, { users: [admin] })
    await loginAs(page, admin)
    await page.goto('/admin')

    await expect(page.getByRole('button', { name: /Events/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Categories/ })).toBeVisible()
  })
})
