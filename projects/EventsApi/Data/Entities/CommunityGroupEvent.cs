namespace EventsApi.Data.Entities;

/// <summary>
/// Association between a community group and an event it owns or curates.
/// </summary>
public sealed class CommunityGroupEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public CommunityGroup Group { get; set; } = null!;
    public Guid EventId { get; set; }
    public CatalogEvent Event { get; set; } = null!;
    public DateTime AddedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid? AddedByUserId { get; set; }
    public ApplicationUser? AddedBy { get; set; }
}
