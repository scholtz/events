using HotChocolate;

namespace EventsApi.Data.Entities;

public sealed class ApplicationUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Email { get; set; }
    public required string DisplayName { get; set; }

    [GraphQLIgnore]
    public required string PasswordHash { get; set; }

    public ApplicationUserRole Role { get; set; } = ApplicationUserRole.Contributor;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    [GraphQLIgnore]
    public List<CatalogEvent> SubmittedEvents { get; set; } = [];

    [GraphQLIgnore]
    public List<CatalogEvent> ReviewedEvents { get; set; } = [];
}
