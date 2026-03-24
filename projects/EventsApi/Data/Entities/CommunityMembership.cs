namespace EventsApi.Data.Entities;

/// <summary>
/// Membership of a user in a community group, with role and approval status.
/// </summary>
public sealed class CommunityMembership
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public CommunityGroup Group { get; set; } = null!;
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public CommunityMemberRole Role { get; set; } = CommunityMemberRole.Member;
    public CommunityMemberStatus Status { get; set; } = CommunityMemberStatus.Pending;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAtUtc { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public ApplicationUser? ReviewedBy { get; set; }
}
