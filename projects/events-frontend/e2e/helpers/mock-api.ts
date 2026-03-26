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
  createdByUserId?: string | null
  primaryColor?: string | null
  accentColor?: string | null
  logoUrl?: string | null
  bannerUrl?: string | null
  overviewContent?: string | null
  whatBelongsHere?: string | null
  submitEventCta?: string | null
  curatorCredit?: string | null
  /** Server-side count of published events in this domain hub. */
  publishedEventCount?: number
}

export type MockDomainAdministrator = {
  id: string
  domainId: string
  userId: string
  user: { displayName: string; email: string }
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
  domain: { id: string; name: string; slug: string; subdomain: string; description?: string | null; logoUrl?: string | null; primaryColor?: string | null; accentColor?: string | null; overviewContent?: string | null }
  submittedByUserId: string
  submittedBy: { displayName: string }
  reviewedByUserId: string | null
  reviewedBy: { displayName: string } | null
  mapUrl: string
  interestedCount: number
  attendanceMode: 'IN_PERSON' | 'ONLINE' | 'HYBRID'
  timezone: string | null
  language: string | null
  eventTags: { id: string; domain: { id: string; name: string; slug: string; subdomain: string } }[]
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
  attendanceMode: 'IN_PERSON' | 'ONLINE' | 'HYBRID' | null
  language: string | null
  timezone: string | null
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

export type MockCalendarAction = {
  id: string
  eventId: string
  provider: string
  triggeredAtUtc: string
}

export type MockPushSubscription = {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  createdAtUtc: string
  updatedAtUtc: string
}

export type MockEventReminder = {
  id: string
  userId: string
  eventId: string
  offsetHours: number
  scheduledForUtc: string
  sentAtUtc: string | null
  createdAtUtc: string
}

export type MockFeaturedEvent = {
  domainSlug: string
  eventId: string
  displayOrder: number
}

export type MockCommunityGroup = {
  id: string
  name: string
  slug: string
  summary: string | null
  description: string | null
  visibility: 'PUBLIC' | 'PRIVATE'
  isActive: boolean
  createdAtUtc: string
  createdByUserId: string | null
}

export type MockCommunityMembership = {
  id: string
  groupId: string
  userId: string
  role: 'ADMIN' | 'EVENT_MANAGER' | 'MEMBER'
  status: 'ACTIVE' | 'PENDING' | 'REJECTED'
  createdAtUtc: string
  reviewedAtUtc: string | null
  reviewedByUserId: string | null
}

export type MockExternalSourceClaim = {
  id: string
  groupId: string
  sourceType: 'MEETUP' | 'LUMA'
  sourceUrl: string
  sourceIdentifier: string
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED'
  createdByUserId: string
  createdAtUtc: string
  lastSyncAtUtc: string | null
  lastSyncOutcome: string | null
  lastSyncImportedCount: number | null
  lastSyncSkippedCount: number | null
}

export type MockState = {
  users: MockUser[]
  domains: MockDomain[]
  domainAdministrators: MockDomainAdministrator[]
  events: MockEvent[]
  featuredEvents: MockFeaturedEvent[]
  savedSearches: MockSavedSearch[]
  favoriteEvents: MockFavoriteEvent[]
  calendarActions: MockCalendarAction[]
  pushSubscriptions: MockPushSubscription[]
  eventReminders: MockEventReminder[]
  communityGroups: MockCommunityGroup[]
  communityMemberships: MockCommunityMembership[]
  externalSourceClaims: MockExternalSourceClaim[]
  vapidPublicKey: string
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
    domainAdministrators: initial?.domainAdministrators ?? [],
    events: initial?.events ?? [],
    featuredEvents: initial?.featuredEvents ?? [],
    savedSearches: initial?.savedSearches ?? [],
    favoriteEvents: initial?.favoriteEvents ?? [],
    calendarActions: initial?.calendarActions ?? [],
    pushSubscriptions: initial?.pushSubscriptions ?? [],
    eventReminders: initial?.eventReminders ?? [],
    communityGroups: initial?.communityGroups ?? [],
    communityMemberships: initial?.communityMemberships ?? [],
    externalSourceClaims: initial?.externalSourceClaims ?? [],
    vapidPublicKey: initial?.vapidPublicKey ?? 'SGVsbG9QbGF5d3JpZ2h0S2V5',
    currentUserId: initial?.currentUserId ?? null,
    currentToken: initial?.currentToken ?? null,
  }

  const getActiveUserId = () => state.currentUserId ?? state.users[0]?.id ?? ''

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

    if (query.includes('mutation') && query.includes('RegisterUser')) {
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

    if (query.includes('mutation') && query.includes('UpdateMyEvent')) {
      const eventId = variables.eventId
      const input = variables.input || {}
      const event = state.events.find((e) => e.id === eventId)
      if (!event) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Event was not found.', extensions: { code: 'EVENT_NOT_FOUND' } }] }),
        })
        return
      }
      if (event.submittedByUserId !== state.currentUserId) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'You can only update your own events.', extensions: { code: 'FORBIDDEN' } }] }),
        })
        return
      }
      const domain = state.domains.find((d) => d.slug === input.domainSlug)
      Object.assign(event, {
        name: input.name ?? event.name,
        description: input.description ?? event.description,
        eventUrl: input.eventUrl ?? event.eventUrl,
        venueName: input.venueName ?? event.venueName,
        addressLine1: input.addressLine1 ?? event.addressLine1,
        city: input.city ?? event.city,
        countryCode: input.countryCode ?? event.countryCode,
        latitude: input.latitude ?? event.latitude,
        longitude: input.longitude ?? event.longitude,
        startsAtUtc: input.startsAtUtc ?? event.startsAtUtc,
        endsAtUtc: input.endsAtUtc ?? event.endsAtUtc,
        isFree: input.isFree ?? event.isFree,
        priceAmount: input.priceAmount ?? event.priceAmount,
        currencyCode: input.currencyCode ?? event.currencyCode,
        attendanceMode: (input.attendanceMode as MockEvent['attendanceMode']) ?? event.attendanceMode,
        timezone: input.timezone ?? event.timezone,
        domainId: domain?.id ?? event.domainId,
        domain: domain
          ? { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain }
          : event.domain,
        status: 'PENDING_APPROVAL',
        updatedAtUtc: new Date().toISOString(),
      })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { updateMyEvent: event } }),
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
            ? { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain }
            : { id: 'dom-1', name: 'Default', slug: 'default', subdomain: 'default' },
        submittedByUserId: state.currentUserId ?? '',
        submittedBy: { displayName: submitter?.displayName ?? 'Unknown' },
        reviewedByUserId: null,
        reviewedBy: null,
        mapUrl: '',
        interestedCount: 0,
        attendanceMode: (input.attendanceMode as MockEvent['attendanceMode']) || 'IN_PERSON',
        timezone: input.timezone ?? null,
        language: (input.language as string | null) ?? null,
        eventTags: [],
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
        attendanceMode: filter.attendanceMode ?? null,
        language: filter.language ?? null,
        timezone: filter.timezone ?? null,
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

    if (query.includes('mutation') && query.includes('RegisterPushSubscription')) {
      const input = variables.input || {}
      const activeUserId = getActiveUserId()
      const existing = state.pushSubscriptions.find((s) => s.userId === activeUserId)
      const now = new Date().toISOString()

      if (existing) {
        existing.endpoint = String(input.endpoint || '')
        existing.p256dh = String(input.p256dh || '')
        existing.auth = String(input.auth || '')
        existing.updatedAtUtc = now
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              registerPushSubscription: {
                isSubscribed: true,
                endpoint: existing.endpoint,
                createdAtUtc: existing.createdAtUtc,
              },
            },
          }),
        })
        return
      }

      const subscription: MockPushSubscription = {
        id: `push-${state.pushSubscriptions.length + 1}`,
        userId: activeUserId,
        endpoint: String(input.endpoint || ''),
        p256dh: String(input.p256dh || ''),
        auth: String(input.auth || ''),
        createdAtUtc: now,
        updatedAtUtc: now,
      }
      state.pushSubscriptions.push(subscription)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            registerPushSubscription: {
              isSubscribed: true,
              endpoint: subscription.endpoint,
              createdAtUtc: subscription.createdAtUtc,
            },
          },
        }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('RemovePushSubscription')) {
      const activeUserId = getActiveUserId()
      state.pushSubscriptions = state.pushSubscriptions.filter(
        (subscription) => subscription.userId !== activeUserId,
      )
      state.eventReminders = state.eventReminders.filter(
        (reminder) => reminder.userId !== activeUserId,
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { removePushSubscription: true } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('EnableEventReminder')) {
      const input = variables.input || {}
      const eventId = String(input.eventId || '')
      const offsetHours = Number(input.offsetHours || 24)
      const activeUserId = getActiveUserId()
      const currentEvent = state.events.find((event) => event.id === eventId)

      if (!currentEvent) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Event not found', extensions: { code: 'EVENT_NOT_FOUND' } }],
          }),
        })
        return
      }

      const existingSubscription = state.pushSubscriptions.find(
        (subscription) => subscription.userId === activeUserId,
      )
      if (!existingSubscription) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [
              {
                message: 'You must enable push notifications before setting reminders.',
                extensions: { code: 'NO_PUSH_SUBSCRIPTION' },
              },
            ],
          }),
        })
        return
      }

      const scheduledForUtc = new Date(
        new Date(currentEvent.startsAtUtc).getTime() - offsetHours * 60 * 60 * 1000,
      ).toISOString()
      const existing = state.eventReminders.find(
        (reminder) =>
          reminder.userId === activeUserId &&
          reminder.eventId === eventId &&
          reminder.offsetHours === offsetHours,
      )

      if (existing) {
        existing.scheduledForUtc = scheduledForUtc
        existing.sentAtUtc = null
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { enableEventReminder: existing } }),
        })
        return
      }

      const reminder: MockEventReminder = {
        id: `reminder-${state.eventReminders.length + 1}`,
        userId: activeUserId,
        eventId,
        offsetHours,
        scheduledForUtc,
        sentAtUtc: null,
        createdAtUtc: new Date().toISOString(),
      }
      state.eventReminders.push(reminder)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { enableEventReminder: reminder } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('DisableEventReminder')) {
      const eventId = String(variables.eventId || '')
      const activeUserId = getActiveUserId()
      state.eventReminders = state.eventReminders.filter(
        (reminder) =>
          !(reminder.userId === activeUserId && reminder.eventId === eventId),
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { disableEventReminder: true } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('TrackCalendarAction')) {
      const input = variables.input || {}
      const provider = (input.provider as string)?.toUpperCase() ?? ''
      if (!['ICS', 'GOOGLE', 'OUTLOOK'].includes(provider)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Provider must be one of: ICS, GOOGLE, OUTLOOK.', extensions: { code: 'INVALID_CALENDAR_PROVIDER' } }],
          }),
        })
        return
      }
      const newAction: MockCalendarAction = {
        id: `cal-${state.calendarActions.length + 1}`,
        eventId: input.eventId,
        provider,
        triggeredAtUtc: new Date().toISOString(),
      }
      state.calendarActions.push(newAction)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { trackCalendarAction: true } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('TrackDiscoveryAction')) {
      const input = variables.input || {}
      const actionType = (input.actionType as string)?.toUpperCase() ?? ''
      if (!['SEARCH', 'FILTER_CHANGE', 'FILTER_CLEAR', 'RESULT_CLICK'].includes(actionType)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'ActionType must be one of: SEARCH, FILTER_CHANGE, FILTER_CLEAR, RESULT_CLICK.', extensions: { code: 'INVALID_DISCOVERY_ACTION_TYPE' } }],
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { trackDiscoveryAction: true } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('UpdateUserRole')) {
      const input = variables.input || {}
      if (input.userId === state.currentUserId && input.role !== 'ADMIN') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Admins cannot remove their own admin role. Ask another admin to change your role.', extensions: { code: 'SELF_DEMOTION_NOT_ALLOWED' } }] }),
        })
        return
      }
      const user = state.users.find((u) => u.id === input.userId)
      if (!user) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'User was not found.', extensions: { code: 'USER_NOT_FOUND' } }] }),
        })
        return
      }
      user.role = input.role
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            updateUserRole: {
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

    // ── Domain administrator mutations ──
    if (query.includes('mutation') && query.includes('AddDomainAdmin')) {
      const input = variables.input || {}
      const user = state.users.find((u) => u.id === input.userId)
      if (!user) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'User not found' }] }),
        })
        return
      }
      const existing = state.domainAdministrators.find(
        (da) => da.domainId === input.domainId && da.userId === input.userId,
      )
      if (existing) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { addDomainAdministrator: existing } }),
        })
        return
      }
      const da: MockDomainAdministrator = {
        id: `da-${Date.now()}`,
        domainId: input.domainId,
        userId: input.userId,
        user: { displayName: user.displayName, email: user.email },
        createdAtUtc: new Date().toISOString(),
      }
      state.domainAdministrators.push(da)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { addDomainAdministrator: da } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('RemoveDomainAdmin')) {
      const input = variables.input || {}
      const idx = state.domainAdministrators.findIndex(
        (da) => da.domainId === input.domainId && da.userId === input.userId,
      )
      if (idx >= 0) state.domainAdministrators.splice(idx, 1)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { removeDomainAdministrator: true } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('UpdateDomainStyle')) {
      const input = variables.input || {}
      const domain = state.domains.find((d) => d.id === input.domainId)
      if (domain) {
        domain.primaryColor = input.primaryColor ?? null
        domain.accentColor = input.accentColor ?? null
        domain.logoUrl = input.logoUrl ?? null
        domain.bannerUrl = input.bannerUrl ?? null
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { updateDomainStyle: domain } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('UpdateDomainOverview')) {
      const input = variables.input || {}
      const domain = state.domains.find((d) => d.id === input.domainId)
      if (domain) {
        domain.overviewContent = input.overviewContent ?? null
        domain.whatBelongsHere = input.whatBelongsHere ?? null
        domain.submitEventCta = input.submitEventCta ?? null
        domain.curatorCredit = input.curatorCredit ?? null
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { updateDomainOverview: domain } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('SetDomainFeaturedEvents')) {
      const input = variables.input || {}
      const domain = state.domains.find((d) => d.id === input.domainId)
      const currentUser = state.users.find((u) => u.id === state.currentUserId)
      if (!currentUser) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Not authorized', extensions: { code: 'AUTH_NOT_AUTHORIZED' } }] }),
        })
        return
      }
      if (domain) {
        // Replace featured events for this domain
        const slug = domain.slug
        state.featuredEvents = state.featuredEvents.filter((fe) => fe.domainSlug !== slug)
        const eventIds: string[] = input.eventIds ?? []
        eventIds.forEach((eventId: string, i: number) => {
          state.featuredEvents.push({ domainSlug: slug, eventId, displayOrder: i })
        })
      }
      const featuredEventObjs = (input.eventIds ?? [])
        .map((id: string) => state.events.find((e) => e.id === id))
        .filter(Boolean)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { setDomainFeaturedEvents: featuredEventObjs } }),
      })
      return
    }

    // ── Queries ──
    if (query.includes('query') && query.includes('AdminOverview')) {
      const currentUser = state.users.find((u) => u.id === state.currentUserId)
      if (!currentUser || currentUser.role !== 'ADMIN') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Not authorized', extensions: { code: 'AUTH_NOT_AUTHORIZED' } }] }),
        })
        return
      }
      const pendingReviewEvents = state.events.filter((e) => e.status === 'PENDING_APPROVAL')
      const publishedCount = state.events.filter((e) => e.status === 'PUBLISHED').length
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            adminOverview: {
              totalUsers: state.users.length,
              totalDomains: state.domains.length,
              totalPublishedEvents: publishedCount,
              totalPendingEvents: pendingReviewEvents.length,
              users: state.users.map((u) => ({
                id: u.id,
                displayName: u.displayName,
                email: u.email,
                role: u.role,
                createdAtUtc: u.createdAtUtc,
              })),
              pendingReviewEvents,
              domains: state.domains,
            },
          },
        }),
      })
      return
    }

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

    if (query.includes('query') && query.includes('MyPushSubscription')) {
      const activeUserId = getActiveUserId()
      const subscription =
        state.pushSubscriptions.find((item) => item.userId === activeUserId) ?? null
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            myPushSubscription: subscription
              ? {
                  isSubscribed: true,
                  endpoint: subscription.endpoint,
                  createdAtUtc: subscription.createdAtUtc,
                }
              : null,
          },
        }),
      })
      return
    }

    if (query.includes('query') && query.includes('MyEventReminders')) {
      const activeUserId = getActiveUserId()
      const reminders = state.eventReminders.filter(
        (reminder) => reminder.userId === activeUserId,
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { myEventReminders: reminders } }),
      })
      return
    }

    if (query.includes('query') && query.includes('VapidPublicKey')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { vapidPublicKey: state.vapidPublicKey } }),
      })
      return
    }

    if (query.includes('query') && query.includes('MyDashboard')) {
      const managedEvents = state.events.filter((e) => e.submittedByUserId === state.currentUserId)
      const now = Date.now()
      const cutoff7Days = now - 7 * 24 * 60 * 60 * 1000
      const cutoff30Days = now - 30 * 24 * 60 * 60 * 1000

      const eventAnalytics = managedEvents.map((e) => {
        const allFavs = state.favoriteEvents.filter((f) => f.eventId === e.id)
        const total = allFavs.length
        const last7 = allFavs.filter(
          (f) => new Date(f.createdAtUtc).getTime() >= cutoff7Days,
        ).length
        const last30 = allFavs.filter(
          (f) => new Date(f.createdAtUtc).getTime() >= cutoff30Days,
        ).length

        const allCal = state.calendarActions.filter((a) => a.eventId === e.id)
        const calTotal = allCal.length
        const calLast7 = allCal.filter(
          (a) => new Date(a.triggeredAtUtc).getTime() >= cutoff7Days,
        ).length
        const calLast30 = allCal.filter(
          (a) => new Date(a.triggeredAtUtc).getTime() >= cutoff30Days,
        ).length
        const providerMap = new Map<string, number>()
        for (const a of allCal) {
          providerMap.set(a.provider, (providerMap.get(a.provider) ?? 0) + 1)
        }
        const calendarActionsByProvider = Array.from(providerMap.entries()).map(
          ([provider, count]) => ({ provider, count }),
        )

        return {
          eventId: e.id,
          eventName: e.name,
          eventSlug: e.slug,
          status: e.status,
          totalInterestedCount: total,
          interestedLast7Days: last7,
          interestedLast30Days: last30,
          startsAtUtc: e.startsAtUtc,
          totalCalendarActions: calTotal,
          calendarActionsLast7Days: calLast7,
          calendarActionsLast30Days: calLast30,
          calendarActionsByProvider,
          adminNotes: e.adminNotes,
          domainSlug: e.domain?.slug ?? null,
          language: e.language,
          timezone: e.timezone,
        }
      })

      const totalInterestedCount = eventAnalytics
        .filter((a) => a.status === 'PUBLISHED')
        .reduce((sum, a) => sum + a.totalInterestedCount, 0)

      const totalCalendarActions = eventAnalytics
        .filter((a) => a.status === 'PUBLISHED')
        .reduce((sum, a) => sum + a.totalCalendarActions, 0)

      const overview = {
        totalSubmittedEvents: managedEvents.length,
        publishedEvents: managedEvents.filter((e) => e.status === 'PUBLISHED').length,
        pendingApprovalEvents: managedEvents.filter((e) => e.status === 'PENDING_APPROVAL').length,
        rejectedEvents: managedEvents.filter((e) => e.status === 'REJECTED').length,
        draftEvents: managedEvents.filter((e) => e.status === 'DRAFT').length,
        totalInterestedCount,
        totalCalendarActions,
        managedEvents: managedEvents.map((e) => ({
          id: e.id,
          name: e.name,
          slug: e.slug,
          status: e.status,
          startsAtUtc: e.startsAtUtc,
          domain: e.domain,
        })),
        eventAnalytics,
        availableDomains: state.domains.filter((d) => d.isActive),
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { myDashboard: overview } }),
      })
      return
    }

    // ── Community group queries (must come before Me handler – community
    //    query strings contain 'myMembership' which includes 'Me') ─────────────

    if (query.includes('query') && query.includes('CommunityGroupBySlug')) {
      const slug = variables.slug as string
      const userId = getActiveUserId()
      const group = state.communityGroups.find((g) => g.slug === slug && g.isActive) ?? null
      if (!group) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { communityGroupBySlug: null } }) })
        return
      }
      const memberships = state.communityMemberships.filter((m) => m.groupId === group.id)
      const myMembership = memberships.find((m) => m.userId === userId) ?? null
      const memberCount = memberships.filter((m) => m.status === 'ACTIVE').length
      const groupEvents = state.events.filter(
        (e) => e.status === 'PUBLISHED',
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            communityGroupBySlug: {
              group,
              memberCount,
              myMembership: myMembership ? membershipWithUser(myMembership, state) : null,
              events: groupEvents,
            },
          },
        }),
      })
      return
    }

    if (query.includes('query') && query.includes('MyCommunityMemberships')) {
      const userId = getActiveUserId()
      const memberships = state.communityMemberships
        .filter((m) => m.userId === userId)
        .map((m) => membershipWithUser(m, state))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { myCommunityMemberships: memberships } }),
      })
      return
    }

    if (query.includes('query') && query.includes('PendingMembershipRequests')) {
      const groupId = variables.groupId as string
      const pending = state.communityMemberships
        .filter((m) => m.groupId === groupId && m.status === 'PENDING')
        .map((m) => membershipWithUser(m, state))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingMembershipRequests: pending } }),
      })
      return
    }

    if (query.includes('query') && query.includes('GroupMembers')) {
      const groupId = variables.groupId as string
      const members = state.communityMemberships
        .filter((m) => m.groupId === groupId && m.status === 'ACTIVE')
        .map((m) => membershipWithUser(m, state))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { groupMembers: members } }),
      })
      return
    }

    if (query.includes('query') && query.includes('GroupExternalSources')) {
      const groupId = variables.groupId as string
      const claims = state.externalSourceClaims.filter((c) => c.groupId === groupId)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { groupExternalSources: claims } }),
      })
      return
    }

    if (query.includes('query') && query.includes('CommunityGroups')) {
      const userId = getActiveUserId()
      const activeMemberGroupIds = new Set(
        state.communityMemberships
          .filter((m) => m.userId === userId && m.status === 'ACTIVE')
          .map((m) => m.groupId),
      )
      const visible = state.communityGroups.filter(
        (g) => g.isActive && (g.visibility === 'PUBLIC' || activeMemberGroupIds.has(g.id)),
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { communityGroups: visible } }),
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

    if (query.includes('query') && query.includes('FeaturedEventsForDomain')) {
      const domainSlug = variables.domainSlug as string | undefined
      const fes = domainSlug
        ? state.featuredEvents
            .filter((fe) => fe.domainSlug === domainSlug)
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((fe) => state.events.find((e) => e.id === fe.eventId && e.status === 'PUBLISHED'))
            .filter((e): e is MockEvent => e !== undefined)
        : []
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { featuredEventsForDomain: fes } }),
      })
      return
    }

    if (query.includes('query') && query.includes('EventBySlug')) {
      const slug = variables.slug
      const found = state.events.find((e) => e.slug === slug && e.status === 'PUBLISHED') ?? null
      if (found) {
        const interestedCount = state.favoriteEvents.filter((f) => f.eventId === found.id).length
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { eventBySlug: { ...found, interestedCount } } }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { eventBySlug: null } }),
        })
      }
      return
    }

    if (query.includes('query') && query.includes('EventById')) {
      const id = variables.id
      const found = state.events.find((e) => e.id === id) ?? null
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { eventById: found } }),
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

    if (query.includes('query') && query.includes('CategoryEvents')) {
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

    if (query.includes('query') && query.includes('DomainAdmins')) {
      const domainId = variables.domainId
      const admins = state.domainAdministrators.filter((da) => da.domainId === domainId)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { domainAdministrators: admins } }),
      })
      return
    }

    if (query.includes('query') && query.includes('MyManagedDomains')) {
      const userId = state.currentUserId
      const managed = userId
        ? state.domainAdministrators
            .filter((da) => da.userId === userId)
            .map((da) => state.domains.find((d) => d.id === da.domainId))
            .filter((d): d is MockDomain => d !== undefined)
        : []
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { myManagedDomains: managed } }),
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

    if (query.includes('query') && query.includes('DomainBySlug')) {
      const slug = variables.slug as string | undefined
      const rawDomain = slug ? state.domains.find((d) => d.slug === slug) ?? null : null
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { domainBySlug: rawDomain } }),
      })
      return
    }

    // ── Community group mutations ─────────────────────────────────────────────

    if (query.includes('mutation') && query.includes('CreateCommunityGroup')) {
      const userId = getActiveUserId()
      if (!userId) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Not authorized', extensions: { code: 'AUTH_NOT_AUTHORIZED' } }] }),
        })
        return
      }
      const input = variables.input as Partial<MockCommunityGroup>
      const slug = (input.slug as string ?? '').toLowerCase()
      if (state.communityGroups.some((g) => g.slug === slug)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: `Slug '${slug}' is already taken.`, extensions: { code: 'SLUG_TAKEN' } }] }),
        })
        return
      }
      const group: MockCommunityGroup = {
        id: `group-${Date.now()}`,
        name: input.name as string,
        slug,
        summary: (input.summary as string | undefined) ?? null,
        description: (input.description as string | undefined) ?? null,
        visibility: (input.visibility as 'PUBLIC' | 'PRIVATE') ?? 'PUBLIC',
        isActive: true,
        createdAtUtc: new Date().toISOString(),
        createdByUserId: userId,
      }
      state.communityGroups.push(group)
      state.communityMemberships.push({
        id: `mem-${Date.now()}-admin`,
        groupId: group.id,
        userId,
        role: 'ADMIN',
        status: 'ACTIVE',
        createdAtUtc: new Date().toISOString(),
        reviewedAtUtc: null,
        reviewedByUserId: null,
      })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { createCommunityGroup: group } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('JoinCommunityGroup')) {
      const userId = getActiveUserId()
      const groupId = variables.groupId as string
      const group = state.communityGroups.find((g) => g.id === groupId)
      if (!group || group.visibility !== 'PUBLIC') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Group not found or private', extensions: { code: 'GROUP_PRIVATE' } }] }),
        })
        return
      }
      const existing = state.communityMemberships.find((m) => m.groupId === groupId && m.userId === userId)
      if (existing) {
        existing.status = 'ACTIVE'
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { joinCommunityGroup: membershipWithUser(existing, state) } }) })
        return
      }
      const membership: MockCommunityMembership = {
        id: `mem-${Date.now()}`,
        groupId,
        userId,
        role: 'MEMBER',
        status: 'ACTIVE',
        createdAtUtc: new Date().toISOString(),
        reviewedAtUtc: null,
        reviewedByUserId: null,
      }
      state.communityMemberships.push(membership)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { joinCommunityGroup: membershipWithUser(membership, state) } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('RequestCommunityMembership')) {
      const userId = getActiveUserId()
      const groupId = variables.groupId as string
      const existing = state.communityMemberships.find((m) => m.groupId === groupId && m.userId === userId)
      if (existing) {
        existing.status = 'PENDING'
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { requestCommunityMembership: membershipWithUser(existing, state) } }) })
        return
      }
      const membership: MockCommunityMembership = {
        id: `mem-${Date.now()}`,
        groupId,
        userId,
        role: 'MEMBER',
        status: 'PENDING',
        createdAtUtc: new Date().toISOString(),
        reviewedAtUtc: null,
        reviewedByUserId: null,
      }
      state.communityMemberships.push(membership)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { requestCommunityMembership: membershipWithUser(membership, state) } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('ReviewMembershipRequest')) {
      const membershipId = variables.membershipId as string
      const approve = variables.input?.approve as boolean
      const membership = state.communityMemberships.find((m) => m.id === membershipId)
      if (!membership) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'Not found' }] }) })
        return
      }
      membership.status = approve ? 'ACTIVE' : 'REJECTED'
      membership.reviewedAtUtc = new Date().toISOString()
      membership.reviewedByUserId = getActiveUserId()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { reviewMembershipRequest: membershipWithUser(membership, state) } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('AssignMemberRole')) {
      const membershipId = variables.membershipId as string
      const role = variables.role as MockCommunityMembership['role']
      const membership = state.communityMemberships.find((m) => m.id === membershipId)
      if (!membership) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'Not found' }] }) })
        return
      }
      membership.role = role
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { assignMemberRole: membershipWithUser(membership, state) } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('RevokeMembership')) {
      const membershipId = variables.membershipId as string
      const idx = state.communityMemberships.findIndex((m) => m.id === membershipId)
      if (idx !== -1) state.communityMemberships.splice(idx, 1)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { revokeMembership: true } }),
      })
      return
    }

    // ── External source claim mutations ───────────────────────────────────────

    if (query.includes('mutation') && query.includes('AddExternalSourceClaim')) {
      const userId = getActiveUserId()
      if (!userId) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Not authorized', extensions: { code: 'AUTH_NOT_AUTHORIZED' } }] }),
        })
        return
      }
      const groupId = variables.groupId as string
      const input = variables.input as { sourceType: 'MEETUP' | 'LUMA'; sourceUrl: string }
      // Simple identifier extraction for mock: take last path segment of URL
      const urlPath = input.sourceUrl.replace(/\/$/, '')
      const identifier = urlPath.split('/').pop() ?? urlPath
      // Validate URL format (basic check)
      const isMeetup = input.sourceType === 'MEETUP' && input.sourceUrl.includes('meetup.com/')
      const isLuma = input.sourceType === 'LUMA' && input.sourceUrl.includes('lu.ma/')
      if (!isMeetup && !isLuma) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: `The URL '${input.sourceUrl}' is not a recognised ${input.sourceType} URL.`, extensions: { code: 'INVALID_SOURCE_URL' } }] }),
        })
        return
      }
      // Duplicate check
      if (state.externalSourceClaims.some(
        (c) => c.groupId === groupId && c.sourceType === input.sourceType && c.sourceIdentifier === identifier
      )) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'A claim for this source already exists.', extensions: { code: 'DUPLICATE_CLAIM' } }] }),
        })
        return
      }
      const claim: MockExternalSourceClaim = {
        id: `claim-${Date.now()}`,
        groupId,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl,
        sourceIdentifier: identifier,
        status: 'PENDING_REVIEW',
        createdByUserId: userId,
        createdAtUtc: new Date().toISOString(),
        lastSyncAtUtc: null,
        lastSyncOutcome: null,
        lastSyncImportedCount: null,
        lastSyncSkippedCount: null,
      }
      state.externalSourceClaims.push(claim)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { addExternalSourceClaim: claim } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('RemoveExternalSourceClaim')) {
      const claimId = variables.claimId as string
      const idx = state.externalSourceClaims.findIndex((c) => c.id === claimId)
      if (idx === -1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Claim not found', extensions: { code: 'CLAIM_NOT_FOUND' } }] }),
        })
        return
      }
      state.externalSourceClaims.splice(idx, 1)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { removeExternalSourceClaim: true } }),
      })
      return
    }

    if (query.includes('mutation') && query.includes('TriggerExternalSync')) {
      const claimId = variables.claimId as string
      const claim = state.externalSourceClaims.find((c) => c.id === claimId)
      if (!claim) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Claim not found', extensions: { code: 'CLAIM_NOT_FOUND' } }] }),
        })
        return
      }
      if (claim.status !== 'VERIFIED') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Only verified claims can be synced.', extensions: { code: 'CLAIM_NOT_VERIFIED' } }] }),
        })
        return
      }
      // Stub sync — no events from adapter
      claim.lastSyncAtUtc = new Date().toISOString()
      claim.lastSyncOutcome = 'Imported 0 events.'
      claim.lastSyncImportedCount = 0
      claim.lastSyncSkippedCount = 0
      const result = { importedCount: 0, skippedCount: 0, errorCount: 0, summary: 'Imported 0 events.' }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { triggerExternalSync: result } }),
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

