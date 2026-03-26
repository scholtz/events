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
                || catalogEvent.City.ToLower().Contains(normalizedSearchText)
                || catalogEvent.Domain.Name.ToLower().Contains(normalizedSearchText)
                || catalogEvent.SubmittedBy.DisplayName.ToLower().Contains(normalizedSearchText));
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
            .SingleOrDefaultAsync(
                domain => domain.Slug == slug.Trim().ToLowerInvariant() && domain.IsActive,
                cancellationToken);

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
                    CalendarActionsByProvider: providerBreakdown);
            })
            .ToList();

        var totalInterestedCount = eventAnalytics
            .Where(a => a.Status == EventStatus.Published)
            .Sum(a => a.TotalInterestedCount);

        var totalCalendarActions = eventAnalytics
            .Where(a => a.Status == EventStatus.Published)
            .Sum(a => a.TotalCalendarActions);

        var availableDomains = await dbContext.Domains
            .AsNoTracking()
            .Where(domain => domain.IsActive)
            .OrderBy(domain => domain.Name)
            .ToListAsync(cancellationToken);

        return new DashboardOverview(
            TotalSubmittedEvents: managedEvents.Count,
            PublishedEvents: managedEvents.Count(catalogEvent => catalogEvent.Status == EventStatus.Published),
            PendingApprovalEvents: managedEvents.Count(catalogEvent => catalogEvent.Status == EventStatus.PendingApproval),
            TotalInterestedCount: totalInterestedCount,
            TotalCalendarActions: totalCalendarActions,
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
        string? normalizedSearchText,
        DateTime? utcNow = null)
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
                .ThenBy(catalogEvent => catalogEvent.StartsAtUtc),
            _ => query
                // Upcoming events (starts today or later) before past events
                .OrderBy(catalogEvent => catalogEvent.StartsAtUtc < now ? 1 : 0)
                // Within each group: ascending by start date (nearest upcoming first; oldest past first)
                .ThenBy(catalogEvent => catalogEvent.StartsAtUtc)
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
        return await dbContext.DomainAdministrators
            .AsNoTracking()
            .Where(da => da.UserId == userId)
            .Select(da => da.Domain)
            .OrderBy(d => d.Name)
            .ToListAsync(cancellationToken);
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
                .FirstOrDefaultAsync(cm => cm.GroupId == group.Id && cm.UserId == userId, cancellationToken);
        }

        return new CommunityGroupDetail(group, events, memberCount, myMembership);
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
                      cm.Role == CommunityMemberRole.Admin && cm.Status == CommunityMemberStatus.Active,
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
                      cm.Role == CommunityMemberRole.Admin && cm.Status == CommunityMemberStatus.Active,
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
                      cm.Role == CommunityMemberRole.Admin && cm.Status == CommunityMemberStatus.Active,
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
}
