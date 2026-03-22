namespace EventsApi.Data.Entities;

/// <summary>
/// Records a user's intent to receive a push reminder for a specific saved event.
/// One record per user/event/offsetHours combination.
/// </summary>
public sealed class EventReminder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required Guid UserId { get; set; }
    public required Guid EventId { get; set; }

    /// <summary>
    /// How many hours before the event start time the reminder should fire.
    /// Typical values: 24 (one day before) or 1 (one hour before).
    /// </summary>
    public int OffsetHours { get; set; } = 24;

    /// <summary>Computed UTC timestamp when the notification should be dispatched.</summary>
    public DateTime ScheduledForUtc { get; set; }

    /// <summary>Set when the push notification was successfully dispatched. Null means not yet sent.</summary>
    public DateTime? SentAtUtc { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    // Navigation
    public ApplicationUser User { get; set; } = null!;
    public CatalogEvent Event { get; set; } = null!;
}
