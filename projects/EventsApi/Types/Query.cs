using System.Security.Claims;
using EventsApi.Adapters;
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
            .Include(catalogEvent => catalogEvent.EventTags)
                .ThenInclude(et => et.Domain)
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
                || catalogEvent.City.ToLower().Contains(normalizedSearchText)
                || catalogEvent.Domain.Name.ToLower().Contains(normalizedSearchText)
                || catalogEvent.SubmittedBy.DisplayName.ToLower().Contains(normalizedSearchText));
        }

        if (!string.IsNullOrWhiteSpace(filter?.DomainSlug))
        {
            var domainSlug = filter.DomainSlug.Trim().ToLowerInvariant();
            query = query.Where(catalogEvent =>
                catalogEvent.Domain.Slug == domainSlug
                || catalogEvent.EventTags.Any(et => et.Domain.Slug == domainSlug));
        }

        if (!string.IsNullOrWhiteSpace(filter?.DomainSubdomain))
        {
            var domainSubdomain = filter.DomainSubdomain.Trim().ToLowerInvariant();
            query = query.Where(catalogEvent =>
                catalogEvent.Domain.Subdomain == domainSubdomain
                || catalogEvent.EventTags.Any(et => et.Domain.Subdomain == domainSubdomain));
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

        if (filter?.AttendanceMode is not null)
        {
            query = query.Where(catalogEvent => catalogEvent.AttendanceMode == filter.AttendanceMode.Value);
        }

        if (!string.IsNullOrWhiteSpace(filter?.Language))
        {
            var language = filter.Language.Trim().ToLowerInvariant();
            query = query.Where(catalogEvent => catalogEvent.Language != null && catalogEvent.Language.ToLower() == language);
        }

        if (!string.IsNullOrWhiteSpace(filter?.Timezone))
        {
            var timezone = filter.Timezone.Trim().ToLowerInvariant();
            query = query.Where(catalogEvent => catalogEvent.Timezone != null && catalogEvent.Timezone.ToLower() == timezone);
        }

        return await ApplySorting(
            query,
            filter?.SortBy,
            normalizedSearchText,
            dbContext.FavoriteEvents,
            domainSlugFilter: NormalizeFilterValue(filter?.DomainSlug),
            domainSubdomainFilter: NormalizeFilterValue(filter?.DomainSubdomain)).ToListAsync(cancellationToken);
    }

    public async Task<CatalogEvent?> GetEventBySlugAsync(
        string slug,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
        => await dbContext.Events
            .AsNoTracking()
            .Include(catalogEvent => catalogEvent.Domain)
            .Include(catalogEvent => catalogEvent.SubmittedBy)
            .Include(catalogEvent => catalogEvent.EventTags)
                .ThenInclude(et => et.Domain)
            .SingleOrDefaultAsync(
                catalogEvent => catalogEvent.Slug == slug && catalogEvent.Status == EventStatus.Published,
                cancellationToken);

    /// <summary>
    /// Returns a single event by ID for the authenticated user (for editing).
    /// Only the event's submitter or a global admin may retrieve it.
    /// </summary>
    [Authorize]
    public async Task<CatalogEvent?> GetEventByIdAsync(
        Guid id,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var currentUserId = claimsPrincipal.GetRequiredUserId();
        var isAdmin = claimsPrincipal.IsAdmin();

        var catalogEvent = await dbContext.Events
            .AsNoTracking()
            .Include(e => e.Domain)
            .Include(e => e.SubmittedBy)
            .Include(e => e.EventTags)
                .ThenInclude(et => et.Domain)
            .SingleOrDefaultAsync(
                e => e.Id == id && (isAdmin || e.SubmittedByUserId == currentUserId),
                cancellationToken);

        return catalogEvent;
    }

    public async Task<IReadOnlyList<EventDomain>> GetDomainsAsync(
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Domains.AsNoTracking()
            .Include(d => d.Links.OrderBy(l => l.DisplayOrder))
            .AsQueryable();
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
            .Include(d => d.Links.OrderBy(l => l.DisplayOrder))
            .SingleOrDefaultAsync(
                domain => domain.Subdomain == subdomain.Trim().ToLowerInvariant() && domain.IsActive,
                cancellationToken);

    /// <summary>
    /// Returns a single active domain by its slug.
    /// Used by category landing pages to retrieve domain metadata.
    /// </summary>
    public async Task<EventDomain?> GetDomainBySlugAsync(
        string slug,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
        => await dbContext.Domains
            .AsNoTracking()
            .Include(d => d.Links.OrderBy(l => l.DisplayOrder))
            .SingleOrDefaultAsync(
                domain => domain.Slug == slug.Trim().ToLowerInvariant() && domain.IsActive,
                cancellationToken);

    /// <summary>
    /// Returns the enabled curated community groups for a domain hub, ordered by DisplayOrder.
    /// Only enabled entries for active community groups are returned.
    /// Both public and private groups may appear — private groups are explicitly curated
    /// by a hub administrator and show a "Request Access" call-to-action to users.
    /// Publicly accessible without authentication.
    /// </summary>
    public async Task<IReadOnlyList<DomainCuratedCommunity>> GetCuratedCommunitiesForDomainAsync(
        string domainSlug,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var normalizedSlug = domainSlug.Trim().ToLowerInvariant();
        var entries = await dbContext.DomainCuratedCommunities
            .AsNoTracking()
            .Where(dcc => dcc.Domain.Slug == normalizedSlug && dcc.Domain.IsActive)
            .Where(dcc => dcc.IsEnabled)
            .Where(dcc => dcc.Group.IsActive)
            .OrderBy(dcc => dcc.DisplayOrder)
            .Include(dcc => dcc.Group)
            .ToListAsync(cancellationToken);

        if (entries.Count > 0)
        {
            // Compute upcoming published event counts per group — aggregate only, no PII exposed.
            // Query is written as an explicit join starting from Events (not via a navigation property
            // on CommunityGroupEvent) so EF Core translates it into a clean parameterised SQL JOIN
            // with no risk of lazy-loading or N+1 issues.
            var groupIds = entries.Select(e => e.GroupId).ToList();
            var now = DateTime.UtcNow;
            var counts = await dbContext.Events
                .AsNoTracking()
                .Where(e => e.Status == EventStatus.Published && e.StartsAtUtc > now)
                .Join(
                    dbContext.CommunityGroupEvents.Where(cge => groupIds.Contains(cge.GroupId)),
                    e => e.Id,
                    cge => cge.EventId,
                    (e, cge) => cge.GroupId)
                .GroupBy(groupId => groupId)
                .Select(g => new { GroupId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(g => g.GroupId, g => g.Count, cancellationToken);

            foreach (var entry in entries)
                entry.UpcomingPublishedEventCount = counts.GetValueOrDefault(entry.GroupId, 0);
        }

        return entries;
    }

    /// <summary>
    /// Returns all curated community entries for a domain hub (including disabled),
    /// for use in the hub management UI.
    /// Restricted to domain administrators and global administrators.
    /// </summary>
    [Authorize]
    public async Task<IReadOnlyList<DomainCuratedCommunity>> GetDomainCuratedCommunitiesAdminAsync(
        Guid domainId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!claimsPrincipal.IsAdmin())
        {
            var currentUserId = claimsPrincipal.GetRequiredUserId();
            var isDomainAdmin = await dbContext.DomainAdministrators.AnyAsync(
                da => da.DomainId == domainId && da.UserId == currentUserId,
                cancellationToken);

            if (!isDomainAdmin)
            {
                throw new GraphQLException(ErrorBuilder.New()
                    .SetMessage("You must be a global administrator or a domain administrator to perform this action.")
                    .SetCode("FORBIDDEN")
                    .Build());
            }
        }

        return await dbContext.DomainCuratedCommunities
            .AsNoTracking()
            .Where(dcc => dcc.DomainId == domainId)
            .OrderBy(dcc => dcc.DisplayOrder)
            .Include(dcc => dcc.Group)
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Returns the curated featured events for a domain hub, ordered by DisplayOrder.
    /// Only published events that belong to the domain are returned.
    /// Events that have been unpublished or deleted after being featured are silently excluded.
    /// Publicly accessible without authentication.
    /// </summary>
    public async Task<IReadOnlyList<CatalogEvent>> GetFeaturedEventsForDomainAsync(
        string domainSlug,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var normalizedSlug = domainSlug.Trim().ToLowerInvariant();
        var now = DateTime.UtcNow;

        // Prefer active scheduled highlights when any exist.
        var scheduled = await dbContext.ScheduledFeaturedEvents
            .AsNoTracking()
            .Where(sfe => sfe.Domain.Slug == normalizedSlug && sfe.Domain.IsActive)
            .Where(sfe => sfe.IsEnabled)
            .Where(sfe => sfe.StartsAtUtc <= now && sfe.EndsAtUtc > now)
            .Where(sfe => sfe.Event.Status == EventStatus.Published)
            // Deterministic conflict-resolution order (documented on ScheduledFeaturedEvent):
            //   1. Priority ascending (lower value = higher importance, e.g. 0 beats 5)
            //   2. Nearest EndsAtUtc first (promote event with shortest remaining window)
            //   3. Event.PublishedAtUtc descending (newest publish date wins any remaining tie)
            .OrderBy(sfe => sfe.Priority)
            .ThenBy(sfe => sfe.EndsAtUtc)
            .ThenByDescending(sfe => sfe.Event.PublishedAtUtc)
            .Include(sfe => sfe.Event)
                .ThenInclude(e => e.Domain)
            .Include(sfe => sfe.Event)
                .ThenInclude(e => e.SubmittedBy)
            .Select(sfe => sfe.Event)
            .ToListAsync(cancellationToken);

        if (scheduled.Count > 0)
        {
            return scheduled;
        }

        // Fallback: return static curated featured events.
        return await dbContext.DomainFeaturedEvents
            .AsNoTracking()
            .Where(fe => fe.Domain.Slug == normalizedSlug && fe.Domain.IsActive)
            .Where(fe => fe.Event.Status == EventStatus.Published)
            .OrderBy(fe => fe.DisplayOrder)
            .Include(fe => fe.Event)
                .ThenInclude(e => e.Domain)
            .Include(fe => fe.Event)
                .ThenInclude(e => e.SubmittedBy)
            .Select(fe => fe.Event)
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Returns all scheduled featured-event entries for a domain hub.
    /// Includes upcoming, currently active, and recently expired schedules.
    /// Restricted to domain administrators and global administrators.
    /// </summary>
    [Authorize]
    public async Task<IReadOnlyList<ScheduledFeaturedEvent>> GetScheduledFeaturedEventsAsync(
        Guid domainId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!claimsPrincipal.IsAdmin())
        {
            var currentUserId = claimsPrincipal.GetRequiredUserId();
            var isDomainAdmin = await dbContext.DomainAdministrators.AnyAsync(
                da => da.DomainId == domainId && da.UserId == currentUserId,
                cancellationToken);

            if (!isDomainAdmin)
            {
                throw new GraphQLException(
                    ErrorBuilder.New()
                        .SetMessage("You must be a global administrator or a domain administrator to view scheduled featured events.")
                        .SetCode("FORBIDDEN")
                        .Build());
            }
        }

        return await dbContext.ScheduledFeaturedEvents
            .AsNoTracking()
            .Where(sfe => sfe.DomainId == domainId)
            .Include(sfe => sfe.Event)
                .ThenInclude(e => e.Domain)
            .Include(sfe => sfe.Event)
                .ThenInclude(e => e.SubmittedBy)
            .OrderBy(sfe => sfe.StartsAtUtc)
            .ThenBy(sfe => sfe.Priority)
            .ToListAsync(cancellationToken);
    }


    [Authorize]
    public async Task<IReadOnlyList<DomainAdministrator>> GetDomainAdministratorsAsync(
        Guid domainId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!claimsPrincipal.IsAdmin())
        {
            var currentUserId = claimsPrincipal.GetRequiredUserId();
            var isDomainAdmin = await dbContext.DomainAdministrators.AnyAsync(
                da => da.DomainId == domainId && da.UserId == currentUserId,
                cancellationToken);

            if (!isDomainAdmin)
            {
                throw new GraphQLException(
                    ErrorBuilder.New()
                        .SetMessage("You must be a global administrator or a domain administrator to view this.")
                        .SetCode("FORBIDDEN")
                        .Build());
            }
        }

        return await dbContext.DomainAdministrators
            .AsNoTracking()
            .Include(da => da.User)
            .Include(da => da.Domain)
            .Where(da => da.DomainId == domainId)
            .OrderBy(da => da.User.DisplayName)
            .ToListAsync(cancellationToken);
    }

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

        var managedEventIds = managedEvents.Select(e => e.Id).ToList();

        var now = DateTime.UtcNow;
        var cutoff7Days = now.AddDays(-7);
        var cutoff30Days = now.AddDays(-30);

        // Load favorite/save timestamps for all managed events in one query
        var favoriteCounts = await dbContext.FavoriteEvents
            .AsNoTracking()
            .Where(f => managedEventIds.Contains(f.EventId))
            .GroupBy(f => f.EventId)
            .Select(g => new
            {
                EventId = g.Key,
                Total = g.Count(),
                Last7Days = g.Count(f => f.CreatedAtUtc >= cutoff7Days),
                Last30Days = g.Count(f => f.CreatedAtUtc >= cutoff30Days),
            })
            .ToListAsync(cancellationToken);

        var favoriteCountsByEventId = favoriteCounts.ToDictionary(x => x.EventId);

        // Load calendar analytics for all managed events in one query
        var calendarActions = await dbContext.CalendarAnalyticsActions
            .AsNoTracking()
            .Where(a => managedEventIds.Contains(a.EventId))
            .Select(a => new { a.EventId, a.Provider, a.TriggeredAtUtc })
            .ToListAsync(cancellationToken);

        var calendarActionsByEventId = calendarActions
            .GroupBy(a => a.EventId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var eventAnalytics = managedEvents
            .Select(e =>
            {
                var counts = favoriteCountsByEventId.TryGetValue(e.Id, out var c) ? c : null;
                var calActions = calendarActionsByEventId.TryGetValue(e.Id, out var ca) ? ca : [];
                var providerBreakdown = calActions
                    .GroupBy(a => a.Provider)
                    .Select(g => new CalendarProviderCount(g.Key, g.Count()))
                    .ToList();
                return new EventAnalyticsItem(
                    EventId: e.Id,
                    EventName: e.Name,
                    EventSlug: e.Slug,
                    Status: e.Status,
                    TotalInterestedCount: counts?.Total ?? 0,
                    InterestedLast7Days: counts?.Last7Days ?? 0,
                    InterestedLast30Days: counts?.Last30Days ?? 0,
                    StartsAtUtc: e.StartsAtUtc,
                    TotalCalendarActions: calActions.Count,
                    CalendarActionsLast7Days: calActions.Count(a => a.TriggeredAtUtc >= cutoff7Days),
                    CalendarActionsLast30Days: calActions.Count(a => a.TriggeredAtUtc >= cutoff30Days),
                    CalendarActionsByProvider: providerBreakdown,
                    AdminNotes: e.AdminNotes,
                    DomainSlug: e.Domain?.Slug,
                    Language: e.Language,
                    Timezone: e.Timezone,
                    PublishedAtUtc: e.PublishedAtUtc,
                    // Online-only events don't need a physical venue; in-person/hybrid events
                    // must have a non-empty VenueName for the venue-completeness recommendation.
                    HasVenueDetails: e.AttendanceMode == AttendanceMode.Online
                        || !string.IsNullOrWhiteSpace(e.VenueName));
            })
            .ToList();

        var publishedAnalytics = eventAnalytics.Where(a => a.Status == EventStatus.Published).ToList();

        var totalInterestedCount = publishedAnalytics.Sum(a => a.TotalInterestedCount);
        var totalInterestedLast7Days = publishedAnalytics.Sum(a => a.InterestedLast7Days);
        var totalInterestedLast30Days = publishedAnalytics.Sum(a => a.InterestedLast30Days);

        var totalCalendarActions = publishedAnalytics.Sum(a => a.TotalCalendarActions);
        var totalCalendarActionsLast7Days = publishedAnalytics.Sum(a => a.CalendarActionsLast7Days);
        var totalCalendarActionsLast30Days = publishedAnalytics.Sum(a => a.CalendarActionsLast30Days);

        var availableDomains = await dbContext.Domains
            .AsNoTracking()
            .Where(domain => domain.IsActive)
            .OrderBy(domain => domain.Name)
            .ToListAsync(cancellationToken);

        return new DashboardOverview(
            TotalSubmittedEvents: managedEvents.Count,
            PublishedEvents: managedEvents.Count(catalogEvent => catalogEvent.Status == EventStatus.Published),
            PendingApprovalEvents: managedEvents.Count(catalogEvent => catalogEvent.Status == EventStatus.PendingApproval),
            RejectedEvents: managedEvents.Count(catalogEvent => catalogEvent.Status == EventStatus.Rejected),
            DraftEvents: managedEvents.Count(catalogEvent => catalogEvent.Status == EventStatus.Draft),
            TotalInterestedCount: totalInterestedCount,
            TotalInterestedLast7Days: totalInterestedLast7Days,
            TotalInterestedLast30Days: totalInterestedLast30Days,
            TotalCalendarActions: totalCalendarActions,
            TotalCalendarActionsLast7Days: totalCalendarActionsLast7Days,
            TotalCalendarActionsLast30Days: totalCalendarActionsLast30Days,
            ManagedEvents: managedEvents,
            EventAnalytics: eventAnalytics,
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

        var pendingExternalSourceClaims = await dbContext.ExternalSourceClaims
            .AsNoTracking()
            .Include(esc => esc.Group)
            .Include(esc => esc.CreatedBy)
            .Where(esc => esc.Status == ExternalSourceClaimStatus.PendingReview)
            .OrderBy(esc => esc.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        var groups = await dbContext.CommunityGroups
            .AsNoTracking()
            .OrderBy(cg => cg.Name)
            .ToListAsync(cancellationToken);

        var membershipCounts = await dbContext.CommunityMemberships
            .AsNoTracking()
            .Where(cm => groups.Select(g => g.Id).Contains(cm.GroupId))
            .GroupBy(cm => new { cm.GroupId, cm.Status })
            .Select(g => new { g.Key.GroupId, g.Key.Status, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var communityGroupSummaries = groups.Select(g =>
        {
            var activeCount = membershipCounts
                .Where(m => m.GroupId == g.Id && m.Status == CommunityMemberStatus.Active)
                .Sum(m => m.Count);
            var pendingCount = membershipCounts
                .Where(m => m.GroupId == g.Id && m.Status == CommunityMemberStatus.Pending)
                .Sum(m => m.Count);
            return new CommunityGroupAdminSummary(
                Id: g.Id,
                Name: g.Name,
                Slug: g.Slug,
                Visibility: g.Visibility,
                IsActive: g.IsActive,
                ActiveMemberCount: activeCount,
                PendingRequestCount: pendingCount,
                CreatedAtUtc: g.CreatedAtUtc);
        }).ToList();

        return new AdminOverview(
            TotalUsers: users.Count,
            TotalDomains: domains.Count,
            TotalPublishedEvents: totalPublishedEvents,
            TotalPendingEvents: pendingReviewEvents.Count,
            Users: users,
            PendingReviewEvents: pendingReviewEvents,
            Domains: domains,
            PendingExternalSourceClaims: pendingExternalSourceClaims,
            TotalCommunityGroups: groups.Count,
            CommunityGroups: communityGroupSummaries);
    }

    private static IOrderedQueryable<CatalogEvent> ApplySorting(
        IQueryable<CatalogEvent> query,
        EventSortOption? sortBy,
        string? normalizedSearchText,
        IQueryable<FavoriteEvent>? favoriteEventsSource = null,
        DateTime? utcNow = null,
        string? domainSlugFilter = null,
        string? domainSubdomainFilter = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        return sortBy switch
        {
            EventSortOption.Newest => query
                .OrderByDescending(catalogEvent => catalogEvent.SubmittedAtUtc)
                .ThenBy(catalogEvent => catalogEvent.StartsAtUtc),
            EventSortOption.Relevance when normalizedSearchText is not null => query
                .OrderByDescending(catalogEvent => catalogEvent.Name.ToLower().StartsWith(normalizedSearchText))
                .ThenByDescending(catalogEvent => catalogEvent.Name.ToLower().Contains(normalizedSearchText))
                .ThenByDescending(catalogEvent => catalogEvent.Description.ToLower().Contains(normalizedSearchText))
                // Within the same match tier: upcoming events appear before past events
                .ThenBy(catalogEvent => catalogEvent.StartsAtUtc < now ? 1 : 0)
                .ThenBy(catalogEvent => catalogEvent.StartsAtUtc),
            _ => BuildUpcomingSort(query, now, favoriteEventsSource, domainSlugFilter, domainSubdomainFilter),
        };
    }

    /// <summary>
    /// Constructs the default UPCOMING sort with deterministic, documented heuristics:
    /// 1. Upcoming events (starts at or after now) before past events.
    /// 2. Within each bucket: ascending by start date (nearest upcoming first).
    /// 3. Domain-fit tiebreaker (only active when a domain slug/subdomain filter is set) —
    ///    events whose PRIMARY domain matches the hub filter rank ahead of events that appear
    ///    in this hub only via a secondary EventTag. This makes domain hub pages feel more
    ///    curated toward their own community.
    /// 4. Metadata completeness tiebreaker — events with more filled-in contextual fields
    ///    (city, venue name, event URL, language, timezone) rank higher than sparse listings.
    ///    Each present field contributes 1 point (max 5); higher completeness ranks first.
    ///    Language and timezone are included because they help multilingual/distributed
    ///    audiences immediately identify relevant events, making well-described events more
    ///    discoverable than sparse ones at the same date.
    /// 5. Engagement signal — events saved by more attendees surface above zero-save
    ///    events with identical completeness, rewarding well-prepared submissions.
    /// 6. Publication freshness tiebreaker — within the same engagement tier, recently
    ///    published events (newest PublishedAtUtc) surface above older listings, rewarding
    ///    organizers who keep content current and signalling timeliness to users.
    /// 7. Alphabetical name as a final deterministic tiebreaker.
    /// </summary>
    private static IOrderedQueryable<CatalogEvent> BuildUpcomingSort(
        IQueryable<CatalogEvent> query,
        DateTime now,
        IQueryable<FavoriteEvent>? favoriteEventsSource,
        string? domainSlugFilter = null,
        string? domainSubdomainFilter = null)
    {
        var sorted = query
            // Upcoming events (starts today or later) before past events
            .OrderBy(catalogEvent => catalogEvent.StartsAtUtc < now ? 1 : 0)
            // Within each group: ascending by start date (nearest upcoming first; oldest past first)
            .ThenBy(catalogEvent => catalogEvent.StartsAtUtc);

        // Domain-fit tiebreaker: when browsing a specific hub, events whose PRIMARY domain is
        // this hub rank above events that only appear here via a secondary EventTag. This
        // preserves the curated, community-centric feel of each hub page. When no domain filter
        // is active the expression evaluates to 0 for every event, so ordering is unchanged.
        if (!string.IsNullOrEmpty(domainSlugFilter))
        {
            sorted = sorted.ThenByDescending(catalogEvent =>
                catalogEvent.Domain.Slug == domainSlugFilter ? 1 : 0);
        }
        else if (!string.IsNullOrEmpty(domainSubdomainFilter))
        {
            sorted = sorted.ThenByDescending(catalogEvent =>
                catalogEvent.Domain.Subdomain == domainSubdomainFilter ? 1 : 0);
        }

        sorted = sorted
            // Tiebreaker: prefer events with richer metadata — venue, city, event URL, language,
            // and timezone each contribute 1 point (max 5). Events with better contextual
            // information feel more trustworthy and help multilingual/distributed audiences
            // identify the right event faster.
            .ThenByDescending(catalogEvent =>
                (string.IsNullOrEmpty(catalogEvent.City) ? 0 : 1) +
                (string.IsNullOrEmpty(catalogEvent.VenueName) ? 0 : 1) +
                (string.IsNullOrEmpty(catalogEvent.EventUrl) ? 0 : 1) +
                (string.IsNullOrEmpty(catalogEvent.Language) ? 0 : 1) +
                (string.IsNullOrEmpty(catalogEvent.Timezone) ? 0 : 1));

        // Engagement signal: events saved by more attendees surface above zero-save events
        // with identical completeness. Privacy-safe: only aggregate counts are used.
        //
        // Implementation note: EF Core translates the Count() subquery below into a single
        // SQL statement with a correlated COUNT subquery in the ORDER BY clause — not N+1
        // round-trips. The generated SQL is equivalent to:
        //   ORDER BY (SELECT COUNT(*) FROM FavoriteEvents WHERE EventId = Events.Id) DESC
        // For catalogs with a large number of events (thousands+), a pre-grouped LEFT JOIN
        // (GROUP BY EventId then JOIN) would generate a more efficient execution plan.
        // The current approach is correct and avoids extra round-trips for the catalog sizes
        // this application targets.
        if (favoriteEventsSource != null)
        {
            return sorted
                .ThenByDescending(catalogEvent =>
                    favoriteEventsSource.Count(f => f.EventId == catalogEvent.Id))
                // Publication freshness: within the same engagement tier, more recently published
                // events appear first. Applied after engagement so that events with genuine user
                // interest are not displaced by newer but untested listings.
                .ThenByDescending(catalogEvent => catalogEvent.PublishedAtUtc)
                .ThenBy(catalogEvent => catalogEvent.Name);
        }

        return sorted
            // Publication freshness tiebreaker (no favorite-events source available)
            .ThenByDescending(catalogEvent => catalogEvent.PublishedAtUtc)
            .ThenBy(catalogEvent => catalogEvent.Name);
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

    // ── Push notification queries ─────────────────────────────────────────────

    /// <summary>
    /// Returns the authenticated user's current push subscription status.
    /// Returns null if the user has no registered subscription.
    /// </summary>
    [Authorize]
    public async Task<PushSubscriptionStatus?> GetMyPushSubscriptionAsync(
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var currentUserId = claimsPrincipal.GetRequiredUserId();

        var subscription = await dbContext.PushSubscriptions
            .SingleOrDefaultAsync(ps => ps.UserId == currentUserId, cancellationToken);

        if (subscription is null) return null;

        return new PushSubscriptionStatus(true, subscription.Endpoint, subscription.CreatedAtUtc);
    }

    /// <summary>
    /// Returns all event reminders for the authenticated user (including sent ones).
    /// </summary>
    [Authorize]
    public async Task<IReadOnlyList<EventReminderItem>> GetMyEventRemindersAsync(
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var currentUserId = claimsPrincipal.GetRequiredUserId();

        var reminders = await dbContext.EventReminders
            .Where(r => r.UserId == currentUserId)
            .OrderBy(r => r.ScheduledForUtc)
            .ToListAsync(cancellationToken);

        return reminders
            .Select(r => new EventReminderItem(
                r.Id,
                r.EventId,
                r.OffsetHours,
                r.ScheduledForUtc,
                r.SentAtUtc,
                r.CreatedAtUtc))
            .ToList();
    }

    /// <summary>
    /// Returns the domains where the current authenticated user is a domain administrator.
    /// This allows non-global-admin domain stewards to manage their hub's branding and metadata.
    /// </summary>
    [Authorize]
    public async Task<IReadOnlyList<EventDomain>> GetMyManagedDomainsAsync(
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetRequiredUserId();
        var domains = await dbContext.Domains
            .AsNoTracking()
            .Include(d => d.Links)
            .Where(d => dbContext.DomainAdministrators.Any(da => da.DomainId == d.Id && da.UserId == userId))
            .OrderBy(d => d.Name)
            .ToListAsync(cancellationToken);

        foreach (var domain in domains)
        {
            domain.Links = domain.Links.OrderBy(l => l.DisplayOrder).ToList();
        }

        return domains;
    }

    /// <summary>
    /// Returns the VAPID public key that the frontend needs to create a push subscription.
    /// Empty string means push notifications are not configured on this server.
    /// </summary>
    public string GetVapidPublicKey([Service] Microsoft.Extensions.Options.IOptions<EventsApi.Configuration.VapidOptions> vapidOptions)
        => vapidOptions.Value.PublicKey;

    // ── Community group queries ───────────────────────────────────────────────

    /// <summary>
    /// Returns all active community groups visible to the current caller.
    /// Public groups are visible to everyone.
    /// Private groups are visible only to members and global admins.
    /// </summary>
    public async Task<IReadOnlyList<CommunityGroup>> GetCommunityGroupsAsync(
        ClaimsPrincipal? claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal?.Identity?.IsAuthenticated == true
            ? claimsPrincipal.GetRequiredUserId()
            : (Guid?)null;

        var isAdmin = claimsPrincipal?.IsAdmin() ?? false;

        return await dbContext.CommunityGroups
            .AsNoTracking()
            .Where(cg => cg.IsActive && (
                cg.Visibility == CommunityVisibility.Public ||
                isAdmin ||
                (userId != null && dbContext.CommunityMemberships.Any(
                    cm => cm.GroupId == cg.Id && cm.UserId == userId && cm.Status == CommunityMemberStatus.Active))))
            .OrderBy(cg => cg.Name)
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Returns a single community group by its slug, including associated published events and member count.
    /// Private groups are accessible only to active members and global admins.
    /// Returns null when the group does not exist, is not active, or the caller lacks access.
    /// </summary>
    public async Task<CommunityGroupDetail?> GetCommunityGroupBySlugAsync(
        string slug,
        ClaimsPrincipal? claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var normalizedSlug = slug.Trim().ToLowerInvariant();
        var group = await dbContext.CommunityGroups
            .AsNoTracking()
            .Include(cg => cg.CreatedBy)
            .FirstOrDefaultAsync(cg => cg.Slug == normalizedSlug && cg.IsActive, cancellationToken);

        if (group is null) return null;

        var userId = claimsPrincipal?.Identity?.IsAuthenticated == true
            ? claimsPrincipal.GetRequiredUserId()
            : (Guid?)null;

        var isAdmin = claimsPrincipal?.IsAdmin() ?? false;

        if (group.Visibility == CommunityVisibility.Private && !isAdmin)
        {
            if (userId is null) return null;
            var hasAccess = await dbContext.CommunityMemberships.AnyAsync(
                cm => cm.GroupId == group.Id && cm.UserId == userId && cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (!hasAccess) return null;
        }

        var events = await dbContext.CommunityGroupEvents
            .AsNoTracking()
            .Include(cge => cge.Event)
                .ThenInclude(e => e.Domain)
            .Include(cge => cge.Event)
                .ThenInclude(e => e.SubmittedBy)
            .Where(cge => cge.GroupId == group.Id && cge.Event.Status == EventStatus.Published)
            .Select(cge => cge.Event)
            .OrderBy(e => e.StartsAtUtc)
            .ToListAsync(cancellationToken);

        var memberCount = await dbContext.CommunityMemberships
            .CountAsync(cm => cm.GroupId == group.Id && cm.Status == CommunityMemberStatus.Active, cancellationToken);

        CommunityMembership? myMembership = null;
        if (userId is not null)
        {
            myMembership = await dbContext.CommunityMemberships
                .AsNoTracking()
                .Include(cm => cm.Group)
                .FirstOrDefaultAsync(cm => cm.GroupId == group.Id && cm.UserId == userId, cancellationToken);
        }

        // Related hubs: find domain hubs that have explicitly curated this community.
        // Max 3 results, ordered by DisplayOrder for deterministic output.
        // Only active, enabled entries for active domains are returned — no private metadata exposed.
        const int MaxRelatedHubs = 3;
        var relatedHubEntries = await dbContext.DomainCuratedCommunities
            .AsNoTracking()
            .Where(dcc => dcc.GroupId == group.Id && dcc.IsEnabled && dcc.Domain.IsActive)
            .OrderBy(dcc => dcc.DisplayOrder)
            .Take(MaxRelatedHubs)
            .Select(dcc => new RelatedHubEntry(
                dcc.Domain.Id.ToString(),
                dcc.Domain.Name,
                dcc.Domain.Slug,
                dcc.Domain.Description,
                dcc.Domain.LogoUrl,
                dcc.Domain.PrimaryColor))
            .ToListAsync(cancellationToken);

        return new CommunityGroupDetail(group, events, memberCount, myMembership, relatedHubEntries);
    }

    /// <summary>
    /// Returns all community groups the authenticated user belongs to (any status/role).
    /// </summary>
    [Authorize]
    public async Task<IReadOnlyList<CommunityMembership>> GetMyCommunityMembershipsAsync(
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetRequiredUserId();
        return await dbContext.CommunityMemberships
            .AsNoTracking()
            .Include(cm => cm.Group)
            .Where(cm => cm.UserId == userId)
            .OrderBy(cm => cm.Group.Name)
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Returns pending membership requests for a group. Only group admins may call this.
    /// </summary>
    [Authorize]
    public async Task<IReadOnlyList<CommunityMembership>> GetPendingMembershipRequestsAsync(
        Guid groupId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetRequiredUserId();
        var isAdmin = claimsPrincipal.IsAdmin();

        if (!isAdmin)
        {
            var isGroupAdmin = await dbContext.CommunityMemberships.AnyAsync(
                cm => cm.GroupId == groupId && cm.UserId == userId &&
                      (cm.Role == CommunityMemberRole.Admin || cm.Role == CommunityMemberRole.Owner) &&
                      cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (!isGroupAdmin)
                throw new GraphQLException(
                    ErrorBuilder.New()
                        .SetMessage("Only group administrators can view membership requests.")
                        .SetCode("FORBIDDEN")
                        .Build());
        }

        return await dbContext.CommunityMemberships
            .AsNoTracking()
            .Include(cm => cm.User)
            .Where(cm => cm.GroupId == groupId && cm.Status == CommunityMemberStatus.Pending)
            .OrderBy(cm => cm.CreatedAtUtc)
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Returns all active members of a group. Only group admins (or global admins) may call this.
    /// </summary>
    [Authorize]
    public async Task<IReadOnlyList<CommunityMembership>> GetGroupMembersAsync(
        Guid groupId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetRequiredUserId();
        var isAdmin = claimsPrincipal.IsAdmin();

        if (!isAdmin)
        {
            var isGroupAdmin = await dbContext.CommunityMemberships.AnyAsync(
                cm => cm.GroupId == groupId && cm.UserId == userId &&
                      (cm.Role == CommunityMemberRole.Admin || cm.Role == CommunityMemberRole.Owner) &&
                      cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (!isGroupAdmin)
                throw new GraphQLException(
                    ErrorBuilder.New()
                        .SetMessage("Only group administrators can view member lists.")
                        .SetCode("FORBIDDEN")
                        .Build());
        }

        return await dbContext.CommunityMemberships
            .AsNoTracking()
            .Include(cm => cm.User)
            .Where(cm => cm.GroupId == groupId && cm.Status == CommunityMemberStatus.Active)
            .OrderBy(cm => cm.Role.ToString())
                .ThenBy(cm => cm.User.DisplayName)
            .ToListAsync(cancellationToken);
    }

    // ── External source claim queries ─────────────────────────────────────────

    /// <summary>
    /// Returns all external-source claims for a community group.
    /// Only group admins (or global admins) may call this.
    /// </summary>
    [Authorize]
    public async Task<IReadOnlyList<ExternalSourceClaim>> GetGroupExternalSourcesAsync(
        Guid groupId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetRequiredUserId();
        var isAdmin = claimsPrincipal.IsAdmin();

        if (!isAdmin)
        {
            var isGroupAdmin = await dbContext.CommunityMemberships.AnyAsync(
                cm => cm.GroupId == groupId && cm.UserId == userId &&
                      (cm.Role == CommunityMemberRole.Admin || cm.Role == CommunityMemberRole.Owner) &&
                      cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (!isGroupAdmin)
                throw new GraphQLException(
                    ErrorBuilder.New()
                        .SetMessage("Only group administrators can view external source claims.")
                        .SetCode("FORBIDDEN")
                        .Build());
        }

        return await dbContext.ExternalSourceClaims
            .AsNoTracking()
            .Where(esc => esc.GroupId == groupId)
            .OrderBy(esc => esc.SourceType.ToString())
                .ThenBy(esc => esc.SourceUrl)
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Fetches candidate events from a linked external source without importing them.
    /// Each candidate is annotated with duplicate-detection and importability metadata
    /// so the administrator can make an informed selection before calling importExternalEvents.
    /// Only group admins (or global admins) may call this.
    /// The claim must be in Verified status.
    /// </summary>
    [Authorize]
    public async Task<IReadOnlyList<ExternalEventPreview>> GetPreviewExternalEventsAsync(
        Guid claimId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        [Service] ExternalSourceAdapterFactory adapterFactory,
        CancellationToken cancellationToken)
    {
        var claim = await dbContext.ExternalSourceClaims
            .AsNoTracking()
            .SingleOrDefaultAsync(esc => esc.Id == claimId, cancellationToken)
            ?? throw new GraphQLException(
                ErrorBuilder.New()
                    .SetMessage("External source claim not found.")
                    .SetCode("CLAIM_NOT_FOUND")
                    .Build());

        var userId = claimsPrincipal.GetRequiredUserId();
        if (!claimsPrincipal.IsAdmin())
        {
            var isGroupAdmin = await dbContext.CommunityMemberships.AnyAsync(
                cm => cm.GroupId == claim.GroupId && cm.UserId == userId &&
                      (cm.Role == CommunityMemberRole.Admin || cm.Role == CommunityMemberRole.Owner) &&
                      cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (!isGroupAdmin)
                throw new GraphQLException(
                    ErrorBuilder.New()
                        .SetMessage("Only group administrators can preview external events.")
                        .SetCode("FORBIDDEN")
                        .Build());
        }

        if (claim.Status != ExternalSourceClaimStatus.Verified)
            throw new GraphQLException(
                ErrorBuilder.New()
                    .SetMessage("Only verified claims can be previewed. Please wait for a platform admin to verify this claim.")
                    .SetCode("CLAIM_NOT_VERIFIED")
                    .Build());

        var adapter = adapterFactory.GetAdapter(claim.SourceType);
        var externalEvents = await adapter.FetchEventsAsync(claim.SourceIdentifier, cancellationToken);

        // Batch-load already-imported external IDs for this claim to avoid N+1 queries
        var externalIds = externalEvents.Select(e => e.ExternalId).ToList();
        var alreadyImportedIds = await dbContext.Events
            .AsNoTracking()
            .Where(e => e.ExternalSourceClaimId == claimId && e.ExternalSourceEventId != null
                        && externalIds.Contains(e.ExternalSourceEventId))
            .Select(e => e.ExternalSourceEventId!)
            .ToHashSetAsync(cancellationToken);

        return externalEvents.Select(ext =>
        {
            var alreadyImported = alreadyImportedIds.Contains(ext.ExternalId);
            var isImportable = ext.StartsAtUtc.HasValue;
            var blockReason = isImportable ? null : "Missing start time — cannot import.";

            return new ExternalEventPreview(
                ExternalId: ext.ExternalId,
                Name: ext.Name,
                Description: ext.Description,
                EventUrl: ext.EventUrl,
                StartsAtUtc: ext.StartsAtUtc,
                EndsAtUtc: ext.EndsAtUtc,
                City: ext.City,
                VenueName: ext.VenueName,
                IsFree: ext.IsFree,
                PriceAmount: ext.PriceAmount,
                CurrencyCode: ext.CurrencyCode,
                AlreadyImported: alreadyImported,
                IsImportable: isImportable && !alreadyImported,
                ImportBlockReason: alreadyImported ? "Already imported." : blockReason);
        }).ToList();
    }

    // ── Event submission readiness ──────────────────────────────────────────────

    /// <summary>
    /// Evaluates an organizer's event draft against the platform's submission-readiness
    /// model and returns a structured list of blocking issues and non-blocking recommendations.
    ///
    /// The same rules are applied here as by the frontend composable, keeping validation
    /// authoritative, centralised, and testable independently of the UI.
    ///
    /// Authorization: the caller must own the event or be a platform admin.
    /// </summary>
    [Authorize]
    public async Task<EventReadinessResult> CheckEventReadinessAsync(
        Guid eventId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var currentUserId = claimsPrincipal.GetRequiredUserId();

        var ev = await dbContext.Events
            .AsNoTracking()
            .Include(e => e.Domain)
            .SingleOrDefaultAsync(e => e.Id == eventId, cancellationToken)
            ?? throw new GraphQLException(
                ErrorBuilder.New()
                    .SetMessage("Event was not found.")
                    .SetCode("EVENT_NOT_FOUND")
                    .Build());

        if (ev.SubmittedByUserId != currentUserId && !claimsPrincipal.IsAdmin())
        {
            throw new GraphQLException(
                ErrorBuilder.New()
                    .SetMessage("You can only check readiness for your own events.")
                    .SetCode("FORBIDDEN")
                    .Build());
        }

        return ComputeEventReadiness(ev);
    }

    /// <summary>
    /// Computes the submission-readiness result for a persisted event.
    /// Mirrors the deterministic model in the frontend useEventReadiness composable
    /// so backend and frontend checks stay in sync.
    /// </summary>
    private static EventReadinessResult ComputeEventReadiness(CatalogEvent ev)
    {
        const int MinDescriptionLength = 50;

        var blocking = new List<EventReadinessIssue>();
        var recommendations = new List<EventReadinessIssue>();

        // ── Blocking checks ────────────────────────────────────────────────────

        if (string.IsNullOrWhiteSpace(ev.Name))
            blocking.Add(new EventReadinessIssue("missingTitle", true, "Add an event title."));

        if (string.IsNullOrWhiteSpace(ev.Description))
            blocking.Add(new EventReadinessIssue("missingDescription", true, "Add a description."));

        if (ev.DomainId == Guid.Empty || ev.Domain is null)
            blocking.Add(new EventReadinessIssue("missingDomain", true, "Choose a category (tag)."));

        if (ev.StartsAtUtc == default)
            blocking.Add(new EventReadinessIssue("missingStartDate", true, "Set a start date and time."));

        if (string.IsNullOrWhiteSpace(ev.EventUrl))
        {
            blocking.Add(new EventReadinessIssue("missingEventUrl", true, "Add a website or registration URL."));
        }
        else if (!Uri.TryCreate(ev.EventUrl, UriKind.Absolute, out var parsedUrl)
                 || (parsedUrl.Scheme != Uri.UriSchemeHttps && parsedUrl.Scheme != Uri.UriSchemeHttp))
        {
            blocking.Add(new EventReadinessIssue("invalidEventUrl", true, "Enter a valid URL (e.g. https://example.com/event)."));
        }

        if (!ev.IsFree && (ev.PriceAmount is null || ev.PriceAmount < 0))
            blocking.Add(new EventReadinessIssue("invalidPrice", true, "Enter a valid price for this paid event."));

        // ── Recommendations ────────────────────────────────────────────────────

        if (string.IsNullOrWhiteSpace(ev.Timezone))
            recommendations.Add(new EventReadinessIssue("missingTimezone", false, "Add a timezone so attendees know the exact local time."));

        var needsVenue = ev.AttendanceMode == AttendanceMode.InPerson || ev.AttendanceMode == AttendanceMode.Hybrid;

        if (needsVenue && string.IsNullOrWhiteSpace(ev.VenueName))
            recommendations.Add(new EventReadinessIssue("missingVenue", false, "Add a venue name for this in-person event."));

        if (needsVenue && string.IsNullOrWhiteSpace(ev.City))
            recommendations.Add(new EventReadinessIssue("missingCity", false, "Add a city to help attendees find the event."));

        var descTrimmed = ev.Description?.Trim() ?? string.Empty;
        if (descTrimmed.Length > 0 && descTrimmed.Length < MinDescriptionLength)
            recommendations.Add(new EventReadinessIssue("shortDescription", false, "Expand the description — a longer description helps attendees decide whether to attend."));

        return new EventReadinessResult(
            CanSubmit: blocking.Count == 0,
            BlockingIssues: blocking,
            Recommendations: recommendations);
    }

    /// <summary>
    /// Returns all discussion entries for a published event in chronological order.
    /// Hidden entries are included (body replaced by a removal notice on the client side).
    /// Accessible without authentication — private moderation data is intentionally excluded.
    /// </summary>
    public async Task<IReadOnlyList<DiscussionEntryPayload>> GetEventDiscussionAsync(
        string eventSlug,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var normalizedSlug = eventSlug.Trim().ToLowerInvariant();

        // Only return discussion for published events — non-published events have null responses
        var eventExists = await dbContext.Events
            .AsNoTracking()
            .AnyAsync(
                e => e.Slug == normalizedSlug && e.Status == EventStatus.Published,
                cancellationToken);

        if (!eventExists)
            return [];

        var entries = await dbContext.EventDiscussionEntries
            .AsNoTracking()
            .Where(e => e.Event.Slug == normalizedSlug)
            .OrderBy(e => e.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return entries
            .Select(e => new DiscussionEntryPayload(
                e.Id,
                e.EventId,
                e.AuthorDisplayName,
                e.AuthorRole,
                e.Body,
                e.ParentEntryId,
                e.IsHidden,
                e.CreatedAtUtc,
                e.UpdatedAtUtc))
            .ToList();
    }

}
