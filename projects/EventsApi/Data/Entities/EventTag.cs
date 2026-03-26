namespace EventsApi.Data.Entities;

/// <summary>
/// Junction entity for the many-to-many relationship between events and domains/tags.
/// Each entry associates a CatalogEvent with an EventDomain (tag).
/// </summary>
public sealed class EventTag
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventId { get; set; }
    public CatalogEvent Event { get; set; } = null!;
    public Guid DomainId { get; set; }
    public EventDomain Domain { get; set; } = null!;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
