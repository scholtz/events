/**
 * Shared GraphQL API mock for Playwright tests.
 *
 * Usage:
 *   import { setupMockApi } from './helpers/mock-api'
 *   test('my test', async ({ page }) => {
 *     const state = setupMockApi(page)
 *     state.domains.push(makeTechDomain())
 *     state.events.push(makeApprovedEvent())
 *     await page.goto('/')
 *   })
 */

import type { Page } from '@playwright/test'

export type MockUser = {
  id: string
  email: string
  password: string
  displayName: string
  role: 'CONTRIBUTOR' | 'ADMIN'
  createdAtUtc: string
}

export type MockDomain = {
  id: string
  name: string
  slug: string
  subdomain: string
  description: string | null
  isActive: boolean
  createdAtUtc: string
}

export type MockEvent = {
  id: string
  name: string
  slug: string
  description: string
  eventUrl: string
  venueName: string
  addressLine1: string
  city: string
  countryCode: string
  latitude: number
  longitude: number
  startsAtUtc: string
  endsAtUtc: string
  submittedAtUtc: string
  updatedAtUtc: string
  publishedAtUtc: string | null
  adminNotes: string | null
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'REJECTED'
  domainId: string
  domain: { id: string; name: string; slug: string }
  submittedByUserId: string
  submittedBy: { displayName: string }
  reviewedByUserId: string | null
  reviewedBy: { displayName: string } | null
  mapUrl: string
}

export type MockState = {
  users: MockUser[]
  domains: MockDomain[]
  events: MockEvent[]
  currentUserId: string | null
  currentToken: string | null
}

/**
 * Registers page.route() handlers that intercept all GraphQL API calls
 * and delegate to an in-memory state object.  Returns the mutable state
 * so individual tests can seed data before navigating.
 */
export function setupMockApi(page: Page, initial?: Partial<MockState>): MockState {
  const state: MockState = {
    users: initial?.users ?? [],
    domains: initial?.domains ?? [],
    events: initial?.events ?? [],
    currentUserId: initial?.currentUserId ?? null,
    currentToken: initial?.currentToken ?? null,
  }

  page.route('**/graphql', async (route) => {
    const request = route.request()
    const method = request.method()

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 200, body: '{}' })
      return
    }

    if (method !== 'POST') {
      await route.fulfill({ status: 405, body: '{}' })
      return
    }

    const body = JSON.parse(request.postData() || '{}')
    const query: string = body.query || ''
    const variables = body.variables || {}

    // Check auth from token
    const authHeader = request.headers()['authorization'] || ''
    const token = authHeader.replace('Bearer ', '')
    if (token && token.startsWith('token-')) {
      const userId = token.replace('token-', '')
      const user = state.users.find((u) => u.id === userId)
      if (user) state.currentUserId = user.id
    }

    // ── Mutations ──
    if (query.includes('mutation') && query.includes('Login')) {
      const input = variables.input || {}
      const matched = state.users.find(
        (u) => u.email === input.email && u.password === input.password,
      )
      if (!matched) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Invalid login credentials' }] }),
        })
        return
      }
      state.currentUserId = matched.id
      state.currentToken = `token-${matched.id}`
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            login: {
              token: state.currentToken,
              expiresAtUtc: new Date(Date.now() + 7200000).toISOString(),
              user: {
                id: matched.id,
                displayName: matched.displayName,
                email: matched.email,
                role: matched.role,
                createdAtUtc: matched.createdAtUtc,
              },
            },
          },
        }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('Register')) {
      const input = variables.input || {}
      const id = `user-${state.users.length + 1}`
      const newUser: MockUser = {
        id,
        email: input.email,
        password: input.password,
        displayName: input.displayName,
        role: 'CONTRIBUTOR',
        createdAtUtc: new Date().toISOString(),
      }
      state.users.push(newUser)
      state.currentUserId = id
      state.currentToken = `token-${id}`
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            registerUser: {
              token: state.currentToken,
              expiresAtUtc: new Date(Date.now() + 7200000).toISOString(),
              user: {
                id: newUser.id,
                displayName: newUser.displayName,
                email: newUser.email,
                role: newUser.role,
                createdAtUtc: newUser.createdAtUtc,
              },
            },
          },
        }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('SubmitEvent')) {
      const input = variables.input || {}
      const slug = input.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
      const domain = state.domains.find((d) => d.slug === input.domainSlug)
      const submitter = state.users.find((u) => u.id === state.currentUserId)
      const newEvent: MockEvent = {
        id: `event-${state.events.length + 1}`,
        name: input.name,
        slug,
        description: input.description,
        eventUrl: input.eventUrl,
        venueName: input.venueName || '',
        addressLine1: input.addressLine1 || '',
        city: input.city || '',
        countryCode: input.countryCode || 'CZ',
        latitude: input.latitude || 0,
        longitude: input.longitude || 0,
        startsAtUtc: input.startsAtUtc,
        endsAtUtc: input.endsAtUtc || input.startsAtUtc,
        submittedAtUtc: new Date().toISOString(),
        updatedAtUtc: new Date().toISOString(),
        publishedAtUtc: null,
        adminNotes: null,
        status: 'PENDING_APPROVAL',
        domainId: domain?.id ?? 'dom-1',
        domain: domain
          ? { id: domain.id, name: domain.name, slug: domain.slug }
          : { id: 'dom-1', name: 'Default', slug: 'default' },
        submittedByUserId: state.currentUserId ?? '',
        submittedBy: { displayName: submitter?.displayName ?? 'Unknown' },
        reviewedByUserId: null,
        reviewedBy: null,
        mapUrl: '',
      }
      state.events.unshift(newEvent)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { submitEvent: newEvent } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('ReviewEvent')) {
      const eventId = variables.eventId
      const input = variables.input || {}
      const event = state.events.find((e) => e.id === eventId)
      if (event) {
        event.status = input.status
        if (input.adminNotes) event.adminNotes = input.adminNotes
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { reviewEvent: event } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('UpsertDomain')) {
      const input = variables.input || {}
      const newDomain: MockDomain = {
        id: input.id || `dom-${state.domains.length + 1}`,
        name: input.name,
        slug: input.slug,
        subdomain: input.subdomain,
        description: input.description || null,
        isActive: input.isActive ?? true,
        createdAtUtc: new Date().toISOString(),
      }
      state.domains.push(newDomain)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { upsertDomain: newDomain } }),
      })
      return
    }

    // ── Queries ──
    if (query.includes('query') && query.includes('Me')) {
      const user = state.users.find((u) => u.id === state.currentUserId)
      if (!user) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Not authenticated' }] }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            me: {
              id: user.id,
              displayName: user.displayName,
              email: user.email,
              role: user.role,
              createdAtUtc: user.createdAtUtc,
            },
          },
        }),
      })
      return
    }

    if (query.includes('query') && query.includes('Events')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { events: state.events } }),
      })
      return
    }

    if (query.includes('query') && query.includes('Domains')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { domains: state.domains } }),
      })
      return
    }

    // Fallback
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    })
  })

  return state
}

