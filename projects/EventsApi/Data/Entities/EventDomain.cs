using HotChocolate;

namespace EventsApi.Data.Entities;

public sealed class EventDomain
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string Slug { get; set; }
    public required string Subdomain { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    [GraphQLIgnore]
    public List<CatalogEvent> Events { get; set; } = [];
}
