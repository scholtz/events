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
            ["Free Prague Meetup"],
            await QueryEventNamesAsync(client, new { isFree = true, priceMin = 50m, sortBy = "UPCOMING" }));

        Assert.Equal(
            ["Free Prague Meetup"],
            await QueryEventNamesAsync(client, new { isFree = true, priceMin = 50m, priceMax = 200m, sortBy = "UPCOMING" }));

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

        Assert.Equal(
            ["Budget Prague Meetup", "Premium Prague Summit"],
            await QueryEventNamesAsync(client, new { priceMin = 1m, priceMax = 200m, sortBy = "UPCOMING" }));

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
    public async Task EventsQuery_KeywordOnly_MatchesNameDescriptionAndVenue()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("kw@example.com", "KW User");
            var tech = CreateDomain("Tech", "tech");
            var nextMonth = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.Add(tech);
            dbContext.Events.AddRange(
                CreateEvent(
                    "Tech Summit Prague",
                    "tech-summit-prague",
                    "A summit about cloud technology.",
                    "Congress Centre",
                    "Prague",
                    nextMonth,
                    tech,
                    user),
                CreateEvent(
                    "Builders Meetup",
                    "builders-meetup",
                    "Connect with fellow blockchain builders.",
                    "Blockchain Lounge",
                    "Brno",
                    nextMonth.AddDays(1),
                    tech,
                    user),
                CreateEvent(
                    "General Workshop",
                    "general-workshop",
                    "A workshop on various topics.",
                    "Coworking Hub",
                    "Prague",
                    nextMonth.AddDays(2),
                    tech,
                    user));
        });

        using var client = factory.CreateClient();

        // Match by name
        Assert.Equal(
            ["Tech Summit Prague"],
            await QueryEventNamesAsync(client, new { searchText = "Tech Summit" }));

        // Match by description keyword
        Assert.Equal(
            ["Builders Meetup"],
            await QueryEventNamesAsync(client, new { searchText = "blockchain" }));

        // Match by venue name
        Assert.Equal(
            ["General Workshop"],
            await QueryEventNamesAsync(client, new { searchText = "Coworking" }));
    }

    [Fact]
    public async Task EventsQuery_CityFilter_MatchesExactCityOnly()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("city@example.com", "City User");
            var tech = CreateDomain("Tech", "tech");
            var nextMonth = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.Add(tech);
            dbContext.Events.AddRange(
                CreateEvent("Prague Meetup", "prague-meetup", "In Prague.", "Venue A", "Prague", nextMonth, tech, user),
                CreateEvent("Brno Meetup", "brno-meetup", "In Brno.", "Venue B", "Brno", nextMonth.AddDays(1), tech, user),
                CreateEvent("Prague-Brno Mix", "prague-brno-mix", "In Prague.", "Venue C", "Prague", nextMonth.AddDays(2), tech, user));
        });

        using var client = factory.CreateClient();

        var pragueMeetups = await QueryEventNamesAsync(client, new { city = "Prague" });
        Assert.Equal(["Prague Meetup", "Prague-Brno Mix"], pragueMeetups);

        var brnoMeetups = await QueryEventNamesAsync(client, new { city = "Brno" });
        Assert.Equal(["Brno Meetup"], brnoMeetups);
    }

    [Fact]
    public async Task EventsQuery_DateRangeEdgeCases_IncludeBoundaryDates()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var boundary = FirstDayOfNextMonthUtc();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("dates@example.com", "Dates User");
            var tech = CreateDomain("Tech", "tech");

            dbContext.Users.Add(user);
            dbContext.Domains.Add(tech);
            dbContext.Events.AddRange(
                CreateEvent("Boundary Event", "boundary-event", "Starts exactly on boundary.", "Venue", "Prague", boundary, tech, user),
                CreateEvent("Before Boundary", "before-boundary", "Starts one second before.", "Venue", "Prague", boundary.AddSeconds(-1), tech, user),
                CreateEvent("After Boundary", "after-boundary", "Starts one day after.", "Venue", "Prague", boundary.AddDays(1), tech, user));
        });

        using var client = factory.CreateClient();

        // Boundary start date: should include the event that starts exactly on it
        var fromBoundary = await QueryEventNamesAsync(client, new { startsFromUtc = boundary });
        Assert.Contains("Boundary Event", fromBoundary);
        Assert.DoesNotContain("Before Boundary", fromBoundary);

        // Boundary end date: should include the event that starts exactly on it
        var toBoundary = await QueryEventNamesAsync(client, new { startsToUtc = boundary });
        Assert.Contains("Boundary Event", toBoundary);
        Assert.Contains("Before Boundary", toBoundary);
        Assert.DoesNotContain("After Boundary", toBoundary);

        // Exact day window: only the boundary event
        var exactDay = await QueryEventNamesAsync(client, new { startsFromUtc = boundary, startsToUtc = boundary });
        Assert.Equal(["Boundary Event"], exactDay);
    }

    [Fact]
    public async Task EventsQuery_LocationText_MatchesCityVenueAndAddress()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("loc@example.com", "Loc User");
            var tech = CreateDomain("Tech", "tech");
            var nextMonth = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.Add(tech);
            dbContext.Events.AddRange(
                CreateEvent(
                    "Prague City Match",
                    "prague-city-match",
                    "Event matched by city.",
                    "Some Venue",
                    "Prague",
                    nextMonth,
                    tech,
                    user),
                CreateEvent(
                    "Venue Name Match",
                    "venue-name-match",
                    "Event matched by venue.",
                    "Innovation Hub",
                    "Brno",
                    nextMonth.AddDays(1),
                    tech,
                    user),
                CreateEvent(
                    "No Location Match",
                    "no-location-match",
                    "Event without matching location.",
                    "Unrelated Place",
                    "Ostrava",
                    nextMonth.AddDays(2),
                    tech,
                    user));
        });

        using var client = factory.CreateClient();

        // Matches by city
        Assert.Contains("Prague City Match", await QueryEventNamesAsync(client, new { locationText = "Prague" }));

        // Matches by venue name (fuzzy)
        Assert.Contains("Venue Name Match", await QueryEventNamesAsync(client, new { locationText = "Innovation" }));

        // No match
        var noMatch = await QueryEventNamesAsync(client, new { locationText = "Nonexistent City XYZ" });
        Assert.Empty(noMatch);
    }

    [Fact]
    public async Task EventsQuery_DomainSlugFilter_IsolatesEventsByDomain()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("domain@example.com", "Domain User");
            var tech = CreateDomain("Tech", "tech");
            var crypto = CreateDomain("Crypto", "crypto");
            var nextMonth = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.AddRange(tech, crypto);
            dbContext.Events.AddRange(
                CreateEvent("Tech Event A", "tech-event-a", "Tech desc.", "Venue", "Prague", nextMonth, tech, user),
                CreateEvent("Tech Event B", "tech-event-b", "Tech desc.", "Venue", "Brno", nextMonth.AddDays(1), tech, user),
                CreateEvent("Crypto Event", "crypto-event", "Crypto desc.", "Venue", "Prague", nextMonth, crypto, user));
        });

        using var client = factory.CreateClient();

        var techEvents = await QueryEventNamesAsync(client, new { domainSlug = "tech" });
        Assert.Equal(["Tech Event A", "Tech Event B"], techEvents);

        var cryptoEvents = await QueryEventNamesAsync(client, new { domainSlug = "crypto" });
        Assert.Equal(["Crypto Event"], cryptoEvents);
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

    [Fact]
    public async Task FavoriteEvents_CanBeFavoritedListedAndUnfavorited()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var otherUserId = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("favorite@example.com", "Favorite User");
            var otherUser = CreateUser("other@example.com", "Other User");
            userId = user.Id;
            otherUserId = otherUser.Id;

            var domain = CreateDomain("Tech", "tech");
            dbContext.Users.AddRange(user, otherUser);
            dbContext.Domains.Add(domain);

            var catalogEvent = CreateEvent(
                "Prague Tech Summit",
                "prague-tech-summit",
                "A great tech event.",
                "Prague Congress Centre",
                "Prague",
                FirstDayOfNextMonthUtc(),
                domain,
                user);
            eventId = catalogEvent.Id;
            dbContext.Events.Add(catalogEvent);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        // Favorite the event
        using var favoriteDocument = await ExecuteGraphQlAsync(
            client,
            """
            mutation FavoriteEvent($eventId: UUID!) {
              favoriteEvent(eventId: $eventId) {
                id
                eventId
                userId
                createdAtUtc
              }
            }
            """,
            new { eventId });

        var favoriteData = favoriteDocument.RootElement
            .GetProperty("data")
            .GetProperty("favoriteEvent");

        Assert.Equal(eventId.ToString(), favoriteData.GetProperty("eventId").GetString());
        Assert.Equal(userId.ToString(), favoriteData.GetProperty("userId").GetString());

        // Favoriting the same event again should return the existing favorite (idempotent)
        using var duplicateFavoriteDocument = await ExecuteGraphQlAsync(
            client,
            """
            mutation FavoriteEvent($eventId: UUID!) {
              favoriteEvent(eventId: $eventId) {
                id
                eventId
              }
            }
            """,
            new { eventId });

        var duplicateFavoriteId = duplicateFavoriteDocument.RootElement
            .GetProperty("data")
            .GetProperty("favoriteEvent")
            .GetProperty("id")
            .GetString();

        var originalFavoriteId = favoriteData.GetProperty("id").GetString();
        Assert.Equal(originalFavoriteId, duplicateFavoriteId);

        // List favorites for the user
        using var listDocument = await ExecuteGraphQlAsync(
            client,
            """
            query MyFavoriteEvents {
              myFavoriteEvents {
                id
                name
                slug
                domain { slug }
              }
            }
            """);

        var favorites = listDocument.RootElement
            .GetProperty("data")
            .GetProperty("myFavoriteEvents")
            .EnumerateArray()
            .ToArray();

        var favorite = Assert.Single(favorites);
        Assert.Equal("Prague Tech Summit", favorite.GetProperty("name").GetString());
        Assert.Equal("prague-tech-summit", favorite.GetProperty("slug").GetString());

        // Other user should not see this user's favorites
        using var otherClient = factory.CreateClient();
        otherClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, otherUserId));

        using var otherListDocument = await ExecuteGraphQlAsync(
            otherClient,
            """
            query MyFavoriteEvents {
              myFavoriteEvents { id }
            }
            """);

        Assert.Empty(
            otherListDocument.RootElement
                .GetProperty("data")
                .GetProperty("myFavoriteEvents")
                .EnumerateArray());

        // Unfavorite the event
        using var unfavoriteDocument = await ExecuteGraphQlAsync(
            client,
            """
            mutation UnfavoriteEvent($eventId: UUID!) {
              unfavoriteEvent(eventId: $eventId)
            }
            """,
            new { eventId });

        Assert.True(
            unfavoriteDocument.RootElement
                .GetProperty("data")
                .GetProperty("unfavoriteEvent")
                .GetBoolean());

        // List should now be empty
        using var emptyListDocument = await ExecuteGraphQlAsync(
            client,
            """
            query MyFavoriteEvents {
              myFavoriteEvents { id }
            }
            """);

        Assert.Empty(
            emptyListDocument.RootElement
                .GetProperty("data")
                .GetProperty("myFavoriteEvents")
                .EnumerateArray());
    }

    [Fact]
    public async Task FavoriteEvent_ReturnsError_WhenEventNotFound()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("noevt@example.com", "No Event User");
            userId = user.Id;
            dbContext.Users.Add(user);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation FavoriteEvent($eventId: UUID!) {
                  favoriteEvent(eventId: $eventId) { id }
                }
                """,
            variables = new { eventId = Guid.NewGuid() }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("EVENT_NOT_FOUND", errors.ToString());
    }

    [Fact]
    public async Task UnfavoriteEvent_ReturnsError_WhenFavoriteNotFound()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("unfav@example.com", "Unfav User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tech");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            var catalogEvent = CreateEvent(
                "Some Event",
                "some-event",
                "An event.",
                "Venue",
                "Prague",
                FirstDayOfNextMonthUtc(),
                domain,
                user);
            eventId = catalogEvent.Id;
            dbContext.Events.Add(catalogEvent);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation UnfavoriteEvent($eventId: UUID!) {
                  unfavoriteEvent(eventId: $eventId)
                }
                """,
            variables = new { eventId }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("FAVORITE_NOT_FOUND", errors.ToString());
    }

    [Fact]
    public async Task MyFavoriteEvents_RequiresAuthentication_RejectsAnonymousRequest()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        using var client = factory.CreateClient();
        // No Authorization header — should receive an auth error, not data

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                query MyFavoriteEvents {
                  myFavoriteEvents { id }
                }
                """
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var errorMessage = errors.ToString();
        Assert.True(
            errorMessage.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("not authorized", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("unauthorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error but got: {errorMessage}");
    }

    [Fact]
    public async Task FavoriteEvent_RequiresAuthentication_RejectsAnonymousRequest()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        using var client = factory.CreateClient();
        // No Authorization header

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation FavoriteEvent($eventId: UUID!) {
                  favoriteEvent(eventId: $eventId) { id }
                }
                """,
            variables = new { eventId = Guid.NewGuid() }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var errorMessage = errors.ToString();
        Assert.True(
            errorMessage.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("not authorized", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("unauthorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error but got: {errorMessage}");
    }

    [Fact]
    public async Task UnfavoriteEvent_RequiresAuthentication_RejectsAnonymousRequest()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        using var client = factory.CreateClient();
        // No Authorization header

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation UnfavoriteEvent($eventId: UUID!) {
                  unfavoriteEvent(eventId: $eventId)
                }
                """,
            variables = new { eventId = Guid.NewGuid() }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var errorMessage = errors.ToString();
        Assert.True(
            errorMessage.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("not authorized", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("unauthorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error but got: {errorMessage}");
    }

    [Fact]
    public async Task EventBySlug_ReturnsInterestedCount_ReflectingFavoriteCount()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var otherUserId = Guid.Empty;
        var eventId = Guid.Empty;
        const string slug = "interested-count-event";

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("counter1@example.com", "Counter One");
            var otherUser = CreateUser("counter2@example.com", "Counter Two");
            userId = user.Id;
            otherUserId = otherUser.Id;

            var domain = CreateDomain("Tech", "tech-ic");
            dbContext.Users.AddRange(user, otherUser);
            dbContext.Domains.Add(domain);

            var catalogEvent = CreateEvent(
                "Interested Count Event",
                slug,
                "Testing interested count.",
                "Some Venue",
                "Prague",
                FirstDayOfNextMonthUtc(),
                domain,
                user);
            eventId = catalogEvent.Id;
            dbContext.Events.Add(catalogEvent);
        });

        using var client = factory.CreateClient();

        // Initially zero interested
        using var initialDocument = await ExecuteGraphQlAsync(
            client,
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                name
                interestedCount
              }
            }
            """,
            new { slug });

        var initialEvent = initialDocument.RootElement
            .GetProperty("data")
            .GetProperty("eventBySlug");

        Assert.Equal("Interested Count Event", initialEvent.GetProperty("name").GetString());
        Assert.Equal(0, initialEvent.GetProperty("interestedCount").GetInt32());

        // User 1 favorites the event
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));
        await ExecuteGraphQlAsync(client, """
            mutation FavoriteEvent($eventId: UUID!) {
              favoriteEvent(eventId: $eventId) { id }
            }
            """, new { eventId });

        // User 2 favorites the event
        using var otherClient = factory.CreateClient();
        otherClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, otherUserId));
        await ExecuteGraphQlAsync(otherClient, """
            mutation FavoriteEvent($eventId: UUID!) {
              favoriteEvent(eventId: $eventId) { id }
            }
            """, new { eventId });

        // interestedCount should now be 2
        using var afterFavoriteDocument = await ExecuteGraphQlAsync(
            factory.CreateClient(),
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                interestedCount
              }
            }
            """,
            new { slug });

        Assert.Equal(2, afterFavoriteDocument.RootElement
            .GetProperty("data")
            .GetProperty("eventBySlug")
            .GetProperty("interestedCount")
            .GetInt32());

        // After unfavoriting, count decreases
        await ExecuteGraphQlAsync(client, """
            mutation UnfavoriteEvent($eventId: UUID!) {
              unfavoriteEvent(eventId: $eventId)
            }
            """, new { eventId });

        using var afterUnfavoriteDocument = await ExecuteGraphQlAsync(
            factory.CreateClient(),
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                interestedCount
              }
            }
            """,
            new { slug });

        Assert.Equal(1, afterUnfavoriteDocument.RootElement
            .GetProperty("data")
            .GetProperty("eventBySlug")
            .GetProperty("interestedCount")
            .GetInt32());
    }

    [Fact]
    public async Task MyDashboard_ReturnsAnalyticsWithCorrectInterestedCounts()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var organizerUserId = Guid.Empty;
        var attendeeUserId1 = Guid.Empty;
        var attendeeUserId2 = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var organizer = CreateUser("analytics@example.com", "Organizer");
            var attendee1 = CreateUser("attendee1@example.com", "Attendee One");
            var attendee2 = CreateUser("attendee2@example.com", "Attendee Two");
            organizerUserId = organizer.Id;
            attendeeUserId1 = attendee1.Id;
            attendeeUserId2 = attendee2.Id;

            var domain = CreateDomain("Tech", "tech-analytics");
            dbContext.Users.AddRange(organizer, attendee1, attendee2);
            dbContext.Domains.Add(domain);

            var catalogEvent = CreateEvent(
                "Analytics Test Event",
                "analytics-test-event",
                "Testing analytics.",
                "Some Venue",
                "Prague",
                FirstDayOfNextMonthUtc(),
                domain,
                organizer);
            eventId = catalogEvent.Id;
            dbContext.Events.Add(catalogEvent);

            // Two users save the event
            dbContext.FavoriteEvents.AddRange(
                new FavoriteEvent { UserId = attendee1.Id, EventId = catalogEvent.Id, CreatedAtUtc = DateTime.UtcNow.AddDays(-2) },
                new FavoriteEvent { UserId = attendee2.Id, EventId = catalogEvent.Id, CreatedAtUtc = DateTime.UtcNow.AddDays(-20) });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizerUserId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query MyDashboard {
              myDashboard {
                totalSubmittedEvents
                publishedEvents
                totalInterestedCount
                eventAnalytics {
                  eventId
                  eventName
                  eventSlug
                  status
                  totalInterestedCount
                  interestedLast7Days
                  interestedLast30Days
                }
              }
            }
            """);

        var dashboard = document.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(1, dashboard.GetProperty("totalSubmittedEvents").GetInt32());
        Assert.Equal(1, dashboard.GetProperty("publishedEvents").GetInt32());
        Assert.Equal(2, dashboard.GetProperty("totalInterestedCount").GetInt32());

        var analytics = dashboard.GetProperty("eventAnalytics").EnumerateArray().ToArray();
        var item = Assert.Single(analytics);
        Assert.Equal("analytics-test-event", item.GetProperty("eventSlug").GetString());
        Assert.Equal("PUBLISHED", item.GetProperty("status").GetString());
        Assert.Equal(2, item.GetProperty("totalInterestedCount").GetInt32());
        // Only 1 save within last 7 days
        Assert.Equal(1, item.GetProperty("interestedLast7Days").GetInt32());
        // Both saves within last 30 days
        Assert.Equal(2, item.GetProperty("interestedLast30Days").GetInt32());
    }

    [Fact]
    public async Task MyDashboard_ReturnsZeroAnalytics_ForNewEventWithNoSaves()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var organizerUserId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var organizer = CreateUser("zero-analytics@example.com", "Zero Organizer");
            organizerUserId = organizer.Id;

            var domain = CreateDomain("Tech", "tech-zero");
            dbContext.Users.Add(organizer);
            dbContext.Domains.Add(domain);

            dbContext.Events.Add(CreateEvent(
                "New Unsaved Event",
                "new-unsaved-event",
                "No one has saved this yet.",
                "Venue",
                "Prague",
                FirstDayOfNextMonthUtc(),
                domain,
                organizer));
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizerUserId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query MyDashboard {
              myDashboard {
                totalSubmittedEvents
                totalInterestedCount
                eventAnalytics {
                  totalInterestedCount
                  interestedLast7Days
                  interestedLast30Days
                }
              }
            }
            """);

        var dashboard = document.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(1, dashboard.GetProperty("totalSubmittedEvents").GetInt32());
        Assert.Equal(0, dashboard.GetProperty("totalInterestedCount").GetInt32());

        var analytics = dashboard.GetProperty("eventAnalytics").EnumerateArray().ToArray();
        var item = Assert.Single(analytics);
        Assert.Equal(0, item.GetProperty("totalInterestedCount").GetInt32());
        Assert.Equal(0, item.GetProperty("interestedLast7Days").GetInt32());
        Assert.Equal(0, item.GetProperty("interestedLast30Days").GetInt32());
    }

    [Fact]
    public async Task MyDashboard_OnlyReturnsCurrentOrganizerEvents_NotOtherOrganizers()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var organizer1UserId = Guid.Empty;
        var organizer2UserId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var organizer1 = CreateUser("org1@example.com", "Organizer One");
            var organizer2 = CreateUser("org2@example.com", "Organizer Two");
            organizer1UserId = organizer1.Id;
            organizer2UserId = organizer2.Id;

            var domain = CreateDomain("Tech", "tech-isolation");
            dbContext.Users.AddRange(organizer1, organizer2);
            dbContext.Domains.Add(domain);

            dbContext.Events.AddRange(
                CreateEvent("Org1 Event", "org1-event", "Event by organizer 1.", "Venue 1", "Prague",
                    FirstDayOfNextMonthUtc(), domain, organizer1),
                CreateEvent("Org2 Event", "org2-event", "Event by organizer 2.", "Venue 2", "Brno",
                    FirstDayOfNextMonthUtc(), domain, organizer2));
        });

        using var client1 = factory.CreateClient();
        client1.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizer1UserId));

        using var document1 = await ExecuteGraphQlAsync(
            client1,
            """
            query MyDashboard {
              myDashboard {
                totalSubmittedEvents
                managedEvents { name }
                eventAnalytics { eventName }
              }
            }
            """);

        var dashboard1 = document1.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(1, dashboard1.GetProperty("totalSubmittedEvents").GetInt32());

        var managedEvents1 = dashboard1.GetProperty("managedEvents").EnumerateArray().ToArray();
        Assert.Single(managedEvents1);
        Assert.Equal("Org1 Event", managedEvents1[0].GetProperty("name").GetString());

        var analytics1 = dashboard1.GetProperty("eventAnalytics").EnumerateArray().ToArray();
        Assert.Single(analytics1);
        Assert.Equal("Org1 Event", analytics1[0].GetProperty("eventName").GetString());

        // Organizer 2 sees only their own events
        using var client2 = factory.CreateClient();
        client2.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizer2UserId));

        using var document2 = await ExecuteGraphQlAsync(
            client2,
            """
            query MyDashboard {
              myDashboard {
                totalSubmittedEvents
                eventAnalytics { eventName }
              }
            }
            """);

        var dashboard2 = document2.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(1, dashboard2.GetProperty("totalSubmittedEvents").GetInt32());

        var analytics2 = dashboard2.GetProperty("eventAnalytics").EnumerateArray().ToArray();
        Assert.Single(analytics2);
        Assert.Equal("Org2 Event", analytics2[0].GetProperty("eventName").GetString());
    }

    [Fact]
    public async Task MyDashboard_TotalInterestedCount_OnlyCountsPublishedEvents()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var organizerUserId = Guid.Empty;
        var attendeeUserId = Guid.Empty;
        var publishedEventId = Guid.Empty;
        var pendingEventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var organizer = CreateUser("pub-vs-pending@example.com", "Pub Organizer");
            var attendee = CreateUser("attendee-pub@example.com", "Attendee");
            organizerUserId = organizer.Id;
            attendeeUserId = attendee.Id;

            var domain = CreateDomain("Tech", "tech-pub-pending");
            dbContext.Users.AddRange(organizer, attendee);
            dbContext.Domains.Add(domain);

            var published = CreateEvent("Published Event", "published-event-dashboard", "Published.",
                "Venue 1", "Prague", FirstDayOfNextMonthUtc(), domain, organizer, status: EventStatus.Published);
            var pending = CreateEvent("Pending Event", "pending-event-dashboard", "Pending.",
                "Venue 2", "Prague", FirstDayOfNextMonthUtc(), domain, organizer, status: EventStatus.PendingApproval);

            publishedEventId = published.Id;
            pendingEventId = pending.Id;
            dbContext.Events.AddRange(published, pending);

            // Attendee saves both
            dbContext.FavoriteEvents.AddRange(
                new FavoriteEvent { UserId = attendee.Id, EventId = published.Id, CreatedAtUtc = DateTime.UtcNow },
                new FavoriteEvent { UserId = attendee.Id, EventId = pending.Id, CreatedAtUtc = DateTime.UtcNow });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizerUserId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query MyDashboard {
              myDashboard {
                totalInterestedCount
                eventAnalytics {
                  eventSlug
                  status
                  totalInterestedCount
                }
              }
            }
            """);

        var dashboard = document.RootElement.GetProperty("data").GetProperty("myDashboard");
        // totalInterestedCount only counts published events
        Assert.Equal(1, dashboard.GetProperty("totalInterestedCount").GetInt32());

        var analytics = dashboard.GetProperty("eventAnalytics").EnumerateArray()
            .OrderBy(a => a.GetProperty("eventSlug").GetString())
            .ToArray();

        Assert.Equal(2, analytics.Length);

        var pendingAnalytics = analytics.First(a => a.GetProperty("status").GetString() == "PENDING_APPROVAL");
        Assert.Equal(1, pendingAnalytics.GetProperty("totalInterestedCount").GetInt32());

        var publishedAnalytics = analytics.First(a => a.GetProperty("status").GetString() == "PUBLISHED");
        Assert.Equal(1, publishedAnalytics.GetProperty("totalInterestedCount").GetInt32());
    }

    [Fact]
    public async Task MyDashboard_RequiresAuthentication_RejectsAnonymousRequest()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        using var client = factory.CreateClient();
        // No Authorization header — should receive an auth error, not data

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                query MyDashboard {
                  myDashboard {
                    totalSubmittedEvents
                  }
                }
                """
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var errorMessage = errors.ToString();
        // Hot Chocolate returns AUTH_NOT_AUTHORIZED for unauthenticated access to [Authorize] queries
        Assert.True(
            errorMessage.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("not authorized", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("unauthorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error but got: {errorMessage}");
    }

    [Fact]
    public async Task MyDashboard_RejectedEvents_AppearInAnalyticsButNotInTotalInterestedCount()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var organizerUserId = Guid.Empty;
        var attendeeUserId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var organizer = CreateUser("rejected@example.com", "Rejected Organizer");
            var attendee = CreateUser("attendee-rej@example.com", "Attendee");
            organizerUserId = organizer.Id;
            attendeeUserId = attendee.Id;

            var domain = CreateDomain("Tech", "tech-rej");
            dbContext.Users.AddRange(organizer, attendee);
            dbContext.Domains.Add(domain);

            var published = CreateEvent("Approved Event", "approved-event-rej", "Approved.",
                "Venue 1", "Prague", FirstDayOfNextMonthUtc(), domain, organizer,
                status: EventStatus.Published);
            var rejected = CreateEvent("Rejected Event", "rejected-event-rej", "Rejected.",
                "Venue 2", "Prague", FirstDayOfNextMonthUtc(), domain, organizer,
                status: EventStatus.Rejected);

            dbContext.Events.AddRange(published, rejected);

            // One attendee saved the rejected event
            dbContext.FavoriteEvents.Add(
                new FavoriteEvent { UserId = attendee.Id, EventId = rejected.Id, CreatedAtUtc = DateTime.UtcNow });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizerUserId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query MyDashboard {
              myDashboard {
                totalSubmittedEvents
                totalInterestedCount
                eventAnalytics {
                  eventName
                  status
                  totalInterestedCount
                }
              }
            }
            """);

        var dashboard = document.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(2, dashboard.GetProperty("totalSubmittedEvents").GetInt32());
        // Rejected events are excluded from the headline total
        Assert.Equal(0, dashboard.GetProperty("totalInterestedCount").GetInt32());

        var analytics = dashboard.GetProperty("eventAnalytics").EnumerateArray().ToArray();
        Assert.Equal(2, analytics.Length);

        var rejectedAnalytics = analytics.First(a => a.GetProperty("status").GetString() == "REJECTED");
        // Per-event count is still correct even for rejected events
        Assert.Equal(1, rejectedAnalytics.GetProperty("totalInterestedCount").GetInt32());

        var publishedAnalytics = analytics.First(a => a.GetProperty("status").GetString() == "PUBLISHED");
        Assert.Equal(0, publishedAnalytics.GetProperty("totalInterestedCount").GetInt32());
    }

    [Fact]
    public async Task MyDashboard_MultipleEvents_AllAppearsInAnalyticsOrderedByStartDate()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var organizerUserId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var organizer = CreateUser("multi-event@example.com", "Multi Organizer");
            var attendee1 = CreateUser("multi-att1@example.com", "Attendee 1");
            var attendee2 = CreateUser("multi-att2@example.com", "Attendee 2");
            organizerUserId = organizer.Id;

            var domain = CreateDomain("Tech", "tech-multi");
            dbContext.Users.AddRange(organizer, attendee1, attendee2);
            dbContext.Domains.Add(domain);

            var soonEvent = CreateEvent("Soon Event", "soon-event", "Happening soon.",
                "Venue 1", "Prague", FirstDayOfNextMonthUtc(), domain, organizer);
            var laterEvent = CreateEvent("Later Event", "later-event", "Happening later.",
                "Venue 2", "Prague", FirstDayOfNextMonthUtc().AddMonths(1), domain, organizer);

            dbContext.Events.AddRange(soonEvent, laterEvent);

            // 2 saves for soon event, 1 for later event
            dbContext.FavoriteEvents.AddRange(
                new FavoriteEvent { UserId = attendee1.Id, EventId = soonEvent.Id, CreatedAtUtc = DateTime.UtcNow },
                new FavoriteEvent { UserId = attendee2.Id, EventId = soonEvent.Id, CreatedAtUtc = DateTime.UtcNow },
                new FavoriteEvent { UserId = attendee1.Id, EventId = laterEvent.Id, CreatedAtUtc = DateTime.UtcNow });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizerUserId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query MyDashboard {
              myDashboard {
                totalSubmittedEvents
                totalInterestedCount
                eventAnalytics {
                  eventName
                  totalInterestedCount
                  interestedLast7Days
                }
              }
            }
            """);

        var dashboard = document.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(2, dashboard.GetProperty("totalSubmittedEvents").GetInt32());
        Assert.Equal(3, dashboard.GetProperty("totalInterestedCount").GetInt32());

        var analytics = dashboard.GetProperty("eventAnalytics").EnumerateArray().ToArray();
        Assert.Equal(2, analytics.Length);

        var soonAnalytics = analytics.First(a => a.GetProperty("eventName").GetString() == "Soon Event");
        Assert.Equal(2, soonAnalytics.GetProperty("totalInterestedCount").GetInt32());
        Assert.Equal(2, soonAnalytics.GetProperty("interestedLast7Days").GetInt32());

        var laterAnalytics = analytics.First(a => a.GetProperty("eventName").GetString() == "Later Event");
        Assert.Equal(1, laterAnalytics.GetProperty("totalInterestedCount").GetInt32());
        Assert.Equal(1, laterAnalytics.GetProperty("interestedLast7Days").GetInt32());
    }

    // ── Event detail: location, map, and attendee context ──────────────────

    [Fact]
    public async Task EventBySlug_ReturnsAllLocationFields_ForPublishedEvent()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        const string slug = "location-fields-event";

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("loc@example.com", "Location Organizer");
            var domain = CreateDomain("Tech", "tech-loc");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent("Location Fields Event", slug, "Has all location data.",
                "Grand Venue Hall", "Prague", FirstDayOfNextMonthUtc(), domain, user);
            // Override to set known coordinates
            ev.AddressLine1 = "Wenceslas Square 1";
            ev.CountryCode = "CZ";
            ev.Latitude = 50.0755m;
            ev.Longitude = 14.4378m;
            dbContext.Events.Add(ev);
        });

        using var document = await ExecuteGraphQlAsync(
            factory.CreateClient(),
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                venueName
                addressLine1
                city
                countryCode
                latitude
                longitude
                mapUrl
                interestedCount
              }
            }
            """,
            new { slug });

        var result = document.RootElement.GetProperty("data").GetProperty("eventBySlug");
        Assert.Equal("Grand Venue Hall", result.GetProperty("venueName").GetString());
        Assert.Equal("Wenceslas Square 1", result.GetProperty("addressLine1").GetString());
        Assert.Equal("Prague", result.GetProperty("city").GetString());
        Assert.Equal("CZ", result.GetProperty("countryCode").GetString());
        Assert.Equal(50.0755m, result.GetProperty("latitude").GetDecimal());
        Assert.Equal(14.4378m, result.GetProperty("longitude").GetDecimal());

        var mapUrl = result.GetProperty("mapUrl").GetString();
        Assert.NotNull(mapUrl);
        Assert.Contains("openstreetmap.org", mapUrl);
        Assert.Contains("50.0755", mapUrl);
        Assert.Contains("14.4378", mapUrl);

        // interestedCount starts at zero for a new event with no saves
        Assert.Equal(0, result.GetProperty("interestedCount").GetInt32());
    }

    [Fact]
    public async Task EventBySlug_WithZeroCoordinates_StillReturnsEventWithZeroLatLng()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        const string slug = "zero-coords-event";

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("zerocoords@example.com", "Zero Coords Organizer");
            var domain = CreateDomain("Tech", "tech-zc");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent("Zero Coords Event", slug, "No GPS coordinates set.",
                "Mystery Venue", "Vienna", FirstDayOfNextMonthUtc(), domain, user);
            // Explicitly override to zero lat/lng (default/unset state)
            ev.Latitude = 0m;
            ev.Longitude = 0m;
            dbContext.Events.Add(ev);
        });

        using var document = await ExecuteGraphQlAsync(
            factory.CreateClient(),
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                slug
                venueName
                city
                latitude
                longitude
                mapUrl
                interestedCount
              }
            }
            """,
            new { slug });

        var result = document.RootElement.GetProperty("data").GetProperty("eventBySlug");
        // Event is still returned — the backend does not reject zero-coordinate events
        Assert.Equal(slug, result.GetProperty("slug").GetString());
        Assert.Equal("Mystery Venue", result.GetProperty("venueName").GetString());
        Assert.Equal("Vienna", result.GetProperty("city").GetString());
        Assert.Equal(0m, result.GetProperty("latitude").GetDecimal());
        Assert.Equal(0m, result.GetProperty("longitude").GetDecimal());
        // mapUrl is always computed — frontend decides whether to render the map
        Assert.NotNull(result.GetProperty("mapUrl").GetString());
        Assert.Equal(0, result.GetProperty("interestedCount").GetInt32());
    }

    [Fact]
    public async Task EventBySlug_ReturnsNull_ForNonPublishedEvent()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        const string pendingSlug = "pending-detail-event";
        const string rejectedSlug = "rejected-detail-event";

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("nonpub@example.com", "Non-Published Organizer");
            var domain = CreateDomain("Tech", "tech-np");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            var pending = CreateEvent("Pending Detail Event", pendingSlug, "Pending.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user,
                status: EventStatus.PendingApproval);
            var rejected = CreateEvent("Rejected Detail Event", rejectedSlug, "Rejected.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user,
                status: EventStatus.Rejected);

            dbContext.Events.AddRange(pending, rejected);
        });

        // Unauthenticated client must not see non-published events
        using var pendingDocument = await ExecuteGraphQlAsync(
            factory.CreateClient(),
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) { name }
            }
            """,
            new { slug = pendingSlug });

        Assert.True(
            pendingDocument.RootElement.GetProperty("data").GetProperty("eventBySlug").ValueKind
                == System.Text.Json.JsonValueKind.Null,
            "Pending event should not be accessible via eventBySlug");

        using var rejectedDocument = await ExecuteGraphQlAsync(
            factory.CreateClient(),
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) { name }
            }
            """,
            new { slug = rejectedSlug });

        Assert.True(
            rejectedDocument.RootElement.GetProperty("data").GetProperty("eventBySlug").ValueKind
                == System.Text.Json.JsonValueKind.Null,
            "Rejected event should not be accessible via eventBySlug");
    }

    [Fact]
    public async Task EventBySlug_AllowsUnauthenticatedAccess_AndReturnsInterestedCount()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var attendeeUserId = Guid.Empty;
        const string slug = "unauth-access-event";

        await SeedAsync(factory, dbContext =>
        {
            var organizer = CreateUser("unauth-org@example.com", "Unauth Organizer");
            var attendee = CreateUser("unauth-att@example.com", "Unauth Attendee");
            attendeeUserId = attendee.Id;

            var domain = CreateDomain("Tech", "tech-ua");
            dbContext.Users.AddRange(organizer, attendee);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent("Unauth Access Event", slug, "Anyone can view.",
                "Public Venue", "Prague", FirstDayOfNextMonthUtc(), domain, organizer);
            dbContext.Events.Add(ev);
            dbContext.FavoriteEvents.Add(
                new FavoriteEvent { UserId = attendee.Id, EventId = ev.Id, CreatedAtUtc = DateTime.UtcNow });
        });

        // No Authorization header — unauthenticated request
        using var document = await ExecuteGraphQlAsync(
            factory.CreateClient(),
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                name
                interestedCount
              }
            }
            """,
            new { slug });

        var result = document.RootElement.GetProperty("data").GetProperty("eventBySlug");
        Assert.Equal("Unauth Access Event", result.GetProperty("name").GetString());
        // interestedCount is a public aggregate — visible without authentication
        Assert.Equal(1, result.GetProperty("interestedCount").GetInt32());
    }

    [Fact]
    public async Task EventBySlug_InterestedCount_DoesNotExposeAttendeeIdentities()
    {
        // Privacy assertion: the eventBySlug response must not contain any user PII.
        // interestedCount is a safe aggregate; attendee emails/ids/names must not leak.
        await using var factory = new EventsApiWebApplicationFactory();
        const string slug = "privacy-event";

        await SeedAsync(factory, dbContext =>
        {
            var organizer = CreateUser("priv-org@example.com", "Privacy Organizer");
            var alice = CreateUser("alice-priv@example.com", "Alice Private");
            var bob = CreateUser("bob-priv@example.com", "Bob Private");

            var domain = CreateDomain("Tech", "tech-priv");
            dbContext.Users.AddRange(organizer, alice, bob);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent("Privacy Event", slug, "Testing privacy of attendee data.",
                "Secure Venue", "Prague", FirstDayOfNextMonthUtc(), domain, organizer);
            dbContext.Events.Add(ev);

            dbContext.FavoriteEvents.AddRange(
                new FavoriteEvent { UserId = alice.Id, EventId = ev.Id, CreatedAtUtc = DateTime.UtcNow },
                new FavoriteEvent { UserId = bob.Id, EventId = ev.Id, CreatedAtUtc = DateTime.UtcNow });
        });

        using var document = await ExecuteGraphQlAsync(
            factory.CreateClient(),
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                name
                interestedCount
                submittedBy { displayName }
              }
            }
            """,
            new { slug });

        var rawJson = document.RootElement.GetRawText();

        // Aggregate count is correct
        var result = document.RootElement.GetProperty("data").GetProperty("eventBySlug");
        Assert.Equal(2, result.GetProperty("interestedCount").GetInt32());

        // Attendee PII must not appear anywhere in the response
        Assert.DoesNotContain("alice-priv@example.com", rawJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("bob-priv@example.com", rawJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Alice Private", rawJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Bob Private", rawJson, StringComparison.OrdinalIgnoreCase);

        // Only the organizer's displayName is present (as submittedBy)
        Assert.Contains("Privacy Organizer", rawJson, StringComparison.OrdinalIgnoreCase);
    }

    private static DateTime FirstDayOfNextMonthUtc()
    {
        var now = DateTime.UtcNow;
        return new DateTime(now.Year, now.Month, 1, 10, 0, 0, DateTimeKind.Utc).AddMonths(1);
    }
}
