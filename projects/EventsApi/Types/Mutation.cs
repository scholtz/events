using System.Security.Claims;
using System.Text.RegularExpressions;
using EventsApi.Adapters;
using EventsApi.Data;
using EventsApi.Data.Entities;
using EventsApi.Security;
using EventsApi.Utilities;
using HotChocolate;
using HotChocolate.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace EventsApi.Types;

public sealed class Mutation
{
    public async Task<AuthPayload> RegisterUserAsync(
        RegisterUserInput input,
        [Service] AppDbContext dbContext,
        [Service] IPasswordHasher<ApplicationUser> passwordHasher,
        [Service] JwtTokenService jwtTokenService,
        CancellationToken cancellationToken)
    {
        ValidateEmail(input.Email);
        ValidatePassword(input.Password);

        var normalizedEmail = input.Email.Trim().ToLowerInvariant();

        if (await dbContext.Users.AnyAsync(user => user.Email == normalizedEmail, cancellationToken))
        {
            throw CreateError("A user with that email already exists.", "USER_EXISTS");
        }

        var user = new ApplicationUser
        {
            Email = normalizedEmail,
            DisplayName = input.DisplayName.Trim(),
            PasswordHash = string.Empty,
            Role = ApplicationUserRole.Contributor
        };

        user.PasswordHash = passwordHasher.HashPassword(user, input.Password);
        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreateAuthPayload(user, jwtTokenService);
    }

    public async Task<AuthPayload> LoginAsync(
        LoginInput input,
        [Service] AppDbContext dbContext,
        [Service] IPasswordHasher<ApplicationUser> passwordHasher,
        [Service] JwtTokenService jwtTokenService,
        CancellationToken cancellationToken)
    {
        var normalizedEmail = input.Email.Trim().ToLowerInvariant();
        var user = await dbContext.Users.SingleOrDefaultAsync(candidate => candidate.Email == normalizedEmail, cancellationToken)
            ?? throw CreateError("Invalid email or password.", "INVALID_CREDENTIALS");

        var verificationResult = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, input.Password);
        if (verificationResult == PasswordVerificationResult.Failed)
        {
            throw CreateError("Invalid email or password.", "INVALID_CREDENTIALS");
        }

