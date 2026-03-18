using EventsApi.Configuration;
using EventsApi.Data.Entities;
using EventsApi.Utilities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace EventsApi.Data;

public sealed class AppDbInitializer(
    AppDbContext dbContext,
    IPasswordHasher<ApplicationUser> passwordHasher,
    IOptions<SeedDataOptions> seedOptions)
{
    private readonly AppDbContext _dbContext = dbContext;
    private readonly IPasswordHasher<ApplicationUser> _passwordHasher = passwordHasher;
    private readonly SeedDataOptions _seedOptions = seedOptions.Value;

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await _dbContext.Database.EnsureCreatedAsync(cancellationToken);

        if (!await _dbContext.Domains.AnyAsync(cancellationToken))
        {
            await SeedDomainsAsync(cancellationToken);
        }

        if (!await _dbContext.Users.AnyAsync(cancellationToken))
        {
            await SeedUsersAsync(cancellationToken);
        }

        if (!await _dbContext.Events.AnyAsync(cancellationToken))
        {
            await SeedEventsAsync(cancellationToken);
        }
    }

    private async Task SeedDomainsAsync(CancellationToken cancellationToken)
    {
        var domains = new[]
        {
            new EventDomain
            {
                Name = "Crypto",
                Slug = "crypto",
                Subdomain = "crypto",
                Description = "Blockchain, web3 and crypto community meetups.",
                IsActive = true
            },
            new EventDomain
            {
                Name = "AI",
                Slug = "ai",
                Subdomain = "ai",
                Description = "Artificial intelligence, machine learning and data events.",
                IsActive = true
            },
            new EventDomain
            {
                Name = "Cooking",
                Slug = "cooking",
                Subdomain = "cooking",
                Description = "Food, chef and culinary experiences.",
                IsActive = true
            }
        };

        _dbContext.Domains.AddRange(domains);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task SeedUsersAsync(CancellationToken cancellationToken)
    {
        var admin = new ApplicationUser
        {
            Email = _seedOptions.AdminEmail.Trim().ToLowerInvariant(),
            DisplayName = _seedOptions.AdminDisplayName,
            PasswordHash = string.Empty,
            Role = ApplicationUserRole.Admin
        };
        admin.PasswordHash = _passwordHasher.HashPassword(admin, _seedOptions.AdminPassword);

        var contributor = new ApplicationUser
        {
            Email = "organizer@events.local",
            DisplayName = "Community Organizer",
            PasswordHash = string.Empty,
            Role = ApplicationUserRole.Contributor
        };
        contributor.PasswordHash = _passwordHasher.HashPassword(contributor, "ChangeMe123!");

        _dbContext.Users.AddRange(admin, contributor);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task SeedEventsAsync(CancellationToken cancellationToken)
    {
        var cryptoDomain = await _dbContext.Domains.SingleAsync(domain => domain.Slug == "crypto", cancellationToken);
        var aiDomain = await _dbContext.Domains.SingleAsync(domain => domain.Slug == "ai", cancellationToken);
        var contributor = await _dbContext.Users.SingleAsync(user => user.Email == "organizer@events.local", cancellationToken);
        var admin = await _dbContext.Users.SingleAsync(user => user.Email == _seedOptions.AdminEmail.Trim().ToLowerInvariant(), cancellationToken);

        var firstDayNextMonth = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 18, 0, 0, DateTimeKind.Utc).AddMonths(1);

        var events = new[]
        {
            new CatalogEvent
            {
                Name = "Prague Crypto Builders Meetup",
                Slug = SlugGenerator.Generate("Prague Crypto Builders Meetup"),
                Description = "A curated meetup for founders, investors and builders covering current crypto products, regulation and growth strategies in Prague.",
                EventUrl = "https://events.example.com/crypto/prague-builders",
                VenueName = "Impact Hub Prague",
                AddressLine1 = "Drtinova 10",
                City = "Prague",
                CountryCode = "CZ",
                Latitude = 50.075500m,
                Longitude = 14.404000m,
                StartsAtUtc = firstDayNextMonth.AddDays(6),
                EndsAtUtc = firstDayNextMonth.AddDays(6).AddHours(4),
                SubmittedByUserId = contributor.Id,
                ReviewedByUserId = admin.Id,
                DomainId = cryptoDomain.Id,
                Status = EventStatus.Published,
                PublishedAtUtc = DateTime.UtcNow,
                AdminNotes = "Seeded example for Prague crypto discovery."
            },
            new CatalogEvent
            {
                Name = "Applied AI Product Forum Prague",
                Slug = SlugGenerator.Generate("Applied AI Product Forum Prague"),
                Description = "A practical AI event for engineering leads and product teams focused on shipping production-ready copilots and automation workflows.",
                EventUrl = "https://events.example.com/ai/prague-product-forum",
                VenueName = "Opero",
                AddressLine1 = "Salvátorská 931/8",
                City = "Prague",
                CountryCode = "CZ",
                Latitude = 50.089600m,
                Longitude = 14.419800m,
                StartsAtUtc = firstDayNextMonth.AddDays(12),
                EndsAtUtc = firstDayNextMonth.AddDays(12).AddHours(6),
                SubmittedByUserId = contributor.Id,
                ReviewedByUserId = admin.Id,
                DomainId = aiDomain.Id,
                Status = EventStatus.Published,
                PublishedAtUtc = DateTime.UtcNow,
                AdminNotes = "Seeded example for AI catalog."
            }
        };

        _dbContext.Events.AddRange(events);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }
}
