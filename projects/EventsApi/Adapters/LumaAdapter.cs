using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace EventsApi.Adapters;

/// <summary>
/// Adapter for Luma (lu.ma) community calendars.
/// <para>
/// The current implementation is a structured stub that validates URLs and returns
/// empty event lists. A full implementation would call the Luma public API
/// (https://docs.lu.ma/reference/getcalendarlistevents) using an API key configured
/// via <c>ExternalSources:LumaApiKey</c>. The stub keeps the architecture clean and
/// allows the sync workflow to be exercised end-to-end without live credentials.
/// </para>
/// </summary>
public sealed partial class LumaAdapter(ILogger<LumaAdapter> logger) : IExternalSourceAdapter
{
    // Matches https://lu.ma/{calendar-slug}
    [GeneratedRegex(@"^https?://lu\.ma/(?<slug>[A-Za-z0-9_-]+)/?$", RegexOptions.IgnoreCase)]
    private static partial Regex LumaUrlRegex();

    public string? ExtractIdentifier(string sourceUrl)
    {
        var match = LumaUrlRegex().Match(sourceUrl.Trim());
        return match.Success ? match.Groups["slug"].Value : null;
    }

    public Task<IReadOnlyList<ExternalEventData>> FetchEventsAsync(
        string sourceIdentifier,
        CancellationToken cancellationToken = default)
    {
        // Stub: a production implementation would call the Luma API here.
        // Returning empty so syncs succeed cleanly without live credentials.
        logger.LogInformation("LumaAdapter.FetchEventsAsync called for identifier '{Identifier}' (stub — returning empty list).", sourceIdentifier);
        return Task.FromResult<IReadOnlyList<ExternalEventData>>([]);
    }
}
