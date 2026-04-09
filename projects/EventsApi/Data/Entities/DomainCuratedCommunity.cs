using System.ComponentModel.DataAnnotations.Schema;
using HotChocolate;

namespace EventsApi.Data.Entities;

/// <summary>
/// An administrator-curated association between a domain hub and a community group.
/// Hub stewards can select, order, enable/disable, and annotate community groups
/// to be featured on the public hub page.
/// </summary>
public sealed class DomainCuratedCommunity
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DomainId { get; set; }

    [GraphQLIgnore]
    public EventDomain Domain { get; set; } = null!;

    public Guid GroupId { get; set; }

    /// <summary>The community group being curated into this hub.</summary>
    public CommunityGroup Group { get; set; } = null!;

    /// <summary>Zero-based display position within the hub's curated community list (0 = first).</summary>
    public int DisplayOrder { get; set; }

    /// <summary>
    /// When false the entry is kept for reference but excluded from public hub rendering.
    /// Defaults to true so newly added communities are immediately visible.
    /// </summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Optional steward-authored note explaining why this community is relevant to the hub.
    /// Displayed publicly alongside the community card. Maximum 300 characters.
    /// </summary>
    public string? Annotation { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Count of upcoming published events associated with this community group.
    /// Computed at query time from the CommunityGroupEvents table; not persisted.
    /// Aggregate-only — no attendee identities are exposed.
    /// </summary>
    [NotMapped]
    public int UpcomingPublishedEventCount { get; set; }
}
