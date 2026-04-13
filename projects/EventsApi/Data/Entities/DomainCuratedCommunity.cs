using System.ComponentModel.DataAnnotations.Schema;
using HotChocolate;

namespace EventsApi.Data.Entities;

/// <summary>
/// An association between a domain hub and a community group.
/// Hub stewards can select, order, enable/disable, and annotate community groups
/// to be featured on the public hub page.
/// Community group administrators may also request hub inclusion, creating a PENDING
/// entry that a domain administrator must approve before it appears publicly.
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
    /// Only meaningful when Status == Approved.
    /// </summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Optional steward-authored note explaining why this community is relevant to the hub.
    /// Displayed publicly alongside the community card. Maximum 300 characters.
    /// </summary>
    public string? Annotation { get; set; }

    /// <summary>
    /// Lifecycle status of this association.
    /// Entries created by domain/global administrators are set to Approved directly.
    /// Entries initiated by community administrators via requestHubInclusion start as Pending.
    /// </summary>
    public HubCommunityAssociationStatus Status { get; set; } = HubCommunityAssociationStatus.Approved;

    /// <summary>
    /// The user who requested hub inclusion (set when a community admin initiates the request).
    /// Null for entries created directly by domain/global administrators.
    /// </summary>
    public Guid? RequestedByUserId { get; set; }

    [GraphQLIgnore]
    public ApplicationUser? RequestedBy { get; set; }

    /// <summary>The user who approved or rejected this association. Null if not yet reviewed.</summary>
    public Guid? ReviewedByUserId { get; set; }

    [GraphQLIgnore]
    public ApplicationUser? ReviewedBy { get; set; }

    /// <summary>When the association was approved or rejected. Null if not yet reviewed.</summary>
    public DateTime? ReviewedAtUtc { get; set; }

    /// <summary>
    /// Optional note provided by the reviewer when rejecting the request.
    /// Maximum 500 characters.
    /// </summary>
    public string? RejectionNote { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Count of upcoming published events associated with this community group.
    /// Computed at query time from the CommunityGroupEvents table; not persisted.
    /// Aggregate-only — no attendee identities are exposed.
    /// </summary>
    [NotMapped]
    public int UpcomingPublishedEventCount { get; set; }
}
