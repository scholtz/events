/**
 * Shared Supabase API mock for Playwright tests.
 *
 * Usage:
 *   import { setupMockApi } from './helpers/mock-api'
 *   test('my test', async ({ page }) => {
 *     const state = setupMockApi(page)
 *     state.categories.push({ id: 'c1', name: 'Tech', slug: 'tech', ... })
 *     state.events.push({ id: 'e1', title: 'My Event', status: 'approved', ... })
 *     await page.goto('/')
 *   })
 */

import type { Page } from '@playwright/test'

export type MockUser = {
  id: string
  email: string
  password: string
  name: string
  role: 'user' | 'admin'
}

export type MockCategory = {
  id: string
  name: string
  slug: string
  description: string
  color: string
}

export type MockEvent = {
  id: string
  title: string
  description: string
  category: string
  date: string
  endDate?: string
  location: {
    name: string
    address: string
    lat: number
    lng: number
  }
  link: string
  imageUrl: string
  organizer: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export type MockState = {
  users: MockUser[]
  categories: MockCategory[]
  events: MockEvent[]
  currentUserId: string | null
}

function parseBody<T>(body: string | null): T {
  if (!body) throw new Error('Expected request body to be present')
  return JSON.parse(body) as T
}

/**
 * Registers page.route() handlers that intercept all Supabase auth/rest API
 * calls and delegate to an in-memory state object.  Returns the mutable state
 * so individual tests can seed data before navigating.
 */
export function setupMockApi(page: Page, initial?: Partial<MockState>): MockState {
  const state: MockState = {
    users: initial?.users ?? [],
    categories: initial?.categories ?? [],
    events: initial?.events ?? [],
    currentUserId: initial?.currentUserId ?? null,
  }

  // ── Auth routes ──────────────────────────────────────────────────────────
  page.route('**/auth/v1/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 200, body: '{}' })
      return
    }

    if (url.pathname.endsWith('/auth/v1/signup') && method === 'POST') {
      const payload = parseBody<{ email: string; password: string }>(request.postData())
      const id = `user-${state.users.length + 1}`
      state.users.push({ id, email: payload.email, password: payload.password, name: '', role: 'user' })
      state.currentUserId = id
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id, email: payload.email }, session: null }),
      })
      return
    }

    if (url.pathname.endsWith('/auth/v1/token') && method === 'POST') {
      const payload = parseBody<{ email: string; password: string }>(request.postData())
      const matched = state.users.find(
        (u) => u.email === payload.email && u.password === payload.password,
      )
      if (!matched) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ msg: 'Invalid login credentials' }),
        })
        return
      }
      state.currentUserId = matched.id
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: `token-${matched.id}`,
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: `refresh-${matched.id}`,
          user: { id: matched.id, email: matched.email },
        }),
      })
      return
    }

    if (url.pathname.endsWith('/auth/v1/logout') && method === 'POST') {
      state.currentUserId = null
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      return
    }

    if (url.pathname.endsWith('/auth/v1/user') && method === 'GET') {
      const user = state.users.find((u) => u.id === state.currentUserId)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user ? { id: user.id, email: user.email } : { user: null }),
      })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // ── REST (PostgREST) routes ───────────────────────────────────────────────
  page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 200, body: '{}' })
      return
    }

    if (url.pathname.endsWith('/rest/v1/categories') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.categories),
      })
      return
    }

    if (url.pathname.endsWith('/rest/v1/users') && method === 'POST') {
      const payload = parseBody<{
        id: string
        name: string
        email: string
        role: 'user' | 'admin'
      }>(request.postData())
      const existing = state.users.find((u) => u.id === payload.id)
      if (existing) {
        existing.name = payload.name
        existing.role = payload.role
      }
      await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
      return
    }

    if (url.pathname.endsWith('/rest/v1/users') && method === 'GET') {
      const id = url.searchParams.get('id')?.replace('eq.', '')
      const user = state.users.find((u) => u.id === id)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          user
            ? {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                created_at: new Date().toISOString(),
              }
            : null,
        ),
      })
      return
    }

    if (url.pathname.endsWith('/rest/v1/events') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.events),
      })
      return
    }

    if (url.pathname.endsWith('/rest/v1/events') && method === 'POST') {
      const payload = parseBody<Omit<MockEvent, 'id' | 'created_at' | 'status'>>(
        request.postData(),
      )
      const newEvent: MockEvent = {
        ...payload,
        id: `event-${state.events.length + 1}`,
        status: 'pending',
        created_at: new Date().toISOString(),
      }
      state.events.unshift(newEvent)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newEvent),
      })
      return
    }

    if (url.pathname.endsWith('/rest/v1/events') && method === 'PATCH') {
      const id = url.searchParams.get('id')?.replace('eq.', '')
      const payload = parseBody<{ status: MockEvent['status'] }>(request.postData())
      const event = state.events.find((e) => e.id === id)
      if (event) event.status = payload.status
      await route.fulfill({ status: 204, contentType: 'application/json', body: '{}' })
      return
    }

    if (url.pathname.endsWith('/rest/v1/events') && method === 'DELETE') {
      const id = url.searchParams.get('id')?.replace('eq.', '')
      const idx = state.events.findIndex((e) => e.id === id)
      if (idx >= 0) state.events.splice(idx, 1)
      await route.fulfill({ status: 204, contentType: 'application/json', body: '{}' })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  return state
}

/** Convenience factory for a pre-seeded admin user. */
export function makeAdminUser(): MockUser {
  return {
    id: 'admin-1',
    email: 'admin@example.com',
    password: 'AdminPass123!',
    name: 'Admin User',
    role: 'admin',
  }
}

/** Convenience factory for a Technology category. */
export function makeTechCategory(): MockCategory {
  return {
    id: 'cat-tech',
    name: 'Technology',
    slug: 'technology',
    description: 'Tech events',
    color: '#137fec',
  }
}

/** Build an approved event fixture. */
export function makeApprovedEvent(overrides: Partial<MockEvent> = {}): MockEvent {
  return {
    id: 'event-1',
    title: 'Test Tech Summit',
    description: 'A great technology event.',
    category: 'technology',
    date: '2026-04-01',
    location: { name: 'Tech Hall', address: 'Prague', lat: 50.0755, lng: 14.4378 },
    link: 'https://example.com/event',
    imageUrl: '',
    organizer: 'Test Org',
    status: 'approved',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Helper that navigates to /login, fills credentials, submits the form and
 * waits for the redirect to /dashboard.  Call this instead of setting
 * `state.currentUserId` directly so the Supabase JS client gets a real
 * in-memory session and `checkAuth()` succeeds on subsequent page loads.
 */
export async function loginAs(page: Page, user: MockUser): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL(/\/dashboard$/)
}
