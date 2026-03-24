using HotChocolate;

namespace EventsApi.Data.Entities;

/// <summary>
/// Records a curated featured-event highlight within a domain hub.
/// An ordered list of these records (up to 5 per domain) is used to populate
/// the "Featured Events" section on the public category landing page.
/// </summary>
public sealed class DomainFeaturedEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DomainId { get; set; }

    [GraphQLIgnore]
    public EventDomain Domain { get; set; } = null!;

    public Guid EventId { get; set; }

    [GraphQLIgnore]
    public CatalogEvent Event { get; set; } = null!;

    /// <summary>Zero-based position within the featured list (0 = first/top).</summary>
    public int DisplayOrder { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
