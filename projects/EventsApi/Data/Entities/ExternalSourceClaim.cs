namespace EventsApi.Data.Entities;

/// <summary>
/// Records a community group's claimed ownership of an external event-source profile
/// (e.g. a Meetup group or a Luma community). Administrators can use this claim
/// to trigger an import/sync of events from the linked external source.
/// </summary>
public sealed class ExternalSourceClaim
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The community group that owns this claim.</summary>
    public Guid GroupId { get; set; }
    public CommunityGroup Group { get; set; } = null!;

    /// <summary>The external platform being claimed (Meetup, Luma, …).</summary>
    public ExternalSourceType SourceType { get; set; }

    /// <summary>
    /// Canonical URL of the external profile or group, e.g.
    ///   https://www.meetup.com/my-group  or  https://lu.ma/my-community
    /// </summary>
    public required string SourceUrl { get; set; }

    /// <summary>
    /// Short identifier extracted from the URL (e.g. "my-group" from the Meetup URL).
    /// Used by adapter logic to look up the external resource efficiently.
    /// </summary>
    public required string SourceIdentifier { get; set; }

    /// <summary>Review/verification state of this claim.</summary>
    public ExternalSourceClaimStatus Status { get; set; } = ExternalSourceClaimStatus.PendingReview;

    public Guid CreatedByUserId { get; set; }
    public ApplicationUser CreatedBy { get; set; } = null!;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    /// <summary>UTC timestamp of the most recent sync attempt (null if never synced).</summary>
    public DateTime? LastSyncAtUtc { get; set; }

    /// <summary>
    /// Human-readable outcome of the last sync attempt, e.g.
    /// "Imported 3, skipped 1 (duplicate), 0 errors."
    /// </summary>
    public string? LastSyncOutcome { get; set; }

    /// <summary>Number of events successfully imported in the last sync.</summary>
    public int? LastSyncImportedCount { get; set; }

    /// <summary>Number of events skipped (duplicate) in the last sync.</summary>
    public int? LastSyncSkippedCount { get; set; }

    /// <summary>
    /// Optional note recorded by the platform admin when reviewing this claim.
    /// Typically used to communicate a rejection reason to the community administrator.
    /// </summary>
    public string? AdminNote { get; set; }
}
