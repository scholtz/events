using HotChocolate;

namespace EventsApi.Data.Entities;

/// <summary>
/// A community group that can own events and manage member access.
/// Supports public (open-join) and private (request-based) visibility.
/// </summary>
public sealed class CommunityGroup
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string Slug { get; set; }
    public string? Summary { get; set; }
    public string? Description { get; set; }
    public CommunityVisibility Visibility { get; set; } = CommunityVisibility.Public;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public Guid? CreatedByUserId { get; set; }
    public ApplicationUser? CreatedBy { get; set; }

    [GraphQLIgnore]
    public List<CommunityMembership> Memberships { get; set; } = [];

    [GraphQLIgnore]
    public List<CommunityGroupEvent> GroupEvents { get; set; } = [];
}
