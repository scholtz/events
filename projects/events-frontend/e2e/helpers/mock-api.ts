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
  isFree: boolean
  priceAmount: number | null
  currencyCode: string
  domainId: string
  domain: { id: string; name: string; slug: string }
  submittedByUserId: string
  submittedBy: { displayName: string }
  reviewedByUserId: string | null
  reviewedBy: { displayName: string } | null
  mapUrl: string
  interestedCount: number
}

export type MockSavedSearch = {
  id: string
  name: string
  searchText: string | null
  domainSlug: string | null
  locationText: string | null
  startsFromUtc: string | null
  startsToUtc: string | null
  isFree: boolean | null
  priceMin: number | null
  priceMax: number | null
  sortBy: 'UPCOMING' | 'NEWEST' | 'RELEVANCE'
  createdAtUtc: string
  updatedAtUtc: string
  userId: string
}

export type MockFavoriteEvent = {
  id: string
  userId: string
  eventId: string
  createdAtUtc: string
}

export type MockState = {
  users: MockUser[]
  domains: MockDomain[]
  events: MockEvent[]
  savedSearches: MockSavedSearch[]
  favoriteEvents: MockFavoriteEvent[]
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
    savedSearches: initial?.savedSearches ?? [],
    favoriteEvents: initial?.favoriteEvents ?? [],
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
          isFree: input.isFree ?? true,
          priceAmount: input.isFree === false ? (input.priceAmount ?? null) : 0,
          currencyCode: input.currencyCode || 'EUR',
          domainId: domain?.id ?? 'dom-1',
          domain: domain
            ? { id: domain.id, name: domain.name, slug: domain.slug }
          : { id: 'dom-1', name: 'Default', slug: 'default' },
        submittedByUserId: state.currentUserId ?? '',
        submittedBy: { displayName: submitter?.displayName ?? 'Unknown' },
        reviewedByUserId: null,
        reviewedBy: null,
        mapUrl: '',
        interestedCount: 0,
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

    if (query.includes('mutation') && query.includes('SaveSearch')) {
      const input = variables.input || {}
      const filter = input.filter || {}
      const savedSearch: MockSavedSearch = {
        id: `saved-${state.savedSearches.length + 1}`,
        userId: state.currentUserId ?? 'user-1',
        name: input.name,
        searchText: filter.searchText ?? null,
        domainSlug: filter.domainSlug ?? null,
        locationText: filter.locationText ?? null,
        startsFromUtc: filter.startsFromUtc ?? null,
        startsToUtc: filter.startsToUtc ?? null,
        isFree: filter.isFree ?? null,
        priceMin: filter.priceMin ?? null,
        priceMax: filter.priceMax ?? null,
        sortBy: filter.sortBy ?? 'UPCOMING',
        createdAtUtc: new Date().toISOString(),
        updatedAtUtc: new Date().toISOString(),
      }
      state.savedSearches.unshift(savedSearch)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { saveSearch: savedSearch } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('DeleteSavedSearch')) {
      const savedSearchId = variables.savedSearchId
      state.savedSearches = state.savedSearches.filter((savedSearch) => savedSearch.id !== savedSearchId)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { deleteSavedSearch: true } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('UnfavoriteEvent')) {
      const eventId = variables.eventId
      const index = state.favoriteEvents.findIndex(
        (f) => f.eventId === eventId && f.userId === state.currentUserId,
      )
      if (index === -1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Favorite was not found.', extensions: { code: 'FAVORITE_NOT_FOUND' } }] }),
        })
        return
      }
      state.favoriteEvents.splice(index, 1)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { unfavoriteEvent: true } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('FavoriteEvent')) {
      const eventId = variables.eventId
      const existing = state.favoriteEvents.find(
        (f) => f.eventId === eventId && f.userId === state.currentUserId,
      )
      if (existing) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { favoriteEvent: existing } }),
        })
        return
      }
      const newFavorite: MockFavoriteEvent = {
        id: `fav-${state.favoriteEvents.length + 1}`,
        userId: state.currentUserId ?? '',
        eventId,
        createdAtUtc: new Date().toISOString(),
      }
      state.favoriteEvents.push(newFavorite)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { favoriteEvent: newFavorite } }),
      })
      return
    }

    // ── Queries ──
    if (query.includes('query') && query.includes('MyFavoriteEvents')) {
      const userFavorites = state.favoriteEvents.filter(
        (f) => f.userId === state.currentUserId,
      )
      const favoriteEventIds = userFavorites.map((f) => f.eventId)
      const favoriteEventsData = favoriteEventIds
        .map((id) => state.events.find((e) => e.id === id))
        .filter((e): e is MockEvent => e !== undefined)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { myFavoriteEvents: favoriteEventsData } }),
      })
      return
    }

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

    if (query.includes('query') && query.includes('EventBySlug')) {
      const slug = variables.slug
      const found = state.events.find((e) => e.slug === slug && e.status === 'PUBLISHED') ?? null
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { eventBySlug: found } }),
      })
      return
    }

    if (query.includes('query') && query.includes('DiscoveryEvents')) {
      const filteredEvents = filterEventsForDiscovery(state.events, variables.filter)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { events: filteredEvents } }),
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

    if (query.includes('query') && query.includes('SavedSearches')) {
      const savedSearches = state.savedSearches.filter(
        (savedSearch) => savedSearch.userId === state.currentUserId,
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { mySavedSearches: savedSearches } }),
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
    isFree: true,
    priceAmount: 0,
    currencyCode: 'EUR',
    domainId: 'dom-tech',
    domain: { id: 'dom-tech', name: 'Technology', slug: 'technology' },
    submittedByUserId: 'admin-1',
    submittedBy: { displayName: 'Admin User' },
    reviewedByUserId: null,
    reviewedBy: null,
    mapUrl: 'https://www.openstreetmap.org/?mlat=50.0755&mlon=14.4378#map=15/50.0755/14.4378',
    interestedCount: 0,
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

