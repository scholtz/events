namespace EventsApi.Adapters;

/// <summary>
/// Contract for platform-specific event-source adapters (Meetup, Luma, etc.).
/// Each adapter is responsible for fetching events from its platform and mapping
/// them to the normalized <see cref="ExternalEventData"/> format.
/// The adapter layer is intentionally isolated from the domain so that new sources
/// can be added without touching the core event lifecycle logic.
/// </summary>
public interface IExternalSourceAdapter
{
    /// <summary>
    /// Fetches upcoming events from the external source identified by
    /// <paramref name="sourceIdentifier"/> and returns them as normalized
    /// <see cref="ExternalEventData"/> records.
    /// </summary>
    /// <param name="sourceIdentifier">
    /// Platform-specific group/community identifier extracted from the claim URL.
    /// </param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>
    /// A list of normalized events, or an empty list when the source is temporarily
    /// unavailable or contains no upcoming events.
    /// </returns>
    Task<IReadOnlyList<ExternalEventData>> FetchEventsAsync(
        string sourceIdentifier,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Validates that a given source URL is a recognized URL format for this platform
    /// and returns the extracted identifier, or null if the URL is not supported.
    /// </summary>
    string? ExtractIdentifier(string sourceUrl);
}
