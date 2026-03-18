namespace EventsApi.Configuration;

public sealed class SeedDataOptions
{
    public const string SectionName = "SeedData";

    public string AdminEmail { get; init; } = "admin@events.local";
    public string AdminDisplayName { get; init; } = "Platform Admin";
    public string AdminPassword { get; init; } = "ChangeMe123!";
}
