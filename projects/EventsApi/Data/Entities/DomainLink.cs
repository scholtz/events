using HotChocolate;

namespace EventsApi.Data.Entities;

/// <summary>
/// A curated external/community link attached to a domain hub.
/// Hub administrators can maintain a short list of relevant links
/// (e.g. community website, Discord, mailing list) that appear on
/// the public category landing page.
/// </summary>
public sealed class DomainLink
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DomainId { get; set; }

    [GraphQLIgnore]
    public EventDomain Domain { get; set; } = null!;

    /// <summary>Short human-readable label, e.g. "Community website" or "Join our Discord".</summary>
    public required string Title { get; set; }

    /// <summary>Absolute URL the link points to.</summary>
    public required string Url { get; set; }

    /// <summary>Zero-based display position within the hub's link list (0 = first).</summary>
    public int DisplayOrder { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
