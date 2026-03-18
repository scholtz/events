using System.Security.Claims;
using EventsApi.Data;
using EventsApi.Data.Entities;
using EventsApi.Security;
using HotChocolate;
using HotChocolate.Authorization;
using Microsoft.EntityFrameworkCore;

namespace EventsApi.Types;

public sealed class Query
{
    public async Task<IReadOnlyList<CatalogEvent>> GetEventsAsync(
        EventFilterInput? filter,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Events
            .AsNoTracking()
            .Include(catalogEvent => catalogEvent.Domain)
            .Include(catalogEvent => catalogEvent.SubmittedBy)
            .AsQueryable();

        var isAdmin = claimsPrincipal.Identity?.IsAuthenticated == true && claimsPrincipal.IsAdmin();
        if (!isAdmin)
        {
            query = query.Where(catalogEvent => catalogEvent.Status == EventStatus.Published);
        }
        else if (filter?.Status is not null)
        {
            query = query.Where(catalogEvent => catalogEvent.Status == filter.Status.Value);
        }

        if (!string.IsNullOrWhiteSpace(filter?.DomainSlug))
        {
            var domainSlug = filter.DomainSlug.Trim().ToLowerInvariant();
            query = query.Where(catalogEvent => catalogEvent.Domain.Slug == domainSlug);
        }

        if (!string.IsNullOrWhiteSpace(filter?.DomainSubdomain))
        {
            var domainSubdomain = filter.DomainSubdomain.Trim().ToLowerInvariant();
            query = query.Where(catalogEvent => catalogEvent.Domain.Subdomain == domainSubdomain);
        }

        if (!string.IsNullOrWhiteSpace(filter?.City))
        {
            var city = filter.City.Trim().ToLowerInvariant();
            query = query.Where(catalogEvent => catalogEvent.City.ToLower() == city);
        }

        if (filter?.StartsFromUtc is not null)
        {
            query = query.Where(catalogEvent => catalogEvent.StartsAtUtc >= filter.StartsFromUtc.Value.ToUniversalTime());
        }

        if (filter?.StartsToUtc is not null)
        {
            query = query.Where(catalogEvent => catalogEvent.StartsAtUtc <= filter.StartsToUtc.Value.ToUniversalTime());
        }

        return await query.OrderBy(catalogEvent => catalogEvent.StartsAtUtc).ToListAsync(cancellationToken);
    }

    public async Task<CatalogEvent?> GetEventBySlugAsync(
        string slug,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
        => await dbContext.Events
            .AsNoTracking()
            .Include(catalogEvent => catalogEvent.Domain)
            .Include(catalogEvent => catalogEvent.SubmittedBy)
            .SingleOrDefaultAsync(
                catalogEvent => catalogEvent.Slug == slug && catalogEvent.Status == EventStatus.Published,
                cancellationToken);

    public async Task<IReadOnlyList<EventDomain>> GetDomainsAsync(
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Domains.AsNoTracking().AsQueryable();
        if (!(claimsPrincipal.Identity?.IsAuthenticated == true && claimsPrincipal.IsAdmin()))
        {
            query = query.Where(domain => domain.IsActive);
        }

        return await query.OrderBy(domain => domain.Name).ToListAsync(cancellationToken);
    }

    public async Task<EventDomain?> GetDomainBySubdomainAsync(
        string subdomain,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
        => await dbContext.Domains
            .AsNoTracking()
            .SingleOrDefaultAsync(
                domain => domain.Subdomain == subdomain.Trim().ToLowerInvariant() && domain.IsActive,
                cancellationToken);

    [Authorize]
    public async Task<ApplicationUser> GetMeAsync(
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
        => await dbContext.Users
            .AsNoTracking()
            .SingleAsync(user => user.Id == claimsPrincipal.GetRequiredUserId(), cancellationToken);

    [Authorize]
    public async Task<DashboardOverview> GetMyDashboardAsync(
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var currentUserId = claimsPrincipal.GetRequiredUserId();
        var managedEvents = await dbContext.Events
            .AsNoTracking()
            .Include(catalogEvent => catalogEvent.Domain)
            .Where(catalogEvent => catalogEvent.SubmittedByUserId == currentUserId)
            .OrderByDescending(catalogEvent => catalogEvent.StartsAtUtc)
            .ToListAsync(cancellationToken);

        var availableDomains = await dbContext.Domains
            .AsNoTracking()
            .Where(domain => domain.IsActive)
            .OrderBy(domain => domain.Name)
            .ToListAsync(cancellationToken);

        return new DashboardOverview(
            TotalSubmittedEvents: managedEvents.Count,
            PublishedEvents: managedEvents.Count(catalogEvent => catalogEvent.Status == EventStatus.Published),
            PendingApprovalEvents: managedEvents.Count(catalogEvent => catalogEvent.Status == EventStatus.PendingApproval),
            ManagedEvents: managedEvents,
            AvailableDomains: availableDomains);
    }

    [Authorize(Policy = Policies.Admin)]
    public async Task<AdminOverview> GetAdminOverviewAsync(
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var users = await dbContext.Users
            .AsNoTracking()
            .OrderBy(user => user.DisplayName)
            .ToListAsync(cancellationToken);

        var domains = await dbContext.Domains
            .AsNoTracking()
            .OrderBy(domain => domain.Name)
            .ToListAsync(cancellationToken);

        var pendingReviewEvents = await dbContext.Events
            .AsNoTracking()
            .Include(catalogEvent => catalogEvent.Domain)
            .Include(catalogEvent => catalogEvent.SubmittedBy)
            .Where(catalogEvent => catalogEvent.Status == EventStatus.PendingApproval)
            .OrderBy(catalogEvent => catalogEvent.StartsAtUtc)
            .ToListAsync(cancellationToken);

        var totalPublishedEvents = await dbContext.Events.CountAsync(
            catalogEvent => catalogEvent.Status == EventStatus.Published,
            cancellationToken);

        return new AdminOverview(
            TotalUsers: users.Count,
            TotalDomains: domains.Count,
            TotalPublishedEvents: totalPublishedEvents,
            TotalPendingEvents: pendingReviewEvents.Count,
            Users: users,
            PendingReviewEvents: pendingReviewEvents,
            Domains: domains);
    }
}
