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
    IReadOnlyList<CalendarProviderCount> CalendarActionsByProvider);

public sealed record DashboardOverview(
    int TotalSubmittedEvents,
    int PublishedEvents,
    int PendingApprovalEvents,
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
    IReadOnlyList<EventDomain> Domains);

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

    /// <summary>Number of events skipped because they already exist in the catalog.</summary>
    int SkippedCount,

    /// <summary>Number of events skipped due to validation failures or missing required fields.</summary>
    int ErrorCount,

    /// <summary>Human-readable summary suitable for display in the admin UI.</summary>
    string Summary);
public sealed record CommunityGroupDetail(
    CommunityGroup Group,
    IReadOnlyList<CatalogEvent> Events,
    int MemberCount,
    CommunityMembership? MyMembership);
