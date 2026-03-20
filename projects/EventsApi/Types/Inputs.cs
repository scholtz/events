using EventsApi.Data.Entities;

namespace EventsApi.Types;

public sealed class EventFilterInput
{
    public string? SearchText { get; init; }
    public string? DomainSlug { get; init; }
    public string? DomainSubdomain { get; init; }
    public string? City { get; init; }
    public string? LocationText { get; init; }
    public DateTime? StartsFromUtc { get; init; }
    public DateTime? StartsToUtc { get; init; }
    public bool? IsFree { get; init; }
    public decimal? PriceMin { get; init; }
    public decimal? PriceMax { get; init; }
    public EventSortOption? SortBy { get; init; }
    public EventStatus? Status { get; init; }
    public AttendanceMode? AttendanceMode { get; init; }
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
    public bool IsFree { get; init; } = true;
    public decimal? PriceAmount { get; init; }
    public string CurrencyCode { get; init; } = "EUR";
    public decimal Latitude { get; init; }
    public decimal Longitude { get; init; }
    public DateTime StartsAtUtc { get; init; }
    public DateTime EndsAtUtc { get; init; }
    public AttendanceMode AttendanceMode { get; init; } = AttendanceMode.InPerson;
    /// <summary>
    /// IANA timezone identifier for the event (e.g. "Europe/Prague", "America/New_York").
    /// Optional; legacy events without this field will fall back to UTC for calendar export.
    /// </summary>
    public string? Timezone { get; init; }
}

public sealed class SavedSearchInput
{
    public required string Name { get; init; }
    public EventFilterInput? Filter { get; init; }
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

/// <summary>Input for adding or removing a domain administrator.</summary>
public sealed class DomainAdministratorInput
{
    public Guid DomainId { get; init; }
    public Guid UserId { get; init; }
}

/// <summary>Input for updating a domain's visual style/branding.</summary>
public sealed class UpdateDomainStyleInput
{
    public Guid DomainId { get; init; }
    /// <summary>CSS hex color for the primary brand color, e.g. "#137fec".</summary>
    public string? PrimaryColor { get; init; }
    /// <summary>CSS hex color for the accent/secondary color.</summary>
    public string? AccentColor { get; init; }
    /// <summary>Absolute URL to the domain logo image.</summary>
    public string? LogoUrl { get; init; }
    /// <summary>Absolute URL to the domain banner/hero image.</summary>
    public string? BannerUrl { get; init; }
}

public sealed class UpdateUserRoleInput
{
    public Guid UserId { get; init; }
    public ApplicationUserRole Role { get; init; }
}

/// <summary>
/// Input for recording an add-to-calendar action.
/// Accepted providers: ICS, GOOGLE, OUTLOOK.
/// </summary>
public sealed class TrackCalendarActionInput
{
    public Guid EventId { get; init; }
    public required string Provider { get; init; }
}

/// <summary>
/// Input for recording a discovery interaction (search, filter change, result click, filter clear).
/// No personal data is collected — only aggregate, anonymous product signals.
/// Accepted action types: SEARCH, FILTER_CHANGE, FILTER_CLEAR, RESULT_CLICK.
/// </summary>
public sealed class TrackDiscoveryActionInput
{
    /// <summary>Type of interaction: SEARCH, FILTER_CHANGE, FILTER_CLEAR, or RESULT_CLICK.</summary>
    public required string ActionType { get; init; }

    /// <summary>For RESULT_CLICK: the public slug of the event opened. Null for other action types.</summary>
    public string? EventSlug { get; init; }

    /// <summary>Number of filters active when the interaction occurred.</summary>
    public int ActiveFilterCount { get; init; }

    /// <summary>Number of results visible at the time of the interaction. Null for RESULT_CLICK.</summary>
    public int? ResultCount { get; init; }
}
