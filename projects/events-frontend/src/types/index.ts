/** Matches backend AttendanceMode enum */
export type AttendanceMode = 'IN_PERSON' | 'ONLINE' | 'HYBRID'

/** Matches backend ApplicationUserRole enum */
export type UserRole = 'CONTRIBUTOR' | 'ADMIN'

/** Matches backend EventStatus enum */
export type EventStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'REJECTED'

/** Matches backend EventSortOption enum */
export type EventSortOption = 'UPCOMING' | 'NEWEST' | 'RELEVANCE'

export type EventPriceFilter = 'ALL' | 'FREE' | 'PAID'

/** Matches backend ApplicationUser entity */
export interface User {
  id: string
  email: string
  displayName: string
  role: UserRole
  createdAtUtc: string
}

/** Matches backend AuthPayload response */
export interface AuthPayload {
  token: string
  expiresAtUtc: string
  user: User
}

/** Matches backend EventDomain entity */
export interface EventDomain {
  id: string
  name: string
  slug: string
  subdomain: string
  description: string | null
  isActive: boolean
  createdAtUtc: string
  createdByUserId: string | null
  primaryColor: string | null
  accentColor: string | null
  logoUrl: string | null
  bannerUrl: string | null
}

/** Matches backend DomainAdministrator entity */
export interface DomainAdministrator {
  id: string
  domainId: string
  userId: string
  user: { displayName: string; email: string }
  createdAtUtc: string
}

/** Matches backend CatalogEvent entity */
export interface CatalogEvent {
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
  status: EventStatus
  isFree: boolean
  priceAmount: number | null
  currencyCode: string
  domainId: string
  domain: EventDomain
  submittedByUserId: string
  submittedBy: { displayName: string }
  reviewedByUserId: string | null
  reviewedBy: { displayName: string } | null
  mapUrl: string
  interestedCount: number
  attendanceMode: AttendanceMode
  /** IANA timezone identifier (e.g. "Europe/Prague"). Null for legacy events; fall back to UTC. */
  timezone: string | null
  /** BCP 47 language tag for the primary language of the event (e.g. "en", "cs", "de"). Null if unspecified. */
  language: string | null
}

/** Matches backend DashboardOverview response */
export interface DashboardOverview {
  totalSubmittedEvents: number
  publishedEvents: number
  pendingApprovalEvents: number
  totalInterestedCount: number
  totalCalendarActions: number
  managedEvents: CatalogEvent[]
  eventAnalytics: EventAnalyticsItem[]
  availableDomains: EventDomain[]
}

/** Matches backend CalendarProviderCount response */
export interface CalendarProviderCount {
  provider: string
  count: number
}

/** Matches backend EventAnalyticsItem response */
export interface EventAnalyticsItem {
  eventId: string
  eventName: string
  eventSlug: string
  status: EventStatus
  totalInterestedCount: number
  interestedLast7Days: number
  interestedLast30Days: number
  startsAtUtc: string
  totalCalendarActions: number
  calendarActionsLast7Days: number
  calendarActionsLast30Days: number
  calendarActionsByProvider: CalendarProviderCount[]
}

/** Matches backend AdminOverview response */
export interface AdminOverview {
  totalUsers: number
  totalDomains: number
  totalPublishedEvents: number
  totalPendingEvents: number
  users: User[]
  pendingReviewEvents: CatalogEvent[]
  domains: EventDomain[]
}

/** Frontend filter state for the events listing */
export interface EventFilters {
  search: string
  domain: string
  dateFrom: string
  dateTo: string
  location: string
  priceType: EventPriceFilter
  priceMin: string
  priceMax: string
  sortBy: EventSortOption
  attendanceMode: AttendanceMode | ''
  /** BCP 47 language tag, e.g. "en", "cs", "de". Empty string means no language filter. */
  language: string
}

export interface SavedSearch {
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
  sortBy: EventSortOption
  attendanceMode: AttendanceMode | null
  /** BCP 47 language tag stored with this saved search preset (e.g. "en", "cs", "de"). */
  language: string | null
  createdAtUtc: string
  updatedAtUtc: string
}

/** Matches backend FavoriteEvent entity */
export interface FavoriteEvent {
  id: string
  userId: string
  eventId: string
  createdAtUtc: string
}
