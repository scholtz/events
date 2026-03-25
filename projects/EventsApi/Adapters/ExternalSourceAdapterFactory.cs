using EventsApi.Data.Entities;

namespace EventsApi.Adapters;

/// <summary>
/// Resolves the correct <see cref="IExternalSourceAdapter"/> for a given
/// <see cref="ExternalSourceType"/>. Inject and call <see cref="GetAdapter"/> to
/// obtain the platform-specific adapter at runtime.
/// </summary>
public sealed class ExternalSourceAdapterFactory
{
    private readonly IExternalSourceAdapter _meetup;
    private readonly IExternalSourceAdapter _luma;

    public ExternalSourceAdapterFactory(MeetupAdapter meetup, LumaAdapter luma)
    {
        _meetup = meetup;
        _luma = luma;
    }

    /// <summary>
    /// Test-only constructor that accepts any <see cref="IExternalSourceAdapter"/>
    /// implementations so integration tests can inject seeded adapters without live
    /// credentials or network calls.
    /// </summary>
    internal ExternalSourceAdapterFactory(IExternalSourceAdapter meetup, IExternalSourceAdapter luma)
    {
        _meetup = meetup;
        _luma = luma;
    }

    public IExternalSourceAdapter GetAdapter(ExternalSourceType sourceType) =>
        sourceType switch
        {
            ExternalSourceType.Meetup => _meetup,
            ExternalSourceType.Luma => _luma,
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
