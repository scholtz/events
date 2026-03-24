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
/// Detail view for a single community group, including associated published events,
/// member count, and the calling user's own membership record (if any).
/// </summary>
public sealed record CommunityGroupDetail(
    CommunityGroup Group,
    IReadOnlyList<CatalogEvent> Events,
    int MemberCount,
    CommunityMembership? MyMembership);
