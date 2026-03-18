/** Matches backend ApplicationUserRole enum */
export type UserRole = 'CONTRIBUTOR' | 'ADMIN'

/** Matches backend EventStatus enum */
export type EventStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'REJECTED'

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
  domainId: string
  domain: EventDomain
  submittedByUserId: string
  submittedBy: { displayName: string }
  reviewedByUserId: string | null
  reviewedBy: { displayName: string } | null
  mapUrl: string
}

/** Matches backend DashboardOverview response */
export interface DashboardOverview {
  totalSubmittedEvents: number
  publishedEvents: number
  pendingApprovalEvents: number
  managedEvents: CatalogEvent[]
  availableDomains: EventDomain[]
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
  city: string
}
