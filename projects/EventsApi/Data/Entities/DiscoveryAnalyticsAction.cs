using HotChocolate;

namespace EventsApi.Data.Entities;

/// <summary>
/// Records a single discovery interaction triggered by an attendee.
/// No user identity is stored — only anonymous aggregate signals.
/// </summary>
public sealed class DiscoveryAnalyticsAction
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// The type of discovery action: 'SEARCH', 'FILTER_CHANGE', 'FILTER_CLEAR', or 'RESULT_CLICK'.
    /// </summary>
    public string ActionType { get; set; } = string.Empty;

    /// <summary>
    /// For RESULT_CLICK: the public URL slug of the event that was opened.
    /// Null for all other action types.
    /// </summary>
    public string? EventSlug { get; set; }

    /// <summary>
    /// Number of filters that were active when the action was triggered.
    /// Used to understand how many constraints attendees combine.
    /// </summary>
    public int ActiveFilterCount { get; set; }

    /// <summary>
    /// Number of results visible when the action was triggered.
    /// Used to assess filter effectiveness and result relevance.
    /// Null for RESULT_CLICK (set from the result list the user interacted with).
    /// </summary>
    public int? ResultCount { get; set; }

    /// <summary>UTC timestamp when the action was triggered by the attendee.</summary>
    public DateTime TriggeredAtUtc { get; set; } = DateTime.UtcNow;
}
