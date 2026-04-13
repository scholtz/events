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
    // ── Discovery ranking thresholds (in days) ────────────────────────────────

    /// <summary>Events starting within this many days are labelled "upcoming soon".</summary>
    private const int UpcomingSoonDays = 7;

    /// <summary>
    /// Events published within this many days (and starting in the future but
    /// not within <see cref="UpcomingSoonDays"/>) are labelled "recently added".
    /// </summary>
    private const int RecentlyAddedDays = 14;

    // ── Computed fields ───────────────────────────────────────────────────────

    /// <summary>
    /// Returns the discovery ranking bucket that best explains why this event
    /// appears where it does in search results.
    ///
    /// Rules (evaluated in priority order):
    /// 1. <see cref="DiscoveryRankBucket.UpcomingSoon"/>  — starts within <see cref="UpcomingSoonDays"/> days
    /// 2. <see cref="DiscoveryRankBucket.RecentlyAdded"/> — published within <see cref="RecentlyAddedDays"/> days
    ///    AND starts in the future (outside the UpcomingSoon window)
    /// 3. <see cref="DiscoveryRankBucket.Upcoming"/>      — generic upcoming event
    /// 4. <see cref="DiscoveryRankBucket.Past"/>          — already occurred
    ///
    /// This field is intentionally derived from publicly visible metadata (start date
    /// and publication date) so it never leaks moderation-only state.
    /// </summary>
    public DiscoveryRankBucket GetRankBucket([Parent] CatalogEvent catalogEvent)
    {
        var now = DateTime.UtcNow;

        // Priority 1: starting imminently (most actionable for attendees)
        if (catalogEvent.StartsAtUtc > now &&
            (catalogEvent.StartsAtUtc - now).TotalDays <= UpcomingSoonDays)
            return DiscoveryRankBucket.UpcomingSoon;

        // Priority 2: newly published content that is still in the future
        if (catalogEvent.StartsAtUtc > now &&
            catalogEvent.PublishedAtUtc.HasValue &&
            (now - catalogEvent.PublishedAtUtc.Value).TotalDays <= RecentlyAddedDays)
            return DiscoveryRankBucket.RecentlyAdded;

        // Priority 3: generic upcoming
        if (catalogEvent.StartsAtUtc > now)
            return DiscoveryRankBucket.Upcoming;

        // Default: event has already occurred
        return DiscoveryRankBucket.Past;
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
