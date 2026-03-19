using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using EventsApi.Data;
using EventsApi.Data.Entities;
using EventsApi.Security;
using EventsApi.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace EventsApi.Tests;

public sealed class GraphQlIntegrationTests
{
    [Fact]
    public async Task EventsQuery_ComposesKeywordLocationDateDomainAndPriceFilters()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("organizer@example.com", "Organizer");
            var crypto = CreateDomain("Crypto", "crypto");
            var ai = CreateDomain("AI", "ai");
            var nextMonth = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.AddRange(crypto, ai);
            dbContext.Events.AddRange(
                CreateEvent(
                    "Prague Crypto Summit",
                    "prague-crypto-summit",
                    "A premium crypto conference for founders.",
                    "Prague Congress Centre",
                    "Prague",
                    nextMonth,
                    crypto,
                    user,
                    isFree: false,
                    priceAmount: 149m),
                CreateEvent(
                    "Prague Crypto Builders Breakfast",
                    "prague-crypto-builders-breakfast",
                    "A free breakfast meetup for builders.",
                    "Impact Hub Prague",
                    "Prague",
                    nextMonth.AddDays(1),
                    crypto,
                    user,
                    isFree: true,
                    priceAmount: 0m),
                CreateEvent(
                    "Brno Crypto Night",
                    "brno-crypto-night",
                    "Crypto networking in Brno.",
                    "Clubhouse",
                    "Brno",
                    nextMonth,
                    crypto,
                    user,
                    isFree: false,
                    priceAmount: 39m),
                CreateEvent(
                    "Prague AI Forum",
                    "prague-ai-forum",
                    "AI product discussions in Prague.",
                    "Opero",
                    "Prague",
                    nextMonth,
                    ai,
                    user,
                    isFree: false,
                    priceAmount: 89m));
        });

        using var client = factory.CreateClient();
        var nextMonth = FirstDayOfNextMonthUtc();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query Events($filter: EventFilterInput) {
              events(filter: $filter) {
                name
                city
                isFree
                priceAmount
                domain { slug }
              }
            }
            """,
            new
            {
                filter = new
                {
                    searchText = "crypto",
                    domainSlug = "crypto",
                    locationText = "prague",
                    startsFromUtc = nextMonth,
                    startsToUtc = nextMonth,
                    isFree = false,
                    priceMin = 100m,
                    priceMax = 200m,
                    sortBy = "UPCOMING"
                }
            });

        Assert.Equal(["Prague Crypto Summit"], GetEventNames(document));
    }

    [Fact]
    public async Task EventsQuery_PriceFiltering_RespectsIsFreeAcrossFreePaidAndMixedCatalogs()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("pricing@example.com", "Pricing");
            var crypto = CreateDomain("Crypto", "crypto");
            var eventDate = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.Add(crypto);
            dbContext.Events.AddRange(
                CreateEvent(
                    "Free Prague Meetup",
                    "free-prague-meetup",
                    "A free event in Prague.",
                    "Venue 1",
                    "Prague",
                    eventDate,
                    crypto,
                    user,
                    isFree: true,
                    priceAmount: 0m),
                CreateEvent(
                    "Budget Prague Meetup",
                    "budget-prague-meetup",
                    "A paid budget event in Prague.",
                    "Venue 2",
                    "Prague",
                    eventDate.AddDays(1),
                    crypto,
                    user,
                    isFree: false,
                    priceAmount: 25m),
                CreateEvent(
                    "Premium Prague Summit",
                    "premium-prague-summit",
                    "A premium paid event in Prague.",
                    "Venue 3",
                    "Prague",
                    eventDate.AddDays(2),
                    crypto,
                    user,
                    isFree: false,
                    priceAmount: 120m));
        });

        using var client = factory.CreateClient();

        Assert.Equal(
            ["Free Prague Meetup"],
            await QueryEventNamesAsync(client, new { isFree = true, priceMax = 200m, sortBy = "UPCOMING" }));

        Assert.Equal(
            ["Budget Prague Meetup", "Premium Prague Summit"],
            await QueryEventNamesAsync(client, new { isFree = false, priceMax = 200m, sortBy = "UPCOMING" }));

        Assert.Equal(
            ["Free Prague Meetup", "Budget Prague Meetup", "Premium Prague Summit"],
            await QueryEventNamesAsync(client, new { priceMax = 200m, sortBy = "UPCOMING" }));

        Assert.Equal(
            ["Budget Prague Meetup", "Premium Prague Summit"],
            await QueryEventNamesAsync(client, new { priceMin = 1m, sortBy = "UPCOMING" }));

        Assert.Equal(
            ["Free Prague Meetup", "Budget Prague Meetup"],
            await QueryEventNamesAsync(client, new { priceMax = 30m, sortBy = "UPCOMING" }));

        Assert.Equal(
            ["Budget Prague Meetup"],
            await QueryEventNamesAsync(client, new { priceMin = 20m, priceMax = 30m, sortBy = "UPCOMING" }));

        Assert.Equal(
            ["Budget Prague Meetup"],
            await QueryEventNamesAsync(client, new { isFree = false, priceMax = 30m, sortBy = "UPCOMING" }));

        Assert.Empty(
            await QueryEventNamesAsync(client, new { priceMax = -1m, sortBy = "UPCOMING" }));
    }

    [Fact]
    public async Task EventsQuery_PriceFiltering_ExcludesFreeEventsFromPaidOnlyRanges()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("paid-only@example.com", "Paid Only");
            var crypto = CreateDomain("Crypto", "crypto");
            var eventDate = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.Add(crypto);
            dbContext.Events.AddRange(
                CreateEvent(
                    "Free Crypto Breakfast",
                    "free-crypto-breakfast",
                    "Free breakfast.",
                    "Venue 1",
                    "Prague",
                    eventDate,
                    crypto,
                    user,
                    isFree: true,
                    priceAmount: 0m),
                CreateEvent(
                    "Paid Crypto Workshop",
                    "paid-crypto-workshop",
                    "Paid workshop.",
                    "Venue 2",
                    "Prague",
                    eventDate.AddDays(1),
                    crypto,
                    user,
                    isFree: false,
                    priceAmount: 80m));
        });

        using var client = factory.CreateClient();

        Assert.Equal(
            ["Paid Crypto Workshop"],
            await QueryEventNamesAsync(
                client,
                new
                {
                    searchText = "crypto",
                    locationText = "prague",
                    isFree = false,
                    priceMax = 200m,
                    sortBy = "UPCOMING"
                }));
    }

    [Fact]
    public async Task EventsQuery_SupportsUpcomingNewestAndRelevanceSorts()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("sorter@example.com", "Sorter");
            var crypto = CreateDomain("Crypto", "crypto");
            var today = DateTime.UtcNow.Date;

            dbContext.Users.Add(user);
            dbContext.Domains.Add(crypto);
            dbContext.Events.AddRange(
                CreateEvent(
                    "Crypto Launch Week",
                    "crypto-launch-week",
                    "Launch week for crypto builders.",
                    "Venue 1",
                    "Prague",
                    today.AddDays(10),
                    crypto,
                    user,
                    submittedAtUtc: today.AddDays(-5)),
                CreateEvent(
                    "Builder Week",
                    "builder-week",
                    "A week focused on crypto product design.",
                    "Venue 2",
                    "Prague",
                    today.AddDays(5),
                    crypto,
                    user,
                    submittedAtUtc: today.AddDays(-1)),
                CreateEvent(
                    "Crypto Breakfast",
                    "crypto-breakfast",
                    "Morning crypto networking.",
                    "Venue 3",
                    "Prague",
                    today.AddDays(2),
                    crypto,
                    user,
                    submittedAtUtc: today.AddDays(-10)));
        });

        using var client = factory.CreateClient();

        using var upcoming = await ExecuteGraphQlAsync(
            client,
            """
            query Events($filter: EventFilterInput) {
              events(filter: $filter) { name }
            }
            """,
            new { filter = new { sortBy = "UPCOMING" } });

        Assert.Equal(
            ["Crypto Breakfast", "Builder Week", "Crypto Launch Week"],
            GetEventNames(upcoming));

        using var newest = await ExecuteGraphQlAsync(
            client,
            """
            query Events($filter: EventFilterInput) {
              events(filter: $filter) { name }
            }
            """,
            new { filter = new { sortBy = "NEWEST" } });

        Assert.Equal(
            ["Builder Week", "Crypto Launch Week", "Crypto Breakfast"],
            GetEventNames(newest));

        using var relevance = await ExecuteGraphQlAsync(
            client,
            """
            query Events($filter: EventFilterInput) {
              events(filter: $filter) { name }
            }
            """,
            new { filter = new { searchText = "crypto", sortBy = "RELEVANCE" } });

        Assert.Equal(
            ["Crypto Breakfast", "Crypto Launch Week", "Builder Week"],
            GetEventNames(relevance));
    }

    [Fact]
    public async Task EventsQuery_TreatsBlankFiltersAsUnsetAndKeepsPendingEventsPrivate()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("privacy@example.com", "Privacy");
            var crypto = CreateDomain("Crypto", "crypto");
            var today = DateTime.UtcNow.Date;

            dbContext.Users.Add(user);
            dbContext.Domains.Add(crypto);
            dbContext.Events.AddRange(
                CreateEvent(
                    "Published Crypto Meetup",
                    "published-crypto-meetup",
                    "Public listing",
                    "Venue 1",
                    "Prague",
                    today.AddDays(7),
                    crypto,
                    user,
                    status: EventStatus.Published),
                CreateEvent(
                    "Pending Crypto Meetup",
                    "pending-crypto-meetup",
                    "Hidden pending listing",
                    "Venue 2",
                    "Prague",
                    today.AddDays(8),
                    crypto,
                    user,
                    status: EventStatus.PendingApproval));
        });

        using var client = factory.CreateClient();

        using var publicResult = await ExecuteGraphQlAsync(
            client,
            """
            query Events($filter: EventFilterInput) {
              events(filter: $filter) { name status }
            }
            """,
            new
            {
                filter = new
                {
                    searchText = "",
                    locationText = " ",
                    domainSlug = "",
                    sortBy = "UPCOMING"
                }
            });

        Assert.Equal(["Published Crypto Meetup"], GetEventNames(publicResult));
    }

    [Fact]
    public async Task SavedSearches_CanBeCreatedListedAndDeleted()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("saved@example.com", "Saved Search User");
            userId = user.Id;
            dbContext.Users.Add(user);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        using var createDocument = await ExecuteGraphQlAsync(
            client,
            """
            mutation SaveSearch($input: SavedSearchInput!) {
              saveSearch(input: $input) {
                id
                name
                searchText
                domainSlug
                locationText
                isFree
                priceMax
                sortBy
              }
            }
            """,
            new
            {
                input = new
                {
                    name = "Crypto in Prague next month",
                    filter = new
                    {
                        searchText = "crypto",
                        domainSlug = "crypto",
                        locationText = "Prague",
                        isFree = false,
                        priceMax = 150m,
                        sortBy = "UPCOMING"
                    }
                }
            });

        var savedSearchId = createDocument.RootElement
            .GetProperty("data")
            .GetProperty("saveSearch")
            .GetProperty("id")
            .GetString();

        Assert.False(string.IsNullOrWhiteSpace(savedSearchId));

        using var listDocument = await ExecuteGraphQlAsync(
            client,
            """
            query SavedSearches {
              mySavedSearches {
                id
                name
                searchText
                domainSlug
                locationText
                isFree
                priceMax
                sortBy
              }
            }
            """);

        var savedSearches = listDocument.RootElement
            .GetProperty("data")
            .GetProperty("mySavedSearches")
            .EnumerateArray()
            .ToArray();

        var savedSearch = Assert.Single(savedSearches);
        Assert.Equal("Crypto in Prague next month", savedSearch.GetProperty("name").GetString());
        Assert.Equal("crypto", savedSearch.GetProperty("searchText").GetString());
        Assert.Equal("crypto", savedSearch.GetProperty("domainSlug").GetString());
        Assert.Equal("Prague", savedSearch.GetProperty("locationText").GetString());
        Assert.False(savedSearch.GetProperty("isFree").GetBoolean());
        Assert.Equal(150m, savedSearch.GetProperty("priceMax").GetDecimal());
        Assert.Equal("UPCOMING", savedSearch.GetProperty("sortBy").GetString());

        using var deleteDocument = await ExecuteGraphQlAsync(
            client,
            """
            mutation DeleteSavedSearch($savedSearchId: UUID!) {
              deleteSavedSearch(savedSearchId: $savedSearchId)
            }
            """,
            new { savedSearchId });

        Assert.True(
            deleteDocument.RootElement
                .GetProperty("data")
                .GetProperty("deleteSavedSearch")
                .GetBoolean());

        using var emptyListDocument = await ExecuteGraphQlAsync(
            client,
            """
            query SavedSearches {
              mySavedSearches { id }
            }
            """);

        Assert.Empty(
            emptyListDocument.RootElement
                .GetProperty("data")
                .GetProperty("mySavedSearches")
                .EnumerateArray());
    }

    private static async Task SeedAsync(EventsApiWebApplicationFactory factory, Action<AppDbContext> seedAction)
    {
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await dbContext.Database.EnsureDeletedAsync();
        await dbContext.Database.EnsureCreatedAsync();
        seedAction(dbContext);
        await dbContext.SaveChangesAsync();
    }

    private static async Task<string> CreateTokenAsync(EventsApiWebApplicationFactory factory, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var jwtTokenService = scope.ServiceProvider.GetRequiredService<JwtTokenService>();
        var user = await dbContext.Users.SingleAsync(candidate => candidate.Id == userId);
        return jwtTokenService.CreateSession(user).Token;
    }

    private static async Task<JsonDocument> ExecuteGraphQlAsync(HttpClient client, string query, object? variables = null)
    {
        var response = await client.PostAsJsonAsync("/graphql", new { query, variables });
        response.EnsureSuccessStatusCode();

        var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        if (document.RootElement.TryGetProperty("errors", out var errors))
        {
            throw new Xunit.Sdk.XunitException($"GraphQL returned errors: {errors}");
        }

        return document;
    }

    private static string[] GetEventNames(JsonDocument document)
        => document.RootElement
            .GetProperty("data")
            .GetProperty("events")
            .EnumerateArray()
            .Select(catalogEvent => catalogEvent.GetProperty("name").GetString()!)
            .ToArray();

    private static async Task<string[]> QueryEventNamesAsync(HttpClient client, object filter)
    {
        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query Events($filter: EventFilterInput) {
              events(filter: $filter) { name }
            }
            """,
            new { filter });

        return GetEventNames(document);
    }

    private static ApplicationUser CreateUser(string email, string displayName)
        => new()
        {
            Email = email,
            DisplayName = displayName,
            PasswordHash = "hashed",
            Role = ApplicationUserRole.Contributor
        };

    private static EventDomain CreateDomain(string name, string slug)
        => new()
        {
            Name = name,
            Slug = slug,
            Subdomain = slug,
            Description = $"{name} events"
        };

    private static CatalogEvent CreateEvent(
        string name,
        string slug,
        string description,
        string venueName,
        string city,
        DateTime startsAtUtc,
        EventDomain domain,
        ApplicationUser user,
        bool isFree = true,
        decimal? priceAmount = 0m,
        DateTime? submittedAtUtc = null,
        EventStatus status = EventStatus.Published)
        => new()
        {
            Name = name,
            Slug = slug,
            Description = description,
            EventUrl = $"https://events.example.com/{slug}",
            VenueName = venueName,
            AddressLine1 = "Address 1",
            City = city,
            CountryCode = "CZ",
            StartsAtUtc = DateTime.SpecifyKind(startsAtUtc, DateTimeKind.Utc),
            EndsAtUtc = DateTime.SpecifyKind(startsAtUtc.AddHours(4), DateTimeKind.Utc),
            SubmittedAtUtc = DateTime.SpecifyKind(submittedAtUtc ?? startsAtUtc.AddDays(-10), DateTimeKind.Utc),
            UpdatedAtUtc = DateTime.SpecifyKind((submittedAtUtc ?? startsAtUtc.AddDays(-10)).AddHours(1), DateTimeKind.Utc),
            Domain = domain,
            SubmittedBy = user,
            Status = status,
            PublishedAtUtc = status == EventStatus.Published ? DateTime.UtcNow : null,
            ReviewedBy = status == EventStatus.Published ? user : null,
            IsFree = isFree,
            PriceAmount = isFree ? 0m : priceAmount,
            CurrencyCode = "EUR",
            Latitude = 50.0755m,
            Longitude = 14.4378m
        };

    private static DateTime FirstDayOfNextMonthUtc()
    {
        var now = DateTime.UtcNow;
        return new DateTime(now.Year, now.Month, 1, 10, 0, 0, DateTimeKind.Utc).AddMonths(1);
    }
}
