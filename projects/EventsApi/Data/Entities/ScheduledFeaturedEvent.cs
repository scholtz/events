using HotChocolate;

namespace EventsApi.Data.Entities;

/// <summary>
/// A time-windowed featured-event record created by a hub steward.
/// During the active window (StartsAtUtc ≤ UtcNow &lt; EndsAtUtc) this event
/// is surfaced ahead of the standard domain event list on hub pages.
/// When multiple schedules overlap the deterministic ordering is:
///   1. Priority ascending (lower value = higher importance)
///   2. Nearest EndsAtUtc first (promote event with shortest remaining window)
///   3. Event PublishedAtUtc descending (newest publish date wins tie-break)
/// </summary>
public sealed class ScheduledFeaturedEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DomainId { get; set; }

    [GraphQLIgnore]
    public EventDomain Domain { get; set; } = null!;

    public Guid EventId { get; set; }

    [GraphQLIgnore]
    public CatalogEvent Event { get; set; } = null!;

    /// <summary>UTC start of the promotion window (inclusive).</summary>
    public DateTime StartsAtUtc { get; set; }

    /// <summary>UTC end of the promotion window (exclusive).</summary>
    public DateTime EndsAtUtc { get; set; }

    /// <summary>
    /// Explicit priority used to break ties when multiple schedules overlap.
    /// Lower value = displayed first (default 0).
    /// </summary>
    public int Priority { get; set; } = 0;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public Guid? CreatedByUserId { get; set; }

    [GraphQLIgnore]
    public ApplicationUser? CreatedBy { get; set; }
}