function filterEventsForDiscovery(events: MockEvent[], filter?: Record<string, unknown>) {
  const normalizedSearch = String(filter?.searchText || '')
    .trim()
    .toLowerCase()
  const normalizedLocation = String(filter?.locationText || '')
    .trim()
    .toLowerCase()
  const domainSlug = String(filter?.domainSlug || '').trim()
  const startsFromUtc = String(filter?.startsFromUtc || '').trim()
  const startsToUtc = String(filter?.startsToUtc || '').trim()
  const isFree = typeof filter?.isFree === 'boolean' ? filter.isFree : null
  const priceMin = typeof filter?.priceMin === 'number' ? filter.priceMin : null
  const priceMax = typeof filter?.priceMax === 'number' ? filter.priceMax : null
  const sortBy = String(filter?.sortBy || 'UPCOMING')

  return [...events]
    .filter((event) => event.status === 'PUBLISHED')
    .filter((event) => {
      if (
        normalizedSearch &&
        !`${event.name} ${event.description} ${event.venueName} ${event.city} ${event.addressLine1}`
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false
      }

      if (domainSlug && event.domain.slug !== domainSlug) {
        return false
      }

      if (
        normalizedLocation &&
        !`${event.venueName} ${event.city} ${event.addressLine1}`
          .toLowerCase()
          .includes(normalizedLocation)
      ) {
        return false
      }

      if (startsFromUtc && event.startsAtUtc < startsFromUtc) {
        return false
      }

      if (startsToUtc && event.startsAtUtc > startsToUtc) {
        return false
      }

      if (typeof isFree === 'boolean' && event.isFree !== isFree) {
        return false
      }

      const effectivePrice = event.isFree ? 0 : (event.priceAmount ?? 0)
      if (typeof priceMin === 'number' && effectivePrice < priceMin) {
        return false
      }

      if (typeof priceMax === 'number' && effectivePrice > priceMax) {
        return false
      }

      return true
    })
    .sort((left, right) => sortDiscoveryEvents(left, right, sortBy, normalizedSearch))
}

function sortDiscoveryEvents(
  left: MockEvent,
  right: MockEvent,
  sortBy: string,
  normalizedSearch: string,
) {
  if (sortBy === 'NEWEST') {
    return right.submittedAtUtc.localeCompare(left.submittedAtUtc)
  }

  if (sortBy === 'RELEVANCE' && normalizedSearch) {
    const leftScore = relevanceScore(left, normalizedSearch)
    const rightScore = relevanceScore(right, normalizedSearch)
    if (leftScore !== rightScore) return rightScore - leftScore
  }

  return left.startsAtUtc.localeCompare(right.startsAtUtc)
}

function relevanceScore(event: MockEvent, normalizedSearch: string) {
  let score = 0
  const name = event.name.toLowerCase()
  const description = event.description.toLowerCase()

  if (name.startsWith(normalizedSearch)) score += 3
  if (name.includes(normalizedSearch)) score += 2
  if (description.includes(normalizedSearch)) score += 1

  return score
}
