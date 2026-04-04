using EventsApi.Data.Entities;

namespace EventsApi.Types;

public sealed record AuthPayload(string Token, DateTime ExpiresAtUtc, ApplicationUser User);

/// <summary>
/// Aggregate count of add-to-calendar actions for a single provider.
/// </summary>
public sealed record CalendarProviderCount(string Provider, int Count);

/// <summary>
/// Aggregate analytics for a single event owned by the organizer.
/// All metrics are privacy-safe counts with no attendee identity exposed.
/// </summary>
public sealed record EventAnalyticsItem(
    Guid EventId,
    string EventName,
    string EventSlug,
    EventStatus Status,
    int TotalInterestedCount,
    int InterestedLast7Days,
    int InterestedLast30Days,
    DateTime StartsAtUtc,
    int TotalCalendarActions,
    int CalendarActionsLast7Days,
    int CalendarActionsLast30Days,
    IReadOnlyList<CalendarProviderCount> CalendarActionsByProvider,
    /// <summary>Moderator notes shown to the organizer when an event is rejected.</summary>
    string? AdminNotes,
    /// <summary>Slug of the domain/category this event belongs to.</summary>
    string? DomainSlug,
    /// <summary>BCP 47 language tag for the primary language of the event.</summary>
    string? Language,
    /// <summary>IANA timezone identifier for the event.</summary>
    string? Timezone,
    /// <summary>
    /// UTC timestamp when the event was published (status changed to PUBLISHED).
    /// Null for events that have never been published or were imported before this field was tracked.
    /// Used by the frontend to distinguish newly-published events (not yet enough time to accumulate
    /// saves) from events that have been live for a while with no engagement.
    /// </summary>
    DateTime? PublishedAtUtc);

public sealed record DashboardOverview(
    int TotalSubmittedEvents,
    int PublishedEvents,
    int PendingApprovalEvents,
    /// <summary>Count of events currently in REJECTED status.</summary>
    int RejectedEvents,
    /// <summary>Count of events currently in DRAFT status.</summary>
    int DraftEvents,
    int TotalInterestedCount,
    int TotalCalendarActions,
    IReadOnlyList<CatalogEvent> ManagedEvents,
    IReadOnlyList<EventAnalyticsItem> EventAnalytics,
    IReadOnlyList<EventDomain> AvailableDomains);

public sealed record AdminOverview(
    int TotalUsers,
    int TotalDomains,
    int TotalPublishedEvents,
    int TotalPendingEvents,
    IReadOnlyList<ApplicationUser> Users,
    IReadOnlyList<CatalogEvent> PendingReviewEvents,
    IReadOnlyList<EventDomain> Domains,
    IReadOnlyList<ExternalSourceClaim> PendingExternalSourceClaims,
    int TotalCommunityGroups,
    IReadOnlyList<CommunityGroupAdminSummary> CommunityGroups);

/// <summary>
/// A lightweight summary of a community group for global admin oversight.
/// </summary>
public sealed record CommunityGroupAdminSummary(
    Guid Id,
    string Name,
    string Slug,
    EventsApi.Data.Entities.CommunityVisibility Visibility,
    bool IsActive,
    int ActiveMemberCount,
    int PendingRequestCount,
    DateTime CreatedAtUtc);

/// <summary>
/// Represents the user's current push notification subscription status.
/// </summary>
public sealed record PushSubscriptionStatus(
    /// <summary>True if the user has a registered push subscription.</summary>
    bool IsSubscribed,
    /// <summary>The subscription endpoint, or null if not subscribed.</summary>
    string? Endpoint,
    /// <summary>UTC timestamp of when the subscription was registered, or null if not subscribed.</summary>
    DateTime? CreatedAtUtc);

/// <summary>
/// Represents a single event reminder preference.
/// </summary>
public sealed record EventReminderItem(
    Guid Id,
    Guid EventId,
    int OffsetHours,
    DateTime ScheduledForUtc,
    DateTime? SentAtUtc,
    DateTime CreatedAtUtc);

/// <summary>
/// Outcome of a manual external-source sync triggered by a community admin.
/// All counts are non-negative; a successful empty sync returns zeros.
/// </summary>
public sealed record SyncResult(
    /// <summary>Number of events newly imported during this sync.</summary>
    int ImportedCount,

    /// <summary>Number of already-imported events that were updated with fresh upstream data.</summary>
    int UpdatedCount,

    /// <summary>Number of events skipped due to concurrent duplicate inserts.</summary>
    int SkippedCount,

    /// <summary>Number of events skipped due to validation failures or missing required fields.</summary>
    int ErrorCount,

    /// <summary>
    /// Number of events that were previously imported from this claim but no longer appear
    /// in the upstream feed. These events are NOT deleted — they are preserved as-is and the
    /// count is surfaced so administrators can review and take action.
    /// </summary>
    int OrphanedCount,

    /// <summary>Human-readable summary suitable for display in the admin UI.</summary>
    string Summary);
public sealed record CommunityGroupDetail(
    CommunityGroup Group,
    IReadOnlyList<CatalogEvent> Events,
    int MemberCount,
    CommunityMembership? MyMembership);

/// <summary>
/// A candidate event returned by previewExternalEvents, enriched with duplicate-detection
/// and importability metadata so administrators can make an informed selection before import.
/// </summary>
public sealed record ExternalEventPreview(
    /// <summary>
    /// Stable, platform-specific identifier used for deduplication and selective import.
    /// Pass this value in ImportExternalEventsInput.ExternalIds to import this event.
    /// </summary>
    string ExternalId,

    string Name,
    string Description,
    string? EventUrl,
    DateTime? StartsAtUtc,
    DateTime? EndsAtUtc,
    string? City,
    string? VenueName,
    bool? IsFree,
    decimal? PriceAmount,
    string? CurrencyCode,

    /// <summary>
    /// True when this external event has already been imported into this community.
    /// The checkbox should be disabled and an "Already imported" indicator shown.
    /// </summary>
    bool AlreadyImported,

    /// <summary>
    /// True when this event can be selected for import.
    /// False when a required field is missing (e.g. StartsAtUtc is null).
    /// </summary>
    bool IsImportable,

    /// <summary>
    /// Human-readable reason why the event is not importable, or null when IsImportable is true.
    /// Display this text next to the disabled row to help the admin understand the issue.
    /// </summary>
    string? ImportBlockReason);
