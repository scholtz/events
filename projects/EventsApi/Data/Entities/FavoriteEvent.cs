using HotChocolate;

namespace EventsApi.Data.Entities;

public sealed class FavoriteEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    [GraphQLIgnore]
    public ApplicationUser User { get; set; } = null!;

    public Guid EventId { get; set; }
    public CatalogEvent Event { get; set; } = null!;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
