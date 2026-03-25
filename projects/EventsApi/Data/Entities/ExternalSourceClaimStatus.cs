namespace EventsApi.Data.Entities;

/// <summary>
/// Lifecycle status of an external-source ownership claim for a community group.
/// </summary>
public enum ExternalSourceClaimStatus
{
    /// <summary>Submitted by a community admin; awaiting platform-admin review.</summary>
    PendingReview,

    /// <summary>Reviewed and approved by a platform admin.</summary>
    Verified,

    /// <summary>Rejected during review; the claim cannot be synced until re-verified.</summary>
    Rejected,
}
