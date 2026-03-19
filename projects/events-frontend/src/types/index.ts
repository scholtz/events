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
}

/** Matches backend DashboardOverview response */
export interface DashboardOverview {
  totalSubmittedEvents: number
  publishedEvents: number
  pendingApprovalEvents: number
  totalInterestedCount: number
  managedEvents: CatalogEvent[]
  eventAnalytics: EventAnalyticsItem[]
  availableDomains: EventDomain[]
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
