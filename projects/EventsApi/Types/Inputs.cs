using EventsApi.Data.Entities;

namespace EventsApi.Types;

public sealed class EventFilterInput
{
    public string? DomainSlug { get; init; }
    public string? DomainSubdomain { get; init; }
    public string? City { get; init; }
    public DateTime? StartsFromUtc { get; init; }
    public DateTime? StartsToUtc { get; init; }
    public EventStatus? Status { get; init; }
}

public sealed class RegisterUserInput
{
    public required string Email { get; init; }
    public required string DisplayName { get; init; }
    public required string Password { get; init; }
}

public sealed class LoginInput
{
    public required string Email { get; init; }
    public required string Password { get; init; }
}

public sealed class EventSubmissionInput
{
    public required string DomainSlug { get; init; }
    public required string Name { get; init; }
    public required string Description { get; init; }
    public required string EventUrl { get; init; }
    public required string VenueName { get; init; }
    public required string AddressLine1 { get; init; }
    public required string City { get; init; }
    public string CountryCode { get; init; } = "CZ";
    public decimal Latitude { get; init; }
    public decimal Longitude { get; init; }
    public DateTime StartsAtUtc { get; init; }
    public DateTime EndsAtUtc { get; init; }
}

public sealed class ReviewEventInput
{
    public EventStatus Status { get; init; }
    public string? AdminNotes { get; init; }
}

public sealed class DomainInput
{
    public Guid? Id { get; init; }
    public required string Name { get; init; }
    public required string Slug { get; init; }
    public required string Subdomain { get; init; }
    public string? Description { get; init; }
    public bool IsActive { get; init; } = true;
}

public sealed class UpdateUserRoleInput
{
    public Guid UserId { get; init; }
    public ApplicationUserRole Role { get; init; }
}