/** Convenience factory for a pre-seeded admin user. */
export function makeAdminUser(): MockUser {
  return {
    id: 'admin-1',
    email: 'admin@example.com',
    password: 'AdminPass123!',
    displayName: 'Admin User',
    role: 'ADMIN',
    createdAtUtc: new Date().toISOString(),
  }
}

/** Convenience factory for a Technology domain. */
export function makeTechDomain(): MockDomain {
  return {
    id: 'dom-tech',
    name: 'Technology',
    slug: 'technology',
    subdomain: 'tech',
    description: 'Tech events',
    isActive: true,
    createdAtUtc: new Date().toISOString(),
  }
}

/** Build a published event fixture. */
export function makeApprovedEvent(overrides: Partial<MockEvent> = {}): MockEvent {
  return {
    id: 'event-1',
    name: 'Test Tech Summit',
    slug: 'test-tech-summit',
    description: 'A great technology event.',
    eventUrl: 'https://example.com/event',
    venueName: 'Tech Hall',
    addressLine1: 'Wenceslas Square 1',
    city: 'Prague',
    countryCode: 'CZ',
    latitude: 50.0755,
    longitude: 14.4378,
    startsAtUtc: '2026-04-01T10:00:00Z',
    endsAtUtc: '2026-04-01T18:00:00Z',
    submittedAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString(),
    publishedAtUtc: new Date().toISOString(),
    adminNotes: null,
    status: 'PUBLISHED',
    domainId: 'dom-tech',
    domain: { id: 'dom-tech', name: 'Technology', slug: 'technology' },
    submittedByUserId: 'admin-1',
    submittedBy: { displayName: 'Admin User' },
    reviewedByUserId: null,
    reviewedBy: null,
    mapUrl: 'https://www.openstreetmap.org/?mlat=50.0755&mlon=14.4378#map=15/50.0755/14.4378',
    ...overrides,
  }
}

/**
 * Helper that navigates to /login, fills credentials, submits the form and
 * waits for the redirect to /dashboard.  Call this instead of setting
 * `state.currentUserId` directly so the auth store gets a real JWT token
 * and `checkAuth()` succeeds on subsequent page loads.
 */
export async function loginAs(page: Page, user: MockUser): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL(/\/dashboard$/)
}

