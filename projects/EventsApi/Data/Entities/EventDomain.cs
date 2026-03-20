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

    /// <summary>Who first created this domain/tag. Null for legacy seed data.</summary>
    public Guid? CreatedByUserId { get; set; }
    public ApplicationUser? CreatedBy { get; set; }

    // ── Style / design customization ──────────────────────────────────────
    /// <summary>CSS hex color for the primary brand color, e.g. "#137fec".</summary>
    public string? PrimaryColor { get; set; }
    /// <summary>CSS hex color for the accent/secondary color.</summary>
    public string? AccentColor { get; set; }
    /// <summary>Absolute URL to the domain logo image.</summary>
    public string? LogoUrl { get; set; }
    /// <summary>Absolute URL to the domain banner/hero image.</summary>
    public string? BannerUrl { get; set; }

    [GraphQLIgnore]
    public List<CatalogEvent> Events { get; set; } = [];

    [GraphQLIgnore]
    public List<DomainAdministrator> Administrators { get; set; } = [];
}
