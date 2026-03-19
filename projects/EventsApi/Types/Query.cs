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
        var normalizedSearchText = NormalizeFilterValue(filter?.SearchText);
        var normalizedLocationText = NormalizeFilterValue(filter?.LocationText);

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

        if (normalizedSearchText is not null)
        {
            query = query.Where(catalogEvent =>
                catalogEvent.Name.ToLower().Contains(normalizedSearchText)
                || catalogEvent.Description.ToLower().Contains(normalizedSearchText)
                || catalogEvent.VenueName.ToLower().Contains(normalizedSearchText)
                || catalogEvent.AddressLine1.ToLower().Contains(normalizedSearchText)
                || catalogEvent.City.ToLower().Contains(normalizedSearchText));
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

        if (normalizedLocationText is not null)
        {
            query = query.Where(catalogEvent =>
                catalogEvent.City.ToLower().Contains(normalizedLocationText)
                || catalogEvent.VenueName.ToLower().Contains(normalizedLocationText)
                || catalogEvent.AddressLine1.ToLower().Contains(normalizedLocationText));
        }

        if (filter?.StartsFromUtc is not null)
        {
            query = query.Where(catalogEvent => catalogEvent.StartsAtUtc >= filter.StartsFromUtc.Value.ToUniversalTime());
        }

        if (filter?.StartsToUtc is not null)
        {
            query = query.Where(catalogEvent => catalogEvent.StartsAtUtc <= filter.StartsToUtc.Value.ToUniversalTime());
        }

        if (filter?.IsFree is not null)
        {
            query = query.Where(catalogEvent => catalogEvent.IsFree == filter.IsFree.Value);
        }

        if (filter?.PriceMin is not null)
        {
            var priceMin = filter.PriceMin.Value;
            query = ApplyMinimumPriceFilter(query, filter?.IsFree, priceMin);
        }

        if (filter?.PriceMax is not null)
        {
            var priceMax = filter.PriceMax.Value;
            query = ApplyMaximumPriceFilter(query, filter?.IsFree, priceMax);
        }

        return await ApplySorting(query, filter?.SortBy, normalizedSearchText).ToListAsync(cancellationToken);
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
    public async Task<IReadOnlyList<SavedSearch>> GetMySavedSearchesAsync(
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
        => await dbContext.SavedSearches
            .AsNoTracking()
            .Where(savedSearch => savedSearch.UserId == claimsPrincipal.GetRequiredUserId())
            .OrderByDescending(savedSearch => savedSearch.UpdatedAtUtc)
            .ThenBy(savedSearch => savedSearch.Name)
            .ToListAsync(cancellationToken);

    [Authorize]
    public async Task<IReadOnlyList<CatalogEvent>> GetMyFavoriteEventsAsync(
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var currentUserId = claimsPrincipal.GetRequiredUserId();
        var favoriteEventIds = await dbContext.FavoriteEvents
            .AsNoTracking()
            .Where(f => f.UserId == currentUserId)
            .OrderByDescending(f => f.CreatedAtUtc)
            .Select(f => f.EventId)
            .ToListAsync(cancellationToken);

        var events = await dbContext.Events
            .AsNoTracking()
            .Include(e => e.Domain)
            .Include(e => e.SubmittedBy)
            .Where(e => favoriteEventIds.Contains(e.Id))
            .ToListAsync(cancellationToken);

        // Preserve the order of favorites (most recently favorited first)
        var eventsById = events.ToDictionary(e => e.Id);
        return favoriteEventIds
            .Where(id => eventsById.ContainsKey(id))
            .Select(id => eventsById[id])
            .ToList();
    }

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

    private static IOrderedQueryable<CatalogEvent> ApplySorting(
        IQueryable<CatalogEvent> query,
        EventSortOption? sortBy,
        string? normalizedSearchText)
    {
        return sortBy switch
        {
            EventSortOption.Newest => query
                .OrderByDescending(catalogEvent => catalogEvent.SubmittedAtUtc)
                .ThenBy(catalogEvent => catalogEvent.StartsAtUtc),
            EventSortOption.Relevance when normalizedSearchText is not null => query
                .OrderByDescending(catalogEvent => catalogEvent.Name.ToLower().StartsWith(normalizedSearchText))
                .ThenByDescending(catalogEvent => catalogEvent.Name.ToLower().Contains(normalizedSearchText))
                .ThenByDescending(catalogEvent => catalogEvent.Description.ToLower().Contains(normalizedSearchText))
                .ThenBy(catalogEvent => catalogEvent.StartsAtUtc),
            _ => query
                .OrderBy(catalogEvent => catalogEvent.StartsAtUtc)
                .ThenBy(catalogEvent => catalogEvent.Name)
        };
    }

    private static string? NormalizeFilterValue(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();

    private static IQueryable<CatalogEvent> ApplyMinimumPriceFilter(
        IQueryable<CatalogEvent> query,
        bool? isFreeFilter,
        decimal priceMin)
    {
        return isFreeFilter switch
        {
            true => query.Where(catalogEvent => catalogEvent.IsFree),
            false => query.Where(catalogEvent =>
                !catalogEvent.IsFree
                && catalogEvent.PriceAmount.HasValue
                && catalogEvent.PriceAmount.Value >= priceMin),
            null => query.Where(catalogEvent =>
                (catalogEvent.IsFree && 0m >= priceMin)
                || (!catalogEvent.IsFree
                    && catalogEvent.PriceAmount.HasValue
                    && catalogEvent.PriceAmount.Value >= priceMin))
        };
    }

    private static IQueryable<CatalogEvent> ApplyMaximumPriceFilter(
        IQueryable<CatalogEvent> query,
        bool? isFreeFilter,
        decimal priceMax)
    {
        return isFreeFilter switch
        {
            true => query.Where(catalogEvent => catalogEvent.IsFree && 0m <= priceMax),
            false => query.Where(catalogEvent =>
                !catalogEvent.IsFree
                && catalogEvent.PriceAmount.HasValue
                && catalogEvent.PriceAmount.Value <= priceMax),
            null => query.Where(catalogEvent =>
                (catalogEvent.IsFree && 0m <= priceMax)
                || (!catalogEvent.IsFree
                    && catalogEvent.PriceAmount.HasValue
                    && catalogEvent.PriceAmount.Value <= priceMax))
        };
    }
}