        return CreateAuthPayload(user, jwtTokenService);
    }

    [Authorize]
    public async Task<CatalogEvent> SubmitEventAsync(
        EventSubmissionInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        ValidateEventSubmission(input);

        var currentUser = await dbContext.Users.SingleAsync(
            user => user.Id == claimsPrincipal.GetRequiredUserId(),
            cancellationToken);

        var domain = await dbContext.Domains.SingleOrDefaultAsync(
            candidate => candidate.Slug == input.DomainSlug.Trim().ToLowerInvariant() && candidate.IsActive,
            cancellationToken)
            ?? throw CreateError("The selected domain does not exist.", "DOMAIN_NOT_FOUND");

        var catalogEvent = new CatalogEvent
        {
            Name = input.Name.Trim(),
            Slug = await BuildUniqueEventSlugAsync(dbContext, input.Name, cancellationToken),
            Description = input.Description.Trim(),
            EventUrl = input.EventUrl.Trim(),
            VenueName = input.VenueName.Trim(),
            AddressLine1 = input.AddressLine1.Trim(),
            City = input.City.Trim(),
            CountryCode = input.CountryCode.Trim().ToUpperInvariant(),
            IsFree = input.IsFree,
            PriceAmount = NormalizePriceAmount(input),
            CurrencyCode = NormalizeCurrencyCode(input.CurrencyCode),
            AttendanceMode = input.AttendanceMode,
            Timezone = NormalizeOptionalValue(input.Timezone),
            Language = NormalizeOptionalValue(input.Language),
            Latitude = input.Latitude,
            Longitude = input.Longitude,
            StartsAtUtc = EnsureUtc(input.StartsAtUtc),
            EndsAtUtc = EnsureUtc(input.EndsAtUtc),
            DomainId = domain.Id,
            SubmittedByUserId = currentUser.Id,
            Status = claimsPrincipal.IsAdmin() ? EventStatus.Published : EventStatus.PendingApproval,
            PublishedAtUtc = claimsPrincipal.IsAdmin() ? DateTime.UtcNow : null
        };

        dbContext.Events.Add(catalogEvent);
        await dbContext.SaveChangesAsync(cancellationToken);

        return await dbContext.Events
            .Include(candidate => candidate.Domain)
            .Include(candidate => candidate.SubmittedBy)
            .SingleAsync(candidate => candidate.Id == catalogEvent.Id, cancellationToken);
    }

    [Authorize]
    public async Task<CatalogEvent> UpdateMyEventAsync(
        Guid eventId,
        EventSubmissionInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        ValidateEventSubmission(input);

        var currentUserId = claimsPrincipal.GetRequiredUserId();
        var catalogEvent = await dbContext.Events
            .Include(candidate => candidate.Domain)
            .Include(candidate => candidate.SubmittedBy)
            .SingleOrDefaultAsync(candidate => candidate.Id == eventId, cancellationToken)
            ?? throw CreateError("Event was not found.", "EVENT_NOT_FOUND");

        if (catalogEvent.SubmittedByUserId != currentUserId && !claimsPrincipal.IsAdmin())
        {
            throw CreateError("You can only update your own events.", "FORBIDDEN");
        }

        var domain = await dbContext.Domains.SingleOrDefaultAsync(
            candidate => candidate.Slug == input.DomainSlug.Trim().ToLowerInvariant() && candidate.IsActive,
            cancellationToken)
            ?? throw CreateError("The selected domain does not exist.", "DOMAIN_NOT_FOUND");

        catalogEvent.Name = input.Name.Trim();
        catalogEvent.Slug = await BuildUniqueEventSlugAsync(dbContext, input.Name, cancellationToken, catalogEvent.Id);
        catalogEvent.Description = input.Description.Trim();
        catalogEvent.EventUrl = input.EventUrl.Trim();
        catalogEvent.VenueName = input.VenueName.Trim();
        catalogEvent.AddressLine1 = input.AddressLine1.Trim();
        catalogEvent.City = input.City.Trim();
        catalogEvent.CountryCode = input.CountryCode.Trim().ToUpperInvariant();
        catalogEvent.IsFree = input.IsFree;
        catalogEvent.PriceAmount = NormalizePriceAmount(input);
        catalogEvent.CurrencyCode = NormalizeCurrencyCode(input.CurrencyCode);
        catalogEvent.AttendanceMode = input.AttendanceMode;
        catalogEvent.Timezone = NormalizeOptionalValue(input.Timezone);
        catalogEvent.Language = NormalizeOptionalValue(input.Language);
        catalogEvent.Latitude = input.Latitude;
        catalogEvent.Longitude = input.Longitude;
        catalogEvent.StartsAtUtc = EnsureUtc(input.StartsAtUtc);
        catalogEvent.EndsAtUtc = EnsureUtc(input.EndsAtUtc);
        catalogEvent.DomainId = domain.Id;
        catalogEvent.UpdatedAtUtc = DateTime.UtcNow;

        if (!claimsPrincipal.IsAdmin())
        {
            catalogEvent.Status = EventStatus.PendingApproval;
            catalogEvent.PublishedAtUtc = null;
            catalogEvent.ReviewedByUserId = null;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return catalogEvent;
    }

    [Authorize(Policy = Policies.Admin)]
    public async Task<CatalogEvent> ReviewEventAsync(
        Guid eventId,
        ReviewEventInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var catalogEvent = await dbContext.Events
            .Include(candidate => candidate.Domain)
            .Include(candidate => candidate.SubmittedBy)
            .SingleOrDefaultAsync(candidate => candidate.Id == eventId, cancellationToken)
            ?? throw CreateError("Event was not found.", "EVENT_NOT_FOUND");

        catalogEvent.Status = input.Status;
        catalogEvent.AdminNotes = input.AdminNotes?.Trim();
        catalogEvent.ReviewedByUserId = claimsPrincipal.GetRequiredUserId();
        catalogEvent.UpdatedAtUtc = DateTime.UtcNow;
        catalogEvent.PublishedAtUtc = input.Status == EventStatus.Published ? DateTime.UtcNow : null;

        await dbContext.SaveChangesAsync(cancellationToken);
        return catalogEvent;
    }

    [Authorize(Policy = Policies.Admin)]
    public async Task<EventDomain> UpsertDomainAsync(
        DomainInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var slug = SlugGenerator.Generate(input.Slug);
        var subdomain = SlugGenerator.Generate(input.Subdomain);
        var name = input.Name.Trim();

        var existingDomain = input.Id.HasValue
            ? await dbContext.Domains.SingleOrDefaultAsync(domain => domain.Id == input.Id.Value, cancellationToken)
            : await dbContext.Domains.SingleOrDefaultAsync(domain => domain.Slug == slug, cancellationToken);

        if (existingDomain is null)
        {
            existingDomain = new EventDomain
            {
                Name = name,
                Slug = slug,
                Subdomain = subdomain,
                Description = input.Description?.Trim(),
                IsActive = input.IsActive,
                OverviewContent = NormalizeOptionalValue(input.OverviewContent),
                WhatBelongsHere = NormalizeOptionalValue(input.WhatBelongsHere),
                SubmitEventCta = NormalizeOptionalValue(input.SubmitEventCta),
                CuratorCredit = NormalizeOptionalValue(input.CuratorCredit),
                CreatedByUserId = claimsPrincipal.GetRequiredUserId()
            };

            dbContext.Domains.Add(existingDomain);
            await dbContext.SaveChangesAsync(cancellationToken);

            // The creator automatically becomes the first domain administrator
            dbContext.DomainAdministrators.Add(new DomainAdministrator
            {
                DomainId = existingDomain.Id,
                UserId = claimsPrincipal.GetRequiredUserId()
            });
        }
        else
        {
            existingDomain.Name = name;
            existingDomain.Slug = slug;
            existingDomain.Subdomain = subdomain;
            existingDomain.Description = input.Description?.Trim();
            existingDomain.IsActive = input.IsActive;
            existingDomain.OverviewContent = NormalizeOptionalValue(input.OverviewContent);
            existingDomain.WhatBelongsHere = NormalizeOptionalValue(input.WhatBelongsHere);
            existingDomain.SubmitEventCta = NormalizeOptionalValue(input.SubmitEventCta);
            existingDomain.CuratorCredit = NormalizeOptionalValue(input.CuratorCredit);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return existingDomain;
    }

    [Authorize(Policy = Policies.Admin)]
    public async Task<ApplicationUser> UpdateUserRoleAsync(
        UpdateUserRoleInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var currentUserId = claimsPrincipal.GetRequiredUserId();

        if (input.UserId == currentUserId && input.Role != ApplicationUserRole.Admin)
        {
            throw CreateError(
                "Admins cannot remove their own admin role. Ask another admin to change your role.",
                "SELF_DEMOTION_NOT_ALLOWED");
        }

        var user = await dbContext.Users.SingleOrDefaultAsync(candidate => candidate.Id == input.UserId, cancellationToken)
            ?? throw CreateError("User was not found.", "USER_NOT_FOUND");

        user.Role = input.Role;
        await dbContext.SaveChangesAsync(cancellationToken);
        return user;
    }

    /// <summary>
    /// Adds a user as an administrator of a domain/tag.
    /// Only global admins or existing domain administrators can call this.
    /// </summary>
    [Authorize]
    public async Task<DomainAdministrator> AddDomainAdministratorAsync(
        DomainAdministratorInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        await EnsureDomainAdminOrGlobalAdminAsync(input.DomainId, claimsPrincipal, dbContext, cancellationToken);

        var domain = await dbContext.Domains.SingleOrDefaultAsync(d => d.Id == input.DomainId, cancellationToken)
            ?? throw CreateError("Domain was not found.", "DOMAIN_NOT_FOUND");

        var user = await dbContext.Users.SingleOrDefaultAsync(u => u.Id == input.UserId, cancellationToken)
            ?? throw CreateError("User was not found.", "USER_NOT_FOUND");

        var existing = await dbContext.DomainAdministrators.SingleOrDefaultAsync(
            da => da.DomainId == input.DomainId && da.UserId == input.UserId,
            cancellationToken);

        if (existing is not null)
        {
            return existing;
        }

        var domainAdmin = new DomainAdministrator
        {
            DomainId = domain.Id,
            UserId = user.Id
        };

        dbContext.DomainAdministrators.Add(domainAdmin);
        await dbContext.SaveChangesAsync(cancellationToken);
        return domainAdmin;
    }

    /// <summary>
    /// Removes a user from the administrators of a domain/tag.
    /// Only global admins or existing domain administrators can call this.
    /// </summary>
    [Authorize]
    public async Task<bool> RemoveDomainAdministratorAsync(
        DomainAdministratorInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        await EnsureDomainAdminOrGlobalAdminAsync(input.DomainId, claimsPrincipal, dbContext, cancellationToken);

        var existing = await dbContext.DomainAdministrators.SingleOrDefaultAsync(
            da => da.DomainId == input.DomainId && da.UserId == input.UserId,
            cancellationToken)
            ?? throw CreateError("Domain administrator assignment was not found.", "DOMAIN_ADMIN_NOT_FOUND");

        dbContext.DomainAdministrators.Remove(existing);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>
    /// Updates the visual style/branding of a domain.
    /// Only global admins or domain administrators can call this.
    /// </summary>
    [Authorize]
    public async Task<EventDomain> UpdateDomainStyleAsync(
        UpdateDomainStyleInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        await EnsureDomainAdminOrGlobalAdminAsync(input.DomainId, claimsPrincipal, dbContext, cancellationToken);

        var domain = await dbContext.Domains.SingleOrDefaultAsync(d => d.Id == input.DomainId, cancellationToken)
            ?? throw CreateError("Domain was not found.", "DOMAIN_NOT_FOUND");

        if (input.LogoUrl is not null && !string.IsNullOrWhiteSpace(input.LogoUrl) && !Uri.TryCreate(input.LogoUrl, UriKind.Absolute, out _))
        {
            throw CreateError("Logo URL must be an absolute URL.", "INVALID_LOGO_URL");
        }

        if (input.BannerUrl is not null && !string.IsNullOrWhiteSpace(input.BannerUrl) && !Uri.TryCreate(input.BannerUrl, UriKind.Absolute, out _))
        {
            throw CreateError("Banner URL must be an absolute URL.", "INVALID_BANNER_URL");
        }

        if (input.PrimaryColor is not null && !string.IsNullOrWhiteSpace(input.PrimaryColor) && !IsValidHexColor(input.PrimaryColor))
        {
            throw CreateError("Primary color must be a valid CSS hex color (e.g. \"#137fec\" or \"#fff\").", "INVALID_COLOR");
        }

        if (input.AccentColor is not null && !string.IsNullOrWhiteSpace(input.AccentColor) && !IsValidHexColor(input.AccentColor))
        {
            throw CreateError("Accent color must be a valid CSS hex color (e.g. \"#ff5500\" or \"#f50\").", "INVALID_COLOR");
        }

        domain.PrimaryColor = NormalizeOptionalValue(input.PrimaryColor);
        domain.AccentColor = NormalizeOptionalValue(input.AccentColor);
        domain.LogoUrl = NormalizeOptionalValue(input.LogoUrl);
        domain.BannerUrl = NormalizeOptionalValue(input.BannerUrl);

        await dbContext.SaveChangesAsync(cancellationToken);
        return domain;
    }

    /// <summary>
    /// Updates curator-managed hub overview content for a domain.
    /// Only global admins or domain administrators can call this.
    /// </summary>
    [Authorize]
    public async Task<EventDomain> UpdateDomainOverviewAsync(
        UpdateDomainOverviewInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        await EnsureDomainAdminOrGlobalAdminAsync(input.DomainId, claimsPrincipal, dbContext, cancellationToken);

        var domain = await dbContext.Domains.SingleOrDefaultAsync(d => d.Id == input.DomainId, cancellationToken)
            ?? throw CreateError("Domain was not found.", "DOMAIN_NOT_FOUND");

        if (input.OverviewContent is not null && input.OverviewContent.Length > 2000)
        {
            throw CreateError("Overview content must not exceed 2000 characters.", "INVALID_OVERVIEW_CONTENT");
        }

        if (input.WhatBelongsHere is not null && input.WhatBelongsHere.Length > 1000)
        {
            throw CreateError("'What belongs here' must not exceed 1000 characters.", "INVALID_WHAT_BELONGS_HERE");
        }

        if (input.SubmitEventCta is not null && input.SubmitEventCta.Length > 300)
        {
            throw CreateError("Submission CTA must not exceed 300 characters.", "INVALID_SUBMIT_EVENT_CTA");
        }

        if (input.CuratorCredit is not null && input.CuratorCredit.Length > 200)
        {
            throw CreateError("Curator credit must not exceed 200 characters.", "INVALID_CURATOR_CREDIT");
        }

        domain.OverviewContent = NormalizeOptionalValue(input.OverviewContent);
        domain.WhatBelongsHere = NormalizeOptionalValue(input.WhatBelongsHere);
        domain.SubmitEventCta = NormalizeOptionalValue(input.SubmitEventCta);
        domain.CuratorCredit = NormalizeOptionalValue(input.CuratorCredit);

        await dbContext.SaveChangesAsync(cancellationToken);
        return domain;
    }

    /// <summary>
    /// Replaces the full ordered featured-events list for a domain hub.
    /// Only global admins or domain administrators can call this.
    /// Maximum 5 events. Events must be published and belong to the domain.
    /// Pass an empty EventIds list to clear all featured events.
    /// </summary>
    [Authorize]
    public async Task<IReadOnlyList<CatalogEvent>> SetDomainFeaturedEventsAsync(
        SetDomainFeaturedEventsInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        await EnsureDomainAdminOrGlobalAdminAsync(input.DomainId, claimsPrincipal, dbContext, cancellationToken);

        var domain = await dbContext.Domains.SingleOrDefaultAsync(d => d.Id == input.DomainId, cancellationToken)
            ?? throw CreateError("Domain was not found.", "DOMAIN_NOT_FOUND");

        // De-duplicate while preserving order
        var orderedEventIds = input.EventIds.Distinct().ToList();

        if (orderedEventIds.Count > 5)
        {
            throw CreateError("A domain hub can feature at most 5 events.", "TOO_MANY_FEATURED_EVENTS");
        }

        // Load candidate events once
        var candidateEvents = orderedEventIds.Count > 0
            ? await dbContext.Events
                .Include(e => e.Domain)
                .Include(e => e.SubmittedBy)
                .Where(e => orderedEventIds.Contains(e.Id))
                .ToListAsync(cancellationToken)
            : [];

        // Validate each event: must be published and belong to this domain
        foreach (var eventId in orderedEventIds)
        {
            var catalogEvent = candidateEvents.Find(e => e.Id == eventId)
                ?? throw CreateError($"Event {eventId} was not found.", "EVENT_NOT_FOUND");

            if (catalogEvent.DomainId != input.DomainId)
            {
                throw CreateError(
                    $"Event '{catalogEvent.Name}' does not belong to this domain and cannot be featured here.",
                    "EVENT_WRONG_DOMAIN");
            }

            if (catalogEvent.Status != EventStatus.Published)
            {
                throw CreateError(
                    $"Event '{catalogEvent.Name}' is not published and cannot be featured.",
                    "EVENT_NOT_PUBLISHED");
            }
        }

        // Replace existing featured events for this domain
        var existing = await dbContext.DomainFeaturedEvents
            .Where(fe => fe.DomainId == input.DomainId)
            .ToListAsync(cancellationToken);

        dbContext.DomainFeaturedEvents.RemoveRange(existing);

        for (var i = 0; i < orderedEventIds.Count; i++)
        {
            dbContext.DomainFeaturedEvents.Add(new DomainFeaturedEvent
            {
                DomainId = input.DomainId,
                EventId = orderedEventIds[i],
                DisplayOrder = i
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        // Return the events in the new display order
        return orderedEventIds
            .Select(id => candidateEvents.First(e => e.Id == id))
            .ToList();
    }

    [Authorize]
    public async Task<SavedSearch> SaveSearchAsync(
        SavedSearchInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(input.Name))
        {
            throw CreateError("Saved search name is required.", "INVALID_SAVED_SEARCH");
        }

        var savedSearch = new SavedSearch
        {
            UserId = claimsPrincipal.GetRequiredUserId(),
            Name = input.Name.Trim(),
            SearchText = NormalizeOptionalValue(input.Filter?.SearchText),
            DomainSlug = NormalizeOptionalValue(input.Filter?.DomainSlug),
            LocationText = NormalizeOptionalValue(input.Filter?.LocationText ?? input.Filter?.City),
            StartsFromUtc = input.Filter?.StartsFromUtc is null ? null : EnsureUtc(input.Filter.StartsFromUtc.Value),
            StartsToUtc = input.Filter?.StartsToUtc is null ? null : EnsureUtc(input.Filter.StartsToUtc.Value),
            IsFree = input.Filter?.IsFree,
            PriceMin = input.Filter?.PriceMin,
            PriceMax = input.Filter?.PriceMax,
            SortBy = input.Filter?.SortBy ?? EventSortOption.Upcoming,
            AttendanceMode = input.Filter?.AttendanceMode,
            Language = NormalizeOptionalValue(input.Filter?.Language),
            Timezone = NormalizeOptionalValue(input.Filter?.Timezone)
        };

        dbContext.SavedSearches.Add(savedSearch);
        await dbContext.SaveChangesAsync(cancellationToken);
        return savedSearch;
    }

    [Authorize]
    public async Task<bool> DeleteSavedSearchAsync(
        Guid savedSearchId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var savedSearch = await dbContext.SavedSearches.SingleOrDefaultAsync(
            candidate => candidate.Id == savedSearchId,
            cancellationToken)
            ?? throw CreateError("Saved search was not found.", "SAVED_SEARCH_NOT_FOUND");

        if (savedSearch.UserId != claimsPrincipal.GetRequiredUserId())
        {
            throw CreateError("You can only delete your own saved searches.", "FORBIDDEN");
        }

        dbContext.SavedSearches.Remove(savedSearch);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    [Authorize]
    public async Task<FavoriteEvent> FavoriteEventAsync(
        Guid eventId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var currentUserId = claimsPrincipal.GetRequiredUserId();

        var catalogEvent = await dbContext.Events.SingleOrDefaultAsync(e => e.Id == eventId, cancellationToken)
            ?? throw CreateError("Event was not found.", "EVENT_NOT_FOUND");

        var existing = await dbContext.FavoriteEvents.SingleOrDefaultAsync(
            f => f.UserId == currentUserId && f.EventId == eventId,
            cancellationToken);

        if (existing is not null)
        {
            return existing;
        }

        var favorite = new FavoriteEvent
        {
            UserId = currentUserId,
            EventId = eventId
        };

        dbContext.FavoriteEvents.Add(favorite);
        await dbContext.SaveChangesAsync(cancellationToken);
        return favorite;
    }

    [Authorize]
    public async Task<bool> UnfavoriteEventAsync(
        Guid eventId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var currentUserId = claimsPrincipal.GetRequiredUserId();

        var favorite = await dbContext.FavoriteEvents.SingleOrDefaultAsync(
            f => f.UserId == currentUserId && f.EventId == eventId,
            cancellationToken)
            ?? throw CreateError("Favorite was not found.", "FAVORITE_NOT_FOUND");

        dbContext.FavoriteEvents.Remove(favorite);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>
    /// Records an add-to-calendar action for analytics purposes.
    /// This mutation is intentionally unauthenticated — it accepts anonymous
    /// telemetry from attendees.  No user identity is stored.
    /// The event must exist and be published.
    /// Accepted providers: ICS, GOOGLE, OUTLOOK.
    /// </summary>
    public async Task<bool> TrackCalendarActionAsync(
        TrackCalendarActionInput input,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var normalizedProvider = input.Provider?.Trim().ToUpperInvariant() ?? string.Empty;
        if (normalizedProvider is not ("ICS" or "GOOGLE" or "OUTLOOK"))
        {
            throw CreateError(
                "Provider must be one of: ICS, GOOGLE, OUTLOOK.",
                "INVALID_CALENDAR_PROVIDER");
        }

        var catalogEvent = await dbContext.Events
            .AsNoTracking()
            .SingleOrDefaultAsync(e => e.Id == input.EventId, cancellationToken);

        if (catalogEvent is null)
        {
            throw CreateError("Event was not found.", "EVENT_NOT_FOUND");
        }

        if (catalogEvent.Status != EventStatus.Published)
        {
            throw CreateError("Calendar actions can only be tracked for published events.", "EVENT_NOT_PUBLISHED");
        }

        var action = new CalendarAnalyticsAction
        {
            EventId = input.EventId,
            Provider = normalizedProvider,
            TriggeredAtUtc = DateTime.UtcNow
        };

        dbContext.CalendarAnalyticsActions.Add(action);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> TrackDiscoveryActionAsync(
        TrackDiscoveryActionInput input,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var normalizedActionType = input.ActionType?.Trim().ToUpperInvariant() ?? string.Empty;
        if (normalizedActionType is not ("SEARCH" or "FILTER_CHANGE" or "FILTER_CLEAR" or "RESULT_CLICK"))
        {
            throw CreateError(
                "ActionType must be one of: SEARCH, FILTER_CHANGE, FILTER_CLEAR, RESULT_CLICK.",
                "INVALID_DISCOVERY_ACTION_TYPE");
        }

        var action = new DiscoveryAnalyticsAction
        {
            ActionType = normalizedActionType,
            EventSlug = string.IsNullOrWhiteSpace(input.EventSlug) ? null : input.EventSlug.Trim(),
            ActiveFilterCount = Math.Max(0, input.ActiveFilterCount),
            ResultCount = input.ResultCount.HasValue ? Math.Max(0, input.ResultCount.Value) : null,
            TriggeredAtUtc = DateTime.UtcNow,
        };

        dbContext.DiscoveryAnalyticsActions.Add(action);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static AuthPayload CreateAuthPayload(ApplicationUser user, JwtTokenService jwtTokenService)
    {
        var session = jwtTokenService.CreateSession(user);
        return new AuthPayload(session.Token, session.ExpiresAtUtc, user);
    }

    private static void ValidateEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
        {
            throw CreateError("A valid email address is required.", "INVALID_EMAIL");
        }
    }

    private static void ValidatePassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
        {
            throw CreateError("The password must be at least 8 characters long.", "INVALID_PASSWORD");
        }
    }

    private static void ValidateEventSubmission(EventSubmissionInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name) || string.IsNullOrWhiteSpace(input.Description))
        {
            throw CreateError("Event name and description are required.", "INVALID_EVENT");
        }

        if (EnsureUtc(input.EndsAtUtc) <= EnsureUtc(input.StartsAtUtc))
        {
            throw CreateError("Event end date must be after the start date.", "INVALID_EVENT_DATES");
        }

        if (!Uri.TryCreate(input.EventUrl, UriKind.Absolute, out _))
        {
            throw CreateError("Event URL must be an absolute URL.", "INVALID_EVENT_URL");
        }

        if (input.PriceAmount is not null && input.PriceAmount < 0)
        {
            throw CreateError("Event price cannot be negative.", "INVALID_EVENT_PRICE");
        }

        if (!input.IsFree && input.PriceAmount is null)
        {
            throw CreateError("Paid events require a valid non-negative price.", "INVALID_EVENT_PRICE");
        }

        var timezone = NormalizeOptionalValue(input.Timezone);
        if (timezone is not null && !IsValidIanaTimezone(timezone))
        {
            throw CreateError(
                $"'{timezone}' is not a recognised IANA timezone identifier.",
                "INVALID_TIMEZONE");
        }
    }

    private static bool IsValidIanaTimezone(string tz)
    {
        try
        {
            _ = TimeZoneInfo.FindSystemTimeZoneById(tz);
            return true;
        }
        catch (TimeZoneNotFoundException)
        {
            return false;
        }
    }

    private static DateTime EnsureUtc(DateTime value)
        => value.Kind == DateTimeKind.Utc ? value : value.ToUniversalTime();

    private static decimal? NormalizePriceAmount(EventSubmissionInput input)
    {
        if (input.IsFree)
        {
            return 0m;
        }

        return input.PriceAmount
            ?? throw new InvalidOperationException("Paid events require a validated price amount.");
    }

    private static string NormalizeCurrencyCode(string? currencyCode)
        => string.IsNullOrWhiteSpace(currencyCode) ? "EUR" : currencyCode.Trim().ToUpperInvariant();

    private static string? NormalizeOptionalValue(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>Returns true for 3- or 6-digit CSS hex colors, e.g. "#fff" or "#137fec".</summary>
    private static bool IsValidHexColor(string value)
        => Regex.IsMatch(value.Trim(), @"^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$");

    private static GraphQLException CreateError(string message, string code)
        => new(ErrorBuilder.New().SetMessage(message).SetCode(code).Build());

    /// <summary>
    /// Verifies the calling user is either a global admin or a domain administrator
    /// for the given domain.  Throws FORBIDDEN if neither.
    /// </summary>
    private static async Task EnsureDomainAdminOrGlobalAdminAsync(
        Guid domainId,
        ClaimsPrincipal claimsPrincipal,
        AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (claimsPrincipal.IsAdmin())
        {
            return;
        }

        var currentUserId = claimsPrincipal.GetRequiredUserId();
        var isDomainAdmin = await dbContext.DomainAdministrators.AnyAsync(
            da => da.DomainId == domainId && da.UserId == currentUserId,
            cancellationToken);

        if (!isDomainAdmin)
        {
            throw CreateError(
                "You must be a global administrator or a domain administrator to perform this action.",
                "FORBIDDEN");
        }
    }

    private static async Task<string> BuildUniqueEventSlugAsync(
        AppDbContext dbContext,
        string name,
        CancellationToken cancellationToken,
        Guid? existingEventId = null)
    {
        var baseSlug = SlugGenerator.Generate(name);
        var slug = baseSlug;
        var counter = 2;

        while (await dbContext.Events.AnyAsync(
                   catalogEvent => catalogEvent.Slug == slug && catalogEvent.Id != existingEventId,
                   cancellationToken))
        {
            slug = $"{baseSlug}-{counter++}";
        }

        return slug;
    }

    // ── Push notification subscription mutations ──────────────────────────────

    /// <summary>
    /// Register or replace the authenticated user's browser push subscription.
    /// Called after the browser's PushManager.subscribe() resolves with a new PushSubscription.
    /// Only one subscription per user is stored; re-calling overwrites the previous one.
    /// </summary>
    [Authorize]
    public async Task<PushSubscriptionStatus> RegisterPushSubscriptionAsync(
        RegisterPushSubscriptionInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(input.Endpoint))
            throw CreateError("Endpoint is required.", "INVALID_SUBSCRIPTION");
        if (string.IsNullOrWhiteSpace(input.P256dh))
            throw CreateError("P256dh key is required.", "INVALID_SUBSCRIPTION");
        if (string.IsNullOrWhiteSpace(input.Auth))
            throw CreateError("Auth key is required.", "INVALID_SUBSCRIPTION");

        var currentUserId = claimsPrincipal.GetRequiredUserId();

        var existing = await dbContext.PushSubscriptions
            .SingleOrDefaultAsync(ps => ps.UserId == currentUserId, cancellationToken);

        if (existing is not null)
        {
            existing.Endpoint = input.Endpoint.Trim();
            existing.P256dh = input.P256dh.Trim();
            existing.Auth = input.Auth.Trim();
            existing.UpdatedAtUtc = DateTime.UtcNow;
        }
        else
        {
            existing = new PushSubscription
            {
                UserId = currentUserId,
                Endpoint = input.Endpoint.Trim(),
                P256dh = input.P256dh.Trim(),
                Auth = input.Auth.Trim()
            };
            dbContext.PushSubscriptions.Add(existing);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return new PushSubscriptionStatus(true, existing.Endpoint, existing.CreatedAtUtc);
    }

    /// <summary>
    /// Remove the authenticated user's push subscription and all their pending reminders.
    /// </summary>
    [Authorize]
    public async Task<bool> RemovePushSubscriptionAsync(
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var currentUserId = claimsPrincipal.GetRequiredUserId();

        var subscription = await dbContext.PushSubscriptions
            .SingleOrDefaultAsync(ps => ps.UserId == currentUserId, cancellationToken);

        if (subscription is null) return false;

        dbContext.PushSubscriptions.Remove(subscription);

        // Remove all pending (unsent) reminders for this user too
        var pendingReminders = await dbContext.EventReminders
            .Where(r => r.UserId == currentUserId && r.SentAtUtc == null)
            .ToListAsync(cancellationToken);
        dbContext.EventReminders.RemoveRange(pendingReminders);

        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    // ── Event reminder mutations ──────────────────────────────────────────────

    /// <summary>
    /// Enable a push reminder for a saved event.
    /// Requires the user to have a registered push subscription.
    /// Returns the created/updated reminder item.
    /// </summary>
    [Authorize]
    public async Task<EventReminderItem> EnableEventReminderAsync(
        EnableEventReminderInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (input.OffsetHours <= 0)
            throw CreateError("OffsetHours must be a positive integer.", "INVALID_OFFSET");

        var currentUserId = claimsPrincipal.GetRequiredUserId();

        // User must have an active push subscription
        var hasSubscription = await dbContext.PushSubscriptions
            .AnyAsync(ps => ps.UserId == currentUserId, cancellationToken);
        if (!hasSubscription)
            throw CreateError("You must enable push notifications before setting reminders.", "NO_PUSH_SUBSCRIPTION");

        // Validate the event exists, is published, and is in the future
        var catalogEvent = await dbContext.Events
            .SingleOrDefaultAsync(e => e.Id == input.EventId && e.Status == EventStatus.Published, cancellationToken)
            ?? throw CreateError("Event not found or not yet published.", "EVENT_NOT_FOUND");

        if (catalogEvent.StartsAtUtc <= DateTime.UtcNow)
            throw CreateError("Cannot set a reminder for an event that has already started.", "EVENT_IN_PAST");

        var scheduledFor = catalogEvent.StartsAtUtc.AddHours(-input.OffsetHours);
        if (scheduledFor <= DateTime.UtcNow)
            throw CreateError(
                $"The event starts in less than {input.OffsetHours} hour(s). Choose a shorter reminder offset.",
                "REMINDER_TOO_LATE");

        // Upsert: update if a reminder for this offset already exists
        var existing = await dbContext.EventReminders
            .SingleOrDefaultAsync(
                r => r.UserId == currentUserId && r.EventId == input.EventId && r.OffsetHours == input.OffsetHours,
                cancellationToken);

        if (existing is not null)
        {
            existing.ScheduledForUtc = scheduledFor;
            existing.SentAtUtc = null; // re-arm if re-enabling
        }
        else
        {
            existing = new EventReminder
            {
                UserId = currentUserId,
                EventId = input.EventId,
                OffsetHours = input.OffsetHours,
                ScheduledForUtc = scheduledFor
            };
            dbContext.EventReminders.Add(existing);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return new EventReminderItem(
            existing.Id,
            existing.EventId,
            existing.OffsetHours,
            existing.ScheduledForUtc,
            existing.SentAtUtc,
            existing.CreatedAtUtc);
    }

    /// <summary>
    /// Disable all push reminders for a specific saved event.
    /// </summary>
    [Authorize]
    public async Task<bool> DisableEventReminderAsync(
        Guid eventId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var currentUserId = claimsPrincipal.GetRequiredUserId();

        var reminders = await dbContext.EventReminders
            .Where(r => r.UserId == currentUserId && r.EventId == eventId)
            .ToListAsync(cancellationToken);

        if (reminders.Count == 0) return false;

        dbContext.EventReminders.RemoveRange(reminders);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    // ── Community group mutations ─────────────────────────────────────────────

    /// <summary>
    /// Creates a new community group. The caller automatically becomes the group admin.
    /// Duplicate slugs return a SLUG_TAKEN error.
    /// </summary>
    [Authorize]
    public async Task<CommunityGroup> CreateCommunityGroupAsync(
        CreateCommunityGroupInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var name = input.Name.Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw CreateError("Group name is required.", "VALIDATION_ERROR");

        var slug = SlugGenerator.Generate(input.Slug);
        if (string.IsNullOrEmpty(slug))
            throw CreateError("A valid slug is required.", "VALIDATION_ERROR");

        if (await dbContext.CommunityGroups.AnyAsync(cg => cg.Slug == slug, cancellationToken))
            throw CreateError($"The slug '{slug}' is already taken.", "SLUG_TAKEN");

        var userId = claimsPrincipal.GetRequiredUserId();

        var group = new CommunityGroup
        {
            Name = name,
            Slug = slug,
            Summary = input.Summary?.Trim(),
            Description = input.Description?.Trim(),
            Visibility = input.Visibility,
            IsActive = true,
            CreatedByUserId = userId,
        };

        dbContext.CommunityGroups.Add(group);
        await dbContext.SaveChangesAsync(cancellationToken);

        // Creator becomes first admin
        dbContext.CommunityMemberships.Add(new CommunityMembership
        {
            GroupId = group.Id,
            UserId = userId,
            Role = CommunityMemberRole.Admin,
            Status = CommunityMemberStatus.Active,
        });
        await dbContext.SaveChangesAsync(cancellationToken);

        return group;
    }

    /// <summary>
    /// Updates community group metadata. Only group admins (or global admins) may call this.
    /// </summary>
    [Authorize]
    public async Task<CommunityGroup> UpdateCommunityGroupAsync(
        Guid groupId,
        UpdateCommunityGroupInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var group = await dbContext.CommunityGroups.SingleOrDefaultAsync(cg => cg.Id == groupId, cancellationToken)
            ?? throw CreateError("Community group not found.", "GROUP_NOT_FOUND");

        var userId = claimsPrincipal.GetRequiredUserId();
        if (!claimsPrincipal.IsAdmin())
        {
            var isGroupAdmin = await dbContext.CommunityMemberships.AnyAsync(
                cm => cm.GroupId == groupId && cm.UserId == userId &&
                      cm.Role == CommunityMemberRole.Admin && cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (!isGroupAdmin)
                throw CreateError("Only group administrators can update the group.", "FORBIDDEN");
        }

        if (input.Name is not null) group.Name = input.Name.Trim();
        if (input.Summary is not null) group.Summary = input.Summary.Trim();
        if (input.Description is not null) group.Description = input.Description.Trim();
        if (input.Visibility is not null) group.Visibility = input.Visibility.Value;
        if (input.IsActive is not null) group.IsActive = input.IsActive.Value;

        await dbContext.SaveChangesAsync(cancellationToken);
        return group;
    }

    /// <summary>
    /// Joins a public community group directly. Only works for Public groups.
    /// Returns the created membership (status=Active).
    /// </summary>
    [Authorize]
    public async Task<CommunityMembership> JoinCommunityGroupAsync(
        Guid groupId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var group = await dbContext.CommunityGroups.SingleOrDefaultAsync(
            cg => cg.Id == groupId && cg.IsActive, cancellationToken)
            ?? throw CreateError("Community group not found.", "GROUP_NOT_FOUND");

        if (group.Visibility != CommunityVisibility.Public)
            throw CreateError("This group is private. Use requestCommunityMembership instead.", "GROUP_PRIVATE");

        var userId = claimsPrincipal.GetRequiredUserId();

        var existing = await dbContext.CommunityMemberships.SingleOrDefaultAsync(
            cm => cm.GroupId == groupId && cm.UserId == userId, cancellationToken);

        if (existing is not null)
        {
            if (existing.Status == CommunityMemberStatus.Active)
                throw CreateError("You are already a member of this group.", "ALREADY_MEMBER");

            // Re-activate rejected or pending
            existing.Status = CommunityMemberStatus.Active;
            await dbContext.SaveChangesAsync(cancellationToken);
            return existing;
        }

        var membership = new CommunityMembership
        {
            GroupId = groupId,
            UserId = userId,
            Role = CommunityMemberRole.Member,
            Status = CommunityMemberStatus.Active,
        };
        dbContext.CommunityMemberships.Add(membership);
        await dbContext.SaveChangesAsync(cancellationToken);
        return membership;
    }

    /// <summary>
    /// Requests membership in a private community group. The request enters Pending state
    /// and must be approved by a group admin.
    /// </summary>
    [Authorize]
    public async Task<CommunityMembership> RequestCommunityMembershipAsync(
        Guid groupId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var group = await dbContext.CommunityGroups.SingleOrDefaultAsync(
            cg => cg.Id == groupId && cg.IsActive, cancellationToken)
            ?? throw CreateError("Community group not found.", "GROUP_NOT_FOUND");

        var userId = claimsPrincipal.GetRequiredUserId();

        var existing = await dbContext.CommunityMemberships.SingleOrDefaultAsync(
            cm => cm.GroupId == groupId && cm.UserId == userId, cancellationToken);

        if (existing is not null)
        {
            if (existing.Status == CommunityMemberStatus.Active)
                throw CreateError("You are already a member of this group.", "ALREADY_MEMBER");
            if (existing.Status == CommunityMemberStatus.Pending)
                throw CreateError("Your membership request is already pending.", "REQUEST_PENDING");

            // Re-request after rejection
            existing.Status = CommunityMemberStatus.Pending;
            existing.ReviewedAtUtc = null;
            existing.ReviewedByUserId = null;
            await dbContext.SaveChangesAsync(cancellationToken);
            return existing;
        }

        var membership = new CommunityMembership
        {
            GroupId = groupId,
            UserId = userId,
            Role = CommunityMemberRole.Member,
            Status = CommunityMemberStatus.Pending,
        };
        dbContext.CommunityMemberships.Add(membership);
        await dbContext.SaveChangesAsync(cancellationToken);
        return membership;
    }

    /// <summary>
    /// Allows an authenticated user to leave a community group they are a member of.
    /// The last active administrator of a group cannot leave; they must promote another
    /// member to admin first.
    /// </summary>
    [Authorize]
    public async Task<bool> LeaveCommunityGroupAsync(
        Guid groupId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetRequiredUserId();

        var membership = await dbContext.CommunityMemberships.SingleOrDefaultAsync(
            cm => cm.GroupId == groupId && cm.UserId == userId, cancellationToken)
            ?? throw CreateError("You are not a member of this group.", "NOT_MEMBER");

        if (membership.Role == CommunityMemberRole.Admin && membership.Status == CommunityMemberStatus.Active)
        {
            var adminCount = await dbContext.CommunityMemberships.CountAsync(
                cm => cm.GroupId == groupId && cm.Role == CommunityMemberRole.Admin &&
                      cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (adminCount <= 1)
                throw CreateError(
                    "You are the last administrator. Promote another member to admin before leaving.",
                    "LAST_ADMIN");
        }

        dbContext.CommunityMemberships.Remove(membership);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>
    /// Approves or rejects a pending membership request. Only group admins may call this.
    /// </summary>
    [Authorize]
    public async Task<CommunityMembership> ReviewMembershipRequestAsync(
        Guid membershipId,
        ReviewMembershipRequestInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var membership = await dbContext.CommunityMemberships
            .Include(cm => cm.Group)
            .SingleOrDefaultAsync(cm => cm.Id == membershipId, cancellationToken)
            ?? throw CreateError("Membership not found.", "MEMBERSHIP_NOT_FOUND");

        if (membership.Status != CommunityMemberStatus.Pending)
            throw CreateError("Only pending membership requests can be reviewed.", "INVALID_STATE");

        var userId = claimsPrincipal.GetRequiredUserId();
        if (!claimsPrincipal.IsAdmin())
        {
            var isGroupAdmin = await dbContext.CommunityMemberships.AnyAsync(
                cm => cm.GroupId == membership.GroupId && cm.UserId == userId &&
                      cm.Role == CommunityMemberRole.Admin && cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (!isGroupAdmin)
                throw CreateError("Only group administrators can review membership requests.", "FORBIDDEN");
        }

        membership.Status = input.Approve ? CommunityMemberStatus.Active : CommunityMemberStatus.Rejected;
        membership.ReviewedAtUtc = DateTime.UtcNow;
        membership.ReviewedByUserId = userId;
        await dbContext.SaveChangesAsync(cancellationToken);
        return membership;
    }

    /// <summary>
    /// Assigns a new role to an active group member. Only group admins may call this.
    /// A group admin cannot demote themselves if they are the last admin.
    /// </summary>
    [Authorize]
    public async Task<CommunityMembership> AssignMemberRoleAsync(
        Guid membershipId,
        CommunityMemberRole role,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var membership = await dbContext.CommunityMemberships
            .Include(cm => cm.Group)
            .SingleOrDefaultAsync(cm => cm.Id == membershipId, cancellationToken)
            ?? throw CreateError("Membership not found.", "MEMBERSHIP_NOT_FOUND");

        if (membership.Status != CommunityMemberStatus.Active)
            throw CreateError("Role can only be changed for active members.", "INVALID_STATE");

        var userId = claimsPrincipal.GetRequiredUserId();
        if (!claimsPrincipal.IsAdmin())
        {
            var isGroupAdmin = await dbContext.CommunityMemberships.AnyAsync(
                cm => cm.GroupId == membership.GroupId && cm.UserId == userId &&
                      cm.Role == CommunityMemberRole.Admin && cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (!isGroupAdmin)
                throw CreateError("Only group administrators can assign member roles.", "FORBIDDEN");
        }

        // Prevent demoting the last admin
        if (membership.Role == CommunityMemberRole.Admin && role != CommunityMemberRole.Admin)
        {
            var adminCount = await dbContext.CommunityMemberships.CountAsync(
                cm => cm.GroupId == membership.GroupId && cm.Role == CommunityMemberRole.Admin &&
                      cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (adminCount <= 1)
                throw CreateError("Cannot demote the last group administrator.", "LAST_ADMIN");
        }

        membership.Role = role;
        await dbContext.SaveChangesAsync(cancellationToken);
        return membership;
    }

    /// <summary>
    /// Removes a member from a community group. Only group admins may call this.
    /// A group admin cannot revoke the last admin membership.
    /// </summary>
    [Authorize]
    public async Task<bool> RevokeMembershipAsync(
        Guid membershipId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var membership = await dbContext.CommunityMemberships
            .Include(cm => cm.Group)
            .SingleOrDefaultAsync(cm => cm.Id == membershipId, cancellationToken)
            ?? throw CreateError("Membership not found.", "MEMBERSHIP_NOT_FOUND");

        var userId = claimsPrincipal.GetRequiredUserId();
        if (!claimsPrincipal.IsAdmin())
        {
            var isGroupAdmin = await dbContext.CommunityMemberships.AnyAsync(
                cm => cm.GroupId == membership.GroupId && cm.UserId == userId &&
                      cm.Role == CommunityMemberRole.Admin && cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (!isGroupAdmin)
                throw CreateError("Only group administrators can revoke memberships.", "FORBIDDEN");
        }

        if (membership.Role == CommunityMemberRole.Admin && membership.Status == CommunityMemberStatus.Active)
        {
            var adminCount = await dbContext.CommunityMemberships.CountAsync(
                cm => cm.GroupId == membership.GroupId && cm.Role == CommunityMemberRole.Admin &&
                      cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (adminCount <= 1)
                throw CreateError("Cannot remove the last group administrator.", "LAST_ADMIN");
        }

        dbContext.CommunityMemberships.Remove(membership);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>
    /// Associates a published event with a community group.
    /// The caller must be a group admin or event manager, and must own the event (or be global admin).
    /// </summary>
    [Authorize]
    public async Task<CommunityGroupEvent> AssociateEventWithGroupAsync(
        CommunityGroupEventInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var group = await dbContext.CommunityGroups.SingleOrDefaultAsync(
            cg => cg.Id == input.GroupId && cg.IsActive, cancellationToken)
            ?? throw CreateError("Community group not found.", "GROUP_NOT_FOUND");

        var catalogEvent = await dbContext.Events.SingleOrDefaultAsync(
            e => e.Id == input.EventId, cancellationToken)
            ?? throw CreateError("Event not found.", "EVENT_NOT_FOUND");

        if (catalogEvent.Status != EventStatus.Published)
            throw CreateError("Only published events can be associated with a community group.", "EVENT_NOT_PUBLISHED");

        var userId = claimsPrincipal.GetRequiredUserId();
        var isGlobalAdmin = claimsPrincipal.IsAdmin();

        if (!isGlobalAdmin)
        {
            var membership = await dbContext.CommunityMemberships.SingleOrDefaultAsync(
                cm => cm.GroupId == input.GroupId && cm.UserId == userId && cm.Status == CommunityMemberStatus.Active,
                cancellationToken);

            var hasGroupRole = membership?.Role is CommunityMemberRole.Admin or CommunityMemberRole.EventManager;
            var isEventOwner = catalogEvent.SubmittedByUserId == userId;

            if (!hasGroupRole || !isEventOwner)
                throw CreateError("You must be a group admin or event manager and own the event to associate it.", "FORBIDDEN");
        }

        if (await dbContext.CommunityGroupEvents.AnyAsync(
            cge => cge.GroupId == input.GroupId && cge.EventId == input.EventId, cancellationToken))
            throw CreateError("This event is already associated with the group.", "ALREADY_ASSOCIATED");

        var link = new CommunityGroupEvent
        {
            GroupId = input.GroupId,
            EventId = input.EventId,
            AddedByUserId = userId,
        };
        dbContext.CommunityGroupEvents.Add(link);
        await dbContext.SaveChangesAsync(cancellationToken);
        return link;
    }

    /// <summary>
    /// Removes the association between a community group and an event.
    /// The caller must be a group admin (or global admin).
    /// </summary>
    [Authorize]
    public async Task<bool> DisassociateEventFromGroupAsync(
        CommunityGroupEventInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var link = await dbContext.CommunityGroupEvents.SingleOrDefaultAsync(
            cge => cge.GroupId == input.GroupId && cge.EventId == input.EventId, cancellationToken)
            ?? throw CreateError("Association not found.", "NOT_FOUND");

        var userId = claimsPrincipal.GetRequiredUserId();
        var isGlobalAdmin = claimsPrincipal.IsAdmin();

        if (!isGlobalAdmin)
        {
            var isGroupAdmin = await dbContext.CommunityMemberships.AnyAsync(
                cm => cm.GroupId == input.GroupId && cm.UserId == userId &&
                      cm.Role == CommunityMemberRole.Admin && cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (!isGroupAdmin)
                throw CreateError("Only group administrators can remove event associations.", "FORBIDDEN");
        }

        dbContext.CommunityGroupEvents.Remove(link);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    // ── External source claim mutations ───────────────────────────────────────

    /// <summary>
    /// Adds an external-source ownership claim for a community group.
    /// Only group admins (or global admins) may call this.
    /// The claim enters PendingReview status until verified by a platform admin.
    /// </summary>
    [Authorize]
    public async Task<ExternalSourceClaim> AddExternalSourceClaimAsync(
        Guid groupId,
        AddExternalSourceClaimInput input,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        [Service] ExternalSourceAdapterFactory adapterFactory,
        CancellationToken cancellationToken)
    {
        var group = await dbContext.CommunityGroups.SingleOrDefaultAsync(
            cg => cg.Id == groupId && cg.IsActive, cancellationToken)
            ?? throw CreateError("Community group not found.", "GROUP_NOT_FOUND");

        var userId = claimsPrincipal.GetRequiredUserId();
        if (!claimsPrincipal.IsAdmin())
        {
            var isGroupAdmin = await dbContext.CommunityMemberships.AnyAsync(
                cm => cm.GroupId == groupId && cm.UserId == userId &&
                      cm.Role == CommunityMemberRole.Admin && cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (!isGroupAdmin)
                throw CreateError("Only group administrators can add external source claims.", "FORBIDDEN");
        }

        var sourceUrl = input.SourceUrl.Trim();
        var identifier = adapterFactory.ExtractIdentifier(input.SourceType, sourceUrl)
            ?? throw CreateError(
                $"The URL '{sourceUrl}' is not a recognised {input.SourceType} URL. " +
                $"Expected format: {ExpectedUrlFormat(input.SourceType)}",
                "INVALID_SOURCE_URL");

        if (await dbContext.ExternalSourceClaims.AnyAsync(
            esc => esc.GroupId == groupId &&
                   esc.SourceType == input.SourceType &&
                   esc.SourceIdentifier == identifier,
            cancellationToken))
        {
            throw CreateError("A claim for this source already exists on this community group.", "DUPLICATE_CLAIM");
        }

        var claim = new ExternalSourceClaim
        {
            GroupId = groupId,
            SourceType = input.SourceType,
            SourceUrl = sourceUrl,
            SourceIdentifier = identifier,
            Status = ExternalSourceClaimStatus.PendingReview,
            CreatedByUserId = userId,
        };

        dbContext.ExternalSourceClaims.Add(claim);
        await dbContext.SaveChangesAsync(cancellationToken);
        return claim;
    }

    /// <summary>
    /// Removes an external-source claim. Only group admins (or global admins) may call this.
    /// This does not delete any events that were previously imported via this claim.
    /// </summary>
    [Authorize]
    public async Task<bool> RemoveExternalSourceClaimAsync(
        Guid claimId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var claim = await dbContext.ExternalSourceClaims.SingleOrDefaultAsync(
            esc => esc.Id == claimId, cancellationToken)
            ?? throw CreateError("External source claim not found.", "CLAIM_NOT_FOUND");

        var userId = claimsPrincipal.GetRequiredUserId();
        if (!claimsPrincipal.IsAdmin())
        {
            var isGroupAdmin = await dbContext.CommunityMemberships.AnyAsync(
                cm => cm.GroupId == claim.GroupId && cm.UserId == userId &&
                      cm.Role == CommunityMemberRole.Admin && cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (!isGroupAdmin)
                throw CreateError("Only group administrators can remove external source claims.", "FORBIDDEN");
        }

        dbContext.ExternalSourceClaims.Remove(claim);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>
    /// Triggers a manual sync from the linked external source.
    /// The claim must be in Verified status to be synced.
    /// Only group admins (or global admins) may call this.
    /// Imported events enter PendingApproval status and must be reviewed before publication.
    /// Duplicate events (same ExternalSourceEventId) are skipped without creating new records.
    /// </summary>
    [Authorize]
    public async Task<SyncResult> TriggerExternalSyncAsync(
        Guid claimId,
        ClaimsPrincipal claimsPrincipal,
        [Service] AppDbContext dbContext,
        [Service] ExternalSourceAdapterFactory adapterFactory,
        [Service] ILogger<Mutation> logger,
        CancellationToken cancellationToken)
    {
        var claim = await dbContext.ExternalSourceClaims
            .Include(esc => esc.Group)
            .SingleOrDefaultAsync(esc => esc.Id == claimId, cancellationToken)
            ?? throw CreateError("External source claim not found.", "CLAIM_NOT_FOUND");

        var userId = claimsPrincipal.GetRequiredUserId();
        if (!claimsPrincipal.IsAdmin())
        {
            var isGroupAdmin = await dbContext.CommunityMemberships.AnyAsync(
                cm => cm.GroupId == claim.GroupId && cm.UserId == userId &&
                      cm.Role == CommunityMemberRole.Admin && cm.Status == CommunityMemberStatus.Active,
                cancellationToken);
            if (!isGroupAdmin)
                throw CreateError("Only group administrators can trigger a sync.", "FORBIDDEN");
        }

        if (claim.Status != ExternalSourceClaimStatus.Verified)
            throw CreateError(
                "Only verified claims can be synced. Please wait for a platform admin to verify this claim.",
                "CLAIM_NOT_VERIFIED");

        var adapter = adapterFactory.GetAdapter(claim.SourceType);
        var externalEvents = await adapter.FetchEventsAsync(claim.SourceIdentifier, cancellationToken);

        // Use first available domain as the default for imported events.
        var defaultDomain = await dbContext.Domains.FirstOrDefaultAsync(
            d => d.IsActive, cancellationToken)
            ?? throw CreateError("No active domain found to assign imported events.", "NO_DOMAIN");

        var importedCount = 0;
        var skippedCount = 0;
        var errorCount = 0;

        foreach (var ext in externalEvents)
        {
            // Duplicate check: if an event was already imported from this claim with the same external ID
            var existingImport = await dbContext.Events.AnyAsync(
                e => e.ExternalSourceClaimId == claimId && e.ExternalSourceEventId == ext.ExternalId,
                cancellationToken);

            if (existingImport)
            {
                skippedCount++;
                continue;
            }

            // Validate required fields
            if (ext.StartsAtUtc is null)
            {
                logger.LogWarning(
                    "Sync for claim {ClaimId}: skipping external event '{ExternalId}' — missing StartsAtUtc.",
                    claimId, ext.ExternalId);
                errorCount++;
                continue;
            }

            var endsAt = ext.EndsAtUtc ?? ext.StartsAtUtc.Value.AddHours(2);

            try
            {
                var catalogEvent = new CatalogEvent
                {
                    Name = (ext.Name ?? "Untitled Event").Trim(),
                    Slug = await BuildUniqueEventSlugAsync(dbContext, ext.Name ?? "Untitled Event", cancellationToken),
                    Description = (ext.Description ?? string.Empty).Trim(),
                    EventUrl = (ext.EventUrl ?? string.Empty).Trim(),
                    VenueName = (ext.VenueName ?? string.Empty).Trim(),
                    AddressLine1 = (ext.AddressLine1 ?? string.Empty).Trim(),
                    City = (ext.City ?? string.Empty).Trim(),
                    CountryCode = (ext.CountryCode ?? "XX").Trim().ToUpperInvariant(),
                    Latitude = ext.Latitude ?? 0,
                    Longitude = ext.Longitude ?? 0,
                    StartsAtUtc = EnsureUtc(ext.StartsAtUtc.Value),
                    EndsAtUtc = EnsureUtc(endsAt),
                    IsFree = ext.IsFree ?? true,
                    PriceAmount = ext.PriceAmount,
                    CurrencyCode = NormalizeCurrencyCode(ext.CurrencyCode),
                    Language = ext.Language,
                    AttendanceMode = AttendanceMode.InPerson,
                    Status = EventStatus.PendingApproval,
                    DomainId = defaultDomain.Id,
                    SubmittedByUserId = userId,
                    ExternalSourceClaimId = claimId,
                    ExternalSourceEventId = ext.ExternalId,
                };

                dbContext.Events.Add(catalogEvent);

                // Link the event to the community group
                dbContext.CommunityGroupEvents.Add(new CommunityGroupEvent
                {
                    GroupId = claim.GroupId,
                    EventId = catalogEvent.Id,
                    AddedByUserId = userId,
                });

                await dbContext.SaveChangesAsync(cancellationToken);
                importedCount++;
            }
            catch (Exception ex)
            {
                logger.LogError(ex,
                    "Sync for claim {ClaimId}: failed to import external event '{ExternalId}'. Rolling back pending changes.",
                    claimId, ext.ExternalId);

                // Detach all pending entries added in this iteration to prevent them from
                // being accidentally committed in the final SaveChangesAsync below.
                foreach (var entry in dbContext.ChangeTracker.Entries()
                             .Where(e => e.State == EntityState.Added)
                             .ToList())
                {
                    entry.State = EntityState.Detached;
                }

                errorCount++;
            }
        }

        var summary = BuildSyncSummary(importedCount, skippedCount, errorCount);

        claim.LastSyncAtUtc = DateTime.UtcNow;
        claim.LastSyncOutcome = summary;
        claim.LastSyncImportedCount = importedCount;
        claim.LastSyncSkippedCount = skippedCount;
        await dbContext.SaveChangesAsync(cancellationToken);

        return new SyncResult(importedCount, skippedCount, errorCount, summary);
    }

    private static string BuildSyncSummary(int imported, int skipped, int errors)
    {
        var parts = new List<string>();
        parts.Add(imported == 1 ? "Imported 1 event." : $"Imported {imported} events.");
        if (skipped > 0)
            parts.Add(skipped == 1 ? "Skipped 1 (already imported)." : $"Skipped {skipped} (already imported).");
        if (errors > 0)
            parts.Add(errors == 1 ? "1 event failed validation." : $"{errors} events failed validation.");
        return string.Join(" ", parts);
    }

    private static string ExpectedUrlFormat(ExternalSourceType sourceType) =>
        sourceType switch
        {
            ExternalSourceType.Meetup => "https://www.meetup.com/{group-slug}",
            ExternalSourceType.Luma => "https://lu.ma/{calendar-slug}",
            _ => "an unsupported source type"
        };
}
