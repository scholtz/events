using HotChocolate;

namespace EventsApi.Data.Entities;

public sealed class SavedSearch
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    [GraphQLIgnore]
    public ApplicationUser User { get; set; } = null!;

    public required string Name { get; set; }
    public string? SearchText { get; set; }
    public string? DomainSlug { get; set; }
    public string? LocationText { get; set; }
    public DateTime? StartsFromUtc { get; set; }
    public DateTime? StartsToUtc { get; set; }
    public bool? IsFree { get; set; }
    public decimal? PriceMin { get; set; }
    public decimal? PriceMax { get; set; }
    public EventSortOption SortBy { get; set; } = EventSortOption.Upcoming;
    public AttendanceMode? AttendanceMode { get; set; }
    /// <summary>
    /// BCP 47 language tag stored with this saved search preset (e.g. "en", "cs", "de").
    /// Null means the user did not include a language filter in this preset.
    /// </summary>
    public string? Language { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
