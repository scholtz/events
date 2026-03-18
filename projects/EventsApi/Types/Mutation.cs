using System.Security.Claims;
using EventsApi.Data;
using EventsApi.Data.Entities;
using EventsApi.Security;
using EventsApi.Utilities;
using HotChocolate;
using HotChocolate.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

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
                IsActive = input.IsActive
            };

            dbContext.Domains.Add(existingDomain);
        }
        else
        {
            existingDomain.Name = name;
            existingDomain.Slug = slug;
            existingDomain.Subdomain = subdomain;
            existingDomain.Description = input.Description?.Trim();
            existingDomain.IsActive = input.IsActive;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return existingDomain;
    }

    [Authorize(Policy = Policies.Admin)]
    public async Task<ApplicationUser> UpdateUserRoleAsync(
        UpdateUserRoleInput input,
        [Service] AppDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var user = await dbContext.Users.SingleOrDefaultAsync(candidate => candidate.Id == input.UserId, cancellationToken)
            ?? throw CreateError("User was not found.", "USER_NOT_FOUND");

        user.Role = input.Role;
        await dbContext.SaveChangesAsync(cancellationToken);
        return user;
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
    }

    private static DateTime EnsureUtc(DateTime value)
        => value.Kind == DateTimeKind.Utc ? value : value.ToUniversalTime();

    private static GraphQLException CreateError(string message, string code)
        => new(ErrorBuilder.New().SetMessage(message).SetCode(code).Build());

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
}
