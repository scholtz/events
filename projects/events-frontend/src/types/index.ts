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
  overviewContent: string | null
  whatBelongsHere: string | null
  submitEventCta: string | null
  curatorCredit: string | null
  /** Number of published events in this domain hub. Only present when fetched via domainBySlug. */
  publishedEventCount?: number
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
  /** Additional tags (domains) beyond the primary domain */
  eventTags: { id: string; domain: EventDomain }[]
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
  /** Count of events currently in REJECTED status. */
  rejectedEvents: number
  /** Count of events currently in DRAFT status. */
  draftEvents: number
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
  /** Moderator notes visible to the organizer when the event is rejected. */
  adminNotes: string | null
  /** Slug of the domain/category this event belongs to. */
  domainSlug: string | null
  /** BCP 47 language tag for the primary language of the event. */
  language: string | null
  /** IANA timezone identifier for the event. */
  timezone: string | null
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
  /** IANA timezone identifier, e.g. "Europe/Prague". Empty string means no timezone filter. */
  timezone: string
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
  /** IANA timezone identifier stored with this saved search preset (e.g. "Europe/Prague"). */
  timezone: string | null
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

// ── Community groups ──────────────────────────────────────────────────────────

export type CommunityVisibility = 'PUBLIC' | 'PRIVATE'

export type CommunityMemberRole = 'ADMIN' | 'EVENT_MANAGER' | 'MEMBER'

export type CommunityMemberStatus = 'ACTIVE' | 'PENDING' | 'REJECTED'

/** Matches backend CommunityGroup entity */
export interface CommunityGroup {
  id: string
  name: string
  slug: string
  summary: string | null
  description: string | null
  visibility: CommunityVisibility
  isActive: boolean
  createdAtUtc: string
  createdByUserId: string | null
}

/** Matches backend CommunityMembership entity */
export interface CommunityMembership {
  id: string
  groupId: string
  group: CommunityGroup
  userId: string
  user?: { id: string; displayName: string; email: string }
  role: CommunityMemberRole
  status: CommunityMemberStatus
  createdAtUtc: string
  reviewedAtUtc: string | null
}

/** Matches backend CommunityGroupDetail payload */
export interface CommunityGroupDetail {
  group: CommunityGroup
  events: CatalogEvent[]
  memberCount: number
  myMembership: CommunityMembership | null
}

// ── External source claims ────────────────────────────────────────────────────

export type ExternalSourceType = 'MEETUP' | 'LUMA'

export type ExternalSourceClaimStatus = 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED'

/** Matches backend ExternalSourceClaim entity */
export interface ExternalSourceClaim {
  id: string
  groupId: string
  sourceType: ExternalSourceType
  sourceUrl: string
  sourceIdentifier: string
  status: ExternalSourceClaimStatus
  createdByUserId: string
  createdAtUtc: string
  lastSyncAtUtc: string | null
  lastSyncOutcome: string | null
  lastSyncImportedCount: number | null
  lastSyncSkippedCount: number | null
}

/** Result of a manual sync operation */
export interface SyncResult {
  importedCount: number
  skippedCount: number
  errorCount: number
  summary: string
}