/** Enrich a MockCommunityMembership with user data for the mock GraphQL response. */
function membershipWithUser(
  membership: MockCommunityMembership,
  state: MockState,
) {
  const user = state.users.find((u) => u.id === membership.userId)
  const group = state.communityGroups.find((g) => g.id === membership.groupId)
  return {
    ...membership,
    user: user ? { id: user.id, displayName: user.displayName, email: user.email } : null,
    group: group ?? null,
  }
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
    domain: { id: 'dom-tech', name: 'Technology', slug: 'technology', subdomain: 'tech' },
    submittedByUserId: 'admin-1',
    submittedBy: { displayName: 'Admin User' },
    reviewedByUserId: null,
    reviewedBy: null,
    mapUrl: 'https://www.openstreetmap.org/?mlat=50.0755&mlon=14.4378#map=15/50.0755/14.4378',
    interestedCount: 0,
    attendanceMode: 'IN_PERSON',
    timezone: null,
    language: null,
    eventTags: [],
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
  const attendanceMode = typeof filter?.attendanceMode === 'string' ? filter.attendanceMode : null
  const language = typeof filter?.language === 'string' ? filter.language.toLowerCase() : null
  const timezone = typeof filter?.timezone === 'string' ? filter.timezone.toLowerCase() : null

  return [...events]
    .filter((event) => event.status === 'PUBLISHED')
    .filter((event) => {
      if (
        normalizedSearch &&
        !`${event.name} ${event.description} ${event.venueName} ${event.city} ${event.addressLine1} ${event.domain.name} ${event.submittedBy.displayName}`
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false
      }

      if (domainSlug && event.domain.slug !== domainSlug && !(event.eventTags ?? []).some(t => t.domain.slug === domainSlug)) {
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

      if (attendanceMode && event.attendanceMode !== attendanceMode) {
        return false
      }

      if (language && event.language?.toLowerCase() !== language) {
        return false
      }

      if (timezone && event.timezone?.toLowerCase() !== timezone) {
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

  // Default UPCOMING sort: upcoming events (>= now) before past events
  const now = new Date().toISOString()
  const leftIsPast = left.startsAtUtc < now
  const rightIsPast = right.startsAtUtc < now
  if (leftIsPast !== rightIsPast) {
    return leftIsPast ? 1 : -1
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

/** Convenience factory for a contributor user. */
export function makeContributorUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: 'contributor-1',
    email: 'contributor@example.com',
    password: 'ContribPass123!',
    displayName: 'Contributor User',
    role: 'CONTRIBUTOR',
    createdAtUtc: new Date().toISOString(),
    ...overrides,
  }
}

/** Convenience factory for a public community group. */
export function makePublicGroup(overrides: Partial<MockCommunityGroup> = {}): MockCommunityGroup {
  return {
    id: 'group-1',
    name: 'Prague Crypto Circle',
    slug: 'prague-crypto-circle',
    summary: 'A community for crypto enthusiasts in Prague.',
    description: null,
    visibility: 'PUBLIC',
    isActive: true,
    createdAtUtc: new Date().toISOString(),
    createdByUserId: 'admin-1',
    ...overrides,
  }
}

/** Convenience factory for a private community group. */
export function makePrivateGroup(overrides: Partial<MockCommunityGroup> = {}): MockCommunityGroup {
  return {
    id: 'group-2',
    name: 'Secret Builders Guild',
    slug: 'secret-builders-guild',
    summary: 'An exclusive private community.',
    description: null,
    visibility: 'PRIVATE',
    isActive: true,
    createdAtUtc: new Date().toISOString(),
    createdByUserId: 'admin-1',
    ...overrides,
  }
}

/** Convenience factory for an active membership. */
export function makeActiveMembership(
  groupId: string,
  userId: string,
  role: MockCommunityMembership['role'] = 'MEMBER',
): MockCommunityMembership {
  return {
    id: `mem-${groupId}-${userId}`,
    groupId,
    userId,
    role,
    status: 'ACTIVE',
    createdAtUtc: new Date().toISOString(),
    reviewedAtUtc: null,
    reviewedByUserId: null,
  }
}

/** Convenience factory for a pending membership request. */
export function makePendingMembership(
  groupId: string,
  userId: string,
): MockCommunityMembership {
  return {
    id: `mem-pending-${groupId}-${userId}`,
    groupId,
    userId,
    role: 'MEMBER',
    status: 'PENDING',
    createdAtUtc: new Date().toISOString(),
    reviewedAtUtc: null,
    reviewedByUserId: null,
  }
}

/** Convenience factory for a pending-review external source claim. */
export function makePendingReviewClaim(
  groupId: string,
  overrides: Partial<MockExternalSourceClaim> = {},
): MockExternalSourceClaim {
  return {
    id: 'claim-1',
    groupId,
    sourceType: 'MEETUP',
    sourceUrl: 'https://www.meetup.com/prague-crypto-circle',
    sourceIdentifier: 'prague-crypto-circle',
    status: 'PENDING_REVIEW',
    createdByUserId: 'admin-1',
    createdAtUtc: new Date().toISOString(),
    lastSyncAtUtc: null,
    lastSyncOutcome: null,
    lastSyncImportedCount: null,
    lastSyncSkippedCount: null,
    ...overrides,
  }
}

/** Convenience factory for a verified (sync-ready) external source claim. */
export function makeVerifiedClaim(
  groupId: string,
  overrides: Partial<MockExternalSourceClaim> = {},
): MockExternalSourceClaim {
  return {
    id: 'claim-verified-1',
    groupId,
    sourceType: 'MEETUP',
    sourceUrl: 'https://www.meetup.com/prague-crypto-circle',
    sourceIdentifier: 'prague-crypto-circle',
    status: 'VERIFIED',
    createdByUserId: 'admin-1',
    createdAtUtc: new Date().toISOString(),
    lastSyncAtUtc: null,
    lastSyncOutcome: null,
    lastSyncImportedCount: null,
    lastSyncSkippedCount: null,
    ...overrides,
  }
}

/** Factory for a PENDING_APPROVAL event, defaulting to `submittedByUserId: 'admin-1'`. */
export function makePendingEvent(overrides: Partial<MockEvent> = {}): MockEvent {
  return makeApprovedEvent({
    id: 'event-pending-1',
    slug: 'pending-event',
    name: 'Pending Event',
    status: 'PENDING_APPROVAL',
    publishedAtUtc: null,
    ...overrides,
  })
}

/** Factory for a REJECTED event with optional admin notes. */
export function makeRejectedEvent(overrides: Partial<MockEvent> = {}): MockEvent {
  return makeApprovedEvent({
    id: 'event-rejected-1',
    slug: 'rejected-event',
    name: 'Rejected Event',
    status: 'REJECTED',
    publishedAtUtc: null,
    adminNotes: 'Please add more details about the agenda.',
    ...overrides,
  })
}

/** Factory for a DRAFT event (created but not yet submitted for review). */
export function makeDraftEvent(overrides: Partial<MockEvent> = {}): MockEvent {
  return makeApprovedEvent({
    id: 'event-draft-1',
    slug: 'draft-event',
    name: 'Draft Event',
    status: 'DRAFT',
    publishedAtUtc: null,
    adminNotes: null,
    ...overrides,
  })
}
