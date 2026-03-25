namespace EventsApi.Adapters;

/// <summary>
/// Normalized representation of a single event fetched from an external source.
/// All fields that are unavailable on a given platform are null.
/// </summary>
public sealed record ExternalEventData(
    /// <summary>
    /// A stable, platform-specific identifier used for duplicate detection.
    /// Usually the canonical URL of the event on the source platform.
    /// </summary>
    string ExternalId,

    string Name,
    string Description,
    string? EventUrl,

    /// <summary>UTC start time. Null if the source did not provide one (event will be skipped).</summary>
    DateTime? StartsAtUtc,

    /// <summary>UTC end time. Null if unavailable; adapter may estimate (e.g. start + 2 h).</summary>
    DateTime? EndsAtUtc,

    string? VenueName,
    string? AddressLine1,
    string? City,
    string? CountryCode,
    decimal? Latitude,
    decimal? Longitude,
    bool? IsFree,
    decimal? PriceAmount,
    string? CurrencyCode,
    string? Language
);
