using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace EventsApi.Adapters;

/// <summary>
/// Adapter for Meetup.com groups.
/// <para>
/// The current implementation is a structured stub that validates URLs and returns
/// empty event lists. A full implementation would call the Meetup GraphQL API
/// (https://www.meetup.com/api/schema) using an API key configured via
/// <c>ExternalSources:MeetupApiKey</c>. The stub keeps the architecture clean and
/// allows the sync workflow to be exercised end-to-end without live credentials.
/// </para>
/// </summary>
public sealed partial class MeetupAdapter(ILogger<MeetupAdapter> logger) : IExternalSourceAdapter
{
    // Matches https://www.meetup.com/{group-slug} and https://meetup.com/{group-slug}
    [GeneratedRegex(@"^https?://(?:www\.)?meetup\.com/(?<slug>[A-Za-z0-9_-]+)/?$", RegexOptions.IgnoreCase)]
    private static partial Regex MeetupUrlRegex();

    public string? ExtractIdentifier(string sourceUrl)
    {
        var match = MeetupUrlRegex().Match(sourceUrl.Trim());
        return match.Success ? match.Groups["slug"].Value : null;
    }

    public Task<IReadOnlyList<ExternalEventData>> FetchEventsAsync(
        string sourceIdentifier,
        CancellationToken cancellationToken = default)
    {
        // Stub: a production implementation would call the Meetup API here.
        // Returning empty so syncs succeed cleanly without live credentials.
        logger.LogInformation("MeetupAdapter.FetchEventsAsync called for identifier '{Identifier}' (stub — returning empty list).", sourceIdentifier);
        return Task.FromResult<IReadOnlyList<ExternalEventData>>([]);
    }
}
