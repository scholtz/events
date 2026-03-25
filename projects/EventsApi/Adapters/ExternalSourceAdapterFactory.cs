using EventsApi.Data.Entities;

namespace EventsApi.Adapters;

/// <summary>
/// Resolves the correct <see cref="IExternalSourceAdapter"/> for a given
/// <see cref="ExternalSourceType"/>. Inject and call <see cref="GetAdapter"/> to
/// obtain the platform-specific adapter at runtime.
/// </summary>
public sealed class ExternalSourceAdapterFactory(
    MeetupAdapter meetup,
    LumaAdapter luma)
{
    public IExternalSourceAdapter GetAdapter(ExternalSourceType sourceType) =>
        sourceType switch
        {
            ExternalSourceType.Meetup => meetup,
            ExternalSourceType.Luma => luma,
            _ => throw new InvalidOperationException($"No adapter registered for source type '{sourceType}'.")
        };

    /// <summary>
    /// Validates whether <paramref name="sourceUrl"/> is a supported URL for
    /// <paramref name="sourceType"/> and returns the extracted identifier.
    /// Returns null when the URL format is not recognised.
    /// </summary>
    public string? ExtractIdentifier(ExternalSourceType sourceType, string sourceUrl) =>
        GetAdapter(sourceType).ExtractIdentifier(sourceUrl);
}
