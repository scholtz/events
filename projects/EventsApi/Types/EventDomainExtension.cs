using EventsApi.Data;
using EventsApi.Data.Entities;
using HotChocolate;
using Microsoft.EntityFrameworkCore;

namespace EventsApi.Types;

/// <summary>
/// GraphQL type extensions for <see cref="EventDomain"/> that add computed fields
/// resolved against the database. Keeping these separate from the entity keeps the
/// domain model free of infrastructure concerns.
/// </summary>
[ExtendObjectType(typeof(EventDomain))]
public sealed class EventDomainExtension
{
    /// <summary>
    /// Returns the number of published events currently associated with this domain hub.
    /// Used on category landing pages to communicate how active the hub is without
    /// requiring a separate events query.
    /// This is always a live count — it reflects the true database state at query time.
    /// </summary>
    public async Task<int> GetPublishedEventCountAsync(
        [Parent] EventDomain domain,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
        => await dbContext.Events
            .CountAsync(
                e => e.DomainId == domain.Id && e.Status == EventStatus.Published,
                cancellationToken);
}
