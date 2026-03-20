using HotChocolate;

namespace EventsApi.Data.Entities;

/// <summary>
/// Records a single add-to-calendar action triggered by an attendee.
/// No user identity is stored — only anonymous aggregate signals.
/// </summary>
public sealed class CalendarAnalyticsAction
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Foreign key to the CatalogEvent that was added to a calendar.</summary>
    public Guid EventId { get; set; }

    [GraphQLIgnore]
    public CatalogEvent Event { get; set; } = null!;

    /// <summary>
    /// Calendar provider that was used: 'ICS', 'GOOGLE', or 'OUTLOOK'.
    /// Stored as uppercase string to match frontend CalendarProvider type.
    /// </summary>
    public string Provider { get; set; } = string.Empty;

    /// <summary>UTC timestamp when the action was triggered by the attendee.</summary>
    public DateTime TriggeredAtUtc { get; set; } = DateTime.UtcNow;
}
