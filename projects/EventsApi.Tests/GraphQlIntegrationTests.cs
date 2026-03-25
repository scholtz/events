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
    public async Task EventsQuery_KeywordOnly_MatchesDomainNameAndOrganizerDisplayName()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var aliceOrganizer = CreateUser("alice@example.com", "Alice Wonderland");
            var bobOrganizer = CreateUser("bob@example.com", "Bob Builder");
            var cryptoDomain = CreateDomain("Crypto & Blockchain", "crypto-blockchain");
            var techDomain = CreateDomain("Tech", "tech");
            var nextMonth = FirstDayOfNextMonthUtc();

            dbContext.Users.AddRange(aliceOrganizer, bobOrganizer);
            dbContext.Domains.AddRange(cryptoDomain, techDomain);

            // Event submitted by Alice in the Crypto domain (generic title)
            var e1 = CreateEvent(
                "Monthly Meetup",
                "monthly-meetup",
                "A regular community gathering.",
                "Innovation Hub",
                "Berlin",
                nextMonth,
                cryptoDomain,
                aliceOrganizer);

            // Event submitted by Bob in the Tech domain
            var e2 = CreateEvent(
                "Annual Conference",
                "annual-conference",
                "Year-end summary session.",
                "Convention Center",
                "Prague",
                nextMonth.AddDays(1),
                techDomain,
                bobOrganizer);

            // Event submitted by Alice in the Tech domain (no keyword overlap)
            var e3 = CreateEvent(
                "Dev Workshop",
                "dev-workshop",
                "Hands-on coding practice.",
                "Cowork Space",
                "Vienna",
                nextMonth.AddDays(2),
                techDomain,
                aliceOrganizer);

            dbContext.Events.AddRange(e1, e2, e3);
        });

        using var client = factory.CreateClient();

        // Searching for "crypto" should match by domain name ("Crypto & Blockchain")
        var cryptoResults = await QueryEventNamesAsync(client, new { searchText = "crypto" });
        Assert.Equal(["Monthly Meetup"], cryptoResults);

        // Searching for "blockchain" should also match the domain name
        var blockchainResults = await QueryEventNamesAsync(client, new { searchText = "blockchain" });
        Assert.Equal(["Monthly Meetup"], blockchainResults);

        // Searching for "Alice" matches events by organizer display name
        var aliceResults = await QueryEventNamesAsync(client, new { searchText = "Alice" });
        Assert.Equal(["Dev Workshop", "Monthly Meetup"], aliceResults.Order().ToList());

        // Searching for "Bob" matches only Bob's event
        var bobResults = await QueryEventNamesAsync(client, new { searchText = "Bob" });
        Assert.Equal(["Annual Conference"], bobResults);

        // A keyword that matches neither domain nor organizer returns no results
        var noResults = await QueryEventNamesAsync(client, new { searchText = "zzznomatch" });
        Assert.Empty(noResults);
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
                language
                timezone
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
                        sortBy = "UPCOMING",
                        language = "en",
                        timezone = "Europe/Prague"
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
                language
                timezone
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
        Assert.Equal("en", savedSearch.GetProperty("language").GetString());
        Assert.Equal("Europe/Prague", savedSearch.GetProperty("timezone").GetString());

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

    [Fact]
    public async Task SavedSearch_PersistsAndRestoresAttendanceMode()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("mode-search@example.com", "Mode Search User");
            userId = user.Id;
            dbContext.Users.Add(user);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        // Save a search with attendanceMode = ONLINE
        using var createDocument = await ExecuteGraphQlAsync(
            client,
            """
            mutation SaveSearch($input: SavedSearchInput!) {
              saveSearch(input: $input) {
                id
                name
                attendanceMode
              }
            }
            """,
            new
            {
                input = new
                {
                    name = "Online Events Only",
                    filter = new
                    {
                        attendanceMode = "ONLINE"
                    }
                }
            });

        var savedSearch = createDocument.RootElement
            .GetProperty("data")
            .GetProperty("saveSearch");

        Assert.Equal("Online Events Only", savedSearch.GetProperty("name").GetString());
        Assert.Equal("ONLINE", savedSearch.GetProperty("attendanceMode").GetString());

        var savedSearchId = savedSearch.GetProperty("id").GetString();
        Assert.False(string.IsNullOrWhiteSpace(savedSearchId));

        // Verify it round-trips via the list query
        using var listDocument = await ExecuteGraphQlAsync(
            client,
            """
            query SavedSearches {
              mySavedSearches {
                id
                name
                attendanceMode
              }
            }
            """);

        var savedSearches = listDocument.RootElement
            .GetProperty("data")
            .GetProperty("mySavedSearches")
            .EnumerateArray()
            .ToArray();

        var restored = Assert.Single(savedSearches);
        Assert.Equal("Online Events Only", restored.GetProperty("name").GetString());
        Assert.Equal("ONLINE", restored.GetProperty("attendanceMode").GetString());
    }

    [Fact]
    public async Task SavedSearch_PersistsAndRestoresTimezone()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("timezone-search@example.com", "Timezone Search User");
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
                timezone
              }
            }
            """,
            new
            {
                input = new
                {
                    name = "Prague Timezone Events",
                    filter = new
                    {
                        timezone = "Europe/Prague"
                    }
                }
            });

        var savedSearch = createDocument.RootElement
            .GetProperty("data")
            .GetProperty("saveSearch");

        Assert.Equal("Prague Timezone Events", savedSearch.GetProperty("name").GetString());
        Assert.Equal("Europe/Prague", savedSearch.GetProperty("timezone").GetString());

        using var listDocument = await ExecuteGraphQlAsync(
            client,
            """
            query SavedSearches {
              mySavedSearches {
                id
                name
                timezone
              }
            }
            """);

        var restored = Assert.Single(
            listDocument.RootElement
                .GetProperty("data")
                .GetProperty("mySavedSearches")
                .EnumerateArray()
                .ToArray());

        Assert.Equal("Prague Timezone Events", restored.GetProperty("name").GetString());
        Assert.Equal("Europe/Prague", restored.GetProperty("timezone").GetString());
    }

    // -----------------------------------------------------------------------
    // Calendar Analytics Tests
    // -----------------------------------------------------------------------

    [Fact]
    public async Task TrackCalendarAction_StoresRecordAndReturnsTrue()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cal-track@example.com", "Cal Track User");
            var domain = CreateDomain("Tech", "cal-track-tech");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            var ev = CreateEvent("Calendar Event", "calendar-event", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation TrackCalendarAction($input: TrackCalendarActionInput!) {
              trackCalendarAction(input: $input)
            }
            """,
            new { input = new { eventId, provider = "GOOGLE" } });

        Assert.True(document.RootElement.GetProperty("data").GetProperty("trackCalendarAction").GetBoolean());

        // Verify record is persisted
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var action = Assert.Single(db.CalendarAnalyticsActions.Where(a => a.EventId == eventId));
        Assert.Equal("GOOGLE", action.Provider);
    }

    [Theory]
    [InlineData("ICS")]
    [InlineData("GOOGLE")]
    [InlineData("OUTLOOK")]
    public async Task TrackCalendarAction_AcceptsAllValidProviders(string provider)
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser($"provider-{provider.ToLower()}@example.com", "Provider User");
            var domain = CreateDomain("Tech", $"provider-tech-{provider.ToLower()}");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            var ev = CreateEvent($"Event {provider}", $"event-{provider.ToLower()}", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation TrackCalendarAction($input: TrackCalendarActionInput!) {
              trackCalendarAction(input: $input)
            }
            """,
            new { input = new { eventId, provider } });

        Assert.True(document.RootElement.GetProperty("data").GetProperty("trackCalendarAction").GetBoolean());
    }

    [Fact]
    public async Task TrackCalendarAction_InvalidProvider_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("invalid-provider@example.com", "Invalid Provider User");
            var domain = CreateDomain("Tech", "invalid-provider-tech");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            var ev = CreateEvent("Event", "event-invalid-prov", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation TrackCalendarAction($input: TrackCalendarActionInput!) {
                  trackCalendarAction(input: $input)
                }
                """,
            variables = new { input = new { eventId, provider = "UNKNOWN_PROVIDER" } }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("INVALID_CALENDAR_PROVIDER", errors.ToString());
    }

    [Fact]
    public async Task TrackCalendarAction_NonExistentEvent_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("no-event@example.com", "No Event User");
            var domain = CreateDomain("Tech", "no-event-tech");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        var nonExistentId = Guid.NewGuid();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation TrackCalendarAction($input: TrackCalendarActionInput!) {
                  trackCalendarAction(input: $input)
                }
                """,
            variables = new { input = new { eventId = nonExistentId, provider = "ICS" } }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("EVENT_NOT_FOUND", errors.ToString());
    }

    [Fact]
    public async Task TrackCalendarAction_NonPublishedEvent_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var pendingEventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("non-published@example.com", "Non Published User");
            var domain = CreateDomain("Tech", "non-published-tech");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            var ev = CreateEvent("Pending Event", "pending-event-cal", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user,
                status: EventStatus.PendingApproval);
            pendingEventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation TrackCalendarAction($input: TrackCalendarActionInput!) {
                  trackCalendarAction(input: $input)
                }
                """,
            variables = new { input = new { eventId = pendingEventId, provider = "ICS" } }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("EVENT_NOT_PUBLISHED", errors.ToString());
    }

    [Fact]
    public async Task TrackCalendarAction_IsUnauthenticated_Succeeds()
    {
        // trackCalendarAction must work without a JWT token (anonymous tracking)
        await using var factory = new EventsApiWebApplicationFactory();
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("anon-track@example.com", "Anon Track User");
            var domain = CreateDomain("Tech", "anon-track-tech");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            var ev = CreateEvent("Anon Event", "anon-event-cal", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        // No Authorization header set
        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation TrackCalendarAction($input: TrackCalendarActionInput!) {
              trackCalendarAction(input: $input)
            }
            """,
            new { input = new { eventId, provider = "ICS" } });

        Assert.True(document.RootElement.GetProperty("data").GetProperty("trackCalendarAction").GetBoolean());
    }

    [Fact]
    public async Task MyDashboard_IncludesCalendarAnalytics_CorrectCounts()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cal-dashboard@example.com", "Cal Dashboard User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "cal-dashboard-tech");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent("Dashboard Event", "dashboard-event-cal", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);

            // Add calendar actions: 2 GOOGLE, 1 ICS — all within last 7 days
            dbContext.CalendarAnalyticsActions.AddRange(
                new CalendarAnalyticsAction { EventId = ev.Id, Provider = "GOOGLE", TriggeredAtUtc = DateTime.UtcNow.AddDays(-1) },
                new CalendarAnalyticsAction { EventId = ev.Id, Provider = "GOOGLE", TriggeredAtUtc = DateTime.UtcNow.AddDays(-2) },
                new CalendarAnalyticsAction { EventId = ev.Id, Provider = "ICS", TriggeredAtUtc = DateTime.UtcNow.AddDays(-3) });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query MyDashboard {
              myDashboard {
                totalCalendarActions
                eventAnalytics {
                  eventId eventName totalCalendarActions calendarActionsLast7Days calendarActionsLast30Days
                  calendarActionsByProvider { provider count }
                }
              }
            }
            """);

        var dashboard = document.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(3, dashboard.GetProperty("totalCalendarActions").GetInt32());

        var analytics = Assert.Single(dashboard.GetProperty("eventAnalytics").EnumerateArray());
        Assert.Equal(3, analytics.GetProperty("totalCalendarActions").GetInt32());
        Assert.Equal(3, analytics.GetProperty("calendarActionsLast7Days").GetInt32());
        Assert.Equal(3, analytics.GetProperty("calendarActionsLast30Days").GetInt32());

        var byProvider = analytics.GetProperty("calendarActionsByProvider").EnumerateArray().ToList();
        Assert.Equal(2, byProvider.Count);
        var google = byProvider.Single(p => p.GetProperty("provider").GetString() == "GOOGLE");
        Assert.Equal(2, google.GetProperty("count").GetInt32());
        var ics = byProvider.Single(p => p.GetProperty("provider").GetString() == "ICS");
        Assert.Equal(1, ics.GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task MyDashboard_CalendarAnalytics_ZeroStateReturnsZeroNotNull()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cal-zero@example.com", "Cal Zero User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "cal-zero-tech");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(CreateEvent("Zero Event", "zero-event-cal", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user));
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query MyDashboard {
              myDashboard {
                totalCalendarActions
                eventAnalytics {
                  totalCalendarActions calendarActionsLast7Days calendarActionsLast30Days
                  calendarActionsByProvider { provider count }
                }
              }
            }
            """);

        var dashboard = document.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(0, dashboard.GetProperty("totalCalendarActions").GetInt32());

        var analytics = Assert.Single(dashboard.GetProperty("eventAnalytics").EnumerateArray());
        Assert.Equal(0, analytics.GetProperty("totalCalendarActions").GetInt32());
        Assert.Equal(0, analytics.GetProperty("calendarActionsLast7Days").GetInt32());
        Assert.Equal(0, analytics.GetProperty("calendarActionsLast30Days").GetInt32());
        Assert.Empty(analytics.GetProperty("calendarActionsByProvider").EnumerateArray());
    }

    [Fact]
    public async Task MyDashboard_TotalCalendarActions_OnlyCountsPublishedEvents()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cal-published@example.com", "Cal Published User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "cal-published-tech");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            var publishedEv = CreateEvent("Published Event", "cal-pub-event", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user, status: EventStatus.Published);
            var pendingEv = CreateEvent("Pending Event", "cal-pend-event", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user, status: EventStatus.PendingApproval);
            dbContext.Events.AddRange(publishedEv, pendingEv);

            dbContext.CalendarAnalyticsActions.AddRange(
                new CalendarAnalyticsAction { EventId = publishedEv.Id, Provider = "GOOGLE", TriggeredAtUtc = DateTime.UtcNow },
                new CalendarAnalyticsAction { EventId = pendingEv.Id, Provider = "ICS", TriggeredAtUtc = DateTime.UtcNow });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query MyDashboard {
              myDashboard {
                totalCalendarActions
              }
            }
            """);

        var dashboard = document.RootElement.GetProperty("data").GetProperty("myDashboard");
        // Only the published event's action should count toward the headline KPI
        Assert.Equal(1, dashboard.GetProperty("totalCalendarActions").GetInt32());
    }

    [Fact]
    public async Task MyDashboard_CalendarAnalytics_TrendWindowCutoffs_AreCorrect()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cal-trends@example.com", "Cal Trends User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "cal-trends-tech");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent("Trend Event", "trend-event-cal", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user);
            dbContext.Events.Add(ev);

            dbContext.CalendarAnalyticsActions.AddRange(
                // Within last 7 days
                new CalendarAnalyticsAction { EventId = ev.Id, Provider = "GOOGLE", TriggeredAtUtc = DateTime.UtcNow.AddDays(-1) },
                // Within last 30 days but not 7 days
                new CalendarAnalyticsAction { EventId = ev.Id, Provider = "ICS", TriggeredAtUtc = DateTime.UtcNow.AddDays(-15) },
                // Older than 30 days
                new CalendarAnalyticsAction { EventId = ev.Id, Provider = "OUTLOOK", TriggeredAtUtc = DateTime.UtcNow.AddDays(-45) });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query MyDashboard {
              myDashboard {
                eventAnalytics {
                  totalCalendarActions calendarActionsLast7Days calendarActionsLast30Days
                }
              }
            }
            """);

        var analytics = Assert.Single(document.RootElement
            .GetProperty("data").GetProperty("myDashboard").GetProperty("eventAnalytics").EnumerateArray());

        Assert.Equal(3, analytics.GetProperty("totalCalendarActions").GetInt32());
        Assert.Equal(1, analytics.GetProperty("calendarActionsLast7Days").GetInt32());
        Assert.Equal(2, analytics.GetProperty("calendarActionsLast30Days").GetInt32());
    }

    [Fact]
    public async Task MyDashboard_CalendarAnalytics_OrganizerIsolation()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var organizer1Id = Guid.Empty;
        var organizer2Id = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var org1 = CreateUser("cal-org1@example.com", "Cal Org1");
            var org2 = CreateUser("cal-org2@example.com", "Cal Org2");
            organizer1Id = org1.Id;
            organizer2Id = org2.Id;

            var domain = CreateDomain("Tech", "cal-iso-tech");
            dbContext.Users.AddRange(org1, org2);
            dbContext.Domains.Add(domain);

            var ev1 = CreateEvent("Org1 Cal Event", "org1-cal-event", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, org1);
            var ev2 = CreateEvent("Org2 Cal Event", "org2-cal-event", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, org2);
            dbContext.Events.AddRange(ev1, ev2);

            // 2 actions on org1's event, 1 on org2's
            dbContext.CalendarAnalyticsActions.AddRange(
                new CalendarAnalyticsAction { EventId = ev1.Id, Provider = "GOOGLE", TriggeredAtUtc = DateTime.UtcNow },
                new CalendarAnalyticsAction { EventId = ev1.Id, Provider = "ICS", TriggeredAtUtc = DateTime.UtcNow },
                new CalendarAnalyticsAction { EventId = ev2.Id, Provider = "OUTLOOK", TriggeredAtUtc = DateTime.UtcNow });
        });

        using var client1 = factory.CreateClient();
        client1.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizer1Id));

        using var doc1 = await ExecuteGraphQlAsync(
            client1,
            """
            query MyDashboard {
              myDashboard {
                totalCalendarActions
                eventAnalytics { eventName totalCalendarActions }
              }
            }
            """);

        var dashboard1 = doc1.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(2, dashboard1.GetProperty("totalCalendarActions").GetInt32());
        var analytics1 = Assert.Single(dashboard1.GetProperty("eventAnalytics").EnumerateArray());
        Assert.Equal("Org1 Cal Event", analytics1.GetProperty("eventName").GetString());
        Assert.Equal(2, analytics1.GetProperty("totalCalendarActions").GetInt32());

        using var client2 = factory.CreateClient();
        client2.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizer2Id));

        using var doc2 = await ExecuteGraphQlAsync(
            client2,
            """
            query MyDashboard {
              myDashboard {
                totalCalendarActions
                eventAnalytics { eventName totalCalendarActions }
              }
            }
            """);

        var dashboard2 = doc2.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(1, dashboard2.GetProperty("totalCalendarActions").GetInt32());
        var analytics2 = Assert.Single(dashboard2.GetProperty("eventAnalytics").EnumerateArray());
        Assert.Equal("Org2 Cal Event", analytics2.GetProperty("eventName").GetString());
        Assert.Equal(1, analytics2.GetProperty("totalCalendarActions").GetInt32());
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
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            throw new Xunit.Sdk.XunitException(
                $"HTTP {(int)response.StatusCode} ({response.ReasonPhrase}): {body}");
        }

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

    private static ApplicationUser CreateUser(string email, string displayName, ApplicationUserRole role)
        => new()
        {
            Email = email,
            DisplayName = displayName,
            PasswordHash = "hashed",
            Role = role
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
        EventStatus status = EventStatus.Published,
        AttendanceMode attendanceMode = AttendanceMode.InPerson,
        string? timezone = null,
        string? language = null)
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
            Longitude = 14.4378m,
            AttendanceMode = attendanceMode,
            Timezone = timezone,
            Language = language
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

    [Fact]
    public async Task EventsQuery_AttendanceModeFilter_IsolatesEventsByMode()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("attendance@example.com", "Attendance User");
            var tech = CreateDomain("Tech", "tech-attendance");
            var nextMonth = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.Add(tech);
            dbContext.Events.AddRange(
                CreateEvent("In-Person Workshop", "in-person-workshop", "Hands-on in person.", "Venue A", "Prague", nextMonth, tech, user, attendanceMode: AttendanceMode.InPerson),
                CreateEvent("Online Webinar", "online-webinar", "Remote stream.", "Virtual", "Online", nextMonth.AddDays(1), tech, user, attendanceMode: AttendanceMode.Online),
                CreateEvent("Hybrid Conference", "hybrid-conference", "Both modes.", "Big Hall", "Prague", nextMonth.AddDays(2), tech, user, attendanceMode: AttendanceMode.Hybrid));
        });

        using var client = factory.CreateClient();

        var inPersonEvents = await QueryEventNamesAsync(client, new { attendanceMode = "IN_PERSON" });
        Assert.Equal(["In-Person Workshop"], inPersonEvents);

        var onlineEvents = await QueryEventNamesAsync(client, new { attendanceMode = "ONLINE" });
        Assert.Equal(["Online Webinar"], onlineEvents);

        var hybridEvents = await QueryEventNamesAsync(client, new { attendanceMode = "HYBRID" });
        Assert.Equal(["Hybrid Conference"], hybridEvents);
    }

    [Fact]
    public async Task EventsQuery_AttendanceModeFilter_ReturnsAllWhenNotSpecified()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("att-all@example.com", "Attendance All");
            var tech = CreateDomain("Tech", "tech-att-all");
            var nextMonth = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.Add(tech);
            dbContext.Events.AddRange(
                CreateEvent("Event A", "event-a-att", "Desc.", "Venue", "Prague", nextMonth, tech, user, attendanceMode: AttendanceMode.InPerson),
                CreateEvent("Event B", "event-b-att", "Desc.", "Virtual", "Online", nextMonth.AddDays(1), tech, user, attendanceMode: AttendanceMode.Online),
                CreateEvent("Event C", "event-c-att", "Desc.", "Hall", "Prague", nextMonth.AddDays(2), tech, user, attendanceMode: AttendanceMode.Hybrid));
        });

        using var client = factory.CreateClient();

        // No attendance mode filter — all 3 events are returned
        var allEvents = await QueryEventNamesAsync(client, new { sortBy = "UPCOMING" });
        Assert.Equal(3, allEvents.Length);
    }

    [Fact]
    public async Task EventsQuery_AttendanceModeAndPriceFilter_CombineCorrectly()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("att-price@example.com", "Att Price User");
            var tech = CreateDomain("Tech", "tech-att-price");
            var nextMonth = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.Add(tech);
            dbContext.Events.AddRange(
                CreateEvent("Free In-Person", "free-in-person", "Free workshop.", "Venue A", "Prague", nextMonth, tech, user, isFree: true, priceAmount: 0m, attendanceMode: AttendanceMode.InPerson),
                CreateEvent("Paid In-Person", "paid-in-person", "Premium workshop.", "Venue B", "Prague", nextMonth.AddDays(1), tech, user, isFree: false, priceAmount: 99m, attendanceMode: AttendanceMode.InPerson),
                CreateEvent("Free Online", "free-online", "Free webinar.", "Virtual", "Online", nextMonth.AddDays(2), tech, user, isFree: true, priceAmount: 0m, attendanceMode: AttendanceMode.Online));
        });

        using var client = factory.CreateClient();

        // Free + InPerson combination
        var freeInPerson = await QueryEventNamesAsync(client, new { isFree = true, attendanceMode = "IN_PERSON" });
        Assert.Equal(["Free In-Person"], freeInPerson);

        // Paid + InPerson combination
        var paidInPerson = await QueryEventNamesAsync(client, new { isFree = false, attendanceMode = "IN_PERSON" });
        Assert.Equal(["Paid In-Person"], paidInPerson);

        // Online only (free)
        var freeOnline = await QueryEventNamesAsync(client, new { isFree = true, attendanceMode = "ONLINE" });
        Assert.Equal(["Free Online"], freeOnline);
    }

    [Fact]
    public async Task EventSubmission_AttendanceModeIsStoredAndReturnedCorrectly()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("submit-att@example.com", "Submit Att");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tech-submit-att");
            dbContext.Users.AddRange(user);
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var nextMonth = FirstDayOfNextMonthUtc();

        using var submitDocument = await ExecuteGraphQlAsync(
            client,
            """
            mutation SubmitEvent($input: EventSubmissionInput!) {
              submitEvent(input: $input) {
                name
                attendanceMode
              }
            }
            """,
            new
            {
                input = new
                {
                    domainSlug = "tech-submit-att",
                    name = "Hybrid Hackathon",
                    description = "A hybrid hackathon event.",
                    eventUrl = "https://events.example.com/hybrid-hackathon",
                    venueName = "Hub",
                    addressLine1 = "Somewhere 1",
                    city = "Prague",
                    countryCode = "CZ",
                    isFree = true,
                    currencyCode = "EUR",
                    latitude = 50.075m,
                    longitude = 14.437m,
                    startsAtUtc = nextMonth,
                    endsAtUtc = nextMonth.AddHours(6),
                    attendanceMode = "HYBRID"
                }
            });

        var submittedEvent = submitDocument.RootElement.GetProperty("data").GetProperty("submitEvent");
        Assert.Equal("Hybrid Hackathon", submittedEvent.GetProperty("name").GetString());
        Assert.Equal("HYBRID", submittedEvent.GetProperty("attendanceMode").GetString());
    }

    [Fact]
    public async Task EventBySlug_ReturnsAttendanceMode_ForPublishedEvent()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        const string slug = "online-event-slug";

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("slug-att@example.com", "Slug Att User");
            var domain = CreateDomain("Tech", "tech-slug-att");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(CreateEvent(
                "Online Event", slug, "A fully online event.", "Virtual", "Online",
                FirstDayOfNextMonthUtc(), domain, user,
                attendanceMode: AttendanceMode.Online));
        });

        using var document = await ExecuteGraphQlAsync(
            factory.CreateClient(),
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                name
                attendanceMode
              }
            }
            """,
            new { slug });

        var result = document.RootElement.GetProperty("data").GetProperty("eventBySlug");
        Assert.Equal("Online Event", result.GetProperty("name").GetString());
        Assert.Equal("ONLINE", result.GetProperty("attendanceMode").GetString());
    }

    [Fact]
    public async Task UpdateMyEvent_AttendanceModeIsUpdatedCorrectly()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("update-att@example.com", "Update Att User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tech-update-att");
            dbContext.Users.AddRange(user);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent(
                "Original In-Person Event", "original-in-person", "Original description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user,
                attendanceMode: AttendanceMode.InPerson);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var nextMonth = FirstDayOfNextMonthUtc();

        using var updateDocument = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateMyEvent($eventId: UUID!, $input: EventSubmissionInput!) {
              updateMyEvent(eventId: $eventId, input: $input) {
                name
                attendanceMode
              }
            }
            """,
            new
            {
                eventId,
                input = new
                {
                    domainSlug = "tech-update-att",
                    name = "Updated Hybrid Event",
                    description = "Now a hybrid event.",
                    eventUrl = "https://events.example.com/updated",
                    venueName = "Hub",
                    addressLine1 = "Somewhere 1",
                    city = "Prague",
                    countryCode = "CZ",
                    isFree = true,
                    currencyCode = "EUR",
                    latitude = 50.075m,
                    longitude = 14.437m,
                    startsAtUtc = nextMonth,
                    endsAtUtc = nextMonth.AddHours(6),
                    attendanceMode = "HYBRID"
                }
            });

        var updatedEvent = updateDocument.RootElement.GetProperty("data").GetProperty("updateMyEvent");
        Assert.Equal("Updated Hybrid Event", updatedEvent.GetProperty("name").GetString());
        Assert.Equal("HYBRID", updatedEvent.GetProperty("attendanceMode").GetString());
    }

    // ── Timezone field tests ─────────────────────────────────────────────────

    [Fact]
    public async Task EventBySlug_ReturnsTimezone_WhenSet()
    {
        const string slug = "tz-prague-event";
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("tz-test@example.com", "TZ Test User");
            var domain = CreateDomain("Tech", "tz-tech");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(CreateEvent(
                "Prague Timezone Event", slug, "An event in Prague.", "Venue", "Prague",
                FirstDayOfNextMonthUtc(), domain, user,
                timezone: "Europe/Prague"));
        });

        using var document = await ExecuteGraphQlAsync(
            factory.CreateClient(),
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                name
                timezone
              }
            }
            """,
            new { slug });

        var result = document.RootElement.GetProperty("data").GetProperty("eventBySlug");
        Assert.Equal("Prague Timezone Event", result.GetProperty("name").GetString());
        Assert.Equal("Europe/Prague", result.GetProperty("timezone").GetString());
    }

    [Fact]
    public async Task EventBySlug_ReturnsNullTimezone_WhenNotSet()
    {
        const string slug = "no-tz-event";
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("no-tz@example.com", "No TZ User");
            var domain = CreateDomain("Tech", "no-tz-tech");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(CreateEvent(
                "No Timezone Event", slug, "Legacy event without timezone.", "Venue", "Prague",
                FirstDayOfNextMonthUtc(), domain, user));
        });

        using var document = await ExecuteGraphQlAsync(
            factory.CreateClient(),
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                name
                timezone
              }
            }
            """,
            new { slug });

        var result = document.RootElement.GetProperty("data").GetProperty("eventBySlug");
        Assert.Equal("No Timezone Event", result.GetProperty("name").GetString());
        Assert.Equal(JsonValueKind.Null, result.GetProperty("timezone").ValueKind);
    }

    [Fact]
    public async Task SubmitEvent_PreservesTimezone()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("tz-submit@example.com", "TZ Submit User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tz-submit-tech");
            dbContext.Users.AddRange(user);
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var nextMonth = FirstDayOfNextMonthUtc();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation SubmitEvent($input: EventSubmissionInput!) {
              submitEvent(input: $input) {
                name
                timezone
              }
            }
            """,
            new
            {
                input = new
                {
                    domainSlug = "tz-submit-tech",
                    name = "New York Conference",
                    description = "An event in New York.",
                    eventUrl = "https://events.example.com/ny-conf",
                    venueName = "Convention Center",
                    addressLine1 = "1 Convention Pl",
                    city = "New York",
                    countryCode = "US",
                    isFree = true,
                    currencyCode = "USD",
                    latitude = 40.712m,
                    longitude = -74.006m,
                    startsAtUtc = nextMonth,
                    endsAtUtc = nextMonth.AddHours(4),
                    attendanceMode = "IN_PERSON",
                    timezone = "America/New_York"
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("submitEvent");
        Assert.Equal("New York Conference", result.GetProperty("name").GetString());
        Assert.Equal("America/New_York", result.GetProperty("timezone").GetString());
    }

    [Fact]
    public async Task SubmitEvent_AllowsNullTimezone_ForLegacyCompatibility()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("tz-null@example.com", "TZ Null User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tz-null-tech");
            dbContext.Users.AddRange(user);
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var nextMonth = FirstDayOfNextMonthUtc();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation SubmitEvent($input: EventSubmissionInput!) {
              submitEvent(input: $input) {
                name
                timezone
              }
            }
            """,
            new
            {
                input = new
                {
                    domainSlug = "tz-null-tech",
                    name = "Legacy Event No TZ",
                    description = "A legacy event without timezone.",
                    eventUrl = "https://events.example.com/legacy",
                    venueName = "Venue",
                    addressLine1 = "Street 1",
                    city = "Prague",
                    countryCode = "CZ",
                    isFree = true,
                    currencyCode = "EUR",
                    latitude = 50.075m,
                    longitude = 14.437m,
                    startsAtUtc = nextMonth,
                    endsAtUtc = nextMonth.AddHours(4),
                    attendanceMode = "IN_PERSON"
                    // no timezone field — tests backwards compatibility
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("submitEvent");
        Assert.Equal("Legacy Event No TZ", result.GetProperty("name").GetString());
        Assert.Equal(JsonValueKind.Null, result.GetProperty("timezone").ValueKind);
    }

    [Fact]
    public async Task UpdateMyEvent_PreservesTimezone()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("tz-update@example.com", "TZ Update User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tz-update-tech");
            dbContext.Users.AddRange(user);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent(
                "Original Event", "original-tz", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var nextMonth = FirstDayOfNextMonthUtc();

        using var updateDocument = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateMyEvent($eventId: UUID!, $input: EventSubmissionInput!) {
              updateMyEvent(eventId: $eventId, input: $input) {
                name
                timezone
              }
            }
            """,
            new
            {
                eventId,
                input = new
                {
                    domainSlug = "tz-update-tech",
                    name = "Updated London Event",
                    description = "Now happening in London.",
                    eventUrl = "https://events.example.com/london",
                    venueName = "ExCeL London",
                    addressLine1 = "1 Western Gateway",
                    city = "London",
                    countryCode = "GB",
                    isFree = true,
                    currencyCode = "GBP",
                    latitude = 51.508m,
                    longitude = -0.025m,
                    startsAtUtc = nextMonth,
                    endsAtUtc = nextMonth.AddHours(6),
                    attendanceMode = "IN_PERSON",
                    timezone = "Europe/London"
                }
            });

        var updatedEvent = updateDocument.RootElement.GetProperty("data").GetProperty("updateMyEvent");
        Assert.Equal("Updated London Event", updatedEvent.GetProperty("name").GetString());
        Assert.Equal("Europe/London", updatedEvent.GetProperty("timezone").GetString());
    }

    [Fact]
    public async Task SubmitEvent_RejectsInvalidTimezone()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("tz-invalid@example.com", "TZ Invalid User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tz-invalid-tech");
            dbContext.Users.AddRange(user);
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var nextMonth = FirstDayOfNextMonthUtc();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation SubmitEvent($input: EventSubmissionInput!) {
                  submitEvent(input: $input) {
                    name
                    timezone
                  }
                }
                """,
            variables = new
            {
                input = new
                {
                    domainSlug = "tz-invalid-tech",
                    name = "Invalid TZ Event",
                    description = "An event with a bad timezone.",
                    eventUrl = "https://events.example.com/invalid-tz",
                    venueName = "Some Venue",
                    addressLine1 = "1 Main St",
                    city = "Prague",
                    countryCode = "CZ",
                    isFree = true,
                    currencyCode = "EUR",
                    latitude = 50.075m,
                    longitude = 14.437m,
                    startsAtUtc = nextMonth,
                    endsAtUtc = nextMonth.AddHours(2),
                    attendanceMode = "IN_PERSON",
                    timezone = "NotARealTimezone"
                }
            }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("INVALID_TIMEZONE", errors.ToString());
    }

    [Fact]
    public async Task UpdateMyEvent_RejectsInvalidTimezone()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("tz-update-invalid@example.com", "TZ Update Invalid User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tz-update-invalid-tech");
            dbContext.Users.AddRange(user);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent(
                "Original Event", "original-tz-invalid", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var nextMonth = FirstDayOfNextMonthUtc();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation UpdateMyEvent($eventId: UUID!, $input: EventSubmissionInput!) {
                  updateMyEvent(eventId: $eventId, input: $input) {
                    name
                    timezone
                  }
                }
                """,
            variables = new
            {
                eventId,
                input = new
                {
                    domainSlug = "tz-update-invalid-tech",
                    name = "Bad TZ Update",
                    description = "Should fail validation.",
                    eventUrl = "https://events.example.com/bad-tz",
                    venueName = "Venue",
                    addressLine1 = "1 Main St",
                    city = "Prague",
                    countryCode = "CZ",
                    isFree = true,
                    currencyCode = "EUR",
                    latitude = 50.075m,
                    longitude = 14.437m,
                    startsAtUtc = nextMonth,
                    endsAtUtc = nextMonth.AddHours(2),
                    attendanceMode = "IN_PERSON",
                    timezone = "Europe/Prgaue"
                }
            }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("INVALID_TIMEZONE", errors.ToString());
    }

    [Fact]
    public async Task TrackDiscoveryAction_RecordsSearchAndFilterActions()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        using var client = factory.CreateClient();

        // Track a SEARCH action
        using var searchResponse = await ExecuteGraphQlAsync(
            client,
            """
            mutation TrackDiscoveryAction($input: TrackDiscoveryActionInput!) {
              trackDiscoveryAction(input: $input)
            }
            """,
            new
            {
                input = new
                {
                    actionType = "SEARCH",
                    activeFilterCount = 1,
                    resultCount = 5
                }
            });

        Assert.True(searchResponse.RootElement.GetProperty("data").GetProperty("trackDiscoveryAction").GetBoolean());

        // Track a FILTER_CHANGE action
        using var filterResponse = await ExecuteGraphQlAsync(
            client,
            """
            mutation TrackDiscoveryAction($input: TrackDiscoveryActionInput!) {
              trackDiscoveryAction(input: $input)
            }
            """,
            new
            {
                input = new
                {
                    actionType = "FILTER_CHANGE",
                    activeFilterCount = 3,
                    resultCount = 2
                }
            });

        Assert.True(filterResponse.RootElement.GetProperty("data").GetProperty("trackDiscoveryAction").GetBoolean());

        // Track a FILTER_CLEAR action
        using var clearResponse = await ExecuteGraphQlAsync(
            client,
            """
            mutation TrackDiscoveryAction($input: TrackDiscoveryActionInput!) {
              trackDiscoveryAction(input: $input)
            }
            """,
            new
            {
                input = new
                {
                    actionType = "FILTER_CLEAR",
                    activeFilterCount = 0,
                    resultCount = 10
                }
            });

        Assert.True(clearResponse.RootElement.GetProperty("data").GetProperty("trackDiscoveryAction").GetBoolean());

        // Track a RESULT_CLICK action
        using var clickResponse = await ExecuteGraphQlAsync(
            client,
            """
            mutation TrackDiscoveryAction($input: TrackDiscoveryActionInput!) {
              trackDiscoveryAction(input: $input)
            }
            """,
            new
            {
                input = new
                {
                    actionType = "RESULT_CLICK",
                    eventSlug = "my-event-slug",
                    activeFilterCount = 2
                }
            });

        Assert.True(clickResponse.RootElement.GetProperty("data").GetProperty("trackDiscoveryAction").GetBoolean());
    }

    [Fact]
    public async Task TrackDiscoveryAction_RejectsInvalidActionType()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation TrackDiscoveryAction($input: TrackDiscoveryActionInput!) {
                  trackDiscoveryAction(input: $input)
                }
                """,
            variables = new
            {
                input = new
                {
                    actionType = "INVALID_TYPE",
                    activeFilterCount = 0
                }
            }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("INVALID_DISCOVERY_ACTION_TYPE", errors.ToString());
    }

    // -----------------------------------------------------------------------
    // UpdateUserRole – self-demotion guard and positive path
    // -----------------------------------------------------------------------

    /// <summary>
    /// Business risk: if an admin can remove their own admin role via a direct
    /// API call the platform could lose its last administrator, leaving no one
    /// able to approve events or manage users.  The server must enforce this
    /// invariant independently of the UI.
    /// </summary>
    [Fact]
    public async Task UpdateUserRole_AdminCannotDemoteThemselves()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var adminId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("admin-self@example.com", "Self-Demote Admin");
            admin.Role = ApplicationUserRole.Admin;
            adminId = admin.Id;
            dbContext.Users.Add(admin);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation UpdateUserRole($input: UpdateUserRoleInput!) {
                  updateUserRole(input: $input) { id role }
                }
                """,
            variables = new { input = new { userId = adminId, role = "CONTRIBUTOR" } }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("SELF_DEMOTION_NOT_ALLOWED", errors.ToString());

        // Verify the role was NOT changed in the database
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = await db.Users.SingleAsync(u => u.Id == adminId);
        Assert.Equal(ApplicationUserRole.Admin, user.Role);
    }

    [Fact]
    public async Task UpdateUserRole_AdminCanPromoteAnotherUser()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var adminId = Guid.Empty;
        var contributorId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("admin-promote@example.com", "Promote Admin");
            admin.Role = ApplicationUserRole.Admin;
            adminId = admin.Id;

            var contributor = CreateUser("contributor@example.com", "Regular User");
            contributor.Role = ApplicationUserRole.Contributor;
            contributorId = contributor.Id;

            dbContext.Users.AddRange(admin, contributor);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateUserRole($input: UpdateUserRoleInput!) {
              updateUserRole(input: $input) { id displayName role }
            }
            """,
            new { input = new { userId = contributorId, role = "ADMIN" } });

        var updatedUser = document.RootElement.GetProperty("data").GetProperty("updateUserRole");
        Assert.Equal("ADMIN", updatedUser.GetProperty("role").GetString());
        Assert.Equal("Regular User", updatedUser.GetProperty("displayName").GetString());

        // Verify the role was persisted in the database
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = await db.Users.SingleAsync(u => u.Id == contributorId);
        Assert.Equal(ApplicationUserRole.Admin, user.Role);
    }

    // ── Domain Administrator management tests ────────────────────────────────

    [Fact]
    public async Task AddDomainAdministrator_GlobalAdmin_AssignsUserToDomain()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty, contributorId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("admin@example.com", "Admin");
            admin.Role = ApplicationUserRole.Admin;
            var contributor = CreateUser("contributor@example.com", "Contributor");
            var domain = CreateDomain("Crypto", "crypto");

            dbContext.Users.AddRange(admin, contributor);
            dbContext.Domains.Add(domain);

            adminId = admin.Id;
            contributorId = contributor.Id;
            domainId = domain.Id;
        });

        using var client = factory.CreateClient();
        var token = await CreateTokenAsync(factory, adminId);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation AddDomainAdmin($input: DomainAdministratorInput!) {
              addDomainAdministrator(input: $input) { id domainId userId }
            }
            """,
            new { input = new { domainId, userId = contributorId } });

        var result = document.RootElement.GetProperty("data").GetProperty("addDomainAdministrator");
        Assert.Equal(domainId.ToString(), result.GetProperty("domainId").GetString());
        Assert.Equal(contributorId.ToString(), result.GetProperty("userId").GetString());
    }

    [Fact]
    public async Task AddDomainAdministrator_DomainAdmin_CanAssignOtherUsers()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, newUserId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("domainadmin@example.com", "Domain Admin");
            var newUser = CreateUser("newuser@example.com", "New User");
            var domain = CreateDomain("Crypto", "crypto");

            dbContext.Users.AddRange(domainAdmin, newUser);
            dbContext.Domains.Add(domain);

            domainAdminId = domainAdmin.Id;
            newUserId = newUser.Id;
            domainId = domain.Id;

            // Assign domainAdmin as domain administrator
            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = domainAdmin.Id
            });
        });

        using var client = factory.CreateClient();
        var token = await CreateTokenAsync(factory, domainAdminId);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation AddDomainAdmin($input: DomainAdministratorInput!) {
              addDomainAdministrator(input: $input) { id userId }
            }
            """,
            new { input = new { domainId, userId = newUserId } });

        var result = document.RootElement.GetProperty("data").GetProperty("addDomainAdministrator");
        Assert.Equal(newUserId.ToString(), result.GetProperty("userId").GetString());
    }

    [Fact]
    public async Task AddDomainAdministrator_RegularUser_Forbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid regularUserId = Guid.Empty, targetUserId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var regular = CreateUser("regular@example.com", "Regular");
            var target = CreateUser("target@example.com", "Target");
            var domain = CreateDomain("Crypto", "crypto");

            dbContext.Users.AddRange(regular, target);
            dbContext.Domains.Add(domain);

            regularUserId = regular.Id;
            targetUserId = target.Id;
            domainId = domain.Id;
        });

        using var client = factory.CreateClient();
        var token = await CreateTokenAsync(factory, regularUserId);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation AddDomainAdmin($input: DomainAdministratorInput!) {
              addDomainAdministrator(input: $input) { id }
            }
            """,
            variables = new { input = new { domainId, userId = targetUserId } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("FORBIDDEN", body);
    }

    [Fact]
    public async Task RemoveDomainAdministrator_GlobalAdmin_RemovesAssignment()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty, contributorId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("admin@example.com", "Admin");
            admin.Role = ApplicationUserRole.Admin;
            var contributor = CreateUser("contributor@example.com", "Contributor");
            var domain = CreateDomain("Crypto", "crypto");

            dbContext.Users.AddRange(admin, contributor);
            dbContext.Domains.Add(domain);

            adminId = admin.Id;
            contributorId = contributor.Id;
            domainId = domain.Id;

            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = contributor.Id
            });
        });

        using var client = factory.CreateClient();
        var token = await CreateTokenAsync(factory, adminId);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation RemoveDomainAdmin($input: DomainAdministratorInput!) {
              removeDomainAdministrator(input: $input)
            }
            """,
            new { input = new { domainId, userId = contributorId } });

        var result = document.RootElement.GetProperty("data").GetProperty("removeDomainAdministrator").GetBoolean();
        Assert.True(result);
    }

    [Fact]
    public async Task UpdateDomainStyle_DomainAdmin_UpdatesStyleFields()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("domainadmin@example.com", "Domain Admin");
            var domain = CreateDomain("Crypto", "crypto");

            dbContext.Users.Add(domainAdmin);
            dbContext.Domains.Add(domain);

            domainAdminId = domainAdmin.Id;
            domainId = domain.Id;

            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = domainAdmin.Id
            });
        });

        using var client = factory.CreateClient();
        var token = await CreateTokenAsync(factory, domainAdminId);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateStyle($input: UpdateDomainStyleInput!) {
              updateDomainStyle(input: $input) {
                id primaryColor accentColor logoUrl bannerUrl
              }
            }
            """,
            new
            {
                input = new
                {
                    domainId,
                    primaryColor = "#ff5500",
                    accentColor = "#0055ff",
                    logoUrl = "https://example.com/logo.png",
                    bannerUrl = "https://example.com/banner.jpg"
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("updateDomainStyle");
        Assert.Equal("#ff5500", result.GetProperty("primaryColor").GetString());
        Assert.Equal("#0055ff", result.GetProperty("accentColor").GetString());
        Assert.Equal("https://example.com/logo.png", result.GetProperty("logoUrl").GetString());
        Assert.Equal("https://example.com/banner.jpg", result.GetProperty("bannerUrl").GetString());
    }

    [Fact]
    public async Task UpdateDomainStyle_RegularUser_Forbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("regular@example.com", "Regular");
            var domain = CreateDomain("Crypto", "crypto");

            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            userId = user.Id;
            domainId = domain.Id;
        });

        using var client = factory.CreateClient();
        var token = await CreateTokenAsync(factory, userId);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation UpdateStyle($input: UpdateDomainStyleInput!) {
              updateDomainStyle(input: $input) { id }
            }
            """,
            variables = new { input = new { domainId, primaryColor = "#ff0000" } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("FORBIDDEN", body);
    }

    [Fact]
    public async Task UpdateDomainStyle_InvalidPrimaryColor_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("colortest@example.com", "Color Tester");
            var domain = CreateDomain("Crypto", "crypto-color-test");

            dbContext.Users.Add(domainAdmin);
            dbContext.Domains.Add(domain);

            domainAdminId = domainAdmin.Id;
            domainId = domain.Id;

            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = domainAdmin.Id
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, domainAdminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation UpdateStyle($input: UpdateDomainStyleInput!) {
              updateDomainStyle(input: $input) { id }
            }
            """,
            variables = new { input = new { domainId, primaryColor = "notacolor" } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("INVALID_COLOR", body);
    }

    [Fact]
    public async Task UpdateDomainStyle_InvalidAccentColor_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("accentcolor@example.com", "Accent Tester");
            var domain = CreateDomain("Crypto", "crypto-accent-test");

            dbContext.Users.Add(domainAdmin);
            dbContext.Domains.Add(domain);

            domainAdminId = domainAdmin.Id;
            domainId = domain.Id;

            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = domainAdmin.Id
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, domainAdminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation UpdateStyle($input: UpdateDomainStyleInput!) {
              updateDomainStyle(input: $input) { id }
            }
            """,
            variables = new { input = new { domainId, accentColor = "rgb(255,0,0)" } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("INVALID_COLOR", body);
    }

    [Fact]
    public async Task UpdateDomainStyle_ValidShortHexColor_Succeeds()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("shorthex@example.com", "Short Hex Tester");
            var domain = CreateDomain("Crypto", "crypto-short-hex");

            dbContext.Users.Add(domainAdmin);
            dbContext.Domains.Add(domain);

            domainAdminId = domainAdmin.Id;
            domainId = domain.Id;

            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = domainAdmin.Id
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, domainAdminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateStyle($input: UpdateDomainStyleInput!) {
              updateDomainStyle(input: $input) {
                id primaryColor accentColor
              }
            }
            """,
            new { input = new { domainId, primaryColor = "#fff", accentColor = "#f50" } });

        var result = document.RootElement.GetProperty("data").GetProperty("updateDomainStyle");
        Assert.Equal("#fff", result.GetProperty("primaryColor").GetString());
        Assert.Equal("#f50", result.GetProperty("accentColor").GetString());
    }

    [Fact]
    public async Task GetDomainAdministrators_ReturnsAdminsForDomain()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("admin@example.com", "Admin");
            admin.Role = ApplicationUserRole.Admin;
            var contributor = CreateUser("contributor@example.com", "Contributor");
            var domain = CreateDomain("Crypto", "crypto");

            dbContext.Users.AddRange(admin, contributor);
            dbContext.Domains.Add(domain);

            adminId = admin.Id;
            domainId = domain.Id;

            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = admin.Id
            });
            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = contributor.Id
            });
        });

        using var client = factory.CreateClient();
        var token = await CreateTokenAsync(factory, adminId);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainAdmins($domainId: UUID!) {
              domainAdministrators(domainId: $domainId) {
                userId
                user { displayName }
              }
            }
            """,
            new { domainId });

        var admins = document.RootElement.GetProperty("data").GetProperty("domainAdministrators");
        Assert.Equal(2, admins.GetArrayLength());
    }

    [Fact]
    public async Task UpsertDomain_CreatorBecomesFirstDomainAdmin()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("admin@example.com", "Admin");
            admin.Role = ApplicationUserRole.Admin;
            dbContext.Users.Add(admin);
            adminId = admin.Id;
        });

        using var client = factory.CreateClient();
        var token = await CreateTokenAsync(factory, adminId);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpsertDomain($input: DomainInput!) {
              upsertDomain(input: $input) { id slug createdByUserId }
            }
            """,
            new
            {
                input = new
                {
                    name = "New Tag",
                    slug = "new-tag",
                    subdomain = "new-tag",
                    description = "A fresh tag",
                    isActive = true
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("upsertDomain");
        var newDomainId = Guid.Parse(result.GetProperty("id").GetString()!);
        Assert.Equal(adminId.ToString(), result.GetProperty("createdByUserId").GetString());

        // Verify domain admin was created
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var domainAdmin = await db.DomainAdministrators.SingleOrDefaultAsync(
            da => da.DomainId == newDomainId && da.UserId == adminId);
        Assert.NotNull(domainAdmin);
    }

    [Fact]
    public async Task Domains_ExposeStyleFields()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var domain = CreateDomain("Styled Tag", "styled-tag");
            domain.PrimaryColor = "#ff0000";
            domain.AccentColor = "#00ff00";
            domain.LogoUrl = "https://example.com/logo.png";
            domain.BannerUrl = "https://example.com/banner.jpg";
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query {
              domains {
                slug primaryColor accentColor logoUrl bannerUrl
              }
            }
            """);

        var domains = document.RootElement.GetProperty("data").GetProperty("domains");
        var domain = domains.EnumerateArray().First();
        Assert.Equal("#ff0000", domain.GetProperty("primaryColor").GetString());
        Assert.Equal("#00ff00", domain.GetProperty("accentColor").GetString());
        Assert.Equal("https://example.com/logo.png", domain.GetProperty("logoUrl").GetString());
        Assert.Equal("https://example.com/banner.jpg", domain.GetProperty("bannerUrl").GetString());
    }

    private static DateTime FirstDayOfNextMonthUtc()
    {
        var now = DateTime.UtcNow;
        return new DateTime(now.Year, now.Month, 1, 10, 0, 0, DateTimeKind.Utc).AddMonths(1);
    }

    [Fact]
    public async Task EventsQuery_AttendanceModeAndDateRange_CombineCorrectly()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("att-date@example.com", "Att Date User");
            var tech = CreateDomain("Tech", "tech-att-date");
            var nextMonth = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.Add(tech);
            dbContext.Events.AddRange(
                CreateEvent("Online Next Month", "online-next-month", "Online soon.", "Virtual", "Online", nextMonth, tech, user, attendanceMode: AttendanceMode.Online),
                CreateEvent("Online Far Future", "online-far-future", "Online later.", "Virtual", "Online", nextMonth.AddMonths(3), tech, user, attendanceMode: AttendanceMode.Online),
                CreateEvent("In-Person Next Month", "in-person-next-month", "Physical soon.", "Hall", "Prague", nextMonth.AddDays(1), tech, user, attendanceMode: AttendanceMode.InPerson));
        });

        using var client = factory.CreateClient();
        var nextMonth = FirstDayOfNextMonthUtc();

        // Online + narrow date window should match only "Online Next Month"
        var names = await QueryEventNamesAsync(client, new
        {
            attendanceMode = "ONLINE",
            startsFromUtc = nextMonth.AddDays(-1),
            startsToUtc = nextMonth.AddDays(14),
            sortBy = "UPCOMING"
        });

        Assert.Equal(["Online Next Month"], names);
    }

    [Fact]
    public async Task EventsQuery_KeywordDomainAttendanceModeAndSort_AllCombineCorrectly()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("combo@example.com", "Combo User");
            var ai = CreateDomain("AI", "ai-combo");
            var crypto = CreateDomain("Crypto", "crypto-combo");
            var nextMonth = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.AddRange(ai, crypto);
            dbContext.Events.AddRange(
                // Should match: keyword "summit" + domain ai + online
                CreateEvent("AI Summit Online", "ai-summit-online", "AI online event.", "Virtual", "Remote", nextMonth, ai, user, attendanceMode: AttendanceMode.Online),
                // Should NOT match: wrong domain
                CreateEvent("Crypto Summit Online", "crypto-summit-online", "Crypto online event.", "Virtual", "Remote", nextMonth.AddDays(1), crypto, user, attendanceMode: AttendanceMode.Online),
                // Should NOT match: wrong attendance mode
                CreateEvent("AI Summit In-Person", "ai-summit-in-person", "AI in-person event.", "Venue", "Prague", nextMonth.AddDays(2), ai, user, attendanceMode: AttendanceMode.InPerson),
                // Should NOT match: keyword mismatch
                CreateEvent("AI Workshop Online", "ai-workshop-online", "AI online workshop.", "Virtual", "Remote", nextMonth.AddDays(3), ai, user, attendanceMode: AttendanceMode.Online));
        });

        using var client = factory.CreateClient();

        var names = await QueryEventNamesAsync(client, new
        {
            searchText = "summit",
            domainSlug = "ai-combo",
            attendanceMode = "ONLINE",
            sortBy = "UPCOMING"
        });

        Assert.Equal(["AI Summit Online"], names);
    }

    [Fact]
    public async Task EventsQuery_CombinedFilters_ReturnsEmptyWhenNoEventsMatch()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("empty@example.com", "Empty User");
            var tech = CreateDomain("Tech", "tech-empty");
            var nextMonth = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.Add(tech);
            dbContext.Events.AddRange(
                CreateEvent("Prague Meetup", "prague-meetup", "Meetup in Prague.", "Venue", "Prague", nextMonth, tech, user, attendanceMode: AttendanceMode.InPerson),
                CreateEvent("Online Workshop", "online-workshop-empty", "Remote session.", "Virtual", "Online", nextMonth.AddDays(1), tech, user, attendanceMode: AttendanceMode.Online));
        });

        using var client = factory.CreateClient();

        // Combination that matches nothing: location text "berlin" + online + free
        var names = await QueryEventNamesAsync(client, new
        {
            locationText = "berlin",
            attendanceMode = "ONLINE",
            isFree = true,
            sortBy = "UPCOMING"
        });

        Assert.Empty(names);
    }

    [Fact]
    public async Task EventsQuery_PriceRangeAndDomain_CombineCorrectly()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("price-domain@example.com", "Price Domain User");
            var ai = CreateDomain("AI", "ai-price");
            var crypto = CreateDomain("Crypto", "crypto-price");
            var nextMonth = FirstDayOfNextMonthUtc();

            dbContext.Users.Add(user);
            dbContext.Domains.AddRange(ai, crypto);
            dbContext.Events.AddRange(
                CreateEvent("AI Workshop Cheap", "ai-workshop-cheap", "Budget AI.", "Venue", "Prague", nextMonth, ai, user, isFree: false, priceAmount: 20m),
                CreateEvent("AI Conference Premium", "ai-conference-premium", "Premium AI.", "Venue", "Prague", nextMonth.AddDays(1), ai, user, isFree: false, priceAmount: 250m),
                CreateEvent("Crypto Workshop Mid", "crypto-workshop-mid", "Mid-range crypto.", "Venue", "Brno", nextMonth.AddDays(2), crypto, user, isFree: false, priceAmount: 75m));
        });

        using var client = factory.CreateClient();

        // AI domain + price range 50–300 should match only the premium one
        var names = await QueryEventNamesAsync(client, new
        {
            domainSlug = "ai-price",
            priceMin = 50m,
            priceMax = 300m,
            sortBy = "UPCOMING"
        });

        Assert.Equal(["AI Conference Premium"], names);
    }

    // ── domainBySlug query ─────────────────────────────────────────────────────

    [Fact]
    public async Task DomainBySlug_ReturnsActiveDomainWithCorrectFields()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            dbContext.Domains.Add(CreateDomain("Crypto", "crypto-slug-test"));
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySlug($slug: String!) {
              domainBySlug(slug: $slug) {
                id name slug subdomain description isActive
              }
            }
            """,
            new { slug = "crypto-slug-test" });

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySlug");
        Assert.Equal("Crypto", domain.GetProperty("name").GetString());
        Assert.Equal("crypto-slug-test", domain.GetProperty("slug").GetString());
        Assert.True(domain.GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task DomainBySlug_ReturnsNullWhenSlugDoesNotExist()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            dbContext.Domains.Add(CreateDomain("Tech", "tech-exists"));
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySlug($slug: String!) {
              domainBySlug(slug: $slug) {
                id name slug
              }
            }
            """,
            new { slug = "nonexistent-slug" });

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySlug");
        Assert.Equal(JsonValueKind.Null, domain.ValueKind);
    }

    [Fact]
    public async Task DomainBySlug_ReturnsNullForInactiveDomain()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var inactive = CreateDomain("Inactive Domain", "inactive-slug");
            inactive.IsActive = false;
            dbContext.Domains.Add(inactive);
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySlug($slug: String!) {
              domainBySlug(slug: $slug) {
                id name slug
              }
            }
            """,
            new { slug = "inactive-slug" });

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySlug");
        Assert.Equal(JsonValueKind.Null, domain.ValueKind);
    }

    [Fact]
    public async Task DomainBySlug_IsCaseInsensitiveAndTrimsWhitespace()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            dbContext.Domains.Add(CreateDomain("Blockchain", "blockchain-ci"));
        });

        using var client = factory.CreateClient();

        // Slug stored as lowercase; querying with mixed case + whitespace should still resolve
        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySlug($slug: String!) {
              domainBySlug(slug: $slug) {
                name slug
              }
            }
            """,
            new { slug = "  blockchain-ci  " });

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySlug");
        Assert.Equal("Blockchain", domain.GetProperty("name").GetString());
    }

    [Fact]
    public async Task DomainBySlug_IsAccessibleWithoutAuthentication()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            dbContext.Domains.Add(CreateDomain("Public Domain", "public-domain"));
        });

        // Use a raw HttpClient with no auth header
        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySlug($slug: String!) {
              domainBySlug(slug: $slug) {
                name
              }
            }
            """,
            new { slug = "public-domain" });

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySlug");
        Assert.Equal("Public Domain", domain.GetProperty("name").GetString());
    }

    // ── Language filter tests ────────────────────────────────────────────────

    [Fact]
    public async Task LanguageFilter_ReturnsOnlyMatchingLanguage()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("lang-filter@example.com", "Lang Filter");
            var domain = CreateDomain("Tech", "tech-lang");
            var future = DateTime.UtcNow.AddDays(10);

            dbContext.Domains.Add(domain);
            dbContext.Users.Add(user);
            dbContext.Events.AddRange(
                CreateEvent("English Event", "english-event", "In English.", "Venue A", "Prague", future, domain, user, language: "en"),
                CreateEvent("Czech Event", "czech-event", "V cestine.", "Venue B", "Brno", future.AddHours(2), domain, user, language: "cs"),
                CreateEvent("No Language Event", "no-language-event", "No lang specified.", "Venue C", "Vienna", future.AddHours(4), domain, user, language: null));
        });

        using var client = factory.CreateClient();

        var enResults = await QueryEventNamesAsync(client, new { language = "en", sortBy = "UPCOMING" });
        Assert.Contains("English Event", enResults);
        Assert.DoesNotContain("Czech Event", enResults);
        Assert.DoesNotContain("No Language Event", enResults);

        var csResults = await QueryEventNamesAsync(client, new { language = "cs", sortBy = "UPCOMING" });
        Assert.Contains("Czech Event", csResults);
        Assert.DoesNotContain("English Event", csResults);
    }

    [Fact]
    public async Task LanguageFilter_NoFilterReturnsAllEvents()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("lang-all@example.com", "Lang All");
            var domain = CreateDomain("Tech", "tech-all");
            var future = DateTime.UtcNow.AddDays(10);

            dbContext.Domains.Add(domain);
            dbContext.Users.Add(user);
            dbContext.Events.AddRange(
                CreateEvent("Event A", "event-a-all", "Desc.", "Venue", "Prague", future, domain, user, language: "en"),
                CreateEvent("Event B", "event-b-all", "Desc.", "Venue", "Prague", future.AddHours(1), domain, user, language: "de"),
                CreateEvent("Event C", "event-c-all", "Desc.", "Venue", "Prague", future.AddHours(2), domain, user, language: null));
        });

        using var client = factory.CreateClient();
        var results = await QueryEventNamesAsync(client, new { sortBy = "UPCOMING" });

        Assert.Contains("Event A", results);
        Assert.Contains("Event B", results);
        Assert.Contains("Event C", results);
    }

    [Fact]
    public async Task LanguageFilter_IsCaseInsensitive()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("lang-case@example.com", "Lang Case");
            var domain = CreateDomain("Tech", "tech-case");
            var future = DateTime.UtcNow.AddDays(10);

            dbContext.Domains.Add(domain);
            dbContext.Users.Add(user);
            dbContext.Events.Add(
                CreateEvent("German Event", "german-event-ci", "Auf Deutsch.", "Venue", "Berlin", future, domain, user, language: "de"));
        });

        using var client = factory.CreateClient();

        // Query with uppercase — should still match
        var results = await QueryEventNamesAsync(client, new { language = "DE", sortBy = "UPCOMING" });
        Assert.Contains("German Event", results);
    }

    [Fact]
    public async Task LanguageFilter_ReturnsEmptyWhenNoMatchingLanguage()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("lang-none@example.com", "Lang None");
            var domain = CreateDomain("Tech", "tech-none");
            var future = DateTime.UtcNow.AddDays(10);

            dbContext.Domains.Add(domain);
            dbContext.Users.Add(user);
            dbContext.Events.Add(
                CreateEvent("French Event", "french-event-ni", "En français.", "Venue", "Paris", future, domain, user, language: "fr"));
        });

        using var client = factory.CreateClient();

        // Query for a language with no events
        var results = await QueryEventNamesAsync(client, new { language = "ja", sortBy = "UPCOMING" });
        Assert.Empty(results);
    }

    [Fact]
    public async Task LanguageFilter_EventsWithNullLanguageExcludedFromSpecificLanguageQuery()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("lang-null@example.com", "Lang Null");
            var domain = CreateDomain("Tech", "tech-null");
            var future = DateTime.UtcNow.AddDays(10);

            dbContext.Domains.Add(domain);
            dbContext.Users.Add(user);
            dbContext.Events.AddRange(
                CreateEvent("Specified Lang", "specified-lang", "Has lang.", "Venue", "Prague", future, domain, user, language: "en"),
                CreateEvent("No Lang Specified", "no-lang-specified", "No lang.", "Venue", "Prague", future.AddHours(1), domain, user, language: null));
        });

        using var client = factory.CreateClient();

        var results = await QueryEventNamesAsync(client, new { language = "en", sortBy = "UPCOMING" });
        Assert.Contains("Specified Lang", results);
        // Null-language event must NOT appear in a language-specific filter result
        Assert.DoesNotContain("No Lang Specified", results);
    }

    [Fact]
    public async Task TimezoneFilter_ReturnsOnlyMatchingTimezone()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("timezone-filter@example.com", "Timezone Filter");
            var domain = CreateDomain("Tech", "tech-timezone");
            var future = DateTime.UtcNow.AddDays(10);

            dbContext.Domains.Add(domain);
            dbContext.Users.Add(user);
            dbContext.Events.AddRange(
                CreateEvent("Prague Event", "prague-event-timezone", "CET.", "Venue A", "Prague", future, domain, user, timezone: "Europe/Prague"),
                CreateEvent("New York Event", "new-york-event-timezone", "ET.", "Venue B", "New York", future.AddHours(2), domain, user, timezone: "America/New_York"),
                CreateEvent("No Timezone Event", "no-timezone-event-timezone", "Legacy.", "Venue C", "Vienna", future.AddHours(4), domain, user, timezone: null));
        });

        using var client = factory.CreateClient();

        var pragueResults = await QueryEventNamesAsync(client, new { timezone = "Europe/Prague", sortBy = "UPCOMING" });
        Assert.Contains("Prague Event", pragueResults);
        Assert.DoesNotContain("New York Event", pragueResults);
        Assert.DoesNotContain("No Timezone Event", pragueResults);
    }

    [Fact]
    public async Task TimezoneFilter_NoFilterReturnsAllEvents()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("timezone-all@example.com", "Timezone All");
            var domain = CreateDomain("Tech", "tech-timezone-all");
            var future = DateTime.UtcNow.AddDays(10);

            dbContext.Domains.Add(domain);
            dbContext.Users.Add(user);
            dbContext.Events.AddRange(
                CreateEvent("Event A", "event-a-timezone-all", "Desc.", "Venue", "Prague", future, domain, user, timezone: "Europe/Prague"),
                CreateEvent("Event B", "event-b-timezone-all", "Desc.", "Venue", "New York", future.AddHours(1), domain, user, timezone: "America/New_York"),
                CreateEvent("Event C", "event-c-timezone-all", "Desc.", "Venue", "Berlin", future.AddHours(2), domain, user, timezone: null));
        });

        using var client = factory.CreateClient();
        var results = await QueryEventNamesAsync(client, new { sortBy = "UPCOMING" });

        Assert.Contains("Event A", results);
        Assert.Contains("Event B", results);
        Assert.Contains("Event C", results);
    }

    [Fact]
    public async Task TimezoneFilter_IsCaseInsensitive()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("timezone-case@example.com", "Timezone Case");
            var domain = CreateDomain("Tech", "tech-timezone-case");
            var future = DateTime.UtcNow.AddDays(10);

            dbContext.Domains.Add(domain);
            dbContext.Users.Add(user);
            dbContext.Events.Add(
                CreateEvent("London Event", "london-event-timezone-ci", "UK timezone.", "Venue", "London", future, domain, user, timezone: "Europe/London"));
        });

        using var client = factory.CreateClient();

        var results = await QueryEventNamesAsync(client, new { timezone = "europe/london", sortBy = "UPCOMING" });
        Assert.Contains("London Event", results);
    }

    [Fact]
    public async Task TimezoneFilter_ReturnsEmptyWhenNoMatchingTimezone()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("timezone-none@example.com", "Timezone None");
            var domain = CreateDomain("Tech", "tech-timezone-none");
            var future = DateTime.UtcNow.AddDays(10);

            dbContext.Domains.Add(domain);
            dbContext.Users.Add(user);
            dbContext.Events.Add(
                CreateEvent("Sydney Event", "sydney-event-timezone", "AEST.", "Venue", "Sydney", future, domain, user, timezone: "Australia/Sydney"));
        });

        using var client = factory.CreateClient();

        var results = await QueryEventNamesAsync(client, new { timezone = "Asia/Tokyo", sortBy = "UPCOMING" });
        Assert.Empty(results);
    }

    // ── Push subscription tests ──────────────────────────────────────────────

    [Fact]
    public async Task RegisterPushSubscription_RequiresAuthentication()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            dbContext.Users.Add(CreateUser("push-anon@example.com", "Anon User"));
        });

        using var client = factory.CreateClient(); // No auth header

        var body = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation RegisterPushSubscription($input: RegisterPushSubscriptionInput!) {
              registerPushSubscription(input: $input) {
                isSubscribed
              }
            }
            """,
            variables = new
            {
                input = new { endpoint = "https://push.example.com/sub", p256dh = "key123", auth = "auth123" }
            }
        });

        var json = await JsonDocument.ParseAsync(await body.Content.ReadAsStreamAsync());
        var hasErrors = json.RootElement.TryGetProperty("errors", out _);
        Assert.True(hasErrors, "Unauthenticated request should return GraphQL errors");
    }

    [Fact]
    public async Task RegisterPushSubscription_CanRegisterAndQueryStatus()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("push-user@example.com", "Push User");
            userId = user.Id;
            dbContext.Users.Add(user);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        // Register a subscription
        using var registerDoc = await ExecuteGraphQlAsync(
            client,
            """
            mutation RegisterPushSubscription($input: RegisterPushSubscriptionInput!) {
              registerPushSubscription(input: $input) {
                isSubscribed
                endpoint
              }
            }
            """,
            new
            {
                input = new
                {
                    endpoint = "https://push.example.com/subscription/abc123",
                    p256dh = "BPubKey123",
                    auth = "authSecret456"
                }
            });

        var registered = registerDoc.RootElement.GetProperty("data").GetProperty("registerPushSubscription");
        Assert.True(registered.GetProperty("isSubscribed").GetBoolean());
        Assert.Equal("https://push.example.com/subscription/abc123", registered.GetProperty("endpoint").GetString());

        // Query subscription status
        using var statusDoc = await ExecuteGraphQlAsync(
            client,
            """
            query MyPushSubscription {
              myPushSubscription {
                isSubscribed
                endpoint
              }
            }
            """);

        var status = statusDoc.RootElement.GetProperty("data").GetProperty("myPushSubscription");
        Assert.True(status.GetProperty("isSubscribed").GetBoolean());
        Assert.Equal("https://push.example.com/subscription/abc123", status.GetProperty("endpoint").GetString());
    }

    [Fact]
    public async Task RegisterPushSubscription_ReplacesExistingSubscription()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("push-replace@example.com", "Push Replace");
            userId = user.Id;
            dbContext.Users.Add(user);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        // Register first subscription
        await ExecuteGraphQlAsync(
            client,
            """
            mutation RegisterPushSubscription($input: RegisterPushSubscriptionInput!) {
              registerPushSubscription(input: $input) { isSubscribed }
            }
            """,
            new { input = new { endpoint = "https://push.example.com/old", p256dh = "old-key", auth = "old-auth" } });

        // Register replacement subscription
        using var replaceDoc = await ExecuteGraphQlAsync(
            client,
            """
            mutation RegisterPushSubscription($input: RegisterPushSubscriptionInput!) {
              registerPushSubscription(input: $input) {
                isSubscribed
                endpoint
              }
            }
            """,
            new { input = new { endpoint = "https://push.example.com/new", p256dh = "new-key", auth = "new-auth" } });

        var replaced = replaceDoc.RootElement.GetProperty("data").GetProperty("registerPushSubscription");
        Assert.True(replaced.GetProperty("isSubscribed").GetBoolean());
        Assert.Equal("https://push.example.com/new", replaced.GetProperty("endpoint").GetString());

        // Verify only one subscription exists in database
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var count = await dbContext.PushSubscriptions.CountAsync(ps => ps.UserId == userId);
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task RemovePushSubscription_RemovesSubscriptionAndPendingReminders()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("push-remove@example.com", "Push Remove");
            userId = user.Id;
            var domain = CreateDomain("Remove Domain", "remove-domain");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent("Remove Event", "remove-event", "Desc", "Venue", "City",
                DateTime.UtcNow.AddDays(30), domain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        // Register subscription
        await ExecuteGraphQlAsync(
            client,
            """
            mutation RegisterPushSubscription($input: RegisterPushSubscriptionInput!) {
              registerPushSubscription(input: $input) { isSubscribed }
            }
            """,
            new { input = new { endpoint = "https://push.example.com/sub", p256dh = "key", auth = "auth" } });

        // Enable a reminder
        await ExecuteGraphQlAsync(
            client,
            """
            mutation EnableEventReminder($input: EnableEventReminderInput!) {
              enableEventReminder(input: $input) { id }
            }
            """,
            new { input = new { eventId, offsetHours = 24 } });

        // Remove subscription
        using var removeDoc = await ExecuteGraphQlAsync(
            client,
            """
            mutation RemovePushSubscription {
              removePushSubscription
            }
            """);

        Assert.True(removeDoc.RootElement.GetProperty("data").GetProperty("removePushSubscription").GetBoolean());

        // Verify subscription and pending reminders are gone
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var subCount = await dbContext.PushSubscriptions.CountAsync(ps => ps.UserId == userId);
        var reminderCount = await dbContext.EventReminders.CountAsync(r => r.UserId == userId && r.SentAtUtc == null);
        Assert.Equal(0, subCount);
        Assert.Equal(0, reminderCount);
    }

    [Fact]
    public async Task MyPushSubscription_ReturnsNullWhenNotSubscribed()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("push-none@example.com", "No Sub");
            userId = user.Id;
            dbContext.Users.Add(user);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            query MyPushSubscription {
              myPushSubscription {
                isSubscribed
              }
            }
            """);

        var sub = doc.RootElement.GetProperty("data").GetProperty("myPushSubscription");
        Assert.Equal(JsonValueKind.Null, sub.ValueKind);
    }

    // ── Event reminder tests ─────────────────────────────────────────────────

    [Fact]
    public async Task EnableEventReminder_RequiresPushSubscription()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("reminder-nosub@example.com", "No Sub User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tech-reminder-nosub");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent("Future Event", "future-event-nosub", "Desc", "Venue", "City",
                DateTime.UtcNow.AddDays(10), domain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        // Try to enable reminder without a push subscription
        var body = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation EnableEventReminder($input: EnableEventReminderInput!) {
              enableEventReminder(input: $input) { id }
            }
            """,
            variables = new { input = new { eventId, offsetHours = 24 } }
        });

        var json = await JsonDocument.ParseAsync(await body.Content.ReadAsStreamAsync());
        var hasErrors = json.RootElement.TryGetProperty("errors", out var errors);
        Assert.True(hasErrors);
        Assert.Contains("NO_PUSH_SUBSCRIPTION", errors.ToString());
    }

    [Fact]
    public async Task EnableEventReminder_CanEnableAndListReminder()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("reminder-enable@example.com", "Reminder Enable");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tech-reminder-enable");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent("Upcoming Event", "upcoming-event-enable", "Desc", "Venue", "City",
                DateTime.UtcNow.AddDays(30), domain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        // Register subscription first
        await ExecuteGraphQlAsync(
            client,
            """
            mutation RegisterPushSubscription($input: RegisterPushSubscriptionInput!) {
              registerPushSubscription(input: $input) { isSubscribed }
            }
            """,
            new { input = new { endpoint = "https://push.example.com/s1", p256dh = "k1", auth = "a1" } });

        // Enable reminder
        using var enableDoc = await ExecuteGraphQlAsync(
            client,
            """
            mutation EnableEventReminder($input: EnableEventReminderInput!) {
              enableEventReminder(input: $input) {
                id
                eventId
                offsetHours
                sentAtUtc
              }
            }
            """,
            new { input = new { eventId, offsetHours = 24 } });

        var reminder = enableDoc.RootElement.GetProperty("data").GetProperty("enableEventReminder");
        Assert.Equal(eventId.ToString(), reminder.GetProperty("eventId").GetString());
        Assert.Equal(24, reminder.GetProperty("offsetHours").GetInt32());
        Assert.Equal(JsonValueKind.Null, reminder.GetProperty("sentAtUtc").ValueKind);

        // List reminders
        using var listDoc = await ExecuteGraphQlAsync(
            client,
            """
            query MyEventReminders {
              myEventReminders {
                eventId
                offsetHours
              }
            }
            """);

        var reminders = listDoc.RootElement.GetProperty("data").GetProperty("myEventReminders").EnumerateArray().ToList();
        Assert.Single(reminders);
        Assert.Equal(eventId.ToString(), reminders[0].GetProperty("eventId").GetString());
    }

    [Fact]
    public async Task EnableEventReminder_RejectsEventInPast()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("reminder-past@example.com", "Past User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tech-reminder-past");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            // Past event
            var ev = CreateEvent("Past Event", "past-event-reminder", "Desc", "Venue", "City",
                DateTime.UtcNow.AddDays(-5), domain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        // Register subscription
        await ExecuteGraphQlAsync(
            client,
            """
            mutation RegisterPushSubscription($input: RegisterPushSubscriptionInput!) {
              registerPushSubscription(input: $input) { isSubscribed }
            }
            """,
            new { input = new { endpoint = "https://push.example.com/s2", p256dh = "k2", auth = "a2" } });

        // Try to enable reminder for past event
        var body = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation EnableEventReminder($input: EnableEventReminderInput!) {
              enableEventReminder(input: $input) { id }
            }
            """,
            variables = new { input = new { eventId, offsetHours = 24 } }
        });

        var json = await JsonDocument.ParseAsync(await body.Content.ReadAsStreamAsync());
        var hasErrors = json.RootElement.TryGetProperty("errors", out var errors);
        Assert.True(hasErrors, "Should fail for past event");
        // past events have started so they're not Published in our test data... verify error returned
    }

    [Fact]
    public async Task DisableEventReminder_RemovesRemindersForEvent()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("reminder-disable@example.com", "Reminder Disable");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tech-reminder-disable");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent("Disable Reminder Event", "disable-reminder-event", "Desc", "Venue", "City",
                DateTime.UtcNow.AddDays(20), domain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        // Register subscription
        await ExecuteGraphQlAsync(
            client,
            """
            mutation RegisterPushSubscription($input: RegisterPushSubscriptionInput!) {
              registerPushSubscription(input: $input) { isSubscribed }
            }
            """,
            new { input = new { endpoint = "https://push.example.com/s3", p256dh = "k3", auth = "a3" } });

        // Enable reminder
        await ExecuteGraphQlAsync(
            client,
            """
            mutation EnableEventReminder($input: EnableEventReminderInput!) {
              enableEventReminder(input: $input) { id }
            }
            """,
            new { input = new { eventId, offsetHours = 24 } });

        // Disable reminder
        using var disableDoc = await ExecuteGraphQlAsync(
            client,
            """
            mutation DisableEventReminder($eventId: UUID!) {
              disableEventReminder(eventId: $eventId)
            }
            """,
            new { eventId });

        Assert.True(disableDoc.RootElement.GetProperty("data").GetProperty("disableEventReminder").GetBoolean());

        // Verify no reminders remain
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var count = await dbContext.EventReminders.CountAsync(r => r.UserId == userId && r.EventId == eventId);
        Assert.Equal(0, count);
    }

    [Fact]
    public async Task EnableEventReminder_PreventsDuplicateForSameOffset()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("reminder-dupe@example.com", "Dupe User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tech-reminder-dupe");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent("Dupe Reminder Event", "dupe-reminder-event", "Desc", "Venue", "City",
                DateTime.UtcNow.AddDays(15), domain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        // Register subscription
        await ExecuteGraphQlAsync(
            client,
            """
            mutation RegisterPushSubscription($input: RegisterPushSubscriptionInput!) {
              registerPushSubscription(input: $input) { isSubscribed }
            }
            """,
            new { input = new { endpoint = "https://push.example.com/s4", p256dh = "k4", auth = "a4" } });

        // Enable reminder twice for the same offset
        await ExecuteGraphQlAsync(
            client,
            """
            mutation EnableEventReminder($input: EnableEventReminderInput!) {
              enableEventReminder(input: $input) { id }
            }
            """,
            new { input = new { eventId, offsetHours = 24 } });

        await ExecuteGraphQlAsync(
            client,
            """
            mutation EnableEventReminder($input: EnableEventReminderInput!) {
              enableEventReminder(input: $input) { id }
            }
            """,
            new { input = new { eventId, offsetHours = 24 } });

        // Only one reminder should exist
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var count = await dbContext.EventReminders.CountAsync(r => r.UserId == userId && r.EventId == eventId);
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task OrganizerIsolation_RemindersBelongOnlyToOwner()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId1 = Guid.Empty;
        var userId2 = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user1 = CreateUser("remind-user1@example.com", "User One");
            var user2 = CreateUser("remind-user2@example.com", "User Two");
            userId1 = user1.Id;
            userId2 = user2.Id;
            var domain = CreateDomain("Tech", "tech-isolate");
            dbContext.Users.AddRange(user1, user2);
            dbContext.Domains.Add(domain);

            var ev = CreateEvent("Shared Event", "shared-event-reminder", "Desc", "Venue", "City",
                DateTime.UtcNow.AddDays(10), domain, user1);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
        });

        // User 1 registers subscription and enables reminder
        using var client1 = factory.CreateClient();
        client1.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId1));
        await ExecuteGraphQlAsync(
            client1,
            """
            mutation RegisterPushSubscription($input: RegisterPushSubscriptionInput!) {
              registerPushSubscription(input: $input) { isSubscribed }
            }
            """,
            new { input = new { endpoint = "https://push.example.com/u1", p256dh = "k1u1", auth = "a1u1" } });
        await ExecuteGraphQlAsync(
            client1,
            """
            mutation EnableEventReminder($input: EnableEventReminderInput!) {
              enableEventReminder(input: $input) { id }
            }
            """,
            new { input = new { eventId, offsetHours = 24 } });

        // User 2 queries their reminders — should see none
        using var client2 = factory.CreateClient();
        client2.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId2));

        using var doc = await ExecuteGraphQlAsync(
            client2,
            """
            query MyEventReminders {
              myEventReminders {
                eventId
              }
            }
            """);

        var reminders = doc.RootElement.GetProperty("data").GetProperty("myEventReminders").EnumerateArray().ToList();
        Assert.Empty(reminders);
    }

    [Fact]
    public async Task VapidPublicKey_IsAccessibleWithoutAuthentication()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        using var client = factory.CreateClient();

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            query VapidPublicKey {
              vapidPublicKey
            }
            """);

        // In test config VAPID keys are not set, so the key should be empty string
        var key = doc.RootElement.GetProperty("data").GetProperty("vapidPublicKey").GetString();
        Assert.NotNull(key); // may be empty but must not be null
    }

    // -----------------------------------------------------------------------
    // Domain Hub Overview Tests
    // -----------------------------------------------------------------------

    [Fact]
    public async Task UpdateDomainOverview_PersistsAllFields_ForGlobalAdmin()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var adminId = Guid.Empty;
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("hub-admin@example.com", "Hub Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Crypto", "hub-overview-crypto");
            domainId = domain.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateDomainOverview($input: UpdateDomainOverviewInput!) {
              updateDomainOverview(input: $input) {
                id
                overviewContent
                whatBelongsHere
                submitEventCta
                curatorCredit
              }
            }
            """,
            new
            {
                input = new
                {
                    domainId,
                    overviewContent = "A community for blockchain and crypto events.",
                    whatBelongsHere = "Blockchain meetups, DeFi talks, and crypto networking events.",
                    submitEventCta = "Organizing a crypto event? Submit it here.",
                    curatorCredit = "Prague Blockchain Week organizers"
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("updateDomainOverview");
        Assert.Equal("A community for blockchain and crypto events.", result.GetProperty("overviewContent").GetString());
        Assert.Equal("Blockchain meetups, DeFi talks, and crypto networking events.", result.GetProperty("whatBelongsHere").GetString());
        Assert.Equal("Organizing a crypto event? Submit it here.", result.GetProperty("submitEventCta").GetString());
        Assert.Equal("Prague Blockchain Week organizers", result.GetProperty("curatorCredit").GetString());

        // Verify persistence
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var persisted = await db.Domains.FindAsync(domainId);
        Assert.Equal("A community for blockchain and crypto events.", persisted!.OverviewContent);
        Assert.Equal("Prague Blockchain Week organizers", persisted.CuratorCredit);
    }

    [Fact]
    public async Task UpdateDomainOverview_AllowsDomainAdministrator()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var adminId = Guid.Empty;
        var domainAdminId = Guid.Empty;
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var globalAdmin = CreateUser("global-admin-hub@example.com", "Global Admin", ApplicationUserRole.Admin);
            adminId = globalAdmin.Id;
            var domainAdmin = CreateUser("domain-admin-hub@example.com", "Domain Admin");
            domainAdminId = domainAdmin.Id;
            var domain = CreateDomain("AI", "hub-overview-ai");
            domainId = domain.Id;
            dbContext.Users.AddRange(globalAdmin, domainAdmin);
            dbContext.Domains.Add(domain);
            dbContext.DomainAdministrators.Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = domainAdmin.Id
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, domainAdminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateDomainOverview($input: UpdateDomainOverviewInput!) {
              updateDomainOverview(input: $input) {
                id
                overviewContent
                curatorCredit
              }
            }
            """,
            new
            {
                input = new
                {
                    domainId,
                    overviewContent = "Domain admin-authored overview.",
                    curatorCredit = "AI community team"
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("updateDomainOverview");
        Assert.Equal("Domain admin-authored overview.", result.GetProperty("overviewContent").GetString());
        Assert.Equal("AI community team", result.GetProperty("curatorCredit").GetString());
    }

    [Fact]
    public async Task UpdateDomainOverview_RejectsUnauthenticatedRequest()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domain = CreateDomain("Cooking", "hub-overview-cooking");
            domainId = domain.Id;
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        // No auth header

        var body = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation UpdateDomainOverview($input: UpdateDomainOverviewInput!) {
              updateDomainOverview(input: $input) { id }
            }
            """,
            variables = new { input = new { domainId, overviewContent = "Unauthorized" } }
        });

        var json = await JsonDocument.ParseAsync(await body.Content.ReadAsStreamAsync());
        Assert.True(json.RootElement.TryGetProperty("errors", out _), "Should return errors for unauthenticated request");
    }

    [Fact]
    public async Task UpdateDomainOverview_RejectsNonDomainAdminContributor()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var contributorId = Guid.Empty;
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var contributor = CreateUser("contributor-hub@example.com", "Contributor");
            contributorId = contributor.Id;
            var domain = CreateDomain("Tech", "hub-overview-tech-nonadmin");
            domainId = domain.Id;
            dbContext.Users.Add(contributor);
            dbContext.Domains.Add(domain);
            // Contributor is NOT added to DomainAdministrators
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, contributorId));

        var body = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation UpdateDomainOverview($input: UpdateDomainOverviewInput!) {
              updateDomainOverview(input: $input) { id }
            }
            """,
            variables = new { input = new { domainId, overviewContent = "Should not be allowed" } }
        });

        var json = await JsonDocument.ParseAsync(await body.Content.ReadAsStreamAsync());
        Assert.True(json.RootElement.TryGetProperty("errors", out _), "Contributor who is not a domain admin should be rejected");
    }

    [Fact]
    public async Task UpdateDomainOverview_ClearsFieldsWhenPassingNull()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var adminId = Guid.Empty;
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("hub-clear-admin@example.com", "Hub Clear Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = new EventDomain
            {
                Name = "ClearTest",
                Slug = "hub-clear-test",
                Subdomain = "hub-clear-test",
                OverviewContent = "Initial overview",
                WhatBelongsHere = "Initial what",
                SubmitEventCta = "Initial CTA",
                CuratorCredit = "Initial credit"
            };
            domainId = domain.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateDomainOverview($input: UpdateDomainOverviewInput!) {
              updateDomainOverview(input: $input) {
                overviewContent
                whatBelongsHere
                submitEventCta
                curatorCredit
              }
            }
            """,
            new
            {
                input = new
                {
                    domainId,
                    overviewContent = (string?)null,
                    whatBelongsHere = (string?)null,
                    submitEventCta = (string?)null,
                    curatorCredit = (string?)null
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("updateDomainOverview");
        Assert.Equal(JsonValueKind.Null, result.GetProperty("overviewContent").ValueKind);
        Assert.Equal(JsonValueKind.Null, result.GetProperty("whatBelongsHere").ValueKind);
        Assert.Equal(JsonValueKind.Null, result.GetProperty("submitEventCta").ValueKind);
        Assert.Equal(JsonValueKind.Null, result.GetProperty("curatorCredit").ValueKind);
    }

    [Fact]
    public async Task UpdateDomainOverview_OverviewContentTooLong_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("lentest-overview@example.com", "Length Tester");
            var domain = CreateDomain("Length Hub", "length-hub-overview");

            dbContext.Users.Add(domainAdmin);
            dbContext.Domains.Add(domain);

            domainAdminId = domainAdmin.Id;
            domainId = domain.Id;

            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = domainAdmin.Id
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, domainAdminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation UpdateDomainOverview($input: UpdateDomainOverviewInput!) {
              updateDomainOverview(input: $input) { id }
            }
            """,
            variables = new
            {
                input = new
                {
                    domainId,
                    overviewContent = new string('x', 2001)
                }
            }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("INVALID_OVERVIEW_CONTENT", body);
    }

    [Fact]
    public async Task UpdateDomainOverview_CuratorCreditTooLong_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("lentest-credit@example.com", "Credit Length Tester");
            var domain = CreateDomain("Credit Hub", "credit-hub-len");

            dbContext.Users.Add(domainAdmin);
            dbContext.Domains.Add(domain);

            domainAdminId = domainAdmin.Id;
            domainId = domain.Id;

            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = domainAdmin.Id
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, domainAdminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation UpdateDomainOverview($input: UpdateDomainOverviewInput!) {
              updateDomainOverview(input: $input) { id }
            }
            """,
            variables = new
            {
                input = new
                {
                    domainId,
                    curatorCredit = new string('y', 201)
                }
            }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("INVALID_CURATOR_CREDIT", body);
    }

    [Fact]
    public async Task DomainBySlug_ReturnsOverviewContentFields()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var domain = new EventDomain
            {
                Name = "Overview Test",
                Slug = "overview-test-slug",
                Subdomain = "overview-test",
                OverviewContent = "About this overview hub.",
                WhatBelongsHere = "Events about overview testing.",
                SubmitEventCta = "Submit an overview event.",
                CuratorCredit = "Test curators",
                IsActive = true
            };
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySlug($slug: String!) {
              domainBySlug(slug: $slug) {
                slug
                overviewContent
                whatBelongsHere
                submitEventCta
                curatorCredit
              }
            }
            """,
            new { slug = "overview-test-slug" });

        var result = document.RootElement.GetProperty("data").GetProperty("domainBySlug");
        Assert.Equal("About this overview hub.", result.GetProperty("overviewContent").GetString());
        Assert.Equal("Events about overview testing.", result.GetProperty("whatBelongsHere").GetString());
        Assert.Equal("Submit an overview event.", result.GetProperty("submitEventCta").GetString());
        Assert.Equal("Test curators", result.GetProperty("curatorCredit").GetString());
    }

    [Fact]
    public async Task UpsertDomain_PersistsOverviewFields()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var adminId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("upsert-overview-admin@example.com", "Upsert Overview Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            dbContext.Users.Add(admin);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpsertDomain($input: DomainInput!) {
              upsertDomain(input: $input) {
                slug
                overviewContent
                whatBelongsHere
                submitEventCta
                curatorCredit
              }
            }
            """,
            new
            {
                input = new
                {
                    name = "Upsert Overview Hub",
                    slug = "upsert-overview-hub",
                    subdomain = "upsert-overview-hub",
                    description = "A hub for upsert testing.",
                    isActive = true,
                    overviewContent = "Upsert overview content.",
                    whatBelongsHere = "Upsert what belongs here.",
                    submitEventCta = "Upsert CTA.",
                    curatorCredit = "Upsert curator"
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("upsertDomain");
        Assert.Equal("Upsert overview content.", result.GetProperty("overviewContent").GetString());
        Assert.Equal("Upsert what belongs here.", result.GetProperty("whatBelongsHere").GetString());
        Assert.Equal("Upsert CTA.", result.GetProperty("submitEventCta").GetString());
        Assert.Equal("Upsert curator", result.GetProperty("curatorCredit").GetString());
    }

    // ── myManagedDomains query ────────────────────────────────────────────────

    [Fact]
    public async Task MyManagedDomains_ReturnsDomainsThatUserAdministers()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid domainAdminId = Guid.Empty;
        Guid domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("mmd-admin@example.com", "Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domainAdmin = CreateUser("mmd-domainadmin@example.com", "Domain Admin");
            domainAdminId = domainAdmin.Id;

            var domain = CreateDomain("Hub Alpha", "hub-alpha");
            domainId = domain.Id;

            dbContext.Users.AddRange(admin, domainAdmin);
            dbContext.Domains.Add(domain);
            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = domainAdmin.Id,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, domainAdminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query MyManagedDomains {
              myManagedDomains {
                id name slug primaryColor logoUrl bannerUrl
                overviewContent whatBelongsHere submitEventCta curatorCredit
              }
            }
            """);

        var domains = document.RootElement.GetProperty("data").GetProperty("myManagedDomains");
        Assert.Equal(1, domains.GetArrayLength());
        Assert.Equal("Hub Alpha", domains[0].GetProperty("name").GetString());
        Assert.Equal("hub-alpha", domains[0].GetProperty("slug").GetString());
    }

    [Fact]
    public async Task MyManagedDomains_ReturnsEmptyWhenUserAdministersNoDomains()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("mmd-nodomains@example.com", "No Domains User");
            userId = user.Id;
            dbContext.Users.Add(user);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, userId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query MyManagedDomains {
              myManagedDomains { id name }
            }
            """);

        var domains = document.RootElement.GetProperty("data").GetProperty("myManagedDomains");
        Assert.Equal(0, domains.GetArrayLength());
    }

    [Fact]
    public async Task MyManagedDomains_RequiresAuthentication()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        using var client = factory.CreateClient();
        // No auth header — unauthenticated

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                query MyManagedDomains {
                  myManagedDomains { id name }
                }
                """
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var errorMessage = errors.ToString();
        Assert.True(
            errorMessage.Contains("AUTH_NOT_AUTHENTICATED", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("not authorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error but got: {errorMessage}");
    }

    [Fact]
    public async Task MyManagedDomains_ReturnsOnlyOwnManagedDomains_NotOtherUsersDomains()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userAId = Guid.Empty;
        Guid userBId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var userA = CreateUser("mmd-usera@example.com", "User A");
            userAId = userA.Id;
            var userB = CreateUser("mmd-userb@example.com", "User B");
            userBId = userB.Id;

            var domainA = CreateDomain("Domain A", "domain-a");
            var domainB = CreateDomain("Domain B", "domain-b");

            dbContext.Users.AddRange(userA, userB);
            dbContext.Domains.AddRange(domainA, domainB);
            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domainA.Id,
                UserId = userA.Id,
            });
            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domainB.Id,
                UserId = userB.Id,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, userAId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query MyManagedDomains {
              myManagedDomains { id name slug }
            }
            """);

        var domains = document.RootElement.GetProperty("data").GetProperty("myManagedDomains");
        Assert.Equal(1, domains.GetArrayLength());
        Assert.Equal("domain-a", domains[0].GetProperty("slug").GetString());
    }

    // ── SetDomainFeaturedEvents mutation ─────────────────────────────────────

    [Fact]
    public async Task SetDomainFeaturedEvents_GlobalAdmin_SetsFeaturedEvents()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty, domainId = Guid.Empty, eventId1 = Guid.Empty, eventId2 = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("feat-admin@example.com", "Featured Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Featured Hub", "featured-hub");
            domainId = domain.Id;

            var event1 = CreateEvent("Event One", "event-one", "Description one", "Venue", "Prague",
                DateTime.UtcNow.AddDays(10), domain, admin);
            var event2 = CreateEvent("Event Two", "event-two", "Description two", "Venue", "Prague",
                DateTime.UtcNow.AddDays(20), domain, admin);
            eventId1 = event1.Id;
            eventId2 = event2.Id;

            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.Events.AddRange(event1, event2);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation SetFeatured($input: SetDomainFeaturedEventsInput!) {
              setDomainFeaturedEvents(input: $input) { id name }
            }
            """,
            new { input = new { domainId, eventIds = new[] { eventId1, eventId2 } } });

        var events = document.RootElement.GetProperty("data").GetProperty("setDomainFeaturedEvents");
        Assert.Equal(2, events.GetArrayLength());
        Assert.Equal("Event One", events[0].GetProperty("name").GetString());
        Assert.Equal("Event Two", events[1].GetProperty("name").GetString());
    }

    [Fact]
    public async Task SetDomainFeaturedEvents_DomainAdmin_CanSetFeaturedEvents()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty, eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("feat-domainadmin@example.com", "Domain Admin");
            domainAdminId = domainAdmin.Id;
            var domain = CreateDomain("Domain Admin Hub", "domainadmin-hub");
            domainId = domain.Id;

            var ev = CreateEvent("Featured Event", "featured-event", "Description", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, domainAdmin);
            eventId = ev.Id;

            dbContext.Users.Add(domainAdmin);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = domainAdmin.Id
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, domainAdminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation SetFeatured($input: SetDomainFeaturedEventsInput!) {
              setDomainFeaturedEvents(input: $input) { id name }
            }
            """,
            new { input = new { domainId, eventIds = new[] { eventId } } });

        var events = document.RootElement.GetProperty("data").GetProperty("setDomainFeaturedEvents");
        Assert.Equal(1, events.GetArrayLength());
        Assert.Equal("Featured Event", events[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task SetDomainFeaturedEvents_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domain = CreateDomain("Auth Hub", "auth-hub");
            domainId = domain.Id;
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation SetFeatured($input: SetDomainFeaturedEventsInput!) {
              setDomainFeaturedEvents(input: $input) { id }
            }
            """,
            variables = new { input = new { domainId, eventIds = Array.Empty<Guid>() } }
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
    public async Task SetDomainFeaturedEvents_RegularUser_Forbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("feat-user@example.com", "Regular User");
            userId = user.Id;
            var domain = CreateDomain("Forbidden Hub", "forbidden-hub");
            domainId = domain.Id;
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation SetFeatured($input: SetDomainFeaturedEventsInput!) {
              setDomainFeaturedEvents(input: $input) { id }
            }
            """,
            variables = new { input = new { domainId, eventIds = Array.Empty<Guid>() } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("FORBIDDEN", body);
    }

    [Fact]
    public async Task SetDomainFeaturedEvents_TooManyEvents_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty, domainId = Guid.Empty;
        var sixEventIds = new List<Guid>();

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("feat-many@example.com", "Many Events Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Many Hub", "many-hub");
            domainId = domain.Id;

            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);

            for (var i = 0; i < 6; i++)
            {
                var ev = CreateEvent($"Event {i}", $"event-many-{i}", "Desc", "Venue", "Prague",
                    DateTime.UtcNow.AddDays(i + 1), domain, admin);
                sixEventIds.Add(ev.Id);
                dbContext.Events.Add(ev);
            }
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation SetFeatured($input: SetDomainFeaturedEventsInput!) {
              setDomainFeaturedEvents(input: $input) { id }
            }
            """,
            variables = new { input = new { domainId, eventIds = sixEventIds } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("TOO_MANY_FEATURED_EVENTS", body);
    }

    [Fact]
    public async Task SetDomainFeaturedEvents_EventFromOtherDomain_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty, domainId = Guid.Empty, otherEventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("feat-cross@example.com", "Cross Domain Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Hub A", "hub-a-cross");
            var otherDomain = CreateDomain("Hub B", "hub-b-cross");
            domainId = domain.Id;

            var otherEvent = CreateEvent("Other Event", "other-event-cross", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(3), otherDomain, admin);
            otherEventId = otherEvent.Id;

            dbContext.Users.Add(admin);
            dbContext.Domains.AddRange(domain, otherDomain);
            dbContext.Events.Add(otherEvent);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation SetFeatured($input: SetDomainFeaturedEventsInput!) {
              setDomainFeaturedEvents(input: $input) { id }
            }
            """,
            variables = new { input = new { domainId, eventIds = new[] { otherEventId } } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("EVENT_WRONG_DOMAIN", body);
    }

    [Fact]
    public async Task SetDomainFeaturedEvents_UnpublishedEvent_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty, domainId = Guid.Empty, pendingEventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("feat-unpub@example.com", "Unpub Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Unpub Hub", "unpub-hub");
            domainId = domain.Id;

            var pendingEvent = CreateEvent("Pending Event", "pending-event-unpub", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, admin, status: EventStatus.PendingApproval);
            pendingEventId = pendingEvent.Id;

            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(pendingEvent);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation SetFeatured($input: SetDomainFeaturedEventsInput!) {
              setDomainFeaturedEvents(input: $input) { id }
            }
            """,
            variables = new { input = new { domainId, eventIds = new[] { pendingEventId } } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("EVENT_NOT_PUBLISHED", body);
    }

    [Fact]
    public async Task SetDomainFeaturedEvents_EmptyList_ClearsExistingFeaturedEvents()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("feat-clear@example.com", "Clear Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Clear Hub", "clear-hub");
            domainId = domain.Id;

            var ev = CreateEvent("Clear Event", "clear-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, admin);

            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
            dbContext.Set<DomainFeaturedEvent>().Add(new DomainFeaturedEvent
            {
                DomainId = domain.Id,
                EventId = ev.Id,
                DisplayOrder = 0
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation SetFeatured($input: SetDomainFeaturedEventsInput!) {
              setDomainFeaturedEvents(input: $input) { id }
            }
            """,
            new { input = new { domainId, eventIds = Array.Empty<Guid>() } });

        var events = document.RootElement.GetProperty("data").GetProperty("setDomainFeaturedEvents");
        Assert.Equal(0, events.GetArrayLength());
    }

    // ── featuredEventsForDomain query ─────────────────────────────────────────

    [Fact]
    public async Task FeaturedEventsForDomain_ReturnsFeaturedPublishedEventsInOrder()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("feat-query@example.com", "Featured Query User");
            var domain = CreateDomain("Query Hub", "query-hub");

            var event1 = CreateEvent("Second Event", "second-event-q", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(10), domain, user);
            var event2 = CreateEvent("First Event", "first-event-q", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, user);

            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.AddRange(event1, event2);

            // Featured order: event2 first, then event1
            dbContext.Set<DomainFeaturedEvent>().AddRange(
                new DomainFeaturedEvent { DomainId = domain.Id, EventId = event2.Id, DisplayOrder = 0 },
                new DomainFeaturedEvent { DomainId = domain.Id, EventId = event1.Id, DisplayOrder = 1 }
            );
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query FeaturedEventsForDomain($domainSlug: String!) {
              featuredEventsForDomain(domainSlug: $domainSlug) { id name }
            }
            """,
            new { domainSlug = "query-hub" });

        var events = document.RootElement.GetProperty("data").GetProperty("featuredEventsForDomain");
        Assert.Equal(2, events.GetArrayLength());
        Assert.Equal("First Event", events[0].GetProperty("name").GetString());
        Assert.Equal("Second Event", events[1].GetProperty("name").GetString());
    }

    [Fact]
    public async Task FeaturedEventsForDomain_EmptyWhenNoFeaturedEvents()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("feat-empty@example.com", "Featured Empty User");
            var domain = CreateDomain("Empty Featured Hub", "empty-featured-hub");

            var ev = CreateEvent("Unfeatured Event", "unfeatured-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, user);

            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query FeaturedEventsForDomain($domainSlug: String!) {
              featuredEventsForDomain(domainSlug: $domainSlug) { id name }
            }
            """,
            new { domainSlug = "empty-featured-hub" });

        var events = document.RootElement.GetProperty("data").GetProperty("featuredEventsForDomain");
        Assert.Equal(0, events.GetArrayLength());
    }

    [Fact]
    public async Task FeaturedEventsForDomain_ExcludesUnpublishedEvents()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("feat-excl@example.com", "Featured Excl User");
            var domain = CreateDomain("Excl Hub", "excl-hub");

            var publishedEvent = CreateEvent("Published Event", "published-feat", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, user);
            var pendingEvent = CreateEvent("Pending Event", "pending-feat", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(8), domain, user, status: EventStatus.PendingApproval);

            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.AddRange(publishedEvent, pendingEvent);

            dbContext.Set<DomainFeaturedEvent>().AddRange(
                new DomainFeaturedEvent { DomainId = domain.Id, EventId = publishedEvent.Id, DisplayOrder = 0 },
                new DomainFeaturedEvent { DomainId = domain.Id, EventId = pendingEvent.Id, DisplayOrder = 1 }
            );
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query FeaturedEventsForDomain($domainSlug: String!) {
              featuredEventsForDomain(domainSlug: $domainSlug) { id name }
            }
            """,
            new { domainSlug = "excl-hub" });

        var events = document.RootElement.GetProperty("data").GetProperty("featuredEventsForDomain");
        Assert.Equal(1, events.GetArrayLength());
        Assert.Equal("Published Event", events[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task FeaturedEventsForDomain_AccessibleWithoutAuthentication()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("feat-noauth@example.com", "Featured No Auth User");
            var domain = CreateDomain("No Auth Hub", "no-auth-hub");
            var ev = CreateEvent("Public Featured Event", "public-featured-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, user);

            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
            dbContext.Set<DomainFeaturedEvent>().Add(
                new DomainFeaturedEvent { DomainId = domain.Id, EventId = ev.Id, DisplayOrder = 0 });
        });

        using var client = factory.CreateClient(); // no auth header

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query FeaturedEventsForDomain($domainSlug: String!) {
              featuredEventsForDomain(domainSlug: $domainSlug) { id name }
            }
            """,
            new { domainSlug = "no-auth-hub" });

        var events = document.RootElement.GetProperty("data").GetProperty("featuredEventsForDomain");
        Assert.Equal(1, events.GetArrayLength());
        Assert.Equal("Public Featured Event", events[0].GetProperty("name").GetString());
    }

    // ── Community group tests ─────────────────────────────────────────────────

    [Fact]
    public async Task CreateCommunityGroup_AuthenticatedUser_CreatesGroupAndBecomesAdmin()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cg-creator@example.com", "Group Creator");
            userId = user.Id;
            dbContext.Users.Add(user);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation CreateGroup($input: CreateCommunityGroupInput!) {
              createCommunityGroup(input: $input) {
                id
                name
                slug
                visibility
                isActive
              }
            }
            """,
            new { input = new { name = "Prague Crypto Circle", slug = "prague-crypto-circle", visibility = "PUBLIC" } });

        var group = document.RootElement.GetProperty("data").GetProperty("createCommunityGroup");
        Assert.Equal("Prague Crypto Circle", group.GetProperty("name").GetString());
        Assert.Equal("prague-crypto-circle", group.GetProperty("slug").GetString());
        Assert.True(group.GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task CreateCommunityGroup_DuplicateSlug_ReturnsSlugTakenError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cg-dup@example.com", "Dup User");
            userId = user.Id;
            dbContext.Users.Add(user);

            dbContext.CommunityGroups.Add(new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Existing Group",
                Slug = "existing-group",
                CreatedByUserId = user.Id,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation CreateGroup($input: CreateCommunityGroupInput!) {
                  createCommunityGroup(input: $input) { id }
                }
                """,
            variables = new { input = new { name = "Another Group", slug = "existing-group", visibility = "PUBLIC" } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("SLUG_TAKEN", body);
    }

    [Fact]
    public async Task CreateCommunityGroup_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        using var client = factory.CreateClient(); // no auth

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation CreateGroup($input: CreateCommunityGroupInput!) {
                  createCommunityGroup(input: $input) { id }
                }
                """,
            variables = new { input = new { name = "Unauth Group", slug = "unauth-group", visibility = "PUBLIC" } }
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
    public async Task JoinCommunityGroup_PublicGroup_CreatesActiveMembership()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid creatorId = Guid.Empty;
        Guid joinerId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var creator = CreateUser("cg-creator2@example.com", "Creator");
            var joiner = CreateUser("cg-joiner@example.com", "Joiner");
            creatorId = creator.Id;
            joinerId = joiner.Id;
            dbContext.Users.AddRange(creator, joiner);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Open Group",
                Slug = "open-group",
                Visibility = EventsApi.Data.Entities.CommunityVisibility.Public,
                CreatedByUserId = creator.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = creator.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, joinerId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation JoinGroup($groupId: UUID!) {
              joinCommunityGroup(groupId: $groupId) {
                id
                status
                role
              }
            }
            """,
            new { groupId });

        var membership = document.RootElement.GetProperty("data").GetProperty("joinCommunityGroup");
        Assert.Equal("ACTIVE", membership.GetProperty("status").GetString());
        Assert.Equal("MEMBER", membership.GetProperty("role").GetString());
    }

    [Fact]
    public async Task JoinCommunityGroup_PrivateGroup_ReturnsForbiddenError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid joinerId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var creator = CreateUser("cg-priv-creator@example.com", "PrivCreator");
            var joiner = CreateUser("cg-priv-joiner@example.com", "PrivJoiner");
            joinerId = joiner.Id;
            dbContext.Users.AddRange(creator, joiner);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Private Group",
                Slug = "private-group",
                Visibility = EventsApi.Data.Entities.CommunityVisibility.Private,
                CreatedByUserId = creator.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, joinerId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation JoinGroup($groupId: UUID!) {
                  joinCommunityGroup(groupId: $groupId) { id }
                }
                """,
            variables = new { groupId }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("GROUP_PRIVATE", body);
    }

    [Fact]
    public async Task RequestCommunityMembership_PrivateGroup_CreatesPendingMembership()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid requesterId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var creator = CreateUser("cg-req-creator@example.com", "ReqCreator");
            var requester = CreateUser("cg-requester@example.com", "Requester");
            requesterId = requester.Id;
            dbContext.Users.AddRange(creator, requester);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Secret Group",
                Slug = "secret-group",
                Visibility = EventsApi.Data.Entities.CommunityVisibility.Private,
                CreatedByUserId = creator.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, requesterId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation Request($groupId: UUID!) {
              requestCommunityMembership(groupId: $groupId) {
                id
                status
                role
              }
            }
            """,
            new { groupId });

        var membership = document.RootElement.GetProperty("data").GetProperty("requestCommunityMembership");
        Assert.Equal("PENDING", membership.GetProperty("status").GetString());
        Assert.Equal("MEMBER", membership.GetProperty("role").GetString());
    }

    [Fact]
    public async Task ReviewMembershipRequest_ApproveByAdmin_UpdatesStatusToActive()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid membershipId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-review-admin@example.com", "ReviewAdmin");
            var requester = CreateUser("cg-review-requester@example.com", "ReviewRequester");
            adminId = admin.Id;
            dbContext.Users.AddRange(admin, requester);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Review Group",
                Slug = "review-group",
                Visibility = EventsApi.Data.Entities.CommunityVisibility.Private,
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var pendingMembership = new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = requester.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Pending,
            };
            membershipId = pendingMembership.Id;
            dbContext.CommunityMemberships.Add(pendingMembership);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation Review($membershipId: UUID!, $input: ReviewMembershipRequestInput!) {
              reviewMembershipRequest(membershipId: $membershipId, input: $input) {
                id
                status
              }
            }
            """,
            new { membershipId, input = new { approve = true } });

        var membership = document.RootElement.GetProperty("data").GetProperty("reviewMembershipRequest");
        Assert.Equal("ACTIVE", membership.GetProperty("status").GetString());
    }

    [Fact]
    public async Task ReviewMembershipRequest_RejectByAdmin_UpdatesStatusToRejected()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid membershipId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-reject-admin@example.com", "RejectAdmin");
            var requester = CreateUser("cg-reject-requester@example.com", "RejectRequester");
            adminId = admin.Id;
            dbContext.Users.AddRange(admin, requester);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Reject Group",
                Slug = "reject-group",
                Visibility = EventsApi.Data.Entities.CommunityVisibility.Private,
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var pendingMembership = new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = requester.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Pending,
            };
            membershipId = pendingMembership.Id;
            dbContext.CommunityMemberships.Add(pendingMembership);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation Review($membershipId: UUID!, $input: ReviewMembershipRequestInput!) {
              reviewMembershipRequest(membershipId: $membershipId, input: $input) {
                id
                status
              }
            }
            """,
            new { membershipId, input = new { approve = false } });

        var membership = document.RootElement.GetProperty("data").GetProperty("reviewMembershipRequest");
        Assert.Equal("REJECTED", membership.GetProperty("status").GetString());
    }

    [Fact]
    public async Task ReviewMembershipRequest_NonAdmin_ReturnsForbiddenError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid nonAdminId = Guid.Empty;
        Guid membershipId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-nonrev-admin@example.com", "NonRevAdmin");
            var requester = CreateUser("cg-nonrev-req@example.com", "NonRevReq");
            var nonAdmin = CreateUser("cg-nonrev-user@example.com", "NonRevUser");
            nonAdminId = nonAdmin.Id;
            dbContext.Users.AddRange(admin, requester, nonAdmin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "NonRev Group",
                Slug = "nonrev-group",
                Visibility = EventsApi.Data.Entities.CommunityVisibility.Private,
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.AddRange(
                new EventsApi.Data.Entities.CommunityMembership
                {
                    GroupId = group.Id,
                    UserId = admin.Id,
                    Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                    Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
                },
                new EventsApi.Data.Entities.CommunityMembership
                {
                    GroupId = group.Id,
                    UserId = nonAdmin.Id,
                    Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                    Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
                });

            var pendingMembership = new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = requester.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Pending,
            };
            membershipId = pendingMembership.Id;
            dbContext.CommunityMemberships.Add(pendingMembership);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, nonAdminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation Review($membershipId: UUID!, $input: ReviewMembershipRequestInput!) {
                  reviewMembershipRequest(membershipId: $membershipId, input: $input) { id }
                }
                """,
            variables = new { membershipId, input = new { approve = true } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("FORBIDDEN", body);
    }

    [Fact]
    public async Task AssignMemberRole_PromotesToEventManager_SucceedsForAdmin()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid membershipId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-role-admin@example.com", "RoleAdmin");
            var member = CreateUser("cg-role-member@example.com", "RoleMember");
            adminId = admin.Id;
            dbContext.Users.AddRange(admin, member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Role Group",
                Slug = "role-group",
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var memberMembership = new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = member.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            };
            membershipId = memberMembership.Id;
            dbContext.CommunityMemberships.Add(memberMembership);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation AssignRole($membershipId: UUID!, $role: CommunityMemberRole!) {
              assignMemberRole(membershipId: $membershipId, role: $role) {
                id
                role
              }
            }
            """,
            new { membershipId, role = "EVENT_MANAGER" });

        var membership = document.RootElement.GetProperty("data").GetProperty("assignMemberRole");
        Assert.Equal("EVENT_MANAGER", membership.GetProperty("role").GetString());
    }

    [Fact]
    public async Task AssignMemberRole_DemoteLastAdmin_ReturnsLastAdminError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid adminMembershipId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-lastadmin@example.com", "LastAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Last Admin Group",
                Slug = "last-admin-group",
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var adminMembership = new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            };
            adminMembershipId = adminMembership.Id;
            dbContext.CommunityMemberships.Add(adminMembership);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation AssignRole($membershipId: UUID!, $role: CommunityMemberRole!) {
                  assignMemberRole(membershipId: $membershipId, role: $role) { id }
                }
                """,
            variables = new { membershipId = adminMembershipId, role = "MEMBER" }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("LAST_ADMIN", body);
    }

    [Fact]
    public async Task CommunityGroupsQuery_ReturnsPublicGroups_WithoutAuthentication()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cg-list@example.com", "ListUser");
            dbContext.Users.Add(user);

            dbContext.CommunityGroups.AddRange(
                new EventsApi.Data.Entities.CommunityGroup { Name = "Public Alpha", Slug = "public-alpha", Visibility = EventsApi.Data.Entities.CommunityVisibility.Public, CreatedByUserId = user.Id },
                new EventsApi.Data.Entities.CommunityGroup { Name = "Public Beta", Slug = "public-beta", Visibility = EventsApi.Data.Entities.CommunityVisibility.Public, CreatedByUserId = user.Id },
                new EventsApi.Data.Entities.CommunityGroup { Name = "Private Gamma", Slug = "private-gamma", Visibility = EventsApi.Data.Entities.CommunityVisibility.Private, CreatedByUserId = user.Id }
            );
        });

        using var client = factory.CreateClient(); // no auth

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query {
              communityGroups {
                name
                visibility
              }
            }
            """);

        var groups = document.RootElement.GetProperty("data").GetProperty("communityGroups");
        var names = groups.EnumerateArray().Select(g => g.GetProperty("name").GetString()!).OrderBy(n => n).ToArray();
        // Private group should NOT appear for unauthenticated caller
        Assert.Equal(new[] { "Public Alpha", "Public Beta" }, names);
    }

    [Fact]
    public async Task CommunityGroupBySlug_PublicGroup_AccessibleWithoutAuthentication()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cg-slug@example.com", "SlugUser");
            dbContext.Users.Add(user);
            dbContext.CommunityGroups.Add(new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Slug Group",
                Slug = "slug-group",
                Summary = "A group about slugs.",
                Visibility = EventsApi.Data.Entities.CommunityVisibility.Public,
                CreatedByUserId = user.Id,
            });
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query GetGroup($slug: String!) {
              communityGroupBySlug(slug: $slug) {
                group { name slug summary }
                memberCount
              }
            }
            """,
            new { slug = "slug-group" });

        var detail = document.RootElement.GetProperty("data").GetProperty("communityGroupBySlug");
        Assert.False(detail.ValueKind == JsonValueKind.Null);
        Assert.Equal("Slug Group", detail.GetProperty("group").GetProperty("name").GetString());
        Assert.Equal(0, detail.GetProperty("memberCount").GetInt32());
    }

    [Fact]
    public async Task CommunityGroupBySlug_PrivateGroup_ReturnsNullForUnauthenticated()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cg-priv-slug@example.com", "PrivSlugUser");
            dbContext.Users.Add(user);
            dbContext.CommunityGroups.Add(new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Private Slug Group",
                Slug = "private-slug-group",
                Visibility = EventsApi.Data.Entities.CommunityVisibility.Private,
                CreatedByUserId = user.Id,
            });
        });

        using var client = factory.CreateClient(); // no auth

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query GetGroup($slug: String!) {
              communityGroupBySlug(slug: $slug) {
                group { name }
              }
            }
            """,
            new { slug = "private-slug-group" });

        var detail = document.RootElement.GetProperty("data").GetProperty("communityGroupBySlug");
        Assert.Equal(JsonValueKind.Null, detail.ValueKind);
    }

    [Fact]
    public async Task CommunityGroupBySlug_NonExistentSlug_ReturnsNull()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, _ => { });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query GetGroup($slug: String!) {
              communityGroupBySlug(slug: $slug) {
                group { name }
              }
            }
            """,
            new { slug = "does-not-exist" });

        var detail = document.RootElement.GetProperty("data").GetProperty("communityGroupBySlug");
        Assert.Equal(JsonValueKind.Null, detail.ValueKind);
    }

    [Fact]
    public async Task AssociateEventWithGroup_ByEventOwnerGroupAdmin_Succeeds()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid ownerId = Guid.Empty;
        Guid groupId = Guid.Empty;
        Guid eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("cg-assoc@example.com", "AssocOwner");
            ownerId = owner.Id;
            dbContext.Users.Add(owner);

            var domain = CreateDomain("Tech", "tech-assoc");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Assoc Group",
                Slug = "assoc-group",
                CreatedByUserId = owner.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = owner.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var catalogEvent = CreateEvent("Tech Conference", "tech-conference-assoc", "Great conference",
                "Venue", "Prague", DateTime.UtcNow.AddDays(30), domain, owner);
            eventId = catalogEvent.Id;
            dbContext.Events.Add(catalogEvent);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, ownerId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation Associate($input: CommunityGroupEventInput!) {
              associateEventWithGroup(input: $input) {
                id
                groupId
                eventId
              }
            }
            """,
            new { input = new { groupId, eventId } });

        var link = document.RootElement.GetProperty("data").GetProperty("associateEventWithGroup");
        Assert.Equal(groupId.ToString(), link.GetProperty("groupId").GetString());
        Assert.Equal(eventId.ToString(), link.GetProperty("eventId").GetString());
    }

    [Fact]
    public async Task MyCommunityMemberships_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, _ => { });

        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                query {
                  myCommunityMemberships {
                    id
                    status
                  }
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

    // ── External source claim tests ───────────────────────────────────────────

    [Fact]
    public async Task AddExternalSourceClaim_ByGroupAdmin_CreatesClaimInPendingReview()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("esc-admin@example.com", "ESC Admin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "ESC Group",
                Slug = "esc-group",
                CreatedByUserId = admin.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation AddClaim($groupId: UUID!, $input: AddExternalSourceClaimInput!) {
              addExternalSourceClaim(groupId: $groupId, input: $input) {
                id
                groupId
                sourceType
                sourceUrl
                sourceIdentifier
                status
              }
            }
            """,
            new
            {
                groupId,
                input = new
                {
                    sourceType = "MEETUP",
                    sourceUrl = "https://www.meetup.com/my-test-group"
                }
            });

        var claim = doc.RootElement.GetProperty("data").GetProperty("addExternalSourceClaim");
        Assert.Equal(groupId.ToString(), claim.GetProperty("groupId").GetString());
        Assert.Equal("MEETUP", claim.GetProperty("sourceType").GetString());
        Assert.Equal("https://www.meetup.com/my-test-group", claim.GetProperty("sourceUrl").GetString());
        Assert.Equal("my-test-group", claim.GetProperty("sourceIdentifier").GetString());
        Assert.Equal("PENDING_REVIEW", claim.GetProperty("status").GetString());
    }

    [Fact]
    public async Task AddExternalSourceClaim_InvalidMeetupUrl_ReturnsValidationError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("esc-invalid@example.com", "ESC Invalid");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "ESC Invalid Group",
                Slug = "esc-invalid-group",
                CreatedByUserId = admin.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation AddClaim($groupId: UUID!, $input: AddExternalSourceClaimInput!) {
                  addExternalSourceClaim(groupId: $groupId, input: $input) {
                    id
                    status
                  }
                }
                """,
            variables = new
            {
                groupId,
                input = new
                {
                    sourceType = "MEETUP",
                    sourceUrl = "https://www.notsupportedsite.com/my-group"
                }
            }
        });

        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors),
            $"Expected validation error but got no errors. Response: {doc.RootElement}");
        Assert.Contains("INVALID_SOURCE_URL", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AddExternalSourceClaim_NonAdminMember_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid memberId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("esc-adm@example.com", "ESC Adm");
            adminId = admin.Id;
            var member = CreateUser("esc-member@example.com", "ESC Member");
            memberId = member.Id;
            dbContext.Users.AddRange(admin, member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "ESC Auth Group",
                Slug = "esc-auth-group",
                CreatedByUserId = admin.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.AddRange(
                new EventsApi.Data.Entities.CommunityMembership
                {
                    GroupId = group.Id, UserId = admin.Id,
                    Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                    Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
                },
                new EventsApi.Data.Entities.CommunityMembership
                {
                    GroupId = group.Id, UserId = member.Id,
                    Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                    Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
                }
            );
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, memberId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation AddClaim($groupId: UUID!, $input: AddExternalSourceClaimInput!) {
                  addExternalSourceClaim(groupId: $groupId, input: $input) { id }
                }
                """,
            variables = new
            {
                groupId,
                input = new
                {
                    sourceType = "LUMA",
                    sourceUrl = "https://lu.ma/my-calendar"
                }
            }
        });

        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors),
            $"Expected FORBIDDEN but no errors returned. Response: {doc.RootElement}");
        Assert.Contains("FORBIDDEN", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AddExternalSourceClaim_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var groupId = Guid.NewGuid();
        await SeedAsync(factory, _ => { });

        using var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation AddClaim($groupId: UUID!, $input: AddExternalSourceClaimInput!) {
                  addExternalSourceClaim(groupId: $groupId, input: $input) { id }
                }
                """,
            variables = new
            {
                groupId,
                input = new { sourceType = "MEETUP", sourceUrl = "https://www.meetup.com/test" }
            }
        });

        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors));
        var errStr = errors.ToString();
        Assert.True(
            errStr.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase)
            || errStr.Contains("not authorized", StringComparison.OrdinalIgnoreCase)
            || errStr.Contains("unauthorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error but got: {errStr}");
    }

    [Fact]
    public async Task AddExternalSourceClaim_DuplicateClaim_ReturnsDuplicateError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("esc-dup@example.com", "ESC Dup");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "ESC Dup Group",
                Slug = "esc-dup-group",
                CreatedByUserId = admin.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            // Pre-existing claim
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/dup-group",
                SourceIdentifier = "dup-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview,
                CreatedByUserId = admin.Id,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation AddClaim($groupId: UUID!, $input: AddExternalSourceClaimInput!) {
                  addExternalSourceClaim(groupId: $groupId, input: $input) { id }
                }
                """,
            variables = new
            {
                groupId,
                input = new
                {
                    sourceType = "MEETUP",
                    sourceUrl = "https://www.meetup.com/dup-group"
                }
            }
        });

        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors),
            $"Expected DUPLICATE_CLAIM error but none returned. Response: {doc.RootElement}");
        Assert.Contains("DUPLICATE_CLAIM", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RemoveExternalSourceClaim_ByGroupAdmin_RemovesClaim()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("esc-rm@example.com", "ESC Rm");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "ESC Remove Group",
                Slug = "esc-remove-group",
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Luma,
                SourceUrl = "https://lu.ma/remove-test",
                SourceIdentifier = "remove-test",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview,
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation RemoveClaim($claimId: UUID!) {
              removeExternalSourceClaim(claimId: $claimId)
            }
            """,
            new { claimId });

        var result = doc.RootElement.GetProperty("data").GetProperty("removeExternalSourceClaim").GetBoolean();
        Assert.True(result);
    }

    [Fact]
    public async Task TriggerExternalSync_UnverifiedClaim_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("esc-sync@example.com", "ESC Sync");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "ESC Sync Group",
                Slug = "esc-sync-group",
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/sync-group",
                SourceIdentifier = "sync-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview, // NOT verified
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation Sync($claimId: UUID!) {
                  triggerExternalSync(claimId: $claimId) {
                    importedCount
                    skippedCount
                    errorCount
                    summary
                  }
                }
                """,
            variables = new { claimId }
        });

        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors),
            $"Expected CLAIM_NOT_VERIFIED error but none returned. Response: {doc.RootElement}");
        Assert.Contains("CLAIM_NOT_VERIFIED", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task TriggerExternalSync_VerifiedClaim_ReturnsZeroCountsForStubAdapter()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("esc-vsync@example.com", "ESC VSync");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = CreateDomain("Tech", "tech-esc");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "ESC VSync Group",
                Slug = "esc-vsync-group",
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/vsync-group",
                SourceIdentifier = "vsync-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified, // verified
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation Sync($claimId: UUID!) {
              triggerExternalSync(claimId: $claimId) {
                importedCount
                skippedCount
                errorCount
                summary
              }
            }
            """,
            new { claimId });

        var result = doc.RootElement.GetProperty("data").GetProperty("triggerExternalSync");
        Assert.Equal(0, result.GetProperty("importedCount").GetInt32());
        Assert.Equal(0, result.GetProperty("skippedCount").GetInt32());
        Assert.Equal(0, result.GetProperty("errorCount").GetInt32());
        // Summary should mention "0 events" or "Imported 0 events"
        var summary = result.GetProperty("summary").GetString();
        Assert.NotEmpty(summary ?? "");
    }

    [Fact]
    public async Task GroupExternalSources_ByGroupAdmin_ReturnsClaims()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("esc-list@example.com", "ESC List");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "ESC List Group",
                Slug = "esc-list-group",
                CreatedByUserId = admin.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(
                new EventsApi.Data.Entities.ExternalSourceClaim
                {
                    GroupId = group.Id,
                    SourceType = EventsApi.Data.Entities.ExternalSourceType.Luma,
                    SourceUrl = "https://lu.ma/list-cal",
                    SourceIdentifier = "list-cal",
                    Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                    CreatedByUserId = admin.Id,
                });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            query GetSources($groupId: UUID!) {
              groupExternalSources(groupId: $groupId) {
                id
                sourceType
                sourceUrl
                sourceIdentifier
                status
              }
            }
            """,
            new { groupId });

        var sources = doc.RootElement.GetProperty("data").GetProperty("groupExternalSources").EnumerateArray().ToArray();
        Assert.Single(sources);
        Assert.Equal("LUMA", sources[0].GetProperty("sourceType").GetString());
        Assert.Equal("https://lu.ma/list-cal", sources[0].GetProperty("sourceUrl").GetString());
        Assert.Equal("VERIFIED", sources[0].GetProperty("status").GetString());
    }

    [Fact]
    public async Task GroupExternalSources_NonAdmin_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid memberId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("esc-ga-adm@example.com", "ESC GA Admin");
            var member = CreateUser("esc-ga-member@example.com", "ESC GA Member");
            memberId = member.Id;
            dbContext.Users.AddRange(admin, member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "ESC GA Group",
                Slug = "esc-ga-group",
                CreatedByUserId = admin.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.AddRange(
                new EventsApi.Data.Entities.CommunityMembership
                {
                    GroupId = group.Id, UserId = admin.Id,
                    Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                    Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
                },
                new EventsApi.Data.Entities.CommunityMembership
                {
                    GroupId = group.Id, UserId = member.Id,
                    Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                    Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
                }
            );
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, memberId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                query GetSources($groupId: UUID!) {
                  groupExternalSources(groupId: $groupId) { id sourceUrl }
                }
                """,
            variables = new { groupId }
        });

        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors),
            $"Expected FORBIDDEN but none returned. Response: {doc.RootElement}");
        Assert.Contains("FORBIDDEN", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }
}
