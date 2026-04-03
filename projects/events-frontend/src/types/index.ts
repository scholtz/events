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
  tagline: string | null
  overviewContent: string | null
  whatBelongsHere: string | null
  submitEventCta: string | null
  curatorCredit: string | null
  /** Number of published events in this domain hub. Only present when fetched via domainBySlug. */
  publishedEventCount?: number
  /** Curator-managed community/external links shown on the public hub page. */
  links?: DomainLink[]
}

/** Matches backend DomainLink entity */
export interface DomainLink {
  id: string
  domainId: string
  title: string
  url: string
  displayOrder: number
  createdAtUtc: string
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
  /** Community groups that have associated this event (populated on detail view only). */
  communityGroups?: Pick<CommunityGroup, 'id' | 'name' | 'slug' | 'summary'>[]
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

/** Lightweight community group summary for global admin oversight */
export interface CommunityGroupAdminSummary {
  id: string
  name: string
  slug: string
  visibility: CommunityVisibility
  isActive: boolean
  activeMemberCount: number
  pendingRequestCount: number
  createdAtUtc: string
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
  pendingExternalSourceClaims: ExternalSourceClaim[]
  totalCommunityGroups: number
  communityGroups: CommunityGroupAdminSummary[]
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

export type CommunityMemberRole = 'OWNER' | 'ADMIN' | 'EVENT_MANAGER' | 'MEMBER'

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
  lastSyncSucceededAtUtc: string | null
  lastSyncOutcome: string | null
  lastSyncError: string | null
  lastSyncImportedCount: number | null
  lastSyncSkippedCount: number | null
  isAutoSyncEnabled: boolean
  adminNote: string | null
  /** Navigation property — present when the query includes group { ... } */
  group?: { id: string; name: string; slug: string } | null
  /** Navigation property — present when the query includes createdBy { ... } */
  createdBy?: { displayName: string; email: string } | null
}

/** Result of a manual sync operation */
export interface SyncResult {
  importedCount: number
  skippedCount: number
  errorCount: number
  summary: string
}

/**
 * A candidate event from an external source returned by previewExternalEvents.
 * Contains duplicate-detection and importability metadata so admins can make
 * an informed selection before calling importExternalEvents.
 */
export interface ExternalEventPreview {
  externalId: string
  name: string
  description: string
  eventUrl: string | null
  startsAtUtc: string | null
  endsAtUtc: string | null
  city: string | null
  venueName: string | null
  isFree: boolean | null
  priceAmount: number | null
  currencyCode: string | null
  /** True if this event was already imported from this claim. */
  alreadyImported: boolean
  /** True when the event can be selected for import. False when required fields are missing. */
  isImportable: boolean
  /** Human-readable reason why the event cannot be imported, or null if importable. */
  importBlockReason: string | null
}

/** Status of a scheduled featured-event entry, computed from the time window. */
export type ScheduleStatus = 'upcoming' | 'active' | 'expired'

/** Matches backend ScheduledFeaturedEvent entity */
export interface ScheduledFeaturedEvent {
  id: string
  domainId: string
  eventId: string
  /** The event that is being scheduled for featured promotion. */
  event: CatalogEvent
  /** UTC start of the promotion window (inclusive). */
  startsAtUtc: string
  /** UTC end of the promotion window (exclusive). */
  endsAtUtc: string
  /** Priority for conflict resolution — lower value = displayed first (default 0). */
  priority: number
  createdAtUtc: string
  createdByUserId: string | null
}

/** Input for creating a new scheduled featured-event entry. */
export interface ScheduleFeaturedEventInput {
  domainId: string
  eventId: string
  startsAtUtc: string
  endsAtUtc: string
  priority: number
}

/** Input for updating an existing scheduled featured-event entry. */
export interface UpdateScheduledFeaturedEventInput {
  scheduleId: string
  startsAtUtc: string
  endsAtUtc: string
  priority: number
}
