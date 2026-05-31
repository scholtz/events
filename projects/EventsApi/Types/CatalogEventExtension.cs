using EventsApi.Data;
using EventsApi.Data.Entities;
using HotChocolate;
using Microsoft.EntityFrameworkCore;

namespace EventsApi.Types;

/// <summary>
/// GraphQL type extensions for <see cref="CatalogEvent"/> that add computed fields
/// resolved against the database. Keeping these separate from the entity keeps the
/// domain model free of infrastructure concerns.
/// </summary>
[ExtendObjectType(typeof(CatalogEvent))]
public sealed class CatalogEventExtension
{
    /// <summary>
    /// Number of days ahead within which an event is labelled <see cref="EventRankingCue.UpcomingSoon"/>.
    /// Kept narrow so the cue genuinely signals immediacy. Mirrored on the frontend.
    /// </summary>
    internal const int UpcomingSoonDays = 7;

    /// <summary>
    /// Number of days after publication within which an event is labelled
    /// <see cref="EventRankingCue.RecentlyAdded"/>. Mirrored on the frontend.
    /// </summary>
    internal const int RecentlyAddedDays = 14;

    /// <summary>
    /// Returns a deterministic, privacy-safe ranking cue explaining why this event surfaces
    /// where it does in discovery results. Computed purely from the event's own public dates,
    /// so it never exposes moderation-only or non-public data:
    ///
    /// - <see cref="EventRankingCue.UpcomingSoon"/>  — starts within the next <see cref="UpcomingSoonDays"/> days.
    /// - <see cref="EventRankingCue.RecentlyAdded"/> — published within the last <see cref="RecentlyAddedDays"/>
    ///   days (and not already <see cref="EventRankingCue.UpcomingSoon"/>).
    /// - <see cref="EventRankingCue.None"/>          — beyond both windows.
    ///
    /// Exposing this server-side keeps the cue authoritative and consistent across screens,
    /// rather than having each client reproduce the ranking heuristic independently.
    /// </summary>
    public EventRankingCue GetRankingCue([Parent] CatalogEvent catalogEvent)
        => ComputeRankingCue(catalogEvent, DateTime.UtcNow);

    /// <summary>
    /// Pure ranking-cue computation, exposed internally so it can be unit-tested
    /// deterministically against a fixed reference time.
    /// </summary>
    internal static EventRankingCue ComputeRankingCue(CatalogEvent catalogEvent, DateTime utcNow)
    {
        var daysUntilStart = (catalogEvent.StartsAtUtc - utcNow).TotalDays;
        if (daysUntilStart >= 0 && daysUntilStart <= UpcomingSoonDays)
        {
            return EventRankingCue.UpcomingSoon;
        }

        if (catalogEvent.PublishedAtUtc is { } publishedAtUtc)
        {
            var daysSincePublish = (utcNow - publishedAtUtc).TotalDays;
            if (daysSincePublish >= 0 && daysSincePublish <= RecentlyAddedDays)
            {
                return EventRankingCue.RecentlyAdded;
            }
        }

        return EventRankingCue.None;
    }

    /// <summary>
    /// Returns the number of users who have saved/favorited this event.
    /// This is a privacy-safe aggregate that communicates event momentum
    /// without exposing individual attendee identities.
    /// </summary>
    public async Task<int> GetInterestedCountAsync(
        [Parent] CatalogEvent catalogEvent,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
        => await dbContext.FavoriteEvents
            .CountAsync(f => f.EventId == catalogEvent.Id, cancellationToken);

    /// <summary>
    /// Returns the active community groups that have associated this event.
    /// Allows event detail pages to surface community context without requiring
    /// a separate round-trip query.
    /// </summary>
    public async Task<IReadOnlyList<CommunityGroup>> GetCommunityGroupsAsync(
        [Parent] CatalogEvent catalogEvent,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
        => await dbContext.CommunityGroupEvents
            .Where(cge => cge.EventId == catalogEvent.Id && cge.Group.IsActive)
            .Select(cge => cge.Group)
            .ToListAsync(cancellationToken);
}
