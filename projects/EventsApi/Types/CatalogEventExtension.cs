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
