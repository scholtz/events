using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using EventsApi;
using EventsApi.Data;
using EventsApi.Data.Entities;
using EventsApi.Security;
using EventsApi.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;

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
    public async Task EventsQuery_UpcomingSort_PrioritizesFutureEventsOverPastEvents()
    {
        // Verifies that the default UPCOMING sort places future events before past events,
        // with future events ordered by nearest start date first and past events afterwards.
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("ranking@example.com", "Ranking Tester");
            var tech = CreateDomain("Tech", "tech");
            var now = DateTime.UtcNow;

            dbContext.Users.Add(user);
            dbContext.Domains.Add(tech);
            dbContext.Events.AddRange(
                // Past events
                CreateEvent(
                    "Old Summit",
                    "old-summit",
                    "A past event.",
                    "Venue A",
                    "Prague",
                    now.AddDays(-20),
                    tech,
                    user),
                CreateEvent(
                    "Recent Meetup",
                    "recent-meetup",
                    "A more recent past event.",
                    "Venue B",
                    "Prague",
                    now.AddDays(-3),
                    tech,
                    user),
                // Upcoming events
                CreateEvent(
                    "Next Week Conference",
                    "next-week-conference",
                    "An upcoming event next week.",
                    "Venue C",
                    "Prague",
                    now.AddDays(7),
                    tech,
                    user),
                CreateEvent(
                    "Tomorrow Workshop",
                    "tomorrow-workshop",
                    "An event happening tomorrow.",
                    "Venue D",
                    "Prague",
                    now.AddDays(1),
                    tech,
                    user));
        });

        using var client = factory.CreateClient();

        using var result = await ExecuteGraphQlAsync(
            client,
            """
            query Events($filter: EventFilterInput) {
              events(filter: $filter) { name }
            }
            """,
            new { filter = new { sortBy = "UPCOMING" } });

        var names = GetEventNames(result);

        // Upcoming events must appear before past events
        Assert.Equal(["Tomorrow Workshop", "Next Week Conference", "Old Summit", "Recent Meetup"],
            names);
    }

    [Fact]
    public async Task EventsQuery_UpcomingSort_SparseCategoryShowsAllEventsUpcomingFirst()
    {
        // Verifies deterministic ordering for a sparse category with one upcoming and one past event.
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("sparse@example.com", "Sparse User");
            var ai = CreateDomain("AI", "ai");
            var now = DateTime.UtcNow;

            dbContext.Users.Add(user);
            dbContext.Domains.Add(ai);
            dbContext.Events.AddRange(
                CreateEvent(
                    "Future AI Talk",
                    "future-ai-talk",
                    "Upcoming AI presentation.",
                    "Lab X",
                    "Bratislava",
                    now.AddDays(5),
                    ai,
                    user),
                CreateEvent(
                    "Past AI Hack",
                    "past-ai-hack",
                    "Concluded hackathon.",
                    "Lab Y",
                    "Bratislava",
                    now.AddDays(-5),
                    ai,
                    user));
        });

        using var client = factory.CreateClient();

        var names = await QueryEventNamesAsync(client, new { domainSlug = "ai", sortBy = "UPCOMING" });

        // Upcoming event must appear first, even in a sparse result set
        Assert.Equal(["Future AI Talk", "Past AI Hack"], names);
    }

    [Fact]
    public async Task EventsQuery_RelevanceSort_PrioritizesUpcomingOverPastWithinSameTier()
    {
        // Within the same keyword-match tier, upcoming events should appear before past events.
        // Previously the final tiebreaker was purely ascending StartsAtUtc, which meant a past
        // event with a date far in the past could sort before an upcoming event. The fix adds an
        // explicit upcoming-before-past step before the date sort.
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("relevance-order@example.com", "Relevance Tester");
            var tech = CreateDomain("Tech", "tech");
            var now = DateTime.UtcNow;

            dbContext.Users.Add(user);
            dbContext.Domains.Add(tech);
            dbContext.Events.AddRange(
                // Both events start with "blockchain" → same highest relevance tier
                CreateEvent(
                    "Blockchain Summit Past",
                    "blockchain-summit-past",
                    "Past blockchain event.",
                    "Old Venue",
                    "Prague",
                    now.AddDays(-14),
                    tech,
                    user),
                CreateEvent(
                    "Blockchain Summit Upcoming",
                    "blockchain-summit-upcoming",
                    "Upcoming blockchain event.",
                    "New Venue",
                    "Prague",
                    now.AddDays(14),
                    tech,
                    user));
        });

        using var client = factory.CreateClient();

        var names = await QueryEventNamesAsync(
            client,
            new { searchText = "blockchain", sortBy = "RELEVANCE" });

        // Within the same name-prefix match tier, upcoming event must appear before past event
        Assert.Equal(["Blockchain Summit Upcoming", "Blockchain Summit Past"], names);
    }

    [Fact]
    public async Task EventsQuery_UpcomingSort_ScheduleCompletenessBreaksTiesAtSameStartDate()
    {
        // When two events start at the same time, the event with more complete schedule data
        // (city, venue, end date, event URL) should rank higher than an incomplete event.
        await using var factory = new EventsApiWebApplicationFactory();
        var sameStartTime = DateTime.UtcNow.AddDays(7);
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("completeness@example.com", "Completeness Tester");
            var tech = CreateDomain("Tech", "tech");

            dbContext.Users.Add(user);
            dbContext.Domains.Add(tech);

            // Complete event: city, venueName, endsAtUtc, eventUrl all set (via CreateEvent defaults)
            var complete = CreateEvent(
                "Complete Event",
                "complete-event",
                "This event has all location and schedule fields filled in.",
                "Full Venue",
                "Prague",
                sameStartTime,
                tech,
                user);

            // Incomplete event: explicitly clear city, venueName, and eventUrl
            var incomplete = CreateEvent(
                "Incomplete Event",
                "incomplete-event",
                "Minimal event with no location detail.",
                "Full Venue", // will be cleared below
                "Prague",     // will be cleared below
                sameStartTime,
                tech,
                user);
            incomplete.City = string.Empty;
            incomplete.VenueName = string.Empty;
            incomplete.EventUrl = string.Empty;

            dbContext.Events.AddRange(complete, incomplete);
        });

        using var client = factory.CreateClient();

        var names = await QueryEventNamesAsync(client, new { sortBy = "UPCOMING" });

        // Complete event must appear before incomplete event when start times are identical
        Assert.Equal(["Complete Event", "Incomplete Event"], names);
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

    [Fact]
    public async Task MyDashboard_CalendarAnalytics_Unauthenticated_ReturnsAuthError()
    {
        // myDashboard (including calendar analytics) must be protected — unauthenticated
        // requests must receive AUTH_NOT_AUTHORIZED, not empty data.
        await using var factory = new EventsApiWebApplicationFactory();

        using var client = factory.CreateClient();
        // No Authorization header set — anonymous request

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                query MyDashboard {
                  myDashboard {
                    totalCalendarActions
                    eventAnalytics { eventName totalCalendarActions }
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
            $"Expected auth error for unauthenticated calendar analytics access but got: {errorMessage}");
    }

    [Fact]
    public async Task TrackCalendarAction_NoPersonalDataStored_PrivacySafe()
    {
        // Verifies the aggregate-only privacy guarantee: the stored CalendarAnalyticsAction
        // contains no user identity (no user ID, email, or display name).
        await using var factory = new EventsApiWebApplicationFactory();
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("privacy-check@example.com", "Privacy Check User");
            var domain = CreateDomain("Tech", "privacy-check-tech");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            var ev = CreateEvent("Privacy Event", "privacy-event-cal", "Description.",
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
            variables = new { input = new { eventId, provider = "ICS" } }
        });

        response.EnsureSuccessStatusCode();
        var rawJson = await response.Content.ReadAsStringAsync();

        // The response must not leak any attendee identity fields
        Assert.DoesNotContain("privacy-check@example.com", rawJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Privacy Check User", rawJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("userId", rawJson, StringComparison.OrdinalIgnoreCase);

        // The stored action itself must have no user identity
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var action = Assert.Single(db.CalendarAnalyticsActions.Where(a => a.EventId == eventId));
        Assert.Equal(eventId, action.EventId);
        Assert.Equal("ICS", action.Provider);
        Assert.NotEqual(Guid.Empty, action.Id);
        // CalendarAnalyticsAction has no UserId property — confirm by checking the entity fields
        var actionType = action.GetType();
        Assert.Null(actionType.GetProperty("UserId"));
        Assert.Null(actionType.GetProperty("UserEmail"));
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

    [Fact]
    public async Task MyDashboard_EventAnalytics_PublishedAtUtc_IsReturnedForPublishedEvents()
    {
        // Arrange: one published event (has publishedAtUtc) and one draft event (null publishedAtUtc)
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var publishedEventId = Guid.Empty;
        var draftEventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("published-at@example.com", "Published At User");
            userId = user.Id;
            var domain = CreateDomain("Tech", "tech-pub-at");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);

            var publishedEv = CreateEvent("Published Event", "pub-at-event", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user, status: EventStatus.Published);
            publishedEventId = publishedEv.Id;

            var draftEv = CreateEvent("Draft Event", "draft-at-event", "Description.",
                "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, user, status: EventStatus.Draft);
            draftEventId = draftEv.Id;

            dbContext.Events.AddRange(publishedEv, draftEv);
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
                  eventId eventName status publishedAtUtc
                }
              }
            }
            """);

        var analytics = document.RootElement
            .GetProperty("data").GetProperty("myDashboard")
            .GetProperty("eventAnalytics").EnumerateArray().ToList();

        Assert.Equal(2, analytics.Count);

        var publishedItem = analytics.Single(a => a.GetProperty("eventName").GetString() == "Published Event");
        Assert.Equal("PUBLISHED", publishedItem.GetProperty("status").GetString());
        // publishedAtUtc must be a non-null, parseable UTC timestamp
        var publishedAtStr = publishedItem.GetProperty("publishedAtUtc").GetString();
        Assert.NotNull(publishedAtStr);
        Assert.True(DateTime.TryParse(publishedAtStr, out _), "publishedAtUtc should be a valid date-time string");

        var draftItem = analytics.Single(a => a.GetProperty("eventName").GetString() == "Draft Event");
        Assert.Equal("DRAFT", draftItem.GetProperty("status").GetString());
        // Draft events have no publishedAtUtc
        Assert.True(
            draftItem.GetProperty("publishedAtUtc").ValueKind == System.Text.Json.JsonValueKind.Null,
            "publishedAtUtc should be null for draft events");
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
    public async Task UpdateDomainStyle_InvalidLogoUrl_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("logourl@example.com", "Logo URL Tester");
            var domain = CreateDomain("Crypto", "crypto-logo-url-test");

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
            variables = new { input = new { domainId, logoUrl = "not-a-url" } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("INVALID_LOGO_URL", body);
    }

    [Fact]
    public async Task UpdateDomainStyle_InvalidBannerUrl_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("bannerurl@example.com", "Banner URL Tester");
            var domain = CreateDomain("Crypto", "crypto-banner-url-test");

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
            variables = new { input = new { domainId, bannerUrl = "relative/path/not-absolute" } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("INVALID_BANNER_URL", body);
    }

    [Fact]
    public async Task UpdateDomainStyle_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var domainId = Guid.NewGuid();

        using var client = factory.CreateClient();

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
        Assert.True(
            body.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase) ||
            body.Contains("UNAUTHORIZED", StringComparison.OrdinalIgnoreCase) ||
            body.Contains("not authorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error, got: {body}");
    }

    [Fact]
    public async Task UpdateDomainStyle_NullClearsOptionalFields()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("nullclear@example.com", "Null Clear Tester");
            var domain = CreateDomain("Crypto", "crypto-null-clear");
            domain.PrimaryColor = "#ff0000";
            domain.AccentColor = "#00ff00";
            domain.LogoUrl = "https://example.com/logo.png";
            domain.BannerUrl = "https://example.com/banner.jpg";

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

        // Passing empty strings normalizes to null (NormalizeOptionalValue behavior)
        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateStyle($input: UpdateDomainStyleInput!) {
              updateDomainStyle(input: $input) {
                id primaryColor accentColor logoUrl bannerUrl
              }
            }
            """,
            new { input = new { domainId, primaryColor = "", accentColor = "", logoUrl = "", bannerUrl = "" } });

        var result = document.RootElement.GetProperty("data").GetProperty("updateDomainStyle");
        Assert.True(
            result.GetProperty("primaryColor").ValueKind == System.Text.Json.JsonValueKind.Null
                || result.GetProperty("primaryColor").GetString() == "",
            "primaryColor should be cleared");
        Assert.True(
            result.GetProperty("logoUrl").ValueKind == System.Text.Json.JsonValueKind.Null
                || result.GetProperty("logoUrl").GetString() == "",
            "logoUrl should be cleared");
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

    [Fact]
    public async Task DomainBySlug_ReturnsAllHubBrandingAndOverviewFields()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var domain = CreateDomain("Web3 Hub", "web3-hub-fields");
            domain.PrimaryColor = "#ff6b35";
            domain.AccentColor = "#ffaa00";
            domain.LogoUrl = "https://example.com/web3-logo.png";
            domain.BannerUrl = "https://example.com/web3-banner.jpg";
            domain.Tagline = "Discover the future of decentralised events.";
            domain.OverviewContent = "The premier hub for Web3 events.";
            domain.WhatBelongsHere = "Blockchain, DeFi, and NFT events.";
            domain.SubmitEventCta = "Submit your Web3 event here.";
            domain.CuratorCredit = "Web3 Foundation";
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySlug($slug: String!) {
              domainBySlug(slug: $slug) {
                primaryColor accentColor logoUrl bannerUrl
                tagline overviewContent whatBelongsHere submitEventCta curatorCredit
              }
            }
            """,
            new { slug = "web3-hub-fields" });

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySlug");
        Assert.Equal("#ff6b35", domain.GetProperty("primaryColor").GetString());
        Assert.Equal("#ffaa00", domain.GetProperty("accentColor").GetString());
        Assert.Equal("https://example.com/web3-logo.png", domain.GetProperty("logoUrl").GetString());
        Assert.Equal("https://example.com/web3-banner.jpg", domain.GetProperty("bannerUrl").GetString());
        Assert.Equal("Discover the future of decentralised events.", domain.GetProperty("tagline").GetString());
        Assert.Equal("The premier hub for Web3 events.", domain.GetProperty("overviewContent").GetString());
        Assert.Equal("Blockchain, DeFi, and NFT events.", domain.GetProperty("whatBelongsHere").GetString());
        Assert.Equal("Submit your Web3 event here.", domain.GetProperty("submitEventCta").GetString());
        Assert.Equal("Web3 Foundation", domain.GetProperty("curatorCredit").GetString());
    }

    [Fact]
    public async Task DomainBySlug_ReturnsPublishedEventCount_WithNoEvents()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            dbContext.Domains.Add(CreateDomain("Empty Hub", "empty-hub-count"));
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySlug($slug: String!) {
              domainBySlug(slug: $slug) {
                name publishedEventCount
              }
            }
            """,
            new { slug = "empty-hub-count" });

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySlug");
        Assert.Equal("Empty Hub", domain.GetProperty("name").GetString());
        Assert.Equal(0, domain.GetProperty("publishedEventCount").GetInt32());
    }

    [Fact]
    public async Task DomainBySlug_ReturnsPublishedEventCount_CountsOnlyPublishedEvents()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("counter@example.com", "Counter");
            dbContext.Users.Add(user);
            var domain = CreateDomain("Count Hub", "count-hub-test");
            dbContext.Domains.Add(domain);

            var futureDate = DateTime.UtcNow.AddMonths(3);
            // Two published events in this domain
            dbContext.Events.Add(CreateEvent("Published A", "pub-a", "Desc", "Venue", "Prague", futureDate, domain, user, status: EventStatus.Published));
            dbContext.Events.Add(CreateEvent("Published B", "pub-b", "Desc", "Venue", "Brno", futureDate.AddDays(1), domain, user, status: EventStatus.Published));
            // One pending — must NOT be counted
            dbContext.Events.Add(CreateEvent("Pending C", "pend-c", "Desc", "Venue", "Bratislava", futureDate.AddDays(2), domain, user, status: EventStatus.PendingApproval));
            // One rejected — must NOT be counted
            dbContext.Events.Add(CreateEvent("Rejected D", "rej-d", "Desc", "Venue", "Vienna", futureDate.AddDays(3), domain, user, status: EventStatus.Rejected));
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySlug($slug: String!) {
              domainBySlug(slug: $slug) {
                publishedEventCount
              }
            }
            """,
            new { slug = "count-hub-test" });

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySlug");
        // Only the 2 PUBLISHED events must be counted
        Assert.Equal(2, domain.GetProperty("publishedEventCount").GetInt32());
    }

    [Fact]
    public async Task DomainBySlug_PublishedEventCount_DoesNotIncludeOtherDomainEvents()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("isolation@example.com", "Isolation");
            dbContext.Users.Add(user);
            var domainA = CreateDomain("Domain A", "domain-a-isolation");
            var domainB = CreateDomain("Domain B", "domain-b-isolation");
            dbContext.Domains.AddRange(domainA, domainB);

            var futureDate = DateTime.UtcNow.AddMonths(2);
            // 3 events in domain A
            for (var i = 0; i < 3; i++)
                dbContext.Events.Add(CreateEvent($"A Event {i}", $"a-event-{i}", "Desc", "Venue", "Prague",
                    futureDate.AddDays(i), domainA, user, status: EventStatus.Published));
            // 5 events in domain B
            for (var i = 0; i < 5; i++)
                dbContext.Events.Add(CreateEvent($"B Event {i}", $"b-event-{i}", "Desc", "Venue", "Brno",
                    futureDate.AddDays(i), domainB, user, status: EventStatus.Published));
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySlug($slug: String!) {
              domainBySlug(slug: $slug) {
                publishedEventCount
              }
            }
            """,
            new { slug = "domain-a-isolation" });

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySlug");
        // Domain A has exactly 3; Domain B's 5 must not bleed in
        Assert.Equal(3, domain.GetProperty("publishedEventCount").GetInt32());
    }

    // ── domainBySubdomain query ────────────────────────────────────────────────

    [Fact]
    public async Task DomainBySubdomain_ReturnsBrandingFieldsAndOrderedLinks()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var domain = CreateDomain("Crypto Hub", "crypto-subdomain-hub");
            domain.PrimaryColor = "#7c3aed";
            domain.AccentColor = "#22c55e";
            domain.LogoUrl = "https://example.com/crypto-logo.png";
            domain.BannerUrl = "https://example.com/crypto-banner.jpg";
            domain.OverviewContent = "Curated events for the crypto ecosystem.";
            domain.WhatBelongsHere = "Meetups, hackathons, and conferences about crypto.";
            domain.SubmitEventCta = "List your crypto event";
            domain.CuratorCredit = "Crypto Builders";

            dbContext.Domains.Add(domain);
            dbContext.DomainLinks.AddRange(
                new DomainLink
                {
                    DomainId = domain.Id,
                    Title = "Discord",
                    Url = "https://discord.gg/crypto",
                    DisplayOrder = 1
                },
                new DomainLink
                {
                    DomainId = domain.Id,
                    Title = "Community Site",
                    Url = "https://crypto.example.com",
                    DisplayOrder = 0
                });
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySubdomain($subdomain: String!) {
              domainBySubdomain(subdomain: $subdomain) {
                name
                slug
                subdomain
                primaryColor
                accentColor
                logoUrl
                bannerUrl
                overviewContent
                whatBelongsHere
                submitEventCta
                curatorCredit
                links { title url displayOrder }
              }
            }
            """,
            new { subdomain = "crypto-subdomain-hub" });

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySubdomain");
        Assert.Equal("Crypto Hub", domain.GetProperty("name").GetString());
        Assert.Equal("crypto-subdomain-hub", domain.GetProperty("slug").GetString());
        Assert.Equal("crypto-subdomain-hub", domain.GetProperty("subdomain").GetString());
        Assert.Equal("#7c3aed", domain.GetProperty("primaryColor").GetString());
        Assert.Equal("#22c55e", domain.GetProperty("accentColor").GetString());
        Assert.Equal("https://example.com/crypto-logo.png", domain.GetProperty("logoUrl").GetString());
        Assert.Equal("https://example.com/crypto-banner.jpg", domain.GetProperty("bannerUrl").GetString());
        Assert.Equal("Curated events for the crypto ecosystem.", domain.GetProperty("overviewContent").GetString());
        Assert.Equal("Meetups, hackathons, and conferences about crypto.", domain.GetProperty("whatBelongsHere").GetString());
        Assert.Equal("List your crypto event", domain.GetProperty("submitEventCta").GetString());
        Assert.Equal("Crypto Builders", domain.GetProperty("curatorCredit").GetString());

        var links = domain.GetProperty("links");
        Assert.Equal(2, links.GetArrayLength());
        Assert.Equal("Community Site", links[0].GetProperty("title").GetString());
        Assert.Equal("Discord", links[1].GetProperty("title").GetString());
    }

    [Fact]
    public async Task DomainBySubdomain_ReturnsNullForInactiveDomain()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var inactive = CreateDomain("Inactive Subdomain", "inactive-subdomain");
            inactive.IsActive = false;
            dbContext.Domains.Add(inactive);
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySubdomain($subdomain: String!) {
              domainBySubdomain(subdomain: $subdomain) {
                id
              }
            }
            """,
            new { subdomain = "inactive-subdomain" });

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySubdomain");
        Assert.Equal(JsonValueKind.Null, domain.ValueKind);
    }

    [Fact]
    public async Task DomainBySubdomain_IsCaseInsensitiveAndTrimsWhitespace()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            dbContext.Domains.Add(CreateDomain("AI Europe", "ai-europe"));
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySubdomain($subdomain: String!) {
              domainBySubdomain(subdomain: $subdomain) {
                name
                subdomain
              }
            }
            """,
            new { subdomain = "  AI-EUROPE  " });

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySubdomain");
        Assert.Equal("AI Europe", domain.GetProperty("name").GetString());
        Assert.Equal("ai-europe", domain.GetProperty("subdomain").GetString());
    }

    [Fact]
    public async Task DomainBySubdomain_IsAccessibleWithoutAuthentication()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            dbContext.Domains.Add(CreateDomain("Public Hub", "public-subdomain-hub"));
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySubdomain($subdomain: String!) {
              domainBySubdomain(subdomain: $subdomain) {
                name
              }
            }
            """,
            new { subdomain = "public-subdomain-hub" });

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySubdomain");
        Assert.Equal("Public Hub", domain.GetProperty("name").GetString());
    }

    // ── SetDomainLinks / community links tests ──────────────────────────────

    [Fact]
    public async Task SetDomainLinks_GlobalAdmin_PersistsLinksInOrder()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var adminId = Guid.Empty;
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("links-admin@example.com", "Links Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Links Hub", "links-hub-test");
            domainId = domain.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation SetDomainLinks($input: SetDomainLinksInput!) {
              setDomainLinks(input: $input) {
                title
                url
                displayOrder
              }
            }
            """,
            new
            {
                input = new
                {
                    domainId,
                    links = new[]
                    {
                        new { title = "Community Website", url = "https://example.com" },
                        new { title = "Join our Discord", url = "https://discord.gg/example" },
                    }
                }
            });

        var links = document.RootElement.GetProperty("data").GetProperty("setDomainLinks");
        Assert.Equal(2, links.GetArrayLength());
        Assert.Equal("Community Website", links[0].GetProperty("title").GetString());
        Assert.Equal("https://example.com", links[0].GetProperty("url").GetString());
        Assert.Equal(0, links[0].GetProperty("displayOrder").GetInt32());
        Assert.Equal("Join our Discord", links[1].GetProperty("title").GetString());
        Assert.Equal(1, links[1].GetProperty("displayOrder").GetInt32());
    }

    [Fact]
    public async Task SetDomainLinks_DomainAdmin_Allowed()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var domainAdminId = Guid.Empty;
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("global-admin-links@example.com", "Global Admin", ApplicationUserRole.Admin);
            var domainAdmin = CreateUser("domain-admin-links@example.com", "Domain Admin");
            domainAdminId = domainAdmin.Id;
            var domain = CreateDomain("DA Links Hub", "da-links-hub");
            domainId = domain.Id;
            dbContext.Users.AddRange(admin, domainAdmin);
            dbContext.Domains.Add(domain);
            dbContext.DomainAdministrators.Add(new DomainAdministrator { DomainId = domain.Id, UserId = domainAdmin.Id });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, domainAdminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation SetDomainLinks($input: SetDomainLinksInput!) {
              setDomainLinks(input: $input) {
                title url
              }
            }
            """,
            new
            {
                input = new
                {
                    domainId,
                    links = new[] { new { title = "Hub Site", url = "https://hub.example.com" } }
                }
            });

        var links = document.RootElement.GetProperty("data").GetProperty("setDomainLinks");
        Assert.Equal(1, links.GetArrayLength());
        Assert.Equal("Hub Site", links[0].GetProperty("title").GetString());
    }

    [Fact]
    public async Task SetDomainLinks_RegularUser_Forbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("regular-links@example.com", "Regular User");
            userId = user.Id;
            var domain = CreateDomain("Restricted Hub", "restricted-links-hub");
            domainId = domain.Id;
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation SetDomainLinks($input: SetDomainLinksInput!) {
                  setDomainLinks(input: $input) { title }
                }
                """,
            variables = new { input = new { domainId, links = Array.Empty<object>() } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("FORBIDDEN", body);
    }

    [Fact]
    public async Task SetDomainLinks_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domain = CreateDomain("Public Hub", "public-links-hub");
            domainId = domain.Id;
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient(); // no auth header

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation SetDomainLinks($input: SetDomainLinksInput!) {
                  setDomainLinks(input: $input) { title }
                }
                """,
            variables = new { input = new { domainId, links = Array.Empty<object>() } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(
            body.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase)
            || body.Contains("The current user is not authorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error but got: {body}");
    }

    [Fact]
    public async Task SetDomainLinks_EmptyList_RemovesAllLinks()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var adminId = Guid.Empty;
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("clear-links-admin@example.com", "Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Clear Links Hub", "clear-links-hub");
            domainId = domain.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.DomainLinks.Add(new DomainLink { DomainId = domain.Id, Title = "Old Link", Url = "https://old.example.com", DisplayOrder = 0 });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation SetDomainLinks($input: SetDomainLinksInput!) {
              setDomainLinks(input: $input) { title }
            }
            """,
            new { input = new { domainId, links = Array.Empty<object>() } });

        var links = document.RootElement.GetProperty("data").GetProperty("setDomainLinks");
        Assert.Equal(0, links.GetArrayLength());

        // Verify persistence
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(0, await db.DomainLinks.CountAsync(dl => dl.DomainId == domainId));
    }

    [Fact]
    public async Task SetDomainLinks_TooManyLinks_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var adminId = Guid.Empty;
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("too-many-links-admin@example.com", "Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Busy Hub", "busy-links-hub");
            domainId = domain.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var tooMany = Enumerable.Range(1, 11)
            .Select(i => new { title = $"Link {i}", url = $"https://example.com/{i}" })
            .ToArray();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation SetDomainLinks($input: SetDomainLinksInput!) {
                  setDomainLinks(input: $input) { title }
                }
                """,
            variables = new { input = new { domainId, links = tooMany } }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("TOO_MANY_LINKS", body);
    }

    [Fact]
    public async Task SetDomainLinks_InvalidUrl_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var adminId = Guid.Empty;
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("bad-url-admin@example.com", "Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Bad URL Hub", "bad-url-hub");
            domainId = domain.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation SetDomainLinks($input: SetDomainLinksInput!) {
                  setDomainLinks(input: $input) { title }
                }
                """,
            variables = new
            {
                input = new
                {
                    domainId,
                    links = new[] { new { title = "Bad", url = "not-a-url" } }
                }
            }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("INVALID_LINK_URL", body);
    }

    [Fact]
    public async Task DomainBySlug_ReturnsLinksInDisplayOrder()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domain = CreateDomain("Linked Hub", "linked-hub-slug");
            domainId = domain.Id;
            dbContext.Domains.Add(domain);
            dbContext.DomainLinks.AddRange(
                new DomainLink { DomainId = domain.Id, Title = "Second", Url = "https://second.example.com", DisplayOrder = 1 },
                new DomainLink { DomainId = domain.Id, Title = "First", Url = "https://first.example.com", DisplayOrder = 0 }
            );
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySlug($slug: String!) {
              domainBySlug(slug: $slug) {
                name
                links { title url displayOrder }
              }
            }
            """,
            new { slug = "linked-hub-slug" });

        var links = document.RootElement.GetProperty("data").GetProperty("domainBySlug").GetProperty("links");
        Assert.Equal(2, links.GetArrayLength());
        // Must be returned in DisplayOrder (0 first, 1 second)
        Assert.Equal("First", links[0].GetProperty("title").GetString());
        Assert.Equal("Second", links[1].GetProperty("title").GetString());
    }

    [Fact]
    public async Task DomainBySlug_ReturnsEmptyLinksWhenNoneConfigured()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            dbContext.Domains.Add(CreateDomain("No Links Hub", "no-links-hub"));
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySlug($slug: String!) {
              domainBySlug(slug: $slug) {
                name links { title url }
              }
            }
            """,
            new { slug = "no-links-hub" });

        var links = document.RootElement.GetProperty("data").GetProperty("domainBySlug").GetProperty("links");
        Assert.Equal(0, links.GetArrayLength());
    }

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
                tagline
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
                    tagline = "Your hub for blockchain and crypto events.",
                    overviewContent = "A community for blockchain and crypto events.",
                    whatBelongsHere = "Blockchain meetups, DeFi talks, and crypto networking events.",
                    submitEventCta = "Organizing a crypto event? Submit it here.",
                    curatorCredit = "Prague Blockchain Week organizers"
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("updateDomainOverview");
        Assert.Equal("Your hub for blockchain and crypto events.", result.GetProperty("tagline").GetString());
        Assert.Equal("A community for blockchain and crypto events.", result.GetProperty("overviewContent").GetString());
        Assert.Equal("Blockchain meetups, DeFi talks, and crypto networking events.", result.GetProperty("whatBelongsHere").GetString());
        Assert.Equal("Organizing a crypto event? Submit it here.", result.GetProperty("submitEventCta").GetString());
        Assert.Equal("Prague Blockchain Week organizers", result.GetProperty("curatorCredit").GetString());

        // Verify persistence
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var persisted = await db.Domains.FindAsync(domainId);
        Assert.Equal("Your hub for blockchain and crypto events.", persisted!.Tagline);
        Assert.Equal("A community for blockchain and crypto events.", persisted.OverviewContent);
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
    public async Task UpdateDomainOverview_SubmitEventCtaTooLong_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("lentest-submitcta@example.com", "CTA Length Tester");
            var domain = CreateDomain("CTA Hub", "cta-hub-len");

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
                    submitEventCta = new string('z', 301)
                }
            }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("INVALID_SUBMIT_EVENT_CTA", body);
    }

    [Fact]
    public async Task UpdateDomainOverview_Tagline_PersistsAndReturnsValue()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("tagline-persist@example.com", "Tagline Tester");
            var domain = CreateDomain("Tagline Hub", "tagline-hub-persist");

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
            mutation UpdateDomainOverview($input: UpdateDomainOverviewInput!) {
              updateDomainOverview(input: $input) { id tagline overviewContent }
            }
            """,
            new
            {
                input = new
                {
                    domainId,
                    tagline = "Discover the future of blockchain.",
                    overviewContent = "All about blockchain events."
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("updateDomainOverview");
        Assert.Equal("Discover the future of blockchain.", result.GetProperty("tagline").GetString());
        Assert.Equal("All about blockchain events.", result.GetProperty("overviewContent").GetString());

        // Verify persistence
        await using var verifyFactory = new EventsApiWebApplicationFactory();
        await using var scope = verifyFactory.Services.CreateAsyncScope();
        // Re-fetch from DB via GraphQL to confirm persistence
        using var client2 = verifyFactory.CreateClient();
        // Confirm the domain exists with the tagline set via raw DB query
        await using var db = factory.Services.CreateAsyncScope().ServiceProvider.GetRequiredService<AppDbContext>();
        var persisted = await db.Domains.FindAsync(domainId);
        Assert.Equal("Discover the future of blockchain.", persisted!.Tagline);
    }

    [Fact]
    public async Task UpdateDomainOverview_TaglineTooLong_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("tagline-len@example.com", "Tagline Len Tester");
            var domain = CreateDomain("Tagline Len Hub", "tagline-len-hub");

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
                    tagline = new string('t', 151)
                }
            }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("INVALID_TAGLINE", body);
    }

    [Fact]
    public async Task UpdateDomainOverview_TaglineNullClearsField()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("tagline-clear@example.com", "Tagline Clear Tester");
            var domain = CreateDomain("Tagline Clear Hub", "tagline-clear-hub");
            domain.Tagline = "Old tagline";

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
            mutation UpdateDomainOverview($input: UpdateDomainOverviewInput!) {
              updateDomainOverview(input: $input) { id tagline }
            }
            """,
            new { input = new { domainId, tagline = (string?)null } });

        var result = document.RootElement.GetProperty("data").GetProperty("updateDomainOverview");
        Assert.True(result.GetProperty("tagline").ValueKind == System.Text.Json.JsonValueKind.Null);
    }

    [Fact]
    public async Task UpdateDomainOverview_EmptyStringTaglineClearsField()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("tagline-emptystr@example.com", "Tagline Empty Str Tester");
            var domain = CreateDomain("Tagline Empty Str Hub", "tagline-emptystr-hub");
            domain.Tagline = "Will be cleared";

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
            mutation UpdateDomainOverview($input: UpdateDomainOverviewInput!) {
              updateDomainOverview(input: $input) { id tagline }
            }
            """,
            new { input = new { domainId, tagline = "" } });

        var result = document.RootElement.GetProperty("data").GetProperty("updateDomainOverview");
        Assert.True(result.GetProperty("tagline").ValueKind == System.Text.Json.JsonValueKind.Null);
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
    public async Task MyManagedDomains_ReturnsManagedDomainLinksInDisplayOrder()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty;
        Guid domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("mmd-links@example.com", "Managed Links Admin");
            domainAdminId = domainAdmin.Id;

            var domain = CreateDomain("Hub Links", "hub-links");
            domainId = domain.Id;

            dbContext.Users.Add(domainAdmin);
            dbContext.Domains.Add(domain);
            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = domainAdmin.Id,
            });
            dbContext.Set<DomainLink>().AddRange(
                new DomainLink
                {
                    DomainId = domain.Id,
                    Title = "Discord",
                    Url = "https://discord.example.com",
                    DisplayOrder = 1,
                },
                new DomainLink
                {
                    DomainId = domain.Id,
                    Title = "Newsletter",
                    Url = "https://newsletter.example.com",
                    DisplayOrder = 0,
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
                id
                links {
                  title
                  displayOrder
                }
              }
            }
            """);

        var domains = document.RootElement.GetProperty("data").GetProperty("myManagedDomains");
        Assert.Equal(1, domains.GetArrayLength());
        Assert.Equal(domainId.ToString(), domains[0].GetProperty("id").GetString());

        var links = domains[0].GetProperty("links");
        Assert.Equal(2, links.GetArrayLength());
        Assert.Equal("Newsletter", links[0].GetProperty("title").GetString());
        Assert.Equal(0, links[0].GetProperty("displayOrder").GetInt32());
        Assert.Equal("Discord", links[1].GetProperty("title").GetString());
        Assert.Equal(1, links[1].GetProperty("displayOrder").GetInt32());
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

    // ── Additional hub isolation and coverage tests ───────────────────────────

    [Fact]
    public async Task FeaturedEventsForDomain_DoesNotReturnEventsFromOtherDomains()
    {
        // Verifies cross-domain isolation: events from domain B do not appear
        // in featured events for domain A even if they share the same featuredEvents table.
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("feat-iso@example.com", "Isolation User");
            var domainA = CreateDomain("Domain A", "domain-a-feat-iso");
            var domainB = CreateDomain("Domain B", "domain-b-feat-iso");

            var eventA = CreateEvent("Event A", "event-a-feat-iso", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domainA, user);
            var eventB = CreateEvent("Event B", "event-b-feat-iso", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(7), domainB, user);

            dbContext.Users.Add(user);
            dbContext.Domains.AddRange(domainA, domainB);
            dbContext.Events.AddRange(eventA, eventB);

            // Feature event A in domain A, event B in domain B
            dbContext.Set<DomainFeaturedEvent>().AddRange(
                new DomainFeaturedEvent { DomainId = domainA.Id, EventId = eventA.Id, DisplayOrder = 0 },
                new DomainFeaturedEvent { DomainId = domainB.Id, EventId = eventB.Id, DisplayOrder = 0 }
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
            new { domainSlug = "domain-a-feat-iso" });

        var events = document.RootElement.GetProperty("data").GetProperty("featuredEventsForDomain");
        Assert.Equal(1, events.GetArrayLength());
        Assert.Equal("Event A", events[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task SetDomainFeaturedEvents_DomainAdminForOtherDomain_Forbidden()
    {
        // A domain admin for Domain B must NOT be able to set featured events for Domain A.
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainAdminId = Guid.Empty, domainAId = Guid.Empty, eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domainAdmin = CreateUser("feat-wrong-da@example.com", "Wrong Domain Admin");
            domainAdminId = domainAdmin.Id;
            var domainA = CreateDomain("Domain A Forbidden", "domain-a-forbidden");
            domainAId = domainA.Id;
            var domainB = CreateDomain("Domain B Owner", "domain-b-owner");

            var ev = CreateEvent("Target Event", "target-event-forbidden", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domainA, domainAdmin);
            eventId = ev.Id;

            dbContext.Users.Add(domainAdmin);
            dbContext.Domains.AddRange(domainA, domainB);
            dbContext.Events.Add(ev);
            // Admin only for domain B, NOT for domain A
            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domainB.Id,
                UserId = domainAdmin.Id,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, domainAdminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
            mutation SetFeatured($input: SetDomainFeaturedEventsInput!) {
              setDomainFeaturedEvents(input: $input) { id }
            }
            """,
            variables = new { input = new { domainId = domainAId, eventIds = new[] { eventId } } }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var errorMessage = errors.ToString();
        Assert.True(
            errorMessage.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("FORBIDDEN", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("not authorized", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("domain administrator", StringComparison.OrdinalIgnoreCase),
            $"Expected authorization error but got: {errorMessage}");
    }

    [Fact]
    public async Task DomainBySlug_ReturnsAllHubOverviewFieldsTogether()
    {
        // Verifies that all curator-managed overview fields are returned together in one query.
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("overview-fields@example.com", "Overview User");
            var domain = CreateDomain("Overview Hub", "overview-hub-fields");
            domain.Tagline = "The premier hub for overview testing";
            domain.OverviewContent = "This is a detailed overview of the hub.";
            domain.WhatBelongsHere = "Events related to overview testing belong here.";
            domain.SubmitEventCta = "Submit your overview event here!";
            domain.CuratorCredit = "Overview Testing Team";

            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query DomainBySlug($slug: String!) {
              domainBySlug(slug: $slug) {
                tagline
                overviewContent
                whatBelongsHere
                submitEventCta
                curatorCredit
              }
            }
            """,
            new { slug = "overview-hub-fields" });

        var d = document.RootElement.GetProperty("data").GetProperty("domainBySlug");
        Assert.Equal("The premier hub for overview testing", d.GetProperty("tagline").GetString());
        Assert.Equal("This is a detailed overview of the hub.", d.GetProperty("overviewContent").GetString());
        Assert.Equal("Events related to overview testing belong here.", d.GetProperty("whatBelongsHere").GetString());
        Assert.Equal("Submit your overview event here!", d.GetProperty("submitEventCta").GetString());
        Assert.Equal("Overview Testing Team", d.GetProperty("curatorCredit").GetString());
    }

    [Fact]
    public async Task MyManagedDomains_IncludesHubBrandingAndOverviewFields()
    {
        // Ensures myManagedDomains returns all branding and overview fields (not just id/name).
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("mmd-fields@example.com", "MMD Fields User");
            userId = user.Id;
            var domain = CreateDomain("MMD Hub", "mmd-hub-fields");
            domain.PrimaryColor = "#ab1234";
            domain.Tagline = "MMD tagline value";
            domain.CuratorCredit = "MMD Curators";

            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Set<DomainAdministrator>().Add(new DomainAdministrator
            {
                DomainId = domain.Id,
                UserId = user.Id,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, userId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query MyManagedDomains {
              myManagedDomains {
                id name slug primaryColor tagline curatorCredit
              }
            }
            """);

        var domains = document.RootElement.GetProperty("data").GetProperty("myManagedDomains");
        Assert.Equal(1, domains.GetArrayLength());
        var d = domains[0];
        Assert.Equal("#ab1234", d.GetProperty("primaryColor").GetString());
        Assert.Equal("MMD tagline value", d.GetProperty("tagline").GetString());
        Assert.Equal("MMD Curators", d.GetProperty("curatorCredit").GetString());
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
                Role = EventsApi.Data.Entities.CommunityMemberRole.Owner,
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
        Assert.Contains("LAST_OWNER", body);
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
    public async Task AssociateEventWithGroup_ByEventOwnerEventManager_Succeeds()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid eventManagerId = Guid.Empty;
        Guid groupId = Guid.Empty;
        Guid eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var eventManager = CreateUser("cg-evtmgr@example.com", "EventManager");
            eventManagerId = eventManager.Id;
            dbContext.Users.Add(eventManager);

            var domain = CreateDomain("Tech", "tech-evtmgr");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "EvtMgr Group",
                Slug = "evtmgr-group",
                CreatedByUserId = eventManager.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = eventManager.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.EventManager,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var catalogEvent = CreateEvent("Tech Meetup", "tech-meetup-evtmgr", "Great meetup",
                "Venue", "Prague", DateTime.UtcNow.AddDays(30), domain, eventManager);
            eventId = catalogEvent.Id;
            dbContext.Events.Add(catalogEvent);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, eventManagerId));

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
    public async Task AssociateEventWithGroup_RegularMember_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid memberId = Guid.Empty;
        Guid ownerId = Guid.Empty;
        Guid groupId = Guid.Empty;
        Guid eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("cg-assoc-owner2@example.com", "Owner");
            ownerId = owner.Id;
            dbContext.Users.Add(owner);

            var member = CreateUser("cg-assoc-member@example.com", "RegularMember");
            memberId = member.Id;
            dbContext.Users.Add(member);

            var domain = CreateDomain("Tech", "tech-member-assoc");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Member Test Group",
                Slug = "member-test-group",
                CreatedByUserId = owner.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = member.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var catalogEvent = CreateEvent("Member Event", "member-event", "Event",
                "Venue", "Prague", DateTime.UtcNow.AddDays(30), domain, owner);
            eventId = catalogEvent.Id;
            dbContext.Events.Add(catalogEvent);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, memberId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation Associate($input: CommunityGroupEventInput!) {
                  associateEventWithGroup(input: $input) { id }
                }
                """,
            variables = new { input = new { groupId, eventId } }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("FORBIDDEN", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task LeaveCommunityGroup_LastAdmin_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid groupId = Guid.Empty;
        Guid membershipId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-lastleave@example.com", "LastLeaveAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "LastLeave Group",
                Slug = "lastleave-group",
                CreatedByUserId = admin.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            var membership = new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Owner,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            };
            membershipId = membership.Id;
            dbContext.CommunityMemberships.Add(membership);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation Leave($groupId: UUID!) {
                  leaveCommunityGroup(groupId: $groupId)
                }
                """,
            variables = new { groupId }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out _),
            "Expected an error when last owner tries to leave the group.");
    }

    [Fact]
    public async Task DisassociateEventFromGroup_ByGroupAdmin_Succeeds()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid groupId = Guid.Empty;
        Guid eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-disassoc@example.com", "DisassocAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = CreateDomain("Tech", "tech-disassoc");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Disassoc Group",
                Slug = "disassoc-group",
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

            var catalogEvent = CreateEvent("Disassoc Event", "disassoc-event", "Event",
                "Venue", "Prague", DateTime.UtcNow.AddDays(30), domain, admin);
            eventId = catalogEvent.Id;
            dbContext.Events.Add(catalogEvent);

            dbContext.CommunityGroupEvents.Add(new EventsApi.Data.Entities.CommunityGroupEvent
            {
                GroupId = group.Id,
                EventId = catalogEvent.Id,
                AddedByUserId = admin.Id,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation Disassociate($input: CommunityGroupEventInput!) {
              disassociateEventFromGroup(input: $input)
            }
            """,
            new { input = new { groupId, eventId } });

        Assert.True(document.RootElement.GetProperty("data").GetProperty("disassociateEventFromGroup").GetBoolean());
    }

    [Fact]
    public async Task DisassociateEventFromGroup_NonAdmin_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid memberId = Guid.Empty;
        Guid adminId = Guid.Empty;
        Guid groupId = Guid.Empty;
        Guid eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-disassoc-admin@example.com", "DisassocAdmin2");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var member = CreateUser("cg-disassoc-member@example.com", "NonAdminMember");
            memberId = member.Id;
            dbContext.Users.Add(member);

            var domain = CreateDomain("Tech", "tech-disassoc2");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Disassoc2 Group",
                Slug = "disassoc2-group",
                CreatedByUserId = admin.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = member.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var catalogEvent = CreateEvent("Disassoc2 Event", "disassoc2-event", "Event",
                "Venue", "Prague", DateTime.UtcNow.AddDays(30), domain, admin);
            eventId = catalogEvent.Id;
            dbContext.Events.Add(catalogEvent);

            dbContext.CommunityGroupEvents.Add(new EventsApi.Data.Entities.CommunityGroupEvent
            {
                GroupId = group.Id,
                EventId = catalogEvent.Id,
                AddedByUserId = admin.Id,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, memberId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation Disassociate($input: CommunityGroupEventInput!) {
                  disassociateEventFromGroup(input: $input)
                }
                """,
            variables = new { input = new { groupId, eventId } }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("FORBIDDEN", errors.ToString(), StringComparison.OrdinalIgnoreCase);
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

    // ── Import pipeline tests (seeded adapter) ────────────────────────────────

    /// <summary>
    /// Creates a fake in-process Meetup adapter that returns a pre-seeded list of
    /// external events. This lets us exercise the full import pipeline without live
    /// credentials or network access.
    /// </summary>
    private sealed class SeededMeetupAdapter(IReadOnlyList<EventsApi.Adapters.ExternalEventData> events)
        : EventsApi.Adapters.IExternalSourceAdapter
    {
        public string? ExtractIdentifier(string sourceUrl) => "seeded-group";

        public Task<IReadOnlyList<EventsApi.Adapters.ExternalEventData>> FetchEventsAsync(
            string sourceIdentifier,
            CancellationToken cancellationToken = default)
            => Task.FromResult(events);
    }

    [Fact]
    public async Task TriggerExternalSync_VerifiedClaim_ImportsEventsAsPendingApproval()
    {
        var externalEvents = new List<EventsApi.Adapters.ExternalEventData>
        {
            new(
                ExternalId: "meetup-event-001",
                Name: "Seeded Meetup Event Alpha",
                Description: "A seeded test event from the Meetup adapter.",
                EventUrl: "https://www.meetup.com/seeded-group/events/meetup-event-001",
                StartsAtUtc: new DateTime(2030, 6, 1, 18, 0, 0, DateTimeKind.Utc),
                EndsAtUtc: new DateTime(2030, 6, 1, 20, 0, 0, DateTimeKind.Utc),
                VenueName: "Tech Hub Prague",
                AddressLine1: "Wenceslas Square 1",
                City: "Prague",
                CountryCode: "CZ",
                Latitude: 50.075m,
                Longitude: 14.437m,
                IsFree: true,
                PriceAmount: null,
                CurrencyCode: null,
                Language: "en"
            ),
        };

        await using var factory2 = new EventsApiWebApplicationFactory(services =>
        {
            var seededAdapter = new SeededMeetupAdapter(externalEvents);
            services.RemoveAll<EventsApi.Adapters.ExternalSourceAdapterFactory>();
            services.AddSingleton(new EventsApi.Adapters.ExternalSourceAdapterFactory(seededAdapter, seededAdapter));
        });

        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory2, dbContext =>
        {
            var admin = CreateUser("import-test@example.com", "Import Tester");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = CreateDomain("Tech Import", "tech-import");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Import Test Group",
                Slug = "import-test-group",
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

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/seeded-group",
                SourceIdentifier = "seeded-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);
        });

        using var client = factory2.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory2, adminId));

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
        Assert.Equal(1, result.GetProperty("importedCount").GetInt32());
        Assert.Equal(0, result.GetProperty("skippedCount").GetInt32());
        Assert.Equal(0, result.GetProperty("errorCount").GetInt32());

        // Verify the imported event was created in PendingApproval and linked to the group
        await using var scope = factory2.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();

        var importedEvent = await db.Events
            .FirstOrDefaultAsync(e => e.ExternalSourceEventId == "meetup-event-001");
        Assert.NotNull(importedEvent);
        Assert.Equal(EventsApi.Data.Entities.EventStatus.PendingApproval, importedEvent.Status);
        Assert.Equal("Seeded Meetup Event Alpha", importedEvent.Name);
        Assert.Equal(claimId, importedEvent.ExternalSourceClaimId);

        // Verify the event is linked to the community group
        var groupEvent = await db.CommunityGroupEvents
            .FirstOrDefaultAsync(cge => cge.EventId == importedEvent.Id && cge.GroupId == groupId);
        Assert.NotNull(groupEvent);
    }

    [Fact]
    public async Task TriggerExternalSync_SecondSync_UpdatesAlreadyImportedEvents()
    {
        var externalEvents = new List<EventsApi.Adapters.ExternalEventData>
        {
            new(
                ExternalId: "meetup-dup-001",
                Name: "Duplicate Detection Event",
                Description: "Event used to test duplicate-skip logic.",
                EventUrl: "https://www.meetup.com/dup-group/events/meetup-dup-001",
                StartsAtUtc: new DateTime(2030, 7, 1, 18, 0, 0, DateTimeKind.Utc),
                EndsAtUtc: new DateTime(2030, 7, 1, 20, 0, 0, DateTimeKind.Utc),
                VenueName: "Dup Venue",
                AddressLine1: null, City: "Brno", CountryCode: "CZ",
                Latitude: null, Longitude: null, IsFree: true,
                PriceAmount: null, CurrencyCode: null, Language: null
            ),
        };

        await using var factory = new EventsApiWebApplicationFactory(services =>
        {
            var seededAdapter = new SeededMeetupAdapter(externalEvents);
            services.RemoveAll<EventsApi.Adapters.ExternalSourceAdapterFactory>();
            services.AddSingleton(new EventsApi.Adapters.ExternalSourceAdapterFactory(seededAdapter, seededAdapter));
        });

        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("dup-test@example.com", "Dup Tester");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = CreateDomain("Dup Domain", "dup-domain");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Dup Test Group",
                Slug = "dup-test-group",
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
                SourceUrl = "https://www.meetup.com/dup-group",
                SourceIdentifier = "dup-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var syncMutation = """
            mutation Sync($claimId: UUID!) {
              triggerExternalSync(claimId: $claimId) {
                importedCount updatedCount skippedCount errorCount
              }
            }
            """;

        // First sync: should import 1
        using var doc1 = await ExecuteGraphQlAsync(client, syncMutation, new { claimId });
        var r1 = doc1.RootElement.GetProperty("data").GetProperty("triggerExternalSync");
        Assert.Equal(1, r1.GetProperty("importedCount").GetInt32());

        // Second sync with the same external events: should update 1, not create a duplicate
        using var doc2 = await ExecuteGraphQlAsync(client, syncMutation, new { claimId });
        var r2 = doc2.RootElement.GetProperty("data").GetProperty("triggerExternalSync");
        Assert.Equal(0, r2.GetProperty("importedCount").GetInt32());
        Assert.Equal(1, r2.GetProperty("updatedCount").GetInt32());
        Assert.Equal(0, r2.GetProperty("skippedCount").GetInt32());

        // Verify only one record in DB for this external ID — no duplicate created
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();
        var count = await db.Events.CountAsync(e => e.ExternalSourceEventId == "meetup-dup-001");
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task TriggerExternalSync_SecondSync_UpdatesEventFieldsFromUpstream()
    {
        // When an event was previously imported and the upstream source changes the event data
        // (e.g. name, city, dates), a subsequent sync must refresh those fields while
        // preserving locally curated fields (Status, Slug).
        var updatedExternalEvents = new List<EventsApi.Adapters.ExternalEventData>
        {
            new(
                ExternalId: "meetup-update-001",
                Name: "Updated Event Name",
                Description: "Updated description from upstream.",
                EventUrl: "https://www.meetup.com/update-group/events/meetup-update-001",
                StartsAtUtc: new DateTime(2031, 8, 15, 10, 0, 0, DateTimeKind.Utc),
                EndsAtUtc: new DateTime(2031, 8, 15, 12, 0, 0, DateTimeKind.Utc),
                VenueName: "New Venue", AddressLine1: null, City: "Vienna", CountryCode: "AT",
                Latitude: null, Longitude: null, IsFree: false, PriceAmount: 10m,
                CurrencyCode: "EUR", Language: null),
        };

        await using var factory = new EventsApiWebApplicationFactory(services =>
        {
            var adapter = new SeededMeetupAdapter(updatedExternalEvents);
            services.RemoveAll<EventsApi.Adapters.ExternalSourceAdapterFactory>();
            services.AddSingleton(new EventsApi.Adapters.ExternalSourceAdapterFactory(adapter, adapter));
        });

        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("update-test@example.com", "Update Tester");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = CreateDomain("Update Domain", "update-domain");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Update Group", Slug = "update-group",
                IsActive = true, CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id, UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/update-group",
                SourceIdentifier = "update-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);

            // Pre-seed the event with stale data (as if imported during a previous sync).
            dbContext.Events.Add(new EventsApi.Data.Entities.CatalogEvent
            {
                Name = "Old Event Name",
                Slug = "old-event-name",
                Description = "Old description.",
                EventUrl = "https://www.meetup.com/update-group/events/meetup-update-001",
                VenueName = "Old Venue",
                AddressLine1 = "",
                City = "Prague",
                CountryCode = "CZ",
                StartsAtUtc = new DateTime(2030, 1, 1, 10, 0, 0, DateTimeKind.Utc),
                EndsAtUtc = new DateTime(2030, 1, 1, 12, 0, 0, DateTimeKind.Utc),
                IsFree = true,
                Status = EventsApi.Data.Entities.EventStatus.Published, // simulates admin approval
                DomainId = domain.Id,
                SubmittedByUserId = admin.Id,
                ExternalSourceClaimId = claimId,
                ExternalSourceEventId = "meetup-update-001",
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation Sync($claimId: UUID!) {
              triggerExternalSync(claimId: $claimId) {
                importedCount updatedCount skippedCount errorCount summary
              }
            }
            """,
            new { claimId });

        var result = doc.RootElement.GetProperty("data").GetProperty("triggerExternalSync");
        Assert.Equal(0, result.GetProperty("importedCount").GetInt32());
        Assert.Equal(1, result.GetProperty("updatedCount").GetInt32());
        Assert.Equal(0, result.GetProperty("skippedCount").GetInt32());
        Assert.Equal(0, result.GetProperty("errorCount").GetInt32());
        Assert.Contains("Updated 1 event.", result.GetProperty("summary").GetString());

        // Verify the event fields have been refreshed from upstream.
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();
        var updatedEvent = await db.Events.SingleAsync(e => e.ExternalSourceEventId == "meetup-update-001");

        Assert.Equal("Updated Event Name", updatedEvent.Name);
        Assert.Equal("Updated description from upstream.", updatedEvent.Description);
        Assert.Equal("Vienna", updatedEvent.City);
        Assert.Equal("AT", updatedEvent.CountryCode);
        Assert.Equal(new DateTime(2031, 8, 15, 10, 0, 0, DateTimeKind.Utc), updatedEvent.StartsAtUtc);
        Assert.False(updatedEvent.IsFree);
        Assert.Equal(10m, updatedEvent.PriceAmount);

        // Locally curated fields must NOT be overwritten.
        Assert.Equal("old-event-name", updatedEvent.Slug); // slug preserved
        Assert.Equal(EventsApi.Data.Entities.EventStatus.Published, updatedEvent.Status); // moderation preserved
    }

    [Fact]
    public async Task TriggerExternalSync_OrphanedEventDetection_ReportsCountWithoutDeleting()
    {
        // When an event was previously imported but no longer appears in the upstream feed,
        // the sync must report it as orphaned and preserve the event record.
        var currentExternalEvents = new List<EventsApi.Adapters.ExternalEventData>
        {
            new(
                ExternalId: "meetup-active-001",
                Name: "Still Active Event",
                Description: "This event is still in the upstream feed.",
                EventUrl: "https://www.meetup.com/orphan-group/events/meetup-active-001",
                StartsAtUtc: new DateTime(2031, 9, 1, 10, 0, 0, DateTimeKind.Utc),
                EndsAtUtc: null,
                VenueName: "Active Venue", AddressLine1: null, City: "Prague", CountryCode: "CZ",
                Latitude: null, Longitude: null, IsFree: true,
                PriceAmount: null, CurrencyCode: null, Language: null),
        };

        await using var factory = new EventsApiWebApplicationFactory(services =>
        {
            var adapter = new SeededMeetupAdapter(currentExternalEvents);
            services.RemoveAll<EventsApi.Adapters.ExternalSourceAdapterFactory>();
            services.AddSingleton(new EventsApi.Adapters.ExternalSourceAdapterFactory(adapter, adapter));
        });

        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;
        Guid domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("orphan-test@example.com", "Orphan Tester");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = CreateDomain("Orphan Domain", "orphan-domain");
            domainId = domain.Id;
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Orphan Group", Slug = "orphan-group",
                IsActive = true, CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id, UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/orphan-group",
                SourceIdentifier = "orphan-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);

            // Pre-seed two previously imported events. Only one will be in the upstream feed —
            // the other will be detected as orphaned (removed/cancelled upstream).
            dbContext.Events.Add(new EventsApi.Data.Entities.CatalogEvent
            {
                Name = "Still Active Event",
                Slug = "still-active-event",
                Description = "Still in the upstream feed.",
                EventUrl = "https://www.meetup.com/orphan-group/events/meetup-active-001",
                VenueName = "Active Venue", AddressLine1 = "", City = "Prague", CountryCode = "CZ",
                StartsAtUtc = new DateTime(2031, 9, 1, 10, 0, 0, DateTimeKind.Utc),
                EndsAtUtc = new DateTime(2031, 9, 1, 12, 0, 0, DateTimeKind.Utc),
                IsFree = true, Status = EventsApi.Data.Entities.EventStatus.Published,
                DomainId = domain.Id, SubmittedByUserId = admin.Id,
                ExternalSourceClaimId = claimId, ExternalSourceEventId = "meetup-active-001",
            });

            dbContext.Events.Add(new EventsApi.Data.Entities.CatalogEvent
            {
                Name = "Cancelled Upstream Event",
                Slug = "cancelled-upstream-event",
                Description = "This event was removed from the upstream feed.",
                EventUrl = "https://www.meetup.com/orphan-group/events/meetup-cancelled-002",
                VenueName = "Cancelled Venue", AddressLine1 = "", City = "Brno", CountryCode = "CZ",
                StartsAtUtc = new DateTime(2031, 10, 1, 10, 0, 0, DateTimeKind.Utc),
                EndsAtUtc = new DateTime(2031, 10, 1, 12, 0, 0, DateTimeKind.Utc),
                IsFree = true, Status = EventsApi.Data.Entities.EventStatus.Published,
                DomainId = domain.Id, SubmittedByUserId = admin.Id,
                ExternalSourceClaimId = claimId, ExternalSourceEventId = "meetup-cancelled-002",
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation Sync($claimId: UUID!) {
              triggerExternalSync(claimId: $claimId) {
                importedCount updatedCount skippedCount errorCount orphanedCount summary
              }
            }
            """,
            new { claimId });

        var result = doc.RootElement.GetProperty("data").GetProperty("triggerExternalSync");
        Assert.Equal(0, result.GetProperty("importedCount").GetInt32()); // already existed
        Assert.Equal(1, result.GetProperty("updatedCount").GetInt32());  // active event refreshed
        Assert.Equal(0, result.GetProperty("skippedCount").GetInt32());
        Assert.Equal(0, result.GetProperty("errorCount").GetInt32());
        Assert.Equal(1, result.GetProperty("orphanedCount").GetInt32()); // one no longer in feed
        Assert.Contains("no longer appears upstream", result.GetProperty("summary").GetString());

        // Orphaned event must NOT be deleted — it should still be in the database.
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();
        var cancelledEvent = await db.Events.SingleOrDefaultAsync(
            e => e.ExternalSourceEventId == "meetup-cancelled-002");
        Assert.NotNull(cancelledEvent);
        Assert.Equal("Cancelled Upstream Event", cancelledEvent.Name); // unchanged
        Assert.Equal(EventsApi.Data.Entities.EventStatus.Published, cancelledEvent.Status); // preserved
    }

    [Fact]
    public async Task TriggerExternalSync_ImportedEvents_AreInPendingApprovalNotPublished()
    {
        var externalEvents = new List<EventsApi.Adapters.ExternalEventData>
        {
            new(
                ExternalId: "meetup-moderation-001",
                Name: "Moderation Gate Event",
                Description: "Should enter PendingApproval, not Published.",
                EventUrl: "https://www.meetup.com/mod-group/events/meetup-moderation-001",
                StartsAtUtc: new DateTime(2030, 8, 1, 18, 0, 0, DateTimeKind.Utc),
                EndsAtUtc: null,
                VenueName: null, AddressLine1: null, City: "Bratislava", CountryCode: "SK",
                Latitude: null, Longitude: null, IsFree: true,
                PriceAmount: null, CurrencyCode: null, Language: "sk"
            ),
        };

        await using var factory = new EventsApiWebApplicationFactory(services =>
        {
            var seededAdapter = new SeededMeetupAdapter(externalEvents);
            services.RemoveAll<EventsApi.Adapters.ExternalSourceAdapterFactory>();
            services.AddSingleton(new EventsApi.Adapters.ExternalSourceAdapterFactory(seededAdapter, seededAdapter));
        });

        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("mod-test@example.com", "Mod Tester");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = CreateDomain("Mod Domain", "mod-domain");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Mod Test Group",
                Slug = "mod-test-group",
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
                SourceUrl = "https://www.meetup.com/mod-group",
                SourceIdentifier = "mod-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
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
              triggerExternalSync(claimId: $claimId) { importedCount }
            }
            """,
            new { claimId });

        Assert.Equal(1, doc.RootElement.GetProperty("data")
            .GetProperty("triggerExternalSync")
            .GetProperty("importedCount").GetInt32());

        // Ensure the imported event is NOT published — it must go through moderation
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();
        var ev = await db.Events.FirstOrDefaultAsync(e => e.ExternalSourceEventId == "meetup-moderation-001");
        Assert.NotNull(ev);
        Assert.Equal(EventsApi.Data.Entities.EventStatus.PendingApproval, ev.Status);
        Assert.NotEqual(EventsApi.Data.Entities.EventStatus.Published, ev.Status);
        // End time should be defaulted to start + 2h when not provided
        Assert.Equal(ev.StartsAtUtc.AddHours(2), ev.EndsAtUtc);
    }

    // ── Authorization boundary tests ──────────────────────────────────────────

    [Fact]
    public async Task RemoveExternalSourceClaim_NonAdminMember_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid memberId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("esc-rm-owner@example.com", "Owner");
            dbContext.Users.Add(owner);

            var member = CreateUser("esc-rm-member@example.com", "Member");
            memberId = member.Id;
            dbContext.Users.Add(member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Rm Auth Group",
                Slug = "rm-auth-group",
                CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = owner.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = member.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/rm-auth-group",
                SourceIdentifier = "rm-auth-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview,
                CreatedByUserId = owner.Id,
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, memberId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation Remove($claimId: UUID!) {
                  removeExternalSourceClaim(claimId: $claimId)
                }
                """,
            variables = new { claimId }
        });

        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors),
            $"Expected FORBIDDEN but none returned. Response: {doc.RootElement}");
        Assert.Contains("FORBIDDEN", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RemoveExternalSourceClaim_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var claimId = Guid.NewGuid();

        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation Remove($claimId: UUID!) {
                  removeExternalSourceClaim(claimId: $claimId)
                }
                """,
            variables = new { claimId }
        });

        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors),
            $"Expected auth error but none returned. Response: {doc.RootElement}");
        var errText = errors.ToString();
        Assert.True(
            errText.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase) ||
            errText.Contains("UNAUTHORIZED", StringComparison.OrdinalIgnoreCase) ||
            errText.Contains("not authorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error, got: {errText}");
    }

    [Fact]
    public async Task TriggerExternalSync_NonAdminMember_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid memberId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("esc-trigger-owner@example.com", "Trigger Owner");
            dbContext.Users.Add(owner);

            var member = CreateUser("esc-trigger-member@example.com", "Trigger Member");
            memberId = member.Id;
            dbContext.Users.Add(member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Trigger Auth Group",
                Slug = "trigger-auth-group",
                CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = owner.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = member.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/trigger-auth-group",
                SourceIdentifier = "trigger-auth-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = owner.Id,
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, memberId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation Sync($claimId: UUID!) {
                  triggerExternalSync(claimId: $claimId) {
                    importedCount skippedCount errorCount
                  }
                }
                """,
            variables = new { claimId }
        });

        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors),
            $"Expected FORBIDDEN but none returned. Response: {doc.RootElement}");
        Assert.Contains("FORBIDDEN", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task TriggerExternalSync_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var claimId = Guid.NewGuid();

        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation Sync($claimId: UUID!) {
                  triggerExternalSync(claimId: $claimId) {
                    importedCount skippedCount errorCount
                  }
                }
                """,
            variables = new { claimId }
        });

        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors),
            $"Expected auth error but none returned. Response: {doc.RootElement}");
        var errText = errors.ToString();
        Assert.True(
            errText.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase) ||
            errText.Contains("UNAUTHORIZED", StringComparison.OrdinalIgnoreCase) ||
            errText.Contains("not authorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error, got: {errText}");
    }

    // ── Organizer Portfolio Dashboard ──────────────────────────────────────────

    [Fact]
    public async Task Portfolio_ReturnsRejectedAndDraftCounts()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var organizerUserId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var organizer = CreateUser("portfolio-counts@example.com", "Portfolio Organizer");
            organizerUserId = organizer.Id;
            var domain = CreateDomain("Tech", "tech-portfolio-counts");
            dbContext.Users.Add(organizer);
            dbContext.Domains.Add(domain);

            dbContext.Events.AddRange(
                CreateEvent("Published Event", "port-pub", "Desc", "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, organizer, status: EventStatus.Published),
                CreateEvent("Pending Event", "port-pend", "Desc", "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, organizer, status: EventStatus.PendingApproval),
                CreateEvent("Rejected Event", "port-rej", "Desc", "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, organizer, status: EventStatus.Rejected),
                CreateEvent("Draft Event", "port-draft", "Desc", "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, organizer, status: EventStatus.Draft));
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizerUserId));

        using var document = await ExecuteGraphQlAsync(client, """
            query Portfolio {
              myDashboard {
                totalSubmittedEvents
                publishedEvents
                pendingApprovalEvents
                rejectedEvents
                draftEvents
              }
            }
            """);

        var dash = document.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(4, dash.GetProperty("totalSubmittedEvents").GetInt32());
        Assert.Equal(1, dash.GetProperty("publishedEvents").GetInt32());
        Assert.Equal(1, dash.GetProperty("pendingApprovalEvents").GetInt32());
        Assert.Equal(1, dash.GetProperty("rejectedEvents").GetInt32());
        Assert.Equal(1, dash.GetProperty("draftEvents").GetInt32());
    }

    [Fact]
    public async Task Portfolio_EventAnalytics_IncludesAdminNotesForRejectedEvent()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var organizerUserId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var organizer = CreateUser("portfolio-notes@example.com", "Notes Organizer");
            organizerUserId = organizer.Id;
            var domain = CreateDomain("Tech", "tech-portfolio-notes");
            dbContext.Users.Add(organizer);
            dbContext.Domains.Add(domain);

            var rejected = CreateEvent("Rejected With Notes", "rej-with-notes", "Desc", "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, organizer, status: EventStatus.Rejected);
            rejected.AdminNotes = "Please add more details about the agenda.";
            dbContext.Events.Add(rejected);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizerUserId));

        using var document = await ExecuteGraphQlAsync(client, """
            query Portfolio {
              myDashboard {
                eventAnalytics {
                  eventSlug
                  status
                  adminNotes
                }
              }
            }
            """);

        var analytics = document.RootElement
            .GetProperty("data").GetProperty("myDashboard")
            .GetProperty("eventAnalytics").EnumerateArray().ToArray();

        var item = Assert.Single(analytics);
        Assert.Equal("REJECTED", item.GetProperty("status").GetString());
        Assert.Equal("Please add more details about the agenda.", item.GetProperty("adminNotes").GetString());
    }

    [Fact]
    public async Task Portfolio_EventAnalytics_IncludesDomainSlugLanguageTimezone()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var organizerUserId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var organizer = CreateUser("portfolio-fields@example.com", "Fields Organizer");
            organizerUserId = organizer.Id;
            var domain = CreateDomain("Tech", "tech-portfolio-fields");
            dbContext.Users.Add(organizer);
            dbContext.Domains.Add(domain);

            dbContext.Events.Add(CreateEvent(
                "Localised Event", "localised-event", "Desc", "Venue", "Prague",
                FirstDayOfNextMonthUtc(), domain, organizer,
                language: "cs", timezone: "Europe/Prague"));
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizerUserId));

        using var document = await ExecuteGraphQlAsync(client, """
            query Portfolio {
              myDashboard {
                eventAnalytics {
                  domainSlug
                  language
                  timezone
                }
              }
            }
            """);

        var item = document.RootElement
            .GetProperty("data").GetProperty("myDashboard")
            .GetProperty("eventAnalytics").EnumerateArray().Single();

        Assert.Equal("tech-portfolio-fields", item.GetProperty("domainSlug").GetString());
        Assert.Equal("cs", item.GetProperty("language").GetString());
        Assert.Equal("Europe/Prague", item.GetProperty("timezone").GetString());
    }

    [Fact]
    public async Task Portfolio_OrganizerIsolation_CannotSeeOtherOrganizersEvents()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var organizer1Id = Guid.Empty;
        var organizer2Id = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var organizer1 = CreateUser("portfolio-org1@example.com", "Organizer One");
            var organizer2 = CreateUser("portfolio-org2@example.com", "Organizer Two");
            organizer1Id = organizer1.Id;
            organizer2Id = organizer2.Id;

            var domain = CreateDomain("Tech", "tech-portfolio-isolation");
            dbContext.Users.AddRange(organizer1, organizer2);
            dbContext.Domains.Add(domain);

            dbContext.Events.AddRange(
                CreateEvent("Org1 Event A", "org1-event-a", "Desc", "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, organizer1),
                CreateEvent("Org1 Event B", "org1-event-b", "Desc", "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, organizer1),
                CreateEvent("Org2 Event", "org2-event", "Desc", "Venue", "Prague", FirstDayOfNextMonthUtc(), domain, organizer2));
        });

        using var client1 = factory.CreateClient();
        client1.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizer1Id));

        using var doc1 = await ExecuteGraphQlAsync(client1, """
            query Portfolio { myDashboard { totalSubmittedEvents eventAnalytics { eventSlug } } }
            """);

        var dash1 = doc1.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(2, dash1.GetProperty("totalSubmittedEvents").GetInt32());
        var slugs1 = dash1.GetProperty("eventAnalytics").EnumerateArray()
            .Select(a => a.GetProperty("eventSlug").GetString()).ToArray();
        Assert.DoesNotContain("org2-event", slugs1);

        using var client2 = factory.CreateClient();
        client2.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizer2Id));

        using var doc2 = await ExecuteGraphQlAsync(client2, """
            query Portfolio { myDashboard { totalSubmittedEvents eventAnalytics { eventSlug } } }
            """);

        var dash2 = doc2.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(1, dash2.GetProperty("totalSubmittedEvents").GetInt32());
        var slugs2 = dash2.GetProperty("eventAnalytics").EnumerateArray()
            .Select(a => a.GetProperty("eventSlug").GetString()).ToArray();
        Assert.DoesNotContain("org1-event-a", slugs2);
        Assert.DoesNotContain("org1-event-b", slugs2);
    }

    [Fact]
    public async Task Portfolio_UnauthenticatedAccess_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = "query Portfolio { myDashboard { totalSubmittedEvents } }"
        });

        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors),
            $"Expected auth error but none returned.");
        var errText = errors.ToString();
        Assert.True(
            errText.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase) ||
            errText.Contains("UNAUTHORIZED", StringComparison.OrdinalIgnoreCase) ||
            errText.Contains("not authorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error, got: {errText}");
    }

    [Fact]
    public async Task Portfolio_EmptyState_ReturnsZeroCounts()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var organizerUserId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var organizer = CreateUser("portfolio-empty@example.com", "Empty Organizer");
            organizerUserId = organizer.Id;
            dbContext.Users.Add(organizer);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, organizerUserId));

        using var document = await ExecuteGraphQlAsync(client, """
            query Portfolio {
              myDashboard {
                totalSubmittedEvents publishedEvents pendingApprovalEvents
                rejectedEvents draftEvents totalInterestedCount totalCalendarActions
                eventAnalytics { eventId }
              }
            }
            """);

        var dash = document.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(0, dash.GetProperty("totalSubmittedEvents").GetInt32());
        Assert.Equal(0, dash.GetProperty("publishedEvents").GetInt32());
        Assert.Equal(0, dash.GetProperty("pendingApprovalEvents").GetInt32());
        Assert.Equal(0, dash.GetProperty("rejectedEvents").GetInt32());
        Assert.Equal(0, dash.GetProperty("draftEvents").GetInt32());
        Assert.Equal(0, dash.GetProperty("totalInterestedCount").GetInt32());
        Assert.Equal(0, dash.GetProperty("totalCalendarActions").GetInt32());
        Assert.Empty(dash.GetProperty("eventAnalytics").EnumerateArray());
    }

    // ── Multi-tag (EventTag) tests ────────────────────────────────────────────

    [Fact]
    public async Task SubmitEvent_WithAdditionalTags_CreatesEventTags()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("tags-submit@example.com", "Tags User");
            userId = user.Id;
            dbContext.Users.Add(user);
            dbContext.Domains.Add(CreateDomain("Tech", "tech-tags"));
            dbContext.Domains.Add(CreateDomain("Crypto", "crypto-tags"));
            dbContext.Domains.Add(CreateDomain("AI", "ai-tags"));
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var nextMonth = FirstDayOfNextMonthUtc();

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation SubmitEvent($input: EventSubmissionInput!) {
              submitEvent(input: $input) {
                id name
                domain { slug }
                eventTags { id domain { slug name } }
              }
            }
            """,
            new
            {
                input = new
                {
                    domainSlug = "tech-tags",
                    additionalTagSlugs = new[] { "crypto-tags", "ai-tags" },
                    name = "Multi-Tag Event",
                    description = "An event with multiple tags.",
                    eventUrl = "https://events.example.com/multi-tag",
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
                    attendanceMode = "IN_PERSON"
                }
            });

        var ev = doc.RootElement.GetProperty("data").GetProperty("submitEvent");
        Assert.Equal("tech-tags", ev.GetProperty("domain").GetProperty("slug").GetString());

        var tags = ev.GetProperty("eventTags").EnumerateArray().ToList();
        Assert.Equal(2, tags.Count);
        var tagSlugs = tags.Select(t => t.GetProperty("domain").GetProperty("slug").GetString()).OrderBy(s => s).ToList();
        Assert.Contains("ai-tags", tagSlugs);
        Assert.Contains("crypto-tags", tagSlugs);
    }

    [Fact]
    public async Task Events_FilterByDomainSlug_AlsoMatchesEventTags()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("tag-filter@example.com", "Tag Filter User", ApplicationUserRole.Admin);
            userId = user.Id;
            var techDomain = CreateDomain("Tech", "tech-filter");
            var cryptoDomain = CreateDomain("Crypto", "crypto-filter");
            dbContext.Users.Add(user);
            dbContext.Domains.AddRange(techDomain, cryptoDomain);

            // Event with primary domain=tech, additional tag=crypto
            var ev = CreateEvent("Cross-Tag Event", "cross-tag-evt", "Tagged event", "Hall", "Prague",
                FirstDayOfNextMonthUtc(), techDomain, user);
            dbContext.Events.Add(ev);
            dbContext.EventTags.Add(new EventTag { EventId = ev.Id, DomainId = cryptoDomain.Id });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        // Filter by crypto (the additional tag) — should match
        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            query Events($filter: EventFilterInput) {
              events(filter: $filter) {
                name
                domain { slug }
                eventTags { domain { slug } }
              }
            }
            """,
            new { filter = new { domainSlug = "crypto-filter" } });

        var events = doc.RootElement.GetProperty("data").GetProperty("events").EnumerateArray().ToList();
        Assert.Single(events);
        Assert.Equal("Cross-Tag Event", events[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task UpdateMyEvent_SyncsAdditionalTags()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var userId = Guid.Empty;
        var eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("tag-update@example.com", "Tag Updater", ApplicationUserRole.Admin);
            userId = user.Id;
            var techDomain = CreateDomain("Tech", "tech-update");
            var cryptoDomain = CreateDomain("Crypto", "crypto-update");
            var aiDomain = CreateDomain("AI", "ai-update");
            dbContext.Users.Add(user);
            dbContext.Domains.AddRange(techDomain, cryptoDomain, aiDomain);

            var ev = CreateEvent("Updatable Event", "updatable-evt", "Event to update tags", "Hall", "Prague",
                FirstDayOfNextMonthUtc(), techDomain, user);
            eventId = ev.Id;
            dbContext.Events.Add(ev);
            // Start with crypto tag
            dbContext.EventTags.Add(new EventTag { EventId = ev.Id, DomainId = cryptoDomain.Id });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var nextMonth = FirstDayOfNextMonthUtc();

        // Update: remove crypto tag, add AI tag
        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateMyEvent($eventId: UUID!, $input: EventSubmissionInput!) {
              updateMyEvent(eventId: $eventId, input: $input) {
                id
                eventTags { domain { slug } }
              }
            }
            """,
            new
            {
                eventId,
                input = new
                {
                    domainSlug = "tech-update",
                    additionalTagSlugs = new[] { "ai-update" },
                    name = "Updatable Event",
                    description = "Event to update tags",
                    eventUrl = "https://events.example.com/updatable-evt",
                    venueName = "Hall",
                    addressLine1 = "Address 1",
                    city = "Prague",
                    countryCode = "CZ",
                    isFree = true,
                    currencyCode = "EUR",
                    latitude = 50.075m,
                    longitude = 14.437m,
                    startsAtUtc = nextMonth,
                    endsAtUtc = nextMonth.AddHours(4),
                    attendanceMode = "IN_PERSON"
                }
            });

        var ev = doc.RootElement.GetProperty("data").GetProperty("updateMyEvent");
        var tags = ev.GetProperty("eventTags").EnumerateArray().ToList();
        Assert.Single(tags);
        Assert.Equal("ai-update", tags[0].GetProperty("domain").GetProperty("slug").GetString());
    }

    [Fact]
    public async Task EventBySlug_ReturnsEventTags()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("tag-slug@example.com", "Tag Slug User");
            var techDomain = CreateDomain("Tech", "tech-slug-tag");
            var cryptoDomain = CreateDomain("Crypto", "crypto-slug-tag");
            dbContext.Users.Add(user);
            dbContext.Domains.AddRange(techDomain, cryptoDomain);

            var ev = CreateEvent("Tagged Event", "tagged-event-slug", "Event with tags", "Hall", "Prague",
                FirstDayOfNextMonthUtc(), techDomain, user);
            dbContext.Events.Add(ev);
            dbContext.EventTags.Add(new EventTag { EventId = ev.Id, DomainId = cryptoDomain.Id });
        });

        using var client = factory.CreateClient();

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                name
                domain { slug }
                eventTags { domain { slug name } }
              }
            }
            """,
            new { slug = "tagged-event-slug" });

        var ev = doc.RootElement.GetProperty("data").GetProperty("eventBySlug");
        Assert.Equal("Tagged Event", ev.GetProperty("name").GetString());
        var tags = ev.GetProperty("eventTags").EnumerateArray().ToList();
        Assert.Single(tags);
        Assert.Equal("crypto-slug-tag", tags[0].GetProperty("domain").GetProperty("slug").GetString());
    }

    // ── communityGroups on eventBySlug ────────────────────────────────────────

    [Fact]
    public async Task EventBySlug_CommunityGroups_ReturnsCommunityGroupsAssociatedWithEvent()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid ownerId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("cgev-owner@example.com", "CGEvOwner");
            ownerId = owner.Id;
            dbContext.Users.Add(owner);

            var domain = CreateDomain("Tech", "tech-cg-ev");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Event Community",
                Slug = "event-community",
                Summary = "A community that organizes tech events.",
                IsActive = true,
                CreatedByUserId = owner.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            var catalogEvent = CreateEvent("Community-Owned Talk", "community-owned-talk",
                "A talk organized by the community.", "Venue", "Prague",
                DateTime.UtcNow.AddDays(10), domain, owner);
            dbContext.Events.Add(catalogEvent);

            dbContext.CommunityGroupEvents.Add(new EventsApi.Data.Entities.CommunityGroupEvent
            {
                GroupId = group.Id,
                EventId = catalogEvent.Id,
                AddedByUserId = owner.Id,
            });
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                name
                communityGroups { id name slug summary }
              }
            }
            """,
            new { slug = "community-owned-talk" });

        var result = document.RootElement.GetProperty("data").GetProperty("eventBySlug");
        Assert.Equal("Community-Owned Talk", result.GetProperty("name").GetString());
        var groups = result.GetProperty("communityGroups").EnumerateArray().ToList();
        Assert.Single(groups);
        Assert.Equal("Event Community", groups[0].GetProperty("name").GetString());
        Assert.Equal("event-community", groups[0].GetProperty("slug").GetString());
        Assert.Equal("A community that organizes tech events.", groups[0].GetProperty("summary").GetString());
    }

    [Fact]
    public async Task EventBySlug_CommunityGroups_ReturnsEmptyListWhenNoGroupsAssociated()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid ownerId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("cgev-none@example.com", "CGEvNone");
            ownerId = owner.Id;
            dbContext.Users.Add(owner);

            var domain = CreateDomain("Tech", "tech-cg-none");
            dbContext.Domains.Add(domain);

            var catalogEvent = CreateEvent("Standalone Talk", "standalone-talk",
                "A talk with no community.", "Venue", "Prague",
                DateTime.UtcNow.AddDays(10), domain, owner);
            dbContext.Events.Add(catalogEvent);
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                name
                communityGroups { id name slug }
              }
            }
            """,
            new { slug = "standalone-talk" });

        var result = document.RootElement.GetProperty("data").GetProperty("eventBySlug");
        Assert.Equal("Standalone Talk", result.GetProperty("name").GetString());
        var groups = result.GetProperty("communityGroups").EnumerateArray().ToList();
        Assert.Empty(groups);
    }

    [Fact]
    public async Task EventBySlug_CommunityGroups_ExcludesInactiveGroups()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid ownerId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("cgev-inactive@example.com", "CGEvInactive");
            ownerId = owner.Id;
            dbContext.Users.Add(owner);

            var domain = CreateDomain("Tech", "tech-cg-inactive");
            dbContext.Domains.Add(domain);

            var inactiveGroup = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Inactive Community",
                Slug = "inactive-community",
                IsActive = false,
                CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(inactiveGroup);

            var catalogEvent = CreateEvent("Inactive Group Event", "inactive-group-event",
                "An event whose group is inactive.", "Venue", "Prague",
                DateTime.UtcNow.AddDays(10), domain, owner);
            dbContext.Events.Add(catalogEvent);

            dbContext.CommunityGroupEvents.Add(new EventsApi.Data.Entities.CommunityGroupEvent
            {
                GroupId = inactiveGroup.Id,
                EventId = catalogEvent.Id,
                AddedByUserId = owner.Id,
            });
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query EventBySlug($slug: String!) {
              eventBySlug(slug: $slug) {
                name
                communityGroups { id name slug }
              }
            }
            """,
            new { slug = "inactive-group-event" });

        var result = document.RootElement.GetProperty("data").GetProperty("eventBySlug");
        var groups = result.GetProperty("communityGroups").EnumerateArray().ToList();
        Assert.Empty(groups);
    }

    // ── previewExternalEvents tests ───────────────────────────────────────────

    [Fact]
    public async Task PreviewExternalEvents_VerifiedClaim_ReturnsCandidatesWithDuplicateFlags()
    {
        var externalEvents = new List<EventsApi.Adapters.ExternalEventData>
        {
            new(
                ExternalId: "preview-evt-001",
                Name: "Preview Event One",
                Description: "First preview event.",
                EventUrl: "https://www.meetup.com/preview-group/events/001",
                StartsAtUtc: new DateTime(2030, 8, 1, 18, 0, 0, DateTimeKind.Utc),
                EndsAtUtc: new DateTime(2030, 8, 1, 20, 0, 0, DateTimeKind.Utc),
                VenueName: "Hub A", AddressLine1: "Addr 1", City: "Brno",
                CountryCode: "CZ", Latitude: 49.19m, Longitude: 16.60m,
                IsFree: true, PriceAmount: null, CurrencyCode: null, Language: "en"),
            new(
                ExternalId: "preview-evt-002",
                Name: "Preview Event Two",
                Description: "Second preview event — missing start time, should be non-importable.",
                EventUrl: null,
                StartsAtUtc: null, // missing — non-importable
                EndsAtUtc: null,
                VenueName: null, AddressLine1: null, City: null,
                CountryCode: null, Latitude: null, Longitude: null,
                IsFree: null, PriceAmount: null, CurrencyCode: null, Language: null),
        };

        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await using var factory = new EventsApiWebApplicationFactory(services =>
        {
            services.RemoveAll<EventsApi.Adapters.MeetupAdapter>();
            services.RemoveAll<EventsApi.Adapters.LumaAdapter>();
            services.RemoveAll<EventsApi.Adapters.ExternalSourceAdapterFactory>();
            var seeded = new SeededMeetupAdapter(externalEvents);
            services.AddSingleton<EventsApi.Adapters.ExternalSourceAdapterFactory>(
                _ => new EventsApi.Adapters.ExternalSourceAdapterFactory(seeded, seeded));
        });

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("preview-admin@example.com", "Preview Admin", ApplicationUserRole.Contributor);
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Preview Group", Slug = "preview-group",
                IsActive = true, CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id, UserId = admin.Id,
                Role = CommunityMemberRole.Admin,
                Status = CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/preview-group",
                SourceIdentifier = "preview-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            query PreviewExternalEvents($claimId: UUID!) {
              previewExternalEvents(claimId: $claimId) {
                externalId name startsAtUtc
                alreadyImported isImportable importBlockReason
              }
            }
            """,
            new { claimId });

        var previews = doc.RootElement.GetProperty("data").GetProperty("previewExternalEvents")
            .EnumerateArray().ToList();

        Assert.Equal(2, previews.Count);

        var p1 = previews.First(p => p.GetProperty("externalId").GetString() == "preview-evt-001");
        Assert.Equal("Preview Event One", p1.GetProperty("name").GetString());
        Assert.False(p1.GetProperty("alreadyImported").GetBoolean());
        Assert.True(p1.GetProperty("isImportable").GetBoolean());
        Assert.Equal(JsonValueKind.Null, p1.GetProperty("importBlockReason").ValueKind);

        var p2 = previews.First(p => p.GetProperty("externalId").GetString() == "preview-evt-002");
        Assert.False(p2.GetProperty("alreadyImported").GetBoolean());
        Assert.False(p2.GetProperty("isImportable").GetBoolean());
        Assert.NotNull(p2.GetProperty("importBlockReason").GetString());
    }

    [Fact]
    public async Task PreviewExternalEvents_AlreadyImportedEvent_ShowsAlreadyImportedFlag()
    {
        var externalEvents = new List<EventsApi.Adapters.ExternalEventData>
        {
            new(
                ExternalId: "already-imported-evt",
                Name: "Already Imported Event",
                Description: "This event was already imported.",
                EventUrl: "https://www.meetup.com/dup-group/events/already",
                StartsAtUtc: new DateTime(2030, 9, 1, 18, 0, 0, DateTimeKind.Utc),
                EndsAtUtc: new DateTime(2030, 9, 1, 20, 0, 0, DateTimeKind.Utc),
                VenueName: "Venue", AddressLine1: "Addr", City: "Prague",
                CountryCode: "CZ", Latitude: 50.075m, Longitude: 14.437m,
                IsFree: true, PriceAmount: null, CurrencyCode: null, Language: "en"),
        };

        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await using var factory = new EventsApiWebApplicationFactory(services =>
        {
            services.RemoveAll<EventsApi.Adapters.MeetupAdapter>();
            services.RemoveAll<EventsApi.Adapters.LumaAdapter>();
            services.RemoveAll<EventsApi.Adapters.ExternalSourceAdapterFactory>();
            var seeded = new SeededMeetupAdapter(externalEvents);
            services.AddSingleton<EventsApi.Adapters.ExternalSourceAdapterFactory>(
                _ => new EventsApi.Adapters.ExternalSourceAdapterFactory(seeded, seeded));
        });

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("duppreview-admin@example.com", "DupPreview Admin", ApplicationUserRole.Contributor);
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = CreateDomain("Tech", "tech-dup-preview");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Dup Preview Group", Slug = "dup-preview-group",
                IsActive = true, CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id, UserId = admin.Id,
                Role = CommunityMemberRole.Admin,
                Status = CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/dup-preview-group",
                SourceIdentifier = "dup-preview-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);

            // Pre-seed the already-imported event
            var alreadyImported = CreateEvent("Already Imported Event", "already-imported-evt-slug",
                "Already imported.", "Venue", "Prague",
                new DateTime(2030, 9, 1, 18, 0, 0, DateTimeKind.Utc), domain, admin);
            alreadyImported.ExternalSourceClaimId = claimId;
            alreadyImported.ExternalSourceEventId = "already-imported-evt";
            dbContext.Events.Add(alreadyImported);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            query PreviewExternalEvents($claimId: UUID!) {
              previewExternalEvents(claimId: $claimId) {
                externalId alreadyImported isImportable importBlockReason
              }
            }
            """,
            new { claimId });

        var previews = doc.RootElement.GetProperty("data").GetProperty("previewExternalEvents")
            .EnumerateArray().ToList();

        Assert.Single(previews);
        var p = previews[0];
        Assert.Equal("already-imported-evt", p.GetProperty("externalId").GetString());
        Assert.True(p.GetProperty("alreadyImported").GetBoolean());
        Assert.False(p.GetProperty("isImportable").GetBoolean());
        Assert.Equal("Already imported.", p.GetProperty("importBlockReason").GetString());
    }

    [Fact]
    public async Task PreviewExternalEvents_UnverifiedClaim_ReturnsForbiddenError()
    {
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("preview-unverified@example.com", "PreviewUnverified", ApplicationUserRole.Contributor);
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Unverified Group", Slug = "unverified-group",
                IsActive = true, CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id, UserId = admin.Id,
                Role = CommunityMemberRole.Admin,
                Status = CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/unverified-group",
                SourceIdentifier = "unverified-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview,
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                query PreviewExternalEvents($claimId: UUID!) {
                  previewExternalEvents(claimId: $claimId) { externalId }
                }
                """,
            variables = new { claimId }
        });
        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("CLAIM_NOT_VERIFIED", errors.ToString());
    }

    [Fact]
    public async Task PreviewExternalEvents_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                query PreviewExternalEvents($claimId: UUID!) {
                  previewExternalEvents(claimId: $claimId) { externalId }
                }
                """,
            variables = new { claimId = Guid.NewGuid() }
        });
        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.True(doc.RootElement.TryGetProperty("errors", out _));
    }

    // ── importExternalEvents tests ────────────────────────────────────────────

    [Fact]
    public async Task ImportExternalEvents_SelectiveImport_OnlyImportsChosenEvents()
    {
        var externalEvents = new List<EventsApi.Adapters.ExternalEventData>
        {
            new(ExternalId: "sel-evt-001", Name: "Selected Event",
                Description: "To import.", EventUrl: "https://www.meetup.com/sel/events/001",
                StartsAtUtc: new DateTime(2030, 10, 1, 18, 0, 0, DateTimeKind.Utc),
                EndsAtUtc: new DateTime(2030, 10, 1, 20, 0, 0, DateTimeKind.Utc),
                VenueName: "Venue", AddressLine1: "Addr", City: "Brno",
                CountryCode: "CZ", Latitude: 49.19m, Longitude: 16.60m,
                IsFree: true, PriceAmount: null, CurrencyCode: null, Language: "en"),
            new(ExternalId: "sel-evt-002", Name: "Not Selected Event",
                Description: "Not imported.", EventUrl: "https://www.meetup.com/sel/events/002",
                StartsAtUtc: new DateTime(2030, 10, 2, 18, 0, 0, DateTimeKind.Utc),
                EndsAtUtc: new DateTime(2030, 10, 2, 20, 0, 0, DateTimeKind.Utc),
                VenueName: "Venue2", AddressLine1: "Addr2", City: "Brno",
                CountryCode: "CZ", Latitude: 49.19m, Longitude: 16.60m,
                IsFree: true, PriceAmount: null, CurrencyCode: null, Language: "en"),
        };

        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await using var factory = new EventsApiWebApplicationFactory(services =>
        {
            services.RemoveAll<EventsApi.Adapters.MeetupAdapter>();
            services.RemoveAll<EventsApi.Adapters.LumaAdapter>();
            services.RemoveAll<EventsApi.Adapters.ExternalSourceAdapterFactory>();
            var seeded = new SeededMeetupAdapter(externalEvents);
            services.AddSingleton<EventsApi.Adapters.ExternalSourceAdapterFactory>(
                _ => new EventsApi.Adapters.ExternalSourceAdapterFactory(seeded, seeded));
        });

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("sel-admin@example.com", "Sel Admin", ApplicationUserRole.Contributor);
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = CreateDomain("Tech", "tech-sel");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Sel Group", Slug = "sel-group",
                IsActive = true, CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id, UserId = admin.Id,
                Role = CommunityMemberRole.Admin, Status = CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/sel-group",
                SourceIdentifier = "sel-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        // Import only sel-evt-001
        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation ImportExternalEvents($claimId: UUID!, $input: ImportExternalEventsInput!) {
              importExternalEvents(claimId: $claimId, input: $input) {
                importedCount skippedCount errorCount summary
              }
            }
            """,
            new { claimId, input = new { externalIds = new[] { "sel-evt-001" } } });

        var result = doc.RootElement.GetProperty("data").GetProperty("importExternalEvents");
        Assert.Equal(1, result.GetProperty("importedCount").GetInt32());
        Assert.Equal(0, result.GetProperty("skippedCount").GetInt32());
        Assert.Equal(0, result.GetProperty("errorCount").GetInt32());
        Assert.Contains("1 event", result.GetProperty("summary").GetString());

        // Verify only 1 event was created and it's PendingApproval
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();
        var importedEvents = await db.Events
            .Where(e => e.ExternalSourceClaimId == claimId)
            .ToListAsync();
        Assert.Single(importedEvents);
        Assert.Equal("Selected Event", importedEvents[0].Name);
        Assert.Equal(EventStatus.PendingApproval, importedEvents[0].Status);
        Assert.Equal("sel-evt-001", importedEvents[0].ExternalSourceEventId);
    }

    [Fact]
    public async Task ImportExternalEvents_DuplicatePrevention_SkipsAlreadyImportedEvents()
    {
        var externalEvents = new List<EventsApi.Adapters.ExternalEventData>
        {
            new(ExternalId: "dup-sel-evt-001", Name: "Duplicate Selected Event",
                Description: "Already imported.", EventUrl: null,
                StartsAtUtc: new DateTime(2030, 11, 1, 18, 0, 0, DateTimeKind.Utc),
                EndsAtUtc: null, VenueName: null, AddressLine1: null, City: "Prague",
                CountryCode: "CZ", Latitude: 50.075m, Longitude: 14.437m,
                IsFree: true, PriceAmount: null, CurrencyCode: null, Language: null),
        };

        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await using var factory = new EventsApiWebApplicationFactory(services =>
        {
            services.RemoveAll<EventsApi.Adapters.MeetupAdapter>();
            services.RemoveAll<EventsApi.Adapters.LumaAdapter>();
            services.RemoveAll<EventsApi.Adapters.ExternalSourceAdapterFactory>();
            var seeded = new SeededMeetupAdapter(externalEvents);
            services.AddSingleton<EventsApi.Adapters.ExternalSourceAdapterFactory>(
                _ => new EventsApi.Adapters.ExternalSourceAdapterFactory(seeded, seeded));
        });

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("dupsel-admin@example.com", "DupSel Admin", ApplicationUserRole.Contributor);
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = CreateDomain("Tech", "tech-dupsel");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "DupSel Group", Slug = "dupsel-group",
                IsActive = true, CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id, UserId = admin.Id,
                Role = CommunityMemberRole.Admin, Status = CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/dupsel-group",
                SourceIdentifier = "dupsel-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);

            // Pre-seed the already-imported event
            var existing = CreateEvent("Duplicate Selected Event", "dup-sel-evt-001-slug",
                "Already imported.", "Venue", "Prague",
                new DateTime(2030, 11, 1, 18, 0, 0, DateTimeKind.Utc), domain, admin);
            existing.ExternalSourceClaimId = claimId;
            existing.ExternalSourceEventId = "dup-sel-evt-001";
            existing.Status = EventStatus.PendingApproval;
            dbContext.Events.Add(existing);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        // Try to import again — should skip
        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation ImportExternalEvents($claimId: UUID!, $input: ImportExternalEventsInput!) {
              importExternalEvents(claimId: $claimId, input: $input) {
                importedCount skippedCount errorCount summary
              }
            }
            """,
            new { claimId, input = new { externalIds = new[] { "dup-sel-evt-001" } } });

        var result = doc.RootElement.GetProperty("data").GetProperty("importExternalEvents");
        Assert.Equal(0, result.GetProperty("importedCount").GetInt32());
        Assert.Equal(1, result.GetProperty("skippedCount").GetInt32());
    }

    [Fact]
    public async Task ImportExternalEvents_ImportedEvents_AreInPendingApproval_NotPublished()
    {
        var externalEvents = new List<EventsApi.Adapters.ExternalEventData>
        {
            new(ExternalId: "moderation-evt-001", Name: "Moderation Test Event",
                Description: "Must land in PendingApproval.", EventUrl: null,
                StartsAtUtc: new DateTime(2030, 12, 1, 18, 0, 0, DateTimeKind.Utc),
                EndsAtUtc: null, VenueName: null, AddressLine1: null, City: "Bratislava",
                CountryCode: "SK", Latitude: 48.14m, Longitude: 17.10m,
                IsFree: true, PriceAmount: null, CurrencyCode: null, Language: null),
        };

        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await using var factory = new EventsApiWebApplicationFactory(services =>
        {
            services.RemoveAll<EventsApi.Adapters.MeetupAdapter>();
            services.RemoveAll<EventsApi.Adapters.LumaAdapter>();
            services.RemoveAll<EventsApi.Adapters.ExternalSourceAdapterFactory>();
            var seeded = new SeededMeetupAdapter(externalEvents);
            services.AddSingleton<EventsApi.Adapters.ExternalSourceAdapterFactory>(
                _ => new EventsApi.Adapters.ExternalSourceAdapterFactory(seeded, seeded));
        });

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("mod-import@example.com", "ModImport Admin", ApplicationUserRole.Contributor);
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = CreateDomain("Tech", "tech-mod-import");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Mod Group", Slug = "mod-group",
                IsActive = true, CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id, UserId = admin.Id,
                Role = CommunityMemberRole.Admin, Status = CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/mod-group",
                SourceIdentifier = "mod-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation ImportExternalEvents($claimId: UUID!, $input: ImportExternalEventsInput!) {
              importExternalEvents(claimId: $claimId, input: $input) {
                importedCount summary
              }
            }
            """,
            new { claimId, input = new { externalIds = new[] { "moderation-evt-001" } } });

        var result = doc.RootElement.GetProperty("data").GetProperty("importExternalEvents");
        Assert.Equal(1, result.GetProperty("importedCount").GetInt32());

        // Verify the imported event is NOT published — it must be in PendingApproval
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();
        var imported = await db.Events
            .SingleAsync(e => e.ExternalSourceClaimId == claimId);
        Assert.Equal(EventStatus.PendingApproval, imported.Status);
        Assert.Null(imported.PublishedAtUtc);
    }

    [Fact]
    public async Task ImportExternalEvents_UnverifiedClaim_ReturnsError()
    {
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("import-unverified@example.com", "ImportUnverified", ApplicationUserRole.Contributor);
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Unverified Import Group", Slug = "unverified-import-group",
                IsActive = true, CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id, UserId = admin.Id,
                Role = CommunityMemberRole.Admin, Status = CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/unverified-import-group",
                SourceIdentifier = "unverified-import-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview,
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ImportExternalEvents($claimId: UUID!, $input: ImportExternalEventsInput!) {
                  importExternalEvents(claimId: $claimId, input: $input) { importedCount }
                }
                """,
            variables = new { claimId, input = new { externalIds = new[] { "any-evt" } } }
        });
        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("CLAIM_NOT_VERIFIED", errors.ToString());
    }

    [Fact]
    public async Task ImportExternalEvents_NonAdmin_ReturnsForbidden()
    {
        Guid memberId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("import-owner@example.com", "Owner", ApplicationUserRole.Contributor);
            var member = CreateUser("import-member@example.com", "Member", ApplicationUserRole.Contributor);
            memberId = member.Id;
            dbContext.Users.AddRange(owner, member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Non Admin Import Group", Slug = "non-admin-import-group",
                IsActive = true, CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id, UserId = member.Id,
                Role = CommunityMemberRole.Member, Status = CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/non-admin-import-group",
                SourceIdentifier = "non-admin-import-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = owner.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, memberId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ImportExternalEvents($claimId: UUID!, $input: ImportExternalEventsInput!) {
                  importExternalEvents(claimId: $claimId, input: $input) { importedCount }
                }
                """,
            variables = new { claimId, input = new { externalIds = new[] { "any-evt" } } }
        });
        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("FORBIDDEN", errors.ToString());
    }

    // ── ReviewExternalSourceClaim mutation ────────────────────────────────────

    [Fact]
    public async Task ReviewExternalSourceClaim_GlobalAdmin_CanVerifyClaim()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("review-admin@example.com", "Review Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var owner = CreateUser("review-owner@example.com", "Owner");
            dbContext.Users.AddRange(admin, owner);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Review Group", Slug = "review-group",
                IsActive = true, CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/review-group",
                SourceIdentifier = "review-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview,
                CreatedByUserId = owner.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation ReviewClaim($input: ReviewExternalSourceClaimInput!) {
              reviewExternalSourceClaim(input: $input) { id status }
            }
            """,
            new { input = new { claimId, newStatus = "VERIFIED" } });

        var result = doc.RootElement.GetProperty("data").GetProperty("reviewExternalSourceClaim");
        Assert.Equal("VERIFIED", result.GetProperty("status").GetString());
    }

    [Fact]
    public async Task ReviewExternalSourceClaim_GlobalAdmin_CanRejectClaim()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("reject-admin@example.com", "Reject Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var owner = CreateUser("reject-owner@example.com", "Owner");
            dbContext.Users.AddRange(admin, owner);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Reject Group", Slug = "reject-group",
                IsActive = true, CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Luma,
                SourceUrl = "https://lu.ma/reject-group",
                SourceIdentifier = "reject-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview,
                CreatedByUserId = owner.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation ReviewClaim($input: ReviewExternalSourceClaimInput!) {
              reviewExternalSourceClaim(input: $input) { id status }
            }
            """,
            new { input = new { claimId, newStatus = "REJECTED" } });

        var result = doc.RootElement.GetProperty("data").GetProperty("reviewExternalSourceClaim");
        Assert.Equal("REJECTED", result.GetProperty("status").GetString());
    }

    [Fact]
    public async Task ReviewExternalSourceClaim_WithAdminNote_StoresNoteOnRejection()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("note-admin@example.com", "Note Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var owner = CreateUser("note-owner@example.com", "Note Owner");
            dbContext.Users.AddRange(admin, owner);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Note Group", Slug = "note-group",
                IsActive = true, CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/note-group",
                SourceIdentifier = "note-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview,
                CreatedByUserId = owner.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation ReviewClaim($input: ReviewExternalSourceClaimInput!) {
              reviewExternalSourceClaim(input: $input) { id status adminNote }
            }
            """,
            new { input = new { claimId, newStatus = "REJECTED", adminNote = "We could not verify your ownership of this group." } });

        var result = doc.RootElement.GetProperty("data").GetProperty("reviewExternalSourceClaim");
        Assert.Equal("REJECTED", result.GetProperty("status").GetString());
        Assert.Equal("We could not verify your ownership of this group.", result.GetProperty("adminNote").GetString());

        // Verify persisted in DB
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();
        var persisted = await db.ExternalSourceClaims.FindAsync(claimId);
        Assert.NotNull(persisted);
        Assert.Equal("We could not verify your ownership of this group.", persisted.AdminNote);
    }

    [Fact]
    public async Task ReviewExternalSourceClaim_Verify_DoesNotStoreAdminNote()
    {
        // Even if the admin accidentally submits a note while clicking Verify,
        // the backend must discard it so verified claims never carry rejection text.
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("verify-note-admin@example.com", "Verify Note Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var owner = CreateUser("verify-note-owner@example.com", "Verify Note Owner");
            dbContext.Users.AddRange(admin, owner);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Verify Note Group", Slug = "verify-note-group",
                IsActive = true, CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/verify-note-group",
                SourceIdentifier = "verify-note-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview,
                CreatedByUserId = owner.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        // Submit with adminNote but newStatus = VERIFIED — note must be discarded.
        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation ReviewClaim($input: ReviewExternalSourceClaimInput!) {
              reviewExternalSourceClaim(input: $input) { id status adminNote }
            }
            """,
            new { input = new { claimId, newStatus = "VERIFIED", adminNote = "This should not be stored." } });

        var result = doc.RootElement.GetProperty("data").GetProperty("reviewExternalSourceClaim");
        Assert.Equal("VERIFIED", result.GetProperty("status").GetString());
        Assert.True(result.GetProperty("adminNote").ValueKind == System.Text.Json.JsonValueKind.Null,
            "adminNote must be null on a verified claim");

        // Verify persisted in DB
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();
        var persisted = await db.ExternalSourceClaims.FindAsync(claimId);
        Assert.NotNull(persisted);
        Assert.Null(persisted.AdminNote);
    }

    [Fact]
    public async Task ReviewExternalSourceClaim_WhitespaceOnlyNote_NormalizedToNull()
    {
        // A whitespace-only note must be treated as "no note" — persisted as null, not "".
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("ws-note-admin@example.com", "WS Note Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var owner = CreateUser("ws-note-owner@example.com", "WS Note Owner");
            dbContext.Users.AddRange(admin, owner);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "WS Note Group", Slug = "ws-note-group",
                IsActive = true, CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Luma,
                SourceUrl = "https://lu.ma/ws-note-group",
                SourceIdentifier = "ws-note-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview,
                CreatedByUserId = owner.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        // Reject with a whitespace-only note — must be stored as null, not "".
        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation ReviewClaim($input: ReviewExternalSourceClaimInput!) {
              reviewExternalSourceClaim(input: $input) { id status adminNote }
            }
            """,
            new { input = new { claimId, newStatus = "REJECTED", adminNote = "   " } });

        var result = doc.RootElement.GetProperty("data").GetProperty("reviewExternalSourceClaim");
        Assert.Equal("REJECTED", result.GetProperty("status").GetString());
        Assert.True(result.GetProperty("adminNote").ValueKind == System.Text.Json.JsonValueKind.Null,
            "adminNote must be null when the supplied note is whitespace-only");

        // Verify persisted in DB
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();
        var persisted = await db.ExternalSourceClaims.FindAsync(claimId);
        Assert.NotNull(persisted);
        Assert.Null(persisted.AdminNote);
    }

    [Fact]
    public async Task ReviewExternalSourceClaim_AdminNoteTooLong_ReturnsValidationError()
    {
        // AdminNote is bounded at 2 000 characters. Submitting more must return a validation error.
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("toolong-admin@example.com", "Too Long Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var owner = CreateUser("toolong-owner@example.com", "Too Long Owner");
            dbContext.Users.AddRange(admin, owner);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Too Long Note Group", Slug = "toolong-note-group",
                IsActive = true, CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/toolong-note-group",
                SourceIdentifier = "toolong-note-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview,
                CreatedByUserId = owner.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        // Note is 2 001 characters — one over the 2 000 limit.
        var tooLongNote = new string('x', 2001);
        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ReviewClaim($input: ReviewExternalSourceClaimInput!) {
                  reviewExternalSourceClaim(input: $input) { id status adminNote }
                }
                """,
            variables = new { input = new { claimId, newStatus = "REJECTED", adminNote = tooLongNote } }
        });
        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors),
            "Expected a validation error for an overlong AdminNote.");
        Assert.Contains("2 000", errors.ToString()); // error message mentions the character limit

        // DB must remain unchanged — claim still PENDING_REVIEW, no note stored.
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();
        var persisted = await db.ExternalSourceClaims.FindAsync(claimId);
        Assert.NotNull(persisted);
        Assert.Equal(EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview, persisted.Status);
        Assert.Null(persisted.AdminNote);
    }

    [Fact]
    public async Task AddExternalSourceClaim_DifferentGroups_CanClaimSameSource()
    {
        // The uniqueness constraint is scoped to (GroupId, SourceType, SourceIdentifier).
        // Two distinct community groups are each allowed to connect the same external source —
        // they manage independent import workflows for their own communities.
        await using var factory = new EventsApiWebApplicationFactory();
        Guid admin1Id = Guid.Empty;
        Guid admin2Id = Guid.Empty;
        Guid group1Id = Guid.Empty;
        Guid group2Id = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin1 = CreateUser("mg-admin1@example.com", "Multi Group Admin 1");
            var admin2 = CreateUser("mg-admin2@example.com", "Multi Group Admin 2");
            admin1Id = admin1.Id;
            admin2Id = admin2.Id;
            dbContext.Users.AddRange(admin1, admin2);

            var group1 = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Multi Group A", Slug = "multi-group-a",
                IsActive = true, CreatedByUserId = admin1.Id,
            };
            var group2 = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Multi Group B", Slug = "multi-group-b",
                IsActive = true, CreatedByUserId = admin2.Id,
            };
            group1Id = group1.Id;
            group2Id = group2.Id;
            dbContext.CommunityGroups.AddRange(group1, group2);

            dbContext.CommunityMemberships.AddRange(
                new EventsApi.Data.Entities.CommunityMembership
                {
                    GroupId = group1.Id, UserId = admin1.Id,
                    Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                    Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
                },
                new EventsApi.Data.Entities.CommunityMembership
                {
                    GroupId = group2.Id, UserId = admin2.Id,
                    Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                    Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
                });
        });

        const string addMutation = """
            mutation AddClaim($groupId: UUID!, $input: AddExternalSourceClaimInput!) {
              addExternalSourceClaim(groupId: $groupId, input: $input) { id status }
            }
            """;
        const string sharedUrl = "https://lu.ma/shared-luma-community";

        // Group A admin claims the source — should succeed.
        using var client1 = factory.CreateClient();
        client1.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, admin1Id));

        using var doc1 = await ExecuteGraphQlAsync(
            client1, addMutation,
            new { groupId = group1Id, input = new { sourceType = "LUMA", sourceUrl = sharedUrl } });
        Assert.False(doc1.RootElement.TryGetProperty("errors", out _),
            "Group A claiming the shared source must succeed.");

        // Group B admin claims the same URL — must also succeed (different group).
        using var client2 = factory.CreateClient();
        client2.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, admin2Id));

        using var doc2 = await ExecuteGraphQlAsync(
            client2, addMutation,
            new { groupId = group2Id, input = new { sourceType = "LUMA", sourceUrl = sharedUrl } });
        Assert.False(doc2.RootElement.TryGetProperty("errors", out _),
            "Group B claiming the same shared source must also succeed — the uniqueness constraint is per-group.");
    }

    [Fact]
    public async Task TriggerExternalSync_DbLevelDuplicateGuard_IsIdempotent()
    {
        // Regression test for the DB-level unique index on (ExternalSourceClaimId, ExternalSourceEventId).
        // Pre-seed a CatalogEvent with the same ExternalSourceClaimId + ExternalSourceEventId that
        // the adapter would produce, then verify that a sync updates it gracefully (no exception, no
        // duplicate row created).
        var externalEvents = new List<EventsApi.Adapters.ExternalEventData>
        {
            new(
                ExternalId: "db-guard-ext-001",
                Name: "DB Guard Event",
                Description: "Used to verify the DB-level deduplication constraint.",
                EventUrl: "https://www.meetup.com/db-guard/events/db-guard-ext-001",
                StartsAtUtc: new DateTime(2031, 1, 1, 10, 0, 0, DateTimeKind.Utc),
                EndsAtUtc: new DateTime(2031, 1, 1, 12, 0, 0, DateTimeKind.Utc),
                VenueName: "Guard Venue",
                AddressLine1: null, City: "Bratislava", CountryCode: "SK",
                Latitude: null, Longitude: null, IsFree: true,
                PriceAmount: null, CurrencyCode: null, Language: null),
        };

        await using var factory = new EventsApiWebApplicationFactory(services =>
        {
            var adapter = new SeededMeetupAdapter(externalEvents);
            services.RemoveAll<EventsApi.Adapters.ExternalSourceAdapterFactory>();
            services.AddSingleton(new EventsApi.Adapters.ExternalSourceAdapterFactory(adapter, adapter));
        });

        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("dbguard-admin@example.com", "DB Guard Admin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = CreateDomain("DB Guard Domain", "db-guard-domain");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "DB Guard Group", Slug = "db-guard-group",
                IsActive = true, CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id, UserId = admin.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/db-guard",
                SourceIdentifier = "db-guard",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);

            // Pre-seed the event as if a previous sync already imported it.
            dbContext.Events.Add(new EventsApi.Data.Entities.CatalogEvent
            {
                Name = "DB Guard Event",
                Slug = "db-guard-event",
                Description = "Pre-seeded by a prior sync.",
                EventUrl = "https://www.meetup.com/db-guard/events/db-guard-ext-001",
                VenueName = "Guard Venue",
                AddressLine1 = "",
                City = "Bratislava",
                CountryCode = "SK",
                StartsAtUtc = new DateTime(2031, 1, 1, 10, 0, 0, DateTimeKind.Utc),
                EndsAtUtc = new DateTime(2031, 1, 1, 12, 0, 0, DateTimeKind.Utc),
                Status = EventsApi.Data.Entities.EventStatus.PendingApproval,
                DomainId = domain.Id,
                SubmittedByUserId = admin.Id,
                ExternalSourceClaimId = claimId,
                ExternalSourceEventId = "db-guard-ext-001",
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        // A sync with the same event pre-seeded must update gracefully with 0 errors.
        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            mutation Sync($claimId: UUID!) {
              triggerExternalSync(claimId: $claimId) {
                importedCount updatedCount skippedCount errorCount
              }
            }
            """,
            new { claimId });

        var result = doc.RootElement.GetProperty("data").GetProperty("triggerExternalSync");
        Assert.Equal(0, result.GetProperty("importedCount").GetInt32());
        Assert.Equal(1, result.GetProperty("updatedCount").GetInt32());
        Assert.Equal(0, result.GetProperty("skippedCount").GetInt32());
        Assert.Equal(0, result.GetProperty("errorCount").GetInt32());

        // Confirm exactly one DB record for this external ID — no duplicate created.
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();
        var count = await db.Events.CountAsync(e => e.ExternalSourceEventId == "db-guard-ext-001");
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task ReviewExternalSourceClaim_NonAdmin_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("review-non-admin@example.com", "Non Admin");
            userId = user.Id;
            var owner = CreateUser("review-owner2@example.com", "Owner");
            dbContext.Users.AddRange(user, owner);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Non Admin Review Group", Slug = "non-admin-review-group",
                IsActive = true, CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/non-admin-review-group",
                SourceIdentifier = "non-admin-review-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview,
                CreatedByUserId = owner.Id,
            };
            claimId = claim.Id;
            dbContext.ExternalSourceClaims.Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ReviewClaim($input: ReviewExternalSourceClaimInput!) {
                  reviewExternalSourceClaim(input: $input) { id status }
                }
                """,
            variables = new { input = new { claimId, newStatus = "VERIFIED" } }
        });
        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.True(doc.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("FORBIDDEN", errors.ToString());
    }

    [Fact]
    public async Task ReviewExternalSourceClaim_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        var response = await factory.CreateClient().PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ReviewClaim($input: ReviewExternalSourceClaimInput!) {
                  reviewExternalSourceClaim(input: $input) { id status }
                }
                """,
            variables = new { input = new { claimId = Guid.NewGuid(), newStatus = "VERIFIED" } }
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
    public async Task ReviewExternalSourceClaim_AlreadyDecided_ReturnsClaimNotPendingError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid verifiedClaimId = Guid.Empty;
        Guid rejectedClaimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("decided-admin@example.com", "Decided Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var owner = CreateUser("decided-owner@example.com", "Owner");
            dbContext.Users.AddRange(admin, owner);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Decided Group", Slug = "decided-group",
                IsActive = true, CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var verifiedClaim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/decided-group",
                SourceIdentifier = "decided-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = owner.Id,
            };
            verifiedClaimId = verifiedClaim.Id;

            var rejectedClaim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Luma,
                SourceUrl = "https://lu.ma/decided-group",
                SourceIdentifier = "decided-group-luma",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Rejected,
                CreatedByUserId = owner.Id,
            };
            rejectedClaimId = rejectedClaim.Id;

            dbContext.ExternalSourceClaims.AddRange(verifiedClaim, rejectedClaim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        // Attempting to reject an already-verified claim must fail
        var verifiedResponse = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ReviewClaim($input: ReviewExternalSourceClaimInput!) {
                  reviewExternalSourceClaim(input: $input) { id status }
                }
                """,
            variables = new { input = new { claimId = verifiedClaimId, newStatus = "REJECTED" } }
        });
        verifiedResponse.EnsureSuccessStatusCode();
        using var verifiedDoc = await JsonDocument.ParseAsync(await verifiedResponse.Content.ReadAsStreamAsync());
        Assert.True(verifiedDoc.RootElement.TryGetProperty("errors", out var verifiedErrors),
            "Expected errors for already-verified claim");
        Assert.Contains("CLAIM_NOT_PENDING", verifiedErrors.ToString());

        // Attempting to verify an already-rejected claim must fail
        var rejectedResponse = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ReviewClaim($input: ReviewExternalSourceClaimInput!) {
                  reviewExternalSourceClaim(input: $input) { id status }
                }
                """,
            variables = new { input = new { claimId = rejectedClaimId, newStatus = "VERIFIED" } }
        });
        rejectedResponse.EnsureSuccessStatusCode();
        using var rejectedDoc = await JsonDocument.ParseAsync(await rejectedResponse.Content.ReadAsStreamAsync());
        Assert.True(rejectedDoc.RootElement.TryGetProperty("errors", out var rejectedErrors),
            "Expected errors for already-rejected claim");
        Assert.Contains("CLAIM_NOT_PENDING", rejectedErrors.ToString());
    }

    [Fact]
    public async Task AdminOverview_IncludesPendingExternalSourceClaims()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("aov-admin@example.com", "Admin Overview Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var owner = CreateUser("aov-owner@example.com", "Owner");
            dbContext.Users.AddRange(admin, owner);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "AOV Group", Slug = "aov-group",
                IsActive = true, CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            // A pending claim that should appear in the overview
            dbContext.ExternalSourceClaims.Add(new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/aov-group",
                SourceIdentifier = "aov-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview,
                CreatedByUserId = owner.Id,
            });

            // A verified claim that should NOT appear in the pending list
            dbContext.ExternalSourceClaims.Add(new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Luma,
                SourceUrl = "https://lu.ma/aov-group",
                SourceIdentifier = "aov-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = owner.Id,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            query {
              adminOverview {
                pendingExternalSourceClaims {
                  id
                  sourceType
                  sourceUrl
                  status
                  group { name }
                }
              }
            }
            """);

        var claims = doc.RootElement
            .GetProperty("data")
            .GetProperty("adminOverview")
            .GetProperty("pendingExternalSourceClaims")
            .EnumerateArray()
            .ToList();

        Assert.Single(claims);
        Assert.Equal("PENDING_REVIEW", claims[0].GetProperty("status").GetString());
        Assert.Equal("MEETUP", claims[0].GetProperty("sourceType").GetString());
        Assert.Equal("AOV Group", claims[0].GetProperty("group").GetProperty("name").GetString());
    }

    // ── Domains query includes community links ──────────────────────────────

    [Fact]
    public async Task AdminOverview_IncludesCommunityGroupStats()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-stats-admin@example.com", "CgStatsAdmin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var owner = CreateUser("cg-stats-owner@example.com", "CgStatsOwner");
            dbContext.Users.Add(owner);

            var member = CreateUser("cg-stats-member@example.com", "CgStatsMember");
            dbContext.Users.Add(member);

            var requester = CreateUser("cg-stats-requester@example.com", "CgStatsRequester");
            dbContext.Users.Add(requester);

            var publicGroup = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "CgStats Public Group",
                Slug = "cgstats-public",
                Visibility = EventsApi.Data.Entities.CommunityVisibility.Public,
                IsActive = true,
                CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(publicGroup);

            // Owner is admin of public group
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = publicGroup.Id, UserId = owner.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });
            // One active member
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = publicGroup.Id, UserId = member.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });

            var privateGroup = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "CgStats Private Group",
                Slug = "cgstats-private",
                Visibility = EventsApi.Data.Entities.CommunityVisibility.Private,
                IsActive = true,
                CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(privateGroup);

            // Owner is admin of private group
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = privateGroup.Id, UserId = owner.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Admin,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });
            // One pending join request
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = privateGroup.Id, UserId = requester.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Pending,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            query {
              adminOverview {
                totalCommunityGroups
                communityGroups {
                  name slug visibility isActive
                  activeMemberCount pendingRequestCount
                }
              }
            }
            """);

        var overview = doc.RootElement.GetProperty("data").GetProperty("adminOverview");
        Assert.Equal(2, overview.GetProperty("totalCommunityGroups").GetInt32());

        var groups = overview.GetProperty("communityGroups").EnumerateArray().ToList();
        Assert.Equal(2, groups.Count);

        var publicGrp = groups.First(g => g.GetProperty("slug").GetString() == "cgstats-public");
        Assert.Equal("PUBLIC", publicGrp.GetProperty("visibility").GetString());
        Assert.Equal(2, publicGrp.GetProperty("activeMemberCount").GetInt32()); // owner + member
        Assert.Equal(0, publicGrp.GetProperty("pendingRequestCount").GetInt32());

        var privateGrp = groups.First(g => g.GetProperty("slug").GetString() == "cgstats-private");
        Assert.Equal("PRIVATE", privateGrp.GetProperty("visibility").GetString());
        Assert.Equal(1, privateGrp.GetProperty("activeMemberCount").GetInt32()); // owner only
        Assert.Equal(1, privateGrp.GetProperty("pendingRequestCount").GetInt32()); // one pending request
    }

    [Fact]
    public async Task AdminOverview_IncludesCommunityGroupStats_EmptyWhenNoGroups()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-stats-empty-admin@example.com", "CgStatsEmptyAdmin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            dbContext.Users.Add(admin);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var doc = await ExecuteGraphQlAsync(
            client,
            """
            query {
              adminOverview {
                totalCommunityGroups
                communityGroups { name }
              }
            }
            """);

        var overview = doc.RootElement.GetProperty("data").GetProperty("adminOverview");
        Assert.Equal(0, overview.GetProperty("totalCommunityGroups").GetInt32());
        Assert.Equal(0, overview.GetProperty("communityGroups").GetArrayLength());
    }

    [Fact]
    public async Task AdminOverview_CommunityGroupStats_RequiresGlobalAdminRole()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid contributorId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var contributor = CreateUser("cg-stats-contrib@example.com", "CgStatsContrib");
            contributorId = contributor.Id;
            dbContext.Users.Add(contributor);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, contributorId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                query {
                  adminOverview {
                    totalCommunityGroups
                    communityGroups { name }
                  }
                }
                """
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out _),
            "Expected AUTH_NOT_AUTHORIZED error for non-admin user.");
    }

    [Fact]
    public async Task DomainsQuery_IncludesDomainLinks_InOrder()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        var domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var domain = CreateDomain("Links Hub", "links-hub");
            domainId = domain.Id;
            dbContext.Domains.Add(domain);
            dbContext.DomainLinks.AddRange(
                new DomainLink { DomainId = domain.Id, Title = "Second", Url = "https://second.example.com", DisplayOrder = 1 },
                new DomainLink { DomainId = domain.Id, Title = "First", Url = "https://first.example.com", DisplayOrder = 0 });
        });

        using var client = factory.CreateClient();
        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query {
              domains {
                slug
                links { title url displayOrder }
              }
            }
            """);

        var domains = document.RootElement.GetProperty("data").GetProperty("domains");
        var domain = domains.EnumerateArray().First(d => d.GetProperty("slug").GetString() == "links-hub");
        var links = domain.GetProperty("links").EnumerateArray().ToList();
        Assert.Equal(2, links.Count);
        // Links should be returned in displayOrder order
        Assert.Equal("First", links[0].GetProperty("title").GetString());
        Assert.Equal("https://first.example.com", links[0].GetProperty("url").GetString());
        Assert.Equal("Second", links[1].GetProperty("title").GetString());
    }

    [Fact]
    public async Task DomainsQuery_EmptyLinksArray_WhenNoLinksConfigured()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            dbContext.Domains.Add(CreateDomain("No Links Hub", "no-links-hub"));
        });

        using var client = factory.CreateClient();
        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query {
              domains {
                slug
                links { title url }
              }
            }
            """);

        var domains = document.RootElement.GetProperty("data").GetProperty("domains");
        var domain = domains.EnumerateArray().First(d => d.GetProperty("slug").GetString() == "no-links-hub");
        var links = domain.GetProperty("links").EnumerateArray().ToList();
        Assert.Empty(links);
    }

    [Fact]
    public async Task DomainBySlugQuery_IncludesDomainLinks()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var domain = CreateDomain("Slug Links Hub", "slug-links-hub");
            dbContext.Domains.Add(domain);
            dbContext.DomainLinks.Add(
                new DomainLink { DomainId = domain.Id, Title = "Community", Url = "https://community.example.com", DisplayOrder = 0 });
        });

        using var client = factory.CreateClient();
        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query {
              domainBySlug(slug: "slug-links-hub") {
                slug
                links { title url displayOrder }
              }
            }
            """);

        var domain = document.RootElement.GetProperty("data").GetProperty("domainBySlug");
        var links = domain.GetProperty("links").EnumerateArray().ToList();
        Assert.Single(links);
        Assert.Equal("Community", links[0].GetProperty("title").GetString());
        Assert.Equal("https://community.example.com", links[0].GetProperty("url").GetString());
        Assert.Equal(0, links[0].GetProperty("displayOrder").GetInt32());
    }

    // ── ICS Endpoint Tests ────────────────────────────────────────────────────────

    [Fact]
    public async Task IcsEndpoint_PublishedEvent_ReturnsIcsFile()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("ics-pub@example.com", "ICS User");
            var domain = CreateDomain("Tech", "tech-ics-pub");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(CreateEvent(
                "ICS Test Event", "ics-test-event", "An ICS test event.",
                "Conference Hall", "Prague",
                FirstDayOfNextMonthUtc(), domain, user));
        });

        using var client = factory.CreateClient();
        var response = await client.GetAsync("/ics/ics-test-event");

        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
        var contentType = response.Content.Headers.ContentType?.MediaType;
        Assert.Equal("text/calendar", contentType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("BEGIN:VCALENDAR", body);
        Assert.Contains("BEGIN:VEVENT", body);
        Assert.Contains("SUMMARY:ICS Test Event", body);
        Assert.Contains("END:VEVENT", body);
        Assert.Contains("END:VCALENDAR", body);
    }

    [Fact]
    public async Task IcsEndpoint_PublishedEvent_ContentDispositionUsesSlug()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("ics-cd@example.com", "ICS CD User");
            var domain = CreateDomain("Tech", "tech-ics-cd");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(CreateEvent(
                "Content-Disposition Event", "cd-test-event", "A CD test.",
                "Venue", "Prague",
                FirstDayOfNextMonthUtc(), domain, user));
        });

        using var client = factory.CreateClient();
        var response = await client.GetAsync("/ics/cd-test-event");

        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
        var cd = response.Content.Headers.ContentDisposition;
        Assert.NotNull(cd);
        Assert.Contains("cd-test-event.ics", cd!.FileNameStar ?? cd.FileName ?? "");
    }

    [Fact]
    public async Task IcsEndpoint_NotFound_Returns404()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            dbContext.Users.Add(CreateUser("ics-nf@example.com", "ICS NF"));
            dbContext.Domains.Add(CreateDomain("Tech", "tech-ics-nf"));
        });

        using var client = factory.CreateClient();
        var response = await client.GetAsync("/ics/non-existent-event-slug");

        Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task IcsEndpoint_PendingApprovalEvent_Returns404()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("ics-pending@example.com", "ICS Pending User");
            var domain = CreateDomain("Tech", "tech-ics-pending");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(CreateEvent(
                "Pending ICS Event", "pending-ics-event", "Not published.",
                "Venue", "Prague",
                FirstDayOfNextMonthUtc(), domain, user,
                status: EventStatus.PendingApproval));
        });

        using var client = factory.CreateClient();
        var response = await client.GetAsync("/ics/pending-ics-event");

        Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task IcsEndpoint_RejectedEvent_Returns404()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("ics-rej@example.com", "ICS Rejected User");
            var domain = CreateDomain("Tech", "tech-ics-rej");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(CreateEvent(
                "Rejected ICS Event", "rejected-ics-event", "Rejected.",
                "Venue", "Prague",
                FirstDayOfNextMonthUtc(), domain, user,
                status: EventStatus.Rejected));
        });

        using var client = factory.CreateClient();
        var response = await client.GetAsync("/ics/rejected-ics-event");

        Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task IcsEndpoint_AnonymousAccess_Succeeds()
    {
        // Calendar ICS files for published events must be accessible without authentication.
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("ics-anon@example.com", "ICS Anon User");
            var domain = CreateDomain("Tech", "tech-ics-anon");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(CreateEvent(
                "Anon ICS Event", "anon-ics-event", "Public event.",
                "Venue", "Prague",
                FirstDayOfNextMonthUtc(), domain, user));
        });

        // No auth header — request is deliberately anonymous
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/ics/anon-ics-event");

        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task IcsEndpoint_IcsBodyContainsRequiredFields()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("ics-fields@example.com", "ICS Fields User");
            var domain = CreateDomain("Tech", "tech-ics-fields");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            var ev = CreateEvent(
                "Fields Check Event", "fields-check-event", "Checking all fields.",
                "Grand Hall", "Vienna",
                new DateTime(2026, 6, 15, 10, 0, 0, DateTimeKind.Utc), domain, user);
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        var body = await (await client.GetAsync("/ics/fields-check-event")).Content.ReadAsStringAsync();

        Assert.Contains("SUMMARY:Fields Check Event", body);
        Assert.Contains("DTSTART:", body);
        Assert.Contains("DTEND:", body);
        Assert.Contains("DTSTAMP:", body);
        Assert.Contains("UID:fields-check-event@events-platform", body);
        Assert.Contains("LOCATION:Grand Hall", body);
        // Description must contain the canonical event-page URL
        Assert.Contains("/event/fields-check-event", body);
    }

    [Fact]
    public async Task IcsEndpoint_OnlineEvent_UsesEventUrlAsLocation()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("ics-online@example.com", "ICS Online User");
            var domain = CreateDomain("Tech", "tech-ics-online");
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            var ev = CreateEvent(
                "Online ICS Event", "online-ics-event", "A virtual event.",
                "", "Online",
                FirstDayOfNextMonthUtc(), domain, user,
                attendanceMode: AttendanceMode.Online);
            // Override EventUrl for the online-specific assertion
            ev.EventUrl = "https://meet.example.com/join/abc123";
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        var body = await (await client.GetAsync("/ics/online-ics-event")).Content.ReadAsStringAsync();

        // For online events the join URL must be the LOCATION field
        Assert.Contains("LOCATION:https://meet.example.com/join/abc123", body);
    }

    [Fact]
    public async Task IcsEndpoint_IcsBodyDoesNotContainAttendeePersonalData()
    {
        // Privacy: the ICS file must never expose attendee names, emails, or IDs.
        await using var factory = new EventsApiWebApplicationFactory();
        var attendeeEmail = "attendee-private@example.com";
        await SeedAsync(factory, dbContext =>
        {
            var organizer = CreateUser("ics-priv-org@example.com", "Organizer");
            var attendee  = CreateUser(attendeeEmail, "Attendee Name");
            var domain = CreateDomain("Tech", "tech-ics-priv");
            dbContext.Users.AddRange(organizer, attendee);
            dbContext.Domains.Add(domain);
            var ev = CreateEvent(
                "Private ICS Event", "private-ics-event", "Privacy test.",
                "Venue", "Prague",
                FirstDayOfNextMonthUtc(), domain, organizer);
            dbContext.Events.Add(ev);
            // Add a favourite so an attendee exists in the DB
            dbContext.FavoriteEvents.Add(new FavoriteEvent
            {
                EventId = ev.Id,
                UserId = attendee.Id,
                CreatedAtUtc = DateTime.UtcNow,
            });
        });

        using var client = factory.CreateClient();
        var body = await (await client.GetAsync("/ics/private-ics-event")).Content.ReadAsStringAsync();

        Assert.DoesNotContain(attendeeEmail, body);
        Assert.DoesNotContain("Attendee Name", body);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ── Scheduled Featured Events ──────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task ScheduleFeaturedEvent_GlobalAdmin_CreatesSchedule()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid domainId = Guid.Empty;
        Guid eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("sched-admin@example.com", "Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Scheduled Hub", "scheduled-hub");
            domainId = domain.Id;
            var ev = CreateEvent("Promo Event", "promo-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(10), domain, admin);
            eventId = ev.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, adminId));

        var starts = DateTime.UtcNow.AddDays(1);
        var ends = starts.AddDays(7);

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation ScheduleFeatured($input: ScheduleFeaturedEventInput!) {
              scheduleFeaturedEvent(input: $input) {
                id
                startsAtUtc
                endsAtUtc
                priority
              }
            }
            """,
            new
            {
                input = new
                {
                    domainId,
                    eventId,
                    startsAtUtc = starts,
                    endsAtUtc = ends,
                    priority = 0,
                    isEnabled = true
                }
            });

        var schedule = document.RootElement.GetProperty("data").GetProperty("scheduleFeaturedEvent");
        Assert.False(string.IsNullOrEmpty(schedule.GetProperty("id").GetString()));
        Assert.Equal(0, schedule.GetProperty("priority").GetInt32());
    }

    [Fact]
    public async Task ScheduleFeaturedEvent_DomainAdmin_CreatesSchedule()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;
        Guid domainId = Guid.Empty;
        Guid eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("sched-domainadmin@example.com", "Domain Admin");
            userId = user.Id;
            var domain = CreateDomain("Domain Admin Hub", "da-scheduled-hub");
            domainId = domain.Id;
            var ev = CreateEvent("DA Promo Event", "da-promo-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(10), domain, user);
            eventId = ev.Id;
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
            dbContext.DomainAdministrators.Add(new DomainAdministrator { DomainId = domain.Id, UserId = user.Id });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, userId));

        var starts = DateTime.UtcNow.AddDays(1);
        var ends = starts.AddDays(3);

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation ScheduleFeatured($input: ScheduleFeaturedEventInput!) {
              scheduleFeaturedEvent(input: $input) { id startsAtUtc endsAtUtc }
            }
            """,
            new { input = new { domainId, eventId, startsAtUtc = starts, endsAtUtc = ends, priority = 0, isEnabled = true } });

        var id = document.RootElement.GetProperty("data").GetProperty("scheduleFeaturedEvent").GetProperty("id").GetString();
        Assert.False(string.IsNullOrEmpty(id));
    }

    [Fact]
    public async Task ScheduleFeaturedEvent_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid domainId = Guid.NewGuid();
        Guid eventId = Guid.NewGuid();

        using var client = factory.CreateClient();

        var body = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ScheduleFeatured($input: ScheduleFeaturedEventInput!) {
                  scheduleFeaturedEvent(input: $input) { id }
                }
                """,
            variables = new { input = new { domainId, eventId, startsAtUtc = DateTime.UtcNow, endsAtUtc = DateTime.UtcNow.AddDays(1), priority = 0, isEnabled = true } }
        });

        var response = await JsonDocument.ParseAsync(await body.Content.ReadAsStreamAsync());
        Assert.True(response.RootElement.TryGetProperty("errors", out _));
    }

    [Fact]
    public async Task ScheduleFeaturedEvent_RegularUser_Forbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;
        Guid domainId = Guid.Empty;
        Guid eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("sched-forbidden@example.com", "Forbidden User");
            userId = user.Id;
            var domain = CreateDomain("Forbidden Scheduled Hub", "forbidden-sched-hub");
            domainId = domain.Id;
            var ev = CreateEvent("Forbidden Event", "forbidden-sched-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(10), domain, user);
            eventId = ev.Id;
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, userId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ScheduleFeatured($input: ScheduleFeaturedEventInput!) {
                  scheduleFeaturedEvent(input: $input) { id }
                }
                """,
            variables = new
            {
                input = new
                {
                    domainId,
                    eventId,
                    startsAtUtc = DateTime.UtcNow.AddDays(1),
                    endsAtUtc = DateTime.UtcNow.AddDays(2),
                    priority = 0,
                    isEnabled = true
                }
            }
        });

        var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out _));
    }

    [Fact]
    public async Task ScheduleFeaturedEvent_InvalidTimeRange_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid domainId = Guid.Empty;
        Guid eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("sched-timerange@example.com", "Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Time Range Hub", "time-range-hub");
            domainId = domain.Id;
            var ev = CreateEvent("Time Range Event", "time-range-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(10), domain, admin);
            eventId = ev.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ScheduleFeatured($input: ScheduleFeaturedEventInput!) {
                  scheduleFeaturedEvent(input: $input) { id }
                }
                """,
            variables = new
            {
                input = new
                {
                    domainId,
                    eventId,
                    // endsAtUtc is BEFORE startsAtUtc — invalid
                    startsAtUtc = DateTime.UtcNow.AddDays(5),
                    endsAtUtc = DateTime.UtcNow.AddDays(1),
                    priority = 0,
                    isEnabled = true
                }
            }
        });

        var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var code = errors[0].GetProperty("extensions").GetProperty("code").GetString();
        Assert.Equal("INVALID_TIME_RANGE", code);
    }

    [Fact]
    public async Task ScheduleFeaturedEvent_EventFromOtherDomain_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid domainId = Guid.Empty;
        Guid otherEventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("sched-wrongdomain@example.com", "Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Sched Hub A", "sched-hub-a");
            domainId = domain.Id;
            var otherDomain = CreateDomain("Sched Hub B", "sched-hub-b");
            var otherEvent = CreateEvent("Other Event", "sched-other-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), otherDomain, admin);
            otherEventId = otherEvent.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.AddRange(domain, otherDomain);
            dbContext.Events.Add(otherEvent);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ScheduleFeatured($input: ScheduleFeaturedEventInput!) {
                  scheduleFeaturedEvent(input: $input) { id }
                }
                """,
            variables = new
            {
                input = new
                {
                    domainId,
                    eventId = otherEventId,
                    startsAtUtc = DateTime.UtcNow.AddDays(1),
                    endsAtUtc = DateTime.UtcNow.AddDays(2),
                    priority = 0,
                    isEnabled = true
                }
            }
        });

        var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var code = errors[0].GetProperty("extensions").GetProperty("code").GetString();
        Assert.Equal("EVENT_WRONG_DOMAIN", code);
    }

    [Fact]
    public async Task ScheduleFeaturedEvent_UnpublishedEvent_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid domainId = Guid.Empty;
        Guid draftEventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("sched-unpublished@example.com", "Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Unpublished Sched Hub", "unpublished-sched-hub");
            domainId = domain.Id;
            var draft = CreateEvent("Draft Event", "sched-draft-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, admin, status: EventStatus.Draft);
            draftEventId = draft.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(draft);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ScheduleFeatured($input: ScheduleFeaturedEventInput!) {
                  scheduleFeaturedEvent(input: $input) { id }
                }
                """,
            variables = new
            {
                input = new
                {
                    domainId,
                    eventId = draftEventId,
                    startsAtUtc = DateTime.UtcNow.AddDays(1),
                    endsAtUtc = DateTime.UtcNow.AddDays(2),
                    priority = 0,
                    isEnabled = true
                }
            }
        });

        var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var code = errors[0].GetProperty("extensions").GetProperty("code").GetString();
        Assert.Equal("EVENT_NOT_PUBLISHED", code);
    }

    [Fact]
    public async Task UpdateScheduledFeaturedEvent_UpdatesTimeWindow()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid domainId = Guid.Empty;
        Guid scheduleId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("sched-update@example.com", "Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Update Sched Hub", "update-sched-hub");
            domainId = domain.Id;
            var ev = CreateEvent("Update Sched Event", "update-sched-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(10), domain, admin);
            var schedule = new ScheduledFeaturedEvent
            {
                DomainId = domain.Id,
                EventId = ev.Id,
                StartsAtUtc = DateTime.UtcNow.AddDays(1),
                EndsAtUtc = DateTime.UtcNow.AddDays(3),
                Priority = 0,
            };
            scheduleId = schedule.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
            dbContext.Set<ScheduledFeaturedEvent>().Add(schedule);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, adminId));

        var newStarts = DateTime.UtcNow.AddDays(2);
        var newEnds = newStarts.AddDays(14);

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateSched($input: UpdateScheduledFeaturedEventInput!) {
              updateScheduledFeaturedEvent(input: $input) {
                id
                priority
              }
            }
            """,
            new
            {
                input = new
                {
                    scheduleId,
                    startsAtUtc = newStarts,
                    endsAtUtc = newEnds,
                    priority = 1,
                    isEnabled = true
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("updateScheduledFeaturedEvent");
        Assert.Equal(scheduleId.ToString(), result.GetProperty("id").GetString());
        Assert.Equal(1, result.GetProperty("priority").GetInt32());
    }

    [Fact]
    public async Task RemoveScheduledFeaturedEvent_RemovesSchedule()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid scheduleId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("sched-remove@example.com", "Admin", ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Remove Sched Hub", "remove-sched-hub");
            var ev = CreateEvent("Remove Sched Event", "remove-sched-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(10), domain, admin);
            var schedule = new ScheduledFeaturedEvent
            {
                DomainId = domain.Id,
                EventId = ev.Id,
                StartsAtUtc = DateTime.UtcNow.AddDays(1),
                EndsAtUtc = DateTime.UtcNow.AddDays(5),
                Priority = 0,
            };
            scheduleId = schedule.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
            dbContext.Set<ScheduledFeaturedEvent>().Add(schedule);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation RemoveSched($scheduleId: UUID!) {
              removeScheduledFeaturedEvent(scheduleId: $scheduleId)
            }
            """,
            new { scheduleId });

        var result = document.RootElement.GetProperty("data").GetProperty("removeScheduledFeaturedEvent").GetBoolean();
        Assert.True(result);
    }

    [Fact]
    public async Task GetScheduledFeaturedEvents_DomainAdmin_ReturnsSchedules()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;
        Guid domainId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("sched-list@example.com", "List User");
            userId = user.Id;
            var domain = CreateDomain("List Sched Hub", "list-sched-hub");
            domainId = domain.Id;
            var ev1 = CreateEvent("Sched List Event 1", "sched-list-event-1", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, user);
            var ev2 = CreateEvent("Sched List Event 2", "sched-list-event-2", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(10), domain, user);
            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.AddRange(ev1, ev2);
            dbContext.DomainAdministrators.Add(new DomainAdministrator { DomainId = domain.Id, UserId = user.Id });
            dbContext.Set<ScheduledFeaturedEvent>().AddRange(
                new ScheduledFeaturedEvent
                {
                    DomainId = domain.Id, EventId = ev1.Id,
                    StartsAtUtc = DateTime.UtcNow.AddDays(-1), EndsAtUtc = DateTime.UtcNow.AddDays(3),
                    Priority = 0
                },
                new ScheduledFeaturedEvent
                {
                    DomainId = domain.Id, EventId = ev2.Id,
                    StartsAtUtc = DateTime.UtcNow.AddDays(4), EndsAtUtc = DateTime.UtcNow.AddDays(8),
                    Priority = 0
                }
            );
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, userId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query GetSchedules($domainId: UUID!) {
              scheduledFeaturedEvents(domainId: $domainId) {
                id
                startsAtUtc
                endsAtUtc
                priority
              }
            }
            """,
            new { domainId });

        var schedules = document.RootElement.GetProperty("data").GetProperty("scheduledFeaturedEvents");
        Assert.Equal(2, schedules.GetArrayLength());
    }

    [Fact]
    public async Task GetScheduledFeaturedEvents_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        using var client = factory.CreateClient();
        var domainId = Guid.NewGuid();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                query GetSchedules($domainId: UUID!) {
                  scheduledFeaturedEvents(domainId: $domainId) { id }
                }
                """,
            variables = new { domainId }
        });

        var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out _));
    }

    [Fact]
    public async Task FeaturedEventsForDomain_ActiveScheduledHighlight_TakesPrecedenceOverStaticFeatured()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("sched-priority@example.com", "Priority User");
            var domain = CreateDomain("Priority Hub", "priority-hub");

            var staticEvent = CreateEvent("Static Featured", "static-featured-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, user);
            var scheduledEvent = CreateEvent("Scheduled Featured", "scheduled-featured-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(3), domain, user);

            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.AddRange(staticEvent, scheduledEvent);

            // Static featured event (legacy)
            dbContext.DomainFeaturedEvents.Add(new DomainFeaturedEvent
            {
                DomainId = domain.Id, EventId = staticEvent.Id, DisplayOrder = 0
            });

            // Active scheduled highlight — should take precedence
            dbContext.Set<ScheduledFeaturedEvent>().Add(new ScheduledFeaturedEvent
            {
                DomainId = domain.Id,
                EventId = scheduledEvent.Id,
                StartsAtUtc = DateTime.UtcNow.AddMinutes(-1),
                EndsAtUtc = DateTime.UtcNow.AddDays(7),
                Priority = 0,
            });
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query FeaturedEventsForDomain($domainSlug: String!) {
              featuredEventsForDomain(domainSlug: $domainSlug) { id name }
            }
            """,
            new { domainSlug = "priority-hub" });

        var events = document.RootElement.GetProperty("data").GetProperty("featuredEventsForDomain");
        Assert.Equal(1, events.GetArrayLength());
        Assert.Equal("Scheduled Featured", events[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task FeaturedEventsForDomain_ExpiredSchedule_FallsBackToStaticFeatured()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("sched-expired@example.com", "Expired User");
            var domain = CreateDomain("Expired Sched Hub", "expired-sched-hub");

            var staticEvent = CreateEvent("Fallback Static", "fallback-static-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, user);
            var expiredScheduledEvent = CreateEvent("Expired Scheduled", "expired-sched-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(3), domain, user);

            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.AddRange(staticEvent, expiredScheduledEvent);

            // Static featured (expected fallback)
            dbContext.DomainFeaturedEvents.Add(new DomainFeaturedEvent
            {
                DomainId = domain.Id, EventId = staticEvent.Id, DisplayOrder = 0
            });

            // Expired scheduled highlight
            dbContext.Set<ScheduledFeaturedEvent>().Add(new ScheduledFeaturedEvent
            {
                DomainId = domain.Id,
                EventId = expiredScheduledEvent.Id,
                StartsAtUtc = DateTime.UtcNow.AddDays(-10),
                EndsAtUtc = DateTime.UtcNow.AddMinutes(-1), // already expired
                Priority = 0,
            });
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query FeaturedEventsForDomain($domainSlug: String!) {
              featuredEventsForDomain(domainSlug: $domainSlug) { id name }
            }
            """,
            new { domainSlug = "expired-sched-hub" });

        var events = document.RootElement.GetProperty("data").GetProperty("featuredEventsForDomain");
        Assert.Equal(1, events.GetArrayLength());
        Assert.Equal("Fallback Static", events[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task FeaturedEventsForDomain_MultipleActiveSchedules_OrdersByPriorityThenEndsAt()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("sched-ordering@example.com", "Ordering User");
            var domain = CreateDomain("Ordering Hub", "ordering-hub");

            var ev1 = CreateEvent("Low Priority Long Window", "low-priority-long", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(10), domain, user);
            var ev2 = CreateEvent("High Priority Short Window", "high-priority-short", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, user);
            var ev3 = CreateEvent("High Priority Long Window", "high-priority-long", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(8), domain, user);

            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.AddRange(ev1, ev2, ev3);

            var now = DateTime.UtcNow;
            dbContext.Set<ScheduledFeaturedEvent>().AddRange(
                new ScheduledFeaturedEvent
                {
                    DomainId = domain.Id, EventId = ev1.Id,
                    StartsAtUtc = now.AddMinutes(-1), EndsAtUtc = now.AddDays(10),
                    Priority = 5 // lower priority = displayed later
                },
                new ScheduledFeaturedEvent
                {
                    DomainId = domain.Id, EventId = ev2.Id,
                    StartsAtUtc = now.AddMinutes(-1), EndsAtUtc = now.AddDays(2),
                    Priority = 0 // higher priority, shorter window → first
                },
                new ScheduledFeaturedEvent
                {
                    DomainId = domain.Id, EventId = ev3.Id,
                    StartsAtUtc = now.AddMinutes(-1), EndsAtUtc = now.AddDays(5),
                    Priority = 0 // same priority, longer window → second
                }
            );
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query FeaturedEventsForDomain($domainSlug: String!) {
              featuredEventsForDomain(domainSlug: $domainSlug) { name }
            }
            """,
            new { domainSlug = "ordering-hub" });

        var events = document.RootElement.GetProperty("data").GetProperty("featuredEventsForDomain");
        Assert.Equal(3, events.GetArrayLength());
        Assert.Equal("High Priority Short Window", events[0].GetProperty("name").GetString());
        Assert.Equal("High Priority Long Window", events[1].GetProperty("name").GetString());
        Assert.Equal("Low Priority Long Window", events[2].GetProperty("name").GetString());
    }

    [Fact]
    public async Task FeaturedEventsForDomain_ScheduledButUnpublishedEvent_ExcludedFromResults()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("sched-unpub-excl@example.com", "Unpublished Exclusion User");
            var domain = CreateDomain("Unpub Exclusion Hub", "unpub-exclusion-hub");

            var unpublishedEv = CreateEvent("Unpublished Scheduled", "unpub-sched-excl", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, user, status: EventStatus.Draft);
            var publishedEv = CreateEvent("Published Fallback", "pub-fallback-excl", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(7), domain, user);

            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.AddRange(unpublishedEv, publishedEv);

            dbContext.DomainFeaturedEvents.Add(new DomainFeaturedEvent
            {
                DomainId = domain.Id, EventId = publishedEv.Id, DisplayOrder = 0
            });

            // Schedule the unpublished event — it should be ignored
            dbContext.Set<ScheduledFeaturedEvent>().Add(new ScheduledFeaturedEvent
            {
                DomainId = domain.Id,
                EventId = unpublishedEv.Id,
                StartsAtUtc = DateTime.UtcNow.AddMinutes(-1),
                EndsAtUtc = DateTime.UtcNow.AddDays(7),
                Priority = 0,
            });
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query FeaturedEventsForDomain($domainSlug: String!) {
              featuredEventsForDomain(domainSlug: $domainSlug) { name }
            }
            """,
            new { domainSlug = "unpub-exclusion-hub" });

        // Scheduled unpublished event is silently excluded; falls back to static featured
        var events = document.RootElement.GetProperty("data").GetProperty("featuredEventsForDomain");
        Assert.Equal(1, events.GetArrayLength());
        Assert.Equal("Published Fallback", events[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task GetScheduledFeaturedEvents_OrganizerIsolation_CannotSeeDifferentDomainSchedules()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid user1Id = Guid.Empty;
        Guid domain2Id = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user1 = CreateUser("sched-isolation-u1@example.com", "User 1");
            user1Id = user1.Id;
            var user2 = CreateUser("sched-isolation-u2@example.com", "User 2");
            var domain1 = CreateDomain("Isolation Hub 1", "isolation-hub-1");
            var domain2 = CreateDomain("Isolation Hub 2", "isolation-hub-2");
            domain2Id = domain2.Id;
            var ev = CreateEvent("Isolation Event", "isolation-sched-event", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain2, user2);

            dbContext.Users.AddRange(user1, user2);
            dbContext.Domains.AddRange(domain1, domain2);
            dbContext.Events.Add(ev);
            // user1 is admin of domain1 only
            dbContext.DomainAdministrators.Add(new DomainAdministrator { DomainId = domain1.Id, UserId = user1.Id });
            // Schedule exists on domain2
            dbContext.Set<ScheduledFeaturedEvent>().Add(new ScheduledFeaturedEvent
            {
                DomainId = domain2.Id, EventId = ev.Id,
                StartsAtUtc = DateTime.UtcNow.AddDays(-1), EndsAtUtc = DateTime.UtcNow.AddDays(3),
                Priority = 0
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, user1Id));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                query GetSchedules($domainId: UUID!) {
                  scheduledFeaturedEvents(domainId: $domainId) { id }
                }
                """,
            variables = new { domainId = domain2Id }
        });

        var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out _));
    }

    // ── ScheduledFeaturedEvent IsEnabled and DisplayLabel ─────────────────────

    [Fact]
    public async Task ScheduleFeaturedEvent_WithIsEnabledFalse_CreatesDisabledEntry()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid domainId = Guid.Empty;
        Guid eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("sfe-disabled@example.com", "Admin", role: ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Disabled Hub", "disabled-hub");
            domainId = domain.Id;
            var ev = CreateEvent("Disabled Schedule Event", "disabled-sched-ev", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(3), domain, admin);
            eventId = ev.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation ScheduleDisabled($input: ScheduleFeaturedEventInput!) {
              scheduleFeaturedEvent(input: $input) { id isEnabled displayLabel }
            }
            """,
            new
            {
                input = new
                {
                    domainId,
                    eventId,
                    startsAtUtc = DateTime.UtcNow.AddDays(1),
                    endsAtUtc = DateTime.UtcNow.AddDays(5),
                    priority = 0,
                    isEnabled = false,
                    displayLabel = "Campaign A"
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("scheduleFeaturedEvent");
        Assert.False(result.GetProperty("isEnabled").GetBoolean());
        Assert.Equal("Campaign A", result.GetProperty("displayLabel").GetString());
    }

    [Fact]
    public async Task FeaturedEventsForDomain_DisabledSchedule_ExcludedFromPublicResults()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("sfe-disabled-pub@example.com", "Disabled Pub User");
            var domain = CreateDomain("Disabled Pub Hub", "disabled-pub-hub");

            var disabledEvent = CreateEvent("Disabled Featured", "disabled-featured-ev", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(3), domain, user);
            var staticEvent = CreateEvent("Static Fallback", "static-fallback-ev", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, user);

            dbContext.Users.Add(user);
            dbContext.Domains.Add(domain);
            dbContext.Events.AddRange(disabledEvent, staticEvent);

            // Static fallback
            dbContext.DomainFeaturedEvents.Add(new DomainFeaturedEvent
            {
                DomainId = domain.Id, EventId = staticEvent.Id, DisplayOrder = 0
            });

            // Disabled schedule — should be excluded from public results
            dbContext.Set<ScheduledFeaturedEvent>().Add(new ScheduledFeaturedEvent
            {
                DomainId = domain.Id,
                EventId = disabledEvent.Id,
                StartsAtUtc = DateTime.UtcNow.AddMinutes(-1),
                EndsAtUtc = DateTime.UtcNow.AddDays(7),
                Priority = 0,
                IsEnabled = false,
            });
        });

        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query FeaturedEventsForDomain($domainSlug: String!) {
              featuredEventsForDomain(domainSlug: $domainSlug) { name }
            }
            """,
            new { domainSlug = "disabled-pub-hub" });

        // Disabled schedule is excluded; falls back to static featured
        var events = document.RootElement.GetProperty("data").GetProperty("featuredEventsForDomain");
        Assert.Equal(1, events.GetArrayLength());
        Assert.Equal("Static Fallback", events[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task UpdateScheduledFeaturedEvent_CanToggleIsEnabledAndUpdateDisplayLabel()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid scheduleId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("sfe-update-toggle@example.com", "Toggle Admin", role: ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Toggle Hub", "toggle-hub");
            var ev = CreateEvent("Toggle Event", "toggle-sched-ev", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(3), domain, admin);

            var sfe = new ScheduledFeaturedEvent
            {
                DomainId = domain.Id,
                EventId = ev.Id,
                StartsAtUtc = DateTime.UtcNow.AddDays(1),
                EndsAtUtc = DateTime.UtcNow.AddDays(5),
                Priority = 0,
                IsEnabled = true,
                DisplayLabel = "Original Label",
            };
            scheduleId = sfe.Id;

            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
            dbContext.Set<ScheduledFeaturedEvent>().Add(sfe);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateToggle($input: UpdateScheduledFeaturedEventInput!) {
              updateScheduledFeaturedEvent(input: $input) { isEnabled displayLabel }
            }
            """,
            new
            {
                input = new
                {
                    scheduleId,
                    startsAtUtc = DateTime.UtcNow.AddDays(1),
                    endsAtUtc = DateTime.UtcNow.AddDays(5),
                    priority = 0,
                    isEnabled = false,
                    displayLabel = "Updated Label"
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("updateScheduledFeaturedEvent");
        Assert.False(result.GetProperty("isEnabled").GetBoolean());
        Assert.Equal("Updated Label", result.GetProperty("displayLabel").GetString());
    }

    [Fact]
    public async Task ScheduleFeaturedEvent_DisplayLabelTooLong_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid domainId = Guid.Empty;
        Guid eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("sfe-label-long@example.com", "Label Long Admin", role: ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Label Long Hub", "label-long-hub");
            domainId = domain.Id;
            var ev = CreateEvent("Label Long Event", "label-long-ev", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(3), domain, admin);
            eventId = ev.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, adminId));

        var tooLongLabel = new string('X', 201);

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ScheduleLongLabel($input: ScheduleFeaturedEventInput!) {
                  scheduleFeaturedEvent(input: $input) { id }
                }
                """,
            variables = new
            {
                input = new
                {
                    domainId,
                    eventId,
                    startsAtUtc = DateTime.UtcNow.AddDays(1),
                    endsAtUtc = DateTime.UtcNow.AddDays(5),
                    priority = 0,
                    isEnabled = true,
                    displayLabel = tooLongLabel
                }
            }
        });

        var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var code = errors[0].GetProperty("extensions").GetProperty("code").GetString();
        Assert.Equal("DISPLAY_LABEL_TOO_LONG", code);
    }

    [Fact]
    public async Task UpdateScheduledFeaturedEvent_DisplayLabelTooLong_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid scheduleId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("sfe-update-label@example.com", "Update Label Admin", role: ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Update Label Hub", "update-label-hub");
            var ev = CreateEvent("Update Label Event", "update-label-ev", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(3), domain, admin);
            var schedule = new ScheduledFeaturedEvent
            {
                DomainId = domain.Id,
                EventId = ev.Id,
                StartsAtUtc = DateTime.UtcNow.AddDays(1),
                EndsAtUtc = DateTime.UtcNow.AddDays(5),
                Priority = 0,
                IsEnabled = true,
                DisplayLabel = "Original Label",
            };
            scheduleId = schedule.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);
            dbContext.Set<ScheduledFeaturedEvent>().Add(schedule);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, adminId));

        var tooLongLabel = new string('Y', 201);

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation UpdateLongLabel($input: UpdateScheduledFeaturedEventInput!) {
                  updateScheduledFeaturedEvent(input: $input) { id displayLabel }
                }
                """,
            variables = new
            {
                input = new
                {
                    scheduleId,
                    startsAtUtc = DateTime.UtcNow.AddDays(1),
                    endsAtUtc = DateTime.UtcNow.AddDays(5),
                    priority = 0,
                    isEnabled = true,
                    displayLabel = tooLongLabel
                }
            }
        });

        var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var code = errors[0].GetProperty("extensions").GetProperty("code").GetString();
        Assert.Equal("DISPLAY_LABEL_TOO_LONG", code);
    }

    [Fact]
    public async Task ScheduleFeaturedEvent_ExceedsDomainLimit_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid domainId = Guid.Empty;
        Guid eventId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("sfe-limit@example.com", "Limit Admin", role: ApplicationUserRole.Admin);
            adminId = admin.Id;
            var domain = CreateDomain("Limit Hub", "limit-hub");
            domainId = domain.Id;
            var ev = CreateEvent("Limit Event", "limit-ev", "Desc", "Venue", "Prague",
                DateTime.UtcNow.AddDays(5), domain, admin);
            eventId = ev.Id;
            dbContext.Users.Add(admin);
            dbContext.Domains.Add(domain);
            dbContext.Events.Add(ev);

            // Seed 20 existing scheduled entries to hit the cap
            for (var i = 0; i < 20; i++)
            {
                dbContext.Set<ScheduledFeaturedEvent>().Add(new ScheduledFeaturedEvent
                {
                    DomainId = domain.Id,
                    EventId = ev.Id,
                    StartsAtUtc = DateTime.UtcNow.AddDays(i + 1),
                    EndsAtUtc = DateTime.UtcNow.AddDays(i + 2),
                    Priority = i,
                    IsEnabled = true,
                });
            }
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation ScheduleOver($input: ScheduleFeaturedEventInput!) {
                  scheduleFeaturedEvent(input: $input) { id }
                }
                """,
            variables = new
            {
                input = new
                {
                    domainId,
                    eventId,
                    startsAtUtc = DateTime.UtcNow.AddDays(25),
                    endsAtUtc = DateTime.UtcNow.AddDays(30),
                    priority = 0,
                    isEnabled = true
                }
            }
        });

        var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var code = errors[0].GetProperty("extensions").GetProperty("code").GetString();
        Assert.Equal("TOO_MANY_SCHEDULED_FEATURES", code);
    }

    [Fact]
    public async Task SubmitEvent_WithCommunityGroupId_EventManagerRole_CreatesGroupEventLink()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;
        Guid groupId = Guid.Empty;

        var nextMonth = DateTime.UtcNow.AddDays(30);

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("submit-community@example.com", "Community Submitter");
            userId = user.Id;
            dbContext.Users.Add(user);

            var domain = CreateDomain("Community Tech", "community-tech-submit");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Submit Test Group",
                Slug = "submit-test-group",
                Visibility = CommunityVisibility.Public,
                IsActive = true,
                CreatedByUserId = user.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            // User is an EventManager in the group
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = user.Id,
                Role = CommunityMemberRole.EventManager,
                Status = CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, userId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation SubmitForCommunity($input: EventSubmissionInput!) {
              submitEvent(input: $input) { id name }
            }
            """,
            new
            {
                input = new
                {
                    domainSlug = "community-tech-submit",
                    name = "Community Event Alpha",
                    description = "An event for the community.",
                    eventUrl = "https://example.com/community-event-alpha",
                    venueName = "The Hub",
                    addressLine1 = "Main St 1",
                    city = "Prague",
                    countryCode = "CZ",
                    isFree = true,
                    currencyCode = "EUR",
                    latitude = 50.075m,
                    longitude = 14.437m,
                    startsAtUtc = nextMonth,
                    endsAtUtc = nextMonth.AddHours(3),
                    attendanceMode = "IN_PERSON",
                    communityGroupId = groupId,
                }
            });

        var result = document.RootElement.GetProperty("data").GetProperty("submitEvent");
        Assert.Equal("Community Event Alpha", result.GetProperty("name").GetString());

        // Verify the CommunityGroupEvent record was created
        await using var scope = factory.Services.CreateAsyncScope();
        var dbCtx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var eventId = Guid.Parse(result.GetProperty("id").GetString()!);
        var link = await dbCtx.CommunityGroupEvents.SingleOrDefaultAsync(
            cge => cge.GroupId == groupId && cge.EventId == eventId);
        Assert.NotNull(link);
    }

    [Fact]
    public async Task SubmitEvent_WithCommunityGroupId_NonMember_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;
        Guid groupId = Guid.Empty;

        var nextMonth = DateTime.UtcNow.AddDays(30);

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("submit-community-nonmember@example.com", "Non Member");
            userId = user.Id;
            dbContext.Users.Add(user);

            var domain = CreateDomain("Community Tech NM", "community-tech-nm");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Exclusive Group",
                Slug = "exclusive-group-nm",
                Visibility = CommunityVisibility.Private,
                IsActive = true,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);
            // user is NOT a member of this group
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, userId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation SubmitForCommunity($input: EventSubmissionInput!) {
                  submitEvent(input: $input) { id }
                }
                """,
            variables = new
            {
                input = new
                {
                    domainSlug = "community-tech-nm",
                    name = "Unauthorized Community Event",
                    description = "Should fail.",
                    eventUrl = "https://example.com",
                    venueName = "",
                    addressLine1 = "",
                    city = "Prague",
                    countryCode = "CZ",
                    isFree = true,
                    currencyCode = "EUR",
                    latitude = 0m,
                    longitude = 0m,
                    startsAtUtc = nextMonth,
                    endsAtUtc = nextMonth.AddHours(2),
                    attendanceMode = "IN_PERSON",
                    communityGroupId = groupId,
                }
            }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("FORBIDDEN", body);
    }

    [Fact]
    public async Task SubmitEvent_WithCommunityGroupId_RegularMember_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;
        Guid groupId = Guid.Empty;

        var nextMonth = DateTime.UtcNow.AddDays(30);

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("submit-community-member@example.com", "Regular Member");
            userId = user.Id;
            dbContext.Users.Add(user);

            var domain = CreateDomain("Community Tech Reg", "community-tech-reg");
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Members Only Group",
                Slug = "members-only-group",
                Visibility = CommunityVisibility.Public,
                IsActive = true,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            // User is a plain Member (not Admin or EventManager)
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = user.Id,
                Role = CommunityMemberRole.Member,
                Status = CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await CreateTokenAsync(factory, userId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation SubmitForCommunity($input: EventSubmissionInput!) {
                  submitEvent(input: $input) { id }
                }
                """,
            variables = new
            {
                input = new
                {
                    domainSlug = "community-tech-reg",
                    name = "Regular Member Community Event",
                    description = "Should fail.",
                    eventUrl = "https://example.com",
                    venueName = "",
                    addressLine1 = "",
                    city = "Prague",
                    countryCode = "CZ",
                    isFree = true,
                    currencyCode = "EUR",
                    latitude = 0m,
                    longitude = 0m,
                    startsAtUtc = nextMonth,
                    endsAtUtc = nextMonth.AddHours(2),
                    attendanceMode = "IN_PERSON",
                    communityGroupId = groupId,
                }
            }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("FORBIDDEN", body);
    }

    // ── RevokeMembership tests ────────────────────────────────────────────────

    [Fact]
    public async Task RevokeMembership_ByAdmin_RemovesMember()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid memberId = Guid.Empty;
        Guid membershipId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-revoke-admin@example.com", "RevokeAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var member = CreateUser("cg-revoke-member@example.com", "RevokeMember");
            memberId = member.Id;
            dbContext.Users.Add(member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Revoke Test Group",
                Slug = "revoke-test-group",
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

            var membership = new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = member.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            };
            membershipId = membership.Id;
            dbContext.CommunityMemberships.Add(membership);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation Revoke($membershipId: UUID!) {
              revokeMembership(membershipId: $membershipId)
            }
            """,
            new { membershipId });

        Assert.True(document.RootElement.GetProperty("data").GetProperty("revokeMembership").GetBoolean(),
            "revokeMembership should return true when admin removes a member.");

        // Verify the membership is deleted in the database.
        await using var scope = factory.Services.CreateAsyncScope();
        var dbCtx = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();
        var revoked = await dbCtx.CommunityMemberships.FindAsync(membershipId);
        Assert.Null(revoked);
    }

    [Fact]
    public async Task RevokeMembership_NonAdmin_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid memberId = Guid.Empty;
        Guid membershipId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-revoke-admin2@example.com", "RevokeAdmin2");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var member = CreateUser("cg-revoke-member2@example.com", "RevokeMember2");
            memberId = member.Id;
            dbContext.Users.Add(member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Revoke Forbidden Group",
                Slug = "revoke-forbidden-group",
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

            // The requester is a plain member, not an admin
            var membership = new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = member.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            };
            membershipId = membership.Id;
            dbContext.CommunityMemberships.Add(membership);
        });

        using var client = factory.CreateClient();
        // Authenticate as the plain member, not the admin
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, memberId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation Revoke($membershipId: UUID!) {
                  revokeMembership(membershipId: $membershipId)
                }
                """,
            variables = new { membershipId }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors),
            "Expected a FORBIDDEN error when a non-admin tries to revoke a membership.");
        Assert.Contains("FORBIDDEN", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    // ── LeaveCommunityGroup happy-path test ───────────────────────────────────

    [Fact]
    public async Task LeaveCommunityGroup_RegularMember_Succeeds()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid memberId = Guid.Empty;
        Guid groupId = Guid.Empty;
        Guid membershipId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-leave-admin@example.com", "LeaveAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var member = CreateUser("cg-leave-member@example.com", "LeaveMember");
            memberId = member.Id;
            dbContext.Users.Add(member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Leave Happy Group",
                Slug = "leave-happy-group",
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

            var membership = new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = member.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            };
            membershipId = membership.Id;
            dbContext.CommunityMemberships.Add(membership);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, memberId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation Leave($groupId: UUID!) {
              leaveCommunityGroup(groupId: $groupId)
            }
            """,
            new { groupId });

        Assert.True(document.RootElement.GetProperty("data").GetProperty("leaveCommunityGroup").GetBoolean(),
            "leaveCommunityGroup should return true for a regular member leaving.");

        // Verify the membership is deleted.
        await using var scope = factory.Services.CreateAsyncScope();
        var dbCtx = scope.ServiceProvider.GetRequiredService<EventsApi.Data.AppDbContext>();
        var leftMembership = await dbCtx.CommunityMemberships.FindAsync(membershipId);
        Assert.Null(leftMembership);
    }

    // ── groupMembers query test ───────────────────────────────────────────────

    [Fact]
    public async Task GroupMembers_ByAdmin_ReturnsActiveMembers()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid memberId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-members-admin@example.com", "MembersAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var member = CreateUser("cg-members-member@example.com", "ActiveMember");
            memberId = member.Id;
            dbContext.Users.Add(member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Members Query Group",
                Slug = "members-query-group",
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

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = member.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query GetMembers($groupId: UUID!) {
              groupMembers(groupId: $groupId) {
                id userId role status
                user { displayName }
              }
            }
            """,
            new { groupId });

        var members = document.RootElement.GetProperty("data").GetProperty("groupMembers");
        Assert.Equal(JsonValueKind.Array, members.ValueKind);
        Assert.Equal(2, members.GetArrayLength());

        var roles = members.EnumerateArray().Select(m => m.GetProperty("role").GetString()).ToList();
        Assert.Contains("ADMIN", roles);
        Assert.Contains("MEMBER", roles);
    }

    // ── pendingMembershipRequests query test ──────────────────────────────────

    [Fact]
    public async Task PendingMembershipRequests_ByAdmin_ReturnsPendingRequests()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid requesterId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-pending-admin@example.com", "PendingAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var requester = CreateUser("cg-pending-requester@example.com", "PendingRequester");
            requesterId = requester.Id;
            dbContext.Users.Add(requester);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Pending Requests Group",
                Slug = "pending-requests-group",
                Visibility = EventsApi.Data.Entities.CommunityVisibility.Private,
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

            // A pending join request from requester
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = requester.Id,
                Role = EventsApi.Data.Entities.CommunityMemberRole.Member,
                Status = EventsApi.Data.Entities.CommunityMemberStatus.Pending,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query GetPending($groupId: UUID!) {
              pendingMembershipRequests(groupId: $groupId) {
                id userId role status
                user { displayName }
              }
            }
            """,
            new { groupId });

        var pending = document.RootElement.GetProperty("data").GetProperty("pendingMembershipRequests");
        Assert.Equal(JsonValueKind.Array, pending.ValueKind);
        Assert.Equal(1, pending.GetArrayLength());
        Assert.Equal("PENDING", pending[0].GetProperty("status").GetString());
        Assert.Equal("PendingRequester", pending[0].GetProperty("user").GetProperty("displayName").GetString());
    }

    // ── Owner role tests ──────────────────────────────────────────────────────

    [Fact]
    public async Task CreateCommunityGroup_CreatorBecomesOwner()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cg-owner-creator@example.com", "OwnerCreator");
            userId = user.Id;
            dbContext.Users.Add(user);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation CreateGroup($input: CreateCommunityGroupInput!) {
              createCommunityGroup(input: $input) { id slug }
            }
            """,
            new { input = new { name = "Owner Creator Group", slug = "owner-creator-group", visibility = "PUBLIC" } });

        var group = document.RootElement.GetProperty("data").GetProperty("createCommunityGroup");
        var slug = group.GetProperty("slug").GetString();

        // Verify the creator's membership role is Owner
        await using var scope = factory.Services.CreateAsyncScope();
        var dbCtx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var groupEntity = await dbCtx.CommunityGroups.SingleAsync(g => g.Slug == slug);
        var membership = await dbCtx.CommunityMemberships.SingleAsync(
            m => m.GroupId == groupEntity.Id && m.UserId == userId);
        Assert.Equal(CommunityMemberRole.Owner, membership.Role);
        Assert.Equal(CommunityMemberStatus.Active, membership.Status);
    }

    [Fact]
    public async Task AssignMemberRole_AdminCannotPromoteToOwner_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid memberId = Guid.Empty;
        Guid memberMembershipId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-admin-owner@example.com", "AdminNotOwner");
            var member = CreateUser("cg-member-owner@example.com", "MemberTarget");
            adminId = admin.Id;
            memberId = member.Id;
            dbContext.Users.AddRange(admin, member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Admin Cannot Owner Group",
                Slug = "admin-cannot-owner-group",
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            // Admin role (not Owner) — cannot transfer ownership
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = CommunityMemberRole.Admin,
                Status = CommunityMemberStatus.Active,
            });

            var memberMembership = new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = member.Id,
                Role = CommunityMemberRole.Member,
                Status = CommunityMemberStatus.Active,
            };
            memberMembershipId = memberMembership.Id;
            dbContext.CommunityMemberships.Add(memberMembership);
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
            variables = new { membershipId = memberMembershipId, role = "OWNER" }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("FORBIDDEN", body);
    }

    [Fact]
    public async Task AssignMemberRole_OwnerCanTransferOwnership_Succeeds()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid ownerId = Guid.Empty;
        Guid memberId = Guid.Empty;
        Guid memberMembershipId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("cg-owner-transfer@example.com", "OriginalOwner");
            var member = CreateUser("cg-transfer-target@example.com", "TransferTarget");
            ownerId = owner.Id;
            memberId = member.Id;
            dbContext.Users.AddRange(owner, member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Transfer Ownership Group",
                Slug = "transfer-ownership-group",
                CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = owner.Id,
                Role = CommunityMemberRole.Owner,
                Status = CommunityMemberStatus.Active,
            });

            var memberMembership = new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = member.Id,
                Role = CommunityMemberRole.Member,
                Status = CommunityMemberStatus.Active,
            };
            memberMembershipId = memberMembership.Id;
            dbContext.CommunityMemberships.Add(memberMembership);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, ownerId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation AssignRole($membershipId: UUID!, $role: CommunityMemberRole!) {
              assignMemberRole(membershipId: $membershipId, role: $role) { id role }
            }
            """,
            new { membershipId = memberMembershipId, role = "OWNER" });

        var result = document.RootElement.GetProperty("data").GetProperty("assignMemberRole");
        Assert.Equal("OWNER", result.GetProperty("role").GetString());
    }

    [Fact]
    public async Task RevokeMembership_ByAdmin_CannotRemoveLastOwner_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid ownerId = Guid.Empty;
        Guid adminId = Guid.Empty;
        Guid ownerMembershipId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("cg-last-owner-revoke@example.com", "LastOwnerRevoke");
            var admin = CreateUser("cg-admin-revoke@example.com", "AdminRevoke");
            ownerId = owner.Id;
            adminId = admin.Id;
            dbContext.Users.AddRange(owner, admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Last Owner Revoke Group",
                Slug = "last-owner-revoke-group",
                CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var ownerMembership = new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = owner.Id,
                Role = CommunityMemberRole.Owner,
                Status = CommunityMemberStatus.Active,
            };
            ownerMembershipId = ownerMembership.Id;
            dbContext.CommunityMemberships.Add(ownerMembership);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = CommunityMemberRole.Admin,
                Status = CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        // Admin tries to revoke the last owner — must be blocked
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation Revoke($membershipId: UUID!) {
                  revokeMembership(membershipId: $membershipId)
                }
                """,
            variables = new { membershipId = ownerMembershipId }
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("LAST_OWNER", body);
    }

    [Fact]
    public async Task JoinCommunityGroup_AlreadyMember_ReturnsAlreadyMemberError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cg-dup-join@example.com", "DupJoiner");
            userId = user.Id;
            dbContext.Users.Add(user);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Dup Join Group",
                Slug = "dup-join-group",
                Visibility = CommunityVisibility.Public,
                CreatedByUserId = user.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            // Already a member
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = user.Id,
                Role = CommunityMemberRole.Member,
                Status = CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

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
        // Expect an error indicating already a member
        Assert.True(body.Contains("ALREADY_MEMBER") || body.Contains("error"),
            $"Expected already-member error, got: {body}");
        using var doc = JsonDocument.Parse(body);
        Assert.True(doc.RootElement.TryGetProperty("errors", out _),
            "Expected errors array in response.");
    }

    [Fact]
    public async Task RequestCommunityMembership_AlreadyPending_ReturnsAlreadyPendingError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cg-dup-request@example.com", "DupRequester");
            userId = user.Id;
            dbContext.Users.Add(user);

            var creator = CreateUser("cg-dup-request-creator@example.com", "DupReqCreator");
            dbContext.Users.Add(creator);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Dup Request Group",
                Slug = "dup-request-group",
                Visibility = CommunityVisibility.Private,
                CreatedByUserId = creator.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = creator.Id,
                Role = CommunityMemberRole.Owner,
                Status = CommunityMemberStatus.Active,
            });

            // Already has a pending request
            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = user.Id,
                Role = CommunityMemberRole.Member,
                Status = CommunityMemberStatus.Pending,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation RequestMembership($groupId: UUID!) {
                  requestCommunityMembership(groupId: $groupId) { id }
                }
                """,
            variables = new { groupId }
        });

        var body = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        Assert.True(doc.RootElement.TryGetProperty("errors", out _),
            $"Expected error for duplicate request, got: {body}");
    }

    [Fact]
    public async Task RequestCommunityMembership_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var creator = CreateUser("cg-unauth-req@example.com", "UnauthReqCreator");
            dbContext.Users.Add(creator);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Unauth Request Group",
                Slug = "unauth-request-group",
                Visibility = CommunityVisibility.Private,
                CreatedByUserId = creator.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);
        });

        using var client = factory.CreateClient(); // no auth

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation RequestMembership($groupId: UUID!) {
                  requestCommunityMembership(groupId: $groupId) { id }
                }
                """,
            variables = new { groupId }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var errorMsg = errors.ToString();
        Assert.True(
            errorMsg.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase)
            || errorMsg.Contains("not authorized", StringComparison.OrdinalIgnoreCase)
            || errorMsg.Contains("unauthorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error but got: {errorMsg}");
    }

    // ── UpdateCommunityGroup tests ────────────────────────────────────────────

    [Fact]
    public async Task UpdateCommunityGroup_ByAdmin_UpdatesNameAndVisibility()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-update-admin@example.com", "UpdateAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Original Name",
                Slug = "original-name-group",
                Visibility = CommunityVisibility.Public,
                CreatedByUserId = admin.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = CommunityMemberRole.Admin,
                Status = CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateGroup($groupId: UUID!, $input: UpdateCommunityGroupInput!) {
              updateCommunityGroup(groupId: $groupId, input: $input) {
                id name visibility summary
              }
            }
            """,
            new
            {
                groupId,
                input = new { name = "Updated Name", visibility = "PRIVATE", summary = "A short summary." }
            });

        var group2 = document.RootElement.GetProperty("data").GetProperty("updateCommunityGroup");
        Assert.Equal("Updated Name", group2.GetProperty("name").GetString());
        Assert.Equal("PRIVATE", group2.GetProperty("visibility").GetString());
        Assert.Equal("A short summary.", group2.GetProperty("summary").GetString());
    }

    [Fact]
    public async Task UpdateCommunityGroup_ByOwner_Succeeds()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid ownerId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("cg-update-owner@example.com", "UpdateOwner");
            ownerId = owner.Id;
            dbContext.Users.Add(owner);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Owner Update Group",
                Slug = "owner-update-group",
                Visibility = CommunityVisibility.Public,
                CreatedByUserId = owner.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = owner.Id,
                Role = CommunityMemberRole.Owner,
                Status = CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, ownerId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateGroup($groupId: UUID!, $input: UpdateCommunityGroupInput!) {
              updateCommunityGroup(groupId: $groupId, input: $input) {
                id name
              }
            }
            """,
            new { groupId, input = new { name = "Owner Renamed Group" } });

        var group2 = document.RootElement.GetProperty("data").GetProperty("updateCommunityGroup");
        Assert.Equal("Owner Renamed Group", group2.GetProperty("name").GetString());
    }

    [Fact]
    public async Task UpdateCommunityGroup_NonAdmin_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid memberId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("cg-update-nonadmin-admin@example.com", "UpdateNonAdminAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var member = CreateUser("cg-update-nonadmin-member@example.com", "UpdateNonAdminMember");
            memberId = member.Id;
            dbContext.Users.Add(member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Non Admin Update Group",
                Slug = "non-admin-update-group",
                CreatedByUserId = admin.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = CommunityMemberRole.Owner,
                Status = CommunityMemberStatus.Active,
            });

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = member.Id,
                Role = CommunityMemberRole.Member,
                Status = CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, memberId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation UpdateGroup($groupId: UUID!, $input: UpdateCommunityGroupInput!) {
                  updateCommunityGroup(groupId: $groupId, input: $input) { id }
                }
                """,
            variables = new { groupId, input = new { name = "Hacked Name" } }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("FORBIDDEN", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task UpdateCommunityGroup_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var creator = CreateUser("cg-update-unauth@example.com", "UpdateUnauthCreator");
            dbContext.Users.Add(creator);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Unauth Update Group",
                Slug = "unauth-update-group",
                CreatedByUserId = creator.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);
        });

        using var client = factory.CreateClient(); // no auth

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation UpdateGroup($groupId: UUID!, $input: UpdateCommunityGroupInput!) {
                  updateCommunityGroup(groupId: $groupId, input: $input) { id }
                }
                """,
            variables = new { groupId, input = new { name = "Hacked" } }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var errorMsg = errors.ToString();
        Assert.True(
            errorMsg.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase)
            || errorMsg.Contains("not authorized", StringComparison.OrdinalIgnoreCase)
            || errorMsg.Contains("unauthorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error but got: {errorMsg}");
    }

    [Fact]
    public async Task UpdateCommunityGroup_GroupNotFound_ReturnsError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid userId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var user = CreateUser("cg-update-notfound@example.com", "UpdateNotFound");
            userId = user.Id;
            dbContext.Users.Add(user);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, userId));

        var nonExistentGroupId = Guid.NewGuid();
        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation UpdateGroup($groupId: UUID!, $input: UpdateCommunityGroupInput!) {
                  updateCommunityGroup(groupId: $groupId, input: $input) { id }
                }
                """,
            variables = new { groupId = nonExistentGroupId, input = new { name = "Ghost Group" } }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("GROUP_NOT_FOUND", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task UpdateCommunityGroup_GlobalAdmin_CanUpdateAnyGroup()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid globalAdminId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var creator = CreateUser("cg-update-creator-ga@example.com", "CreatorForGA");
            dbContext.Users.Add(creator);

            var globalAdmin = CreateUser("cg-update-globaladmin@example.com", "GlobalAdmin", ApplicationUserRole.Admin);
            globalAdminId = globalAdmin.Id;
            dbContext.Users.Add(globalAdmin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Global Admin Target Group",
                Slug = "global-admin-target-group",
                CreatedByUserId = creator.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = creator.Id,
                Role = CommunityMemberRole.Owner,
                Status = CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, globalAdminId));

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            mutation UpdateGroup($groupId: UUID!, $input: UpdateCommunityGroupInput!) {
              updateCommunityGroup(groupId: $groupId, input: $input) {
                id name isActive
              }
            }
            """,
            new { groupId, input = new { isActive = false } });

        var group2 = document.RootElement.GetProperty("data").GetProperty("updateCommunityGroup");
        Assert.False(group2.GetProperty("isActive").GetBoolean());
    }

    // ── Additional GroupMembers query tests ───────────────────────────────────

    [Fact]
    public async Task GroupMembers_NonAdmin_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid ownerId = Guid.Empty;
        Guid memberId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("gm-nonadmin-owner@example.com", "MembersOwner");
            ownerId = owner.Id;
            dbContext.Users.Add(owner);

            var member = CreateUser("gm-nonadmin-member@example.com", "RegularMember");
            memberId = member.Id;
            dbContext.Users.Add(member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Members Forbidden Group",
                Slug = "members-forbidden-group",
                CreatedByUserId = owner.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = owner.Id,
                Role = CommunityMemberRole.Owner,
                Status = CommunityMemberStatus.Active,
            });

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = member.Id,
                Role = CommunityMemberRole.Member,
                Status = CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, memberId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                query GetMembers($groupId: UUID!) {
                  groupMembers(groupId: $groupId) { id userId role }
                }
                """,
            variables = new { groupId }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("FORBIDDEN", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GroupMembers_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var creator = CreateUser("gm-unauth@example.com", "GmUnauthCreator");
            dbContext.Users.Add(creator);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Unauthenticated Members Group",
                Slug = "unauthenticated-members-group",
                CreatedByUserId = creator.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);
        });

        using var client = factory.CreateClient(); // no auth

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                query GetMembers($groupId: UUID!) {
                  groupMembers(groupId: $groupId) { id userId role }
                }
                """,
            variables = new { groupId }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var errorMsg = errors.ToString();
        Assert.True(
            errorMsg.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase)
            || errorMsg.Contains("not authorized", StringComparison.OrdinalIgnoreCase)
            || errorMsg.Contains("unauthorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error but got: {errorMsg}");
    }

    [Fact]
    public async Task UpdateCommunityGroup_EventManager_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid ownerId = Guid.Empty;
        Guid eventManagerId = Guid.Empty;
        Guid groupId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("cg-update-em-owner@example.com", "UpdateEmOwner");
            ownerId = owner.Id;
            dbContext.Users.Add(owner);

            var em = CreateUser("cg-update-em@example.com", "EventManagerUser");
            eventManagerId = em.Id;
            dbContext.Users.Add(em);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Event Manager Update Group",
                Slug = "event-manager-update-group",
                CreatedByUserId = owner.Id,
            };
            groupId = group.Id;
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = owner.Id,
                Role = CommunityMemberRole.Owner,
                Status = CommunityMemberStatus.Active,
            });

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = eventManagerId,
                Role = CommunityMemberRole.EventManager,
                Status = CommunityMemberStatus.Active,
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, eventManagerId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation UpdateGroup($groupId: UUID!, $input: UpdateCommunityGroupInput!) {
                  updateCommunityGroup(groupId: $groupId, input: $input) { id }
                }
                """,
            variables = new { groupId, input = new { name = "EM Cannot Update" } }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("FORBIDDEN", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    // ── SetAutoSyncEnabled tests ──────────────────────────────────────────────

    [Fact]
    public async Task SetAutoSyncEnabled_ByGroupAdmin_TogglesToFalse()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("autosync-admin@example.com", "AutoSyncAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "AutoSync Group",
                Slug = "autosync-group",
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = CommunityMemberRole.Admin,
                Status = CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/autosync-group",
                SourceIdentifier = "autosync-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
                IsAutoSyncEnabled = true,
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, adminId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation SetAutoSync($claimId: UUID!, $enabled: Boolean!) {
                  setAutoSyncEnabled(claimId: $claimId, enabled: $enabled) {
                    id isAutoSyncEnabled
                  }
                }
                """,
            variables = new { claimId, enabled = false }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.False(document.RootElement.TryGetProperty("errors", out _), document.RootElement.ToString());
        var result = document.RootElement.GetProperty("data").GetProperty("setAutoSyncEnabled");
        Assert.Equal(claimId.ToString(), result.GetProperty("id").GetString(), StringComparer.OrdinalIgnoreCase);
        Assert.False(result.GetProperty("isAutoSyncEnabled").GetBoolean());
    }

    [Fact]
    public async Task SetAutoSyncEnabled_NonAdmin_ReturnsForbidden()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid ownerId = Guid.Empty;
        Guid memberId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var owner = CreateUser("autosync-owner@example.com", "AutoSyncOwner");
            ownerId = owner.Id;
            dbContext.Users.Add(owner);

            var member = CreateUser("autosync-member@example.com", "AutoSyncMember");
            memberId = member.Id;
            dbContext.Users.Add(member);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "AutoSync Forbidden Group",
                Slug = "autosync-forbidden-group",
                CreatedByUserId = owner.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = memberId,
                Role = CommunityMemberRole.Member,
                Status = CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Luma,
                SourceUrl = "https://lu.ma/autosync-forbidden",
                SourceIdentifier = "autosync-forbidden",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = owner.Id,
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await CreateTokenAsync(factory, memberId));

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation SetAutoSync($claimId: UUID!, $enabled: Boolean!) {
                  setAutoSyncEnabled(claimId: $claimId, enabled: $enabled) { id }
                }
                """,
            variables = new { claimId, enabled = false }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        Assert.Contains("FORBIDDEN", errors.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task SetAutoSyncEnabled_Unauthenticated_ReturnsAuthError()
    {
        await using var factory = new EventsApiWebApplicationFactory();

        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/graphql", new
        {
            query = """
                mutation SetAutoSync($claimId: UUID!, $enabled: Boolean!) {
                  setAutoSyncEnabled(claimId: $claimId, enabled: $enabled) { id }
                }
                """,
            variables = new { claimId = Guid.NewGuid(), enabled = false }
        });

        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.True(document.RootElement.TryGetProperty("errors", out var errors));
        var errorMsg = errors.ToString();
        Assert.True(
            errorMsg.Contains("AUTH_NOT_AUTHORIZED", StringComparison.OrdinalIgnoreCase)
            || errorMsg.Contains("not authorized", StringComparison.OrdinalIgnoreCase)
            || errorMsg.Contains("unauthorized", StringComparison.OrdinalIgnoreCase),
            $"Expected auth error but got: {errorMsg}");
    }

    // ── ExternalSourceSyncService tests ──────────────────────────────────────

    [Fact]
    public async Task ExternalSourceSyncService_SkipsClaimsNotDue()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("svc-skip@example.com", "SvcSkipAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = new EventDomain
            {
                Name = "Sync Service Domain",
                Slug = "sync-service-domain",
                Subdomain = "sync-svc",
                IsActive = true,
            };
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Sync Service Group",
                Slug = "sync-service-group",
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/sync-service-group",
                SourceIdentifier = "sync-service-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
                IsAutoSyncEnabled = true,
                // Set LastSyncAtUtc to 30 minutes ago — within the 1-hour window so should be skipped
                LastSyncAtUtc = DateTime.UtcNow.AddMinutes(-30),
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);
        });

        await using var scope = factory.Services.CreateAsyncScope();
        var service = new ExternalSourceSyncService(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<ExternalSourceSyncService>.Instance);

        await service.RunSyncCycleAsync(CancellationToken.None);

        // Claim was last synced 30 min ago — should NOT have been re-synced
        await using var verifyScope = factory.Services.CreateAsyncScope();
        var db = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var updatedClaim = await db.Set<EventsApi.Data.Entities.ExternalSourceClaim>()
            .SingleAsync(c => c.Id == claimId);
        // LastSyncAtUtc should still be ~30 min ago (not reset by a new sync)
        Assert.NotNull(updatedClaim.LastSyncAtUtc);
        Assert.True(updatedClaim.LastSyncAtUtc < DateTime.UtcNow.AddMinutes(-15));
    }

    [Fact]
    public async Task ExternalSourceSyncService_SkipsAutoSyncDisabledClaims()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("svc-disabled@example.com", "SvcDisabledAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = new EventDomain
            {
                Name = "Disabled Sync Domain",
                Slug = "disabled-sync-domain",
                Subdomain = "disabled-sync",
                IsActive = true,
            };
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Disabled Sync Group",
                Slug = "disabled-sync-group",
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/disabled-sync-group",
                SourceIdentifier = "disabled-sync-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
                IsAutoSyncEnabled = false, // explicitly disabled
                LastSyncAtUtc = null,
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);
        });

        await using var scope = factory.Services.CreateAsyncScope();
        var service = new ExternalSourceSyncService(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<ExternalSourceSyncService>.Instance);

        await service.RunSyncCycleAsync(CancellationToken.None);

        await using var verifyScope = factory.Services.CreateAsyncScope();
        var db = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var updatedClaim = await db.Set<EventsApi.Data.Entities.ExternalSourceClaim>()
            .SingleAsync(c => c.Id == claimId);
        // Should NOT have been synced since auto-sync is disabled
        Assert.Null(updatedClaim.LastSyncAtUtc);
    }

    [Fact]
    public async Task ExternalSourceSyncService_SkipsUnverifiedClaims()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("svc-unverified@example.com", "SvcUnverifiedAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Unverified Sync Group",
                Slug = "unverified-sync-group",
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Luma,
                SourceUrl = "https://lu.ma/unverified-sync",
                SourceIdentifier = "unverified-sync",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.PendingReview, // not verified
                CreatedByUserId = admin.Id,
                IsAutoSyncEnabled = true,
                LastSyncAtUtc = null,
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);
        });

        await using var scope = factory.Services.CreateAsyncScope();
        var service = new ExternalSourceSyncService(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<ExternalSourceSyncService>.Instance);

        await service.RunSyncCycleAsync(CancellationToken.None);

        await using var verifyScope = factory.Services.CreateAsyncScope();
        var db = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var updatedClaim = await db.Set<EventsApi.Data.Entities.ExternalSourceClaim>()
            .SingleAsync(c => c.Id == claimId);
        // Should NOT have been synced since claim is not verified
        Assert.Null(updatedClaim.LastSyncAtUtc);
    }

    [Fact]
    public async Task ExternalSourceSyncService_SyncsEligibleClaim_WithSeededAdapter()
    {
        await using var factory = new EventsApiWebApplicationFactory(services =>
        {
            var seededAdapter = new SeededMeetupAdapter(
            [
                new EventsApi.Adapters.ExternalEventData(
                    ExternalId: "ext-bg-sync-1",
                    Name: "Background Sync Event",
                    Description: "Created by background sync service",
                    EventUrl: "https://www.meetup.com/test-bg-sync/events/1",
                    StartsAtUtc: DateTime.UtcNow.AddDays(14),
                    EndsAtUtc: DateTime.UtcNow.AddDays(14).AddHours(2),
                    VenueName: "Tech Hub",
                    AddressLine1: null,
                    City: "Bratislava",
                    CountryCode: "SK",
                    Latitude: 48.1m,
                    Longitude: 17.1m,
                    IsFree: true,
                    PriceAmount: null,
                    CurrencyCode: null,
                    Language: "sk")
            ]);

            services.RemoveAll<EventsApi.Adapters.ExternalSourceAdapterFactory>();
            services.AddSingleton(new EventsApi.Adapters.ExternalSourceAdapterFactory(seededAdapter, seededAdapter));
            services.AddScoped<ExternalSyncEngine>();
        });

        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("svc-bg-sync@example.com", "BgSyncAdmin");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = new EventDomain
            {
                Name = "BG Sync Domain",
                Slug = "bg-sync-domain",
                Subdomain = "bg-sync",
                IsActive = true,
            };
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "BG Sync Group",
                Slug = "bg-sync-group",
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/bg-sync-group",
                SourceIdentifier = "bg-sync-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
                CreatedByUserId = admin.Id,
                IsAutoSyncEnabled = true,
                LastSyncAtUtc = null, // never synced — eligible
            };
            claimId = claim.Id;
            dbContext.Set<EventsApi.Data.Entities.ExternalSourceClaim>().Add(claim);
        });

        var service = new ExternalSourceSyncService(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<ExternalSourceSyncService>.Instance);

        await service.RunSyncCycleAsync(CancellationToken.None);

        await using var verifyScope = factory.Services.CreateAsyncScope();
        var db = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();

        var updatedClaim = await db.Set<EventsApi.Data.Entities.ExternalSourceClaim>()
            .SingleAsync(c => c.Id == claimId);

        // Sync metadata should be updated
        Assert.NotNull(updatedClaim.LastSyncAtUtc);
        Assert.NotNull(updatedClaim.LastSyncSucceededAtUtc);
        Assert.Null(updatedClaim.LastSyncError);
        Assert.Equal(1, updatedClaim.LastSyncImportedCount);
        Assert.Equal(0, updatedClaim.LastSyncSkippedCount);

        // Imported event should exist and be in PendingApproval
        var importedEvent = await db.Events
            .SingleOrDefaultAsync(e => e.ExternalSourceEventId == "ext-bg-sync-1");
        Assert.NotNull(importedEvent);
        Assert.Equal(EventStatus.PendingApproval, importedEvent.Status);
        Assert.Equal("Background Sync Event", importedEvent.Name);
    }

    [Fact]
    public async Task TriggerExternalSync_UpdatesLastSyncSucceededAtUtc_OnSuccess()
    {
        await using var factory = new EventsApiWebApplicationFactory(services =>
        {
            var seededAdapter = new SeededMeetupAdapter([]);
            services.RemoveAll<EventsApi.Adapters.ExternalSourceAdapterFactory>();
            services.AddSingleton(new EventsApi.Adapters.ExternalSourceAdapterFactory(seededAdapter, seededAdapter));
            services.AddScoped<ExternalSyncEngine>();
        });

        Guid adminId = Guid.Empty;
        Guid claimId = Guid.Empty;

        await SeedAsync(factory, dbContext =>
        {
            var admin = CreateUser("sync-success-meta@example.com", "SyncSuccessMeta");
            adminId = admin.Id;
            dbContext.Users.Add(admin);

            var domain = new EventDomain
            {
                Name = "Sync Meta Domain",
                Slug = "sync-meta-domain",
                Subdomain = "sync-meta",
                IsActive = true,
            };
            dbContext.Domains.Add(domain);

            var group = new EventsApi.Data.Entities.CommunityGroup
            {
                Name = "Sync Meta Group",
                Slug = "sync-meta-group",
                CreatedByUserId = admin.Id,
            };
            dbContext.CommunityGroups.Add(group);

            dbContext.CommunityMemberships.Add(new EventsApi.Data.Entities.CommunityMembership
            {
                GroupId = group.Id,
                UserId = admin.Id,
                Role = CommunityMemberRole.Admin,
                Status = CommunityMemberStatus.Active,
            });

            var claim = new EventsApi.Data.Entities.ExternalSourceClaim
            {
                GroupId = group.Id,
                SourceType = EventsApi.Data.Entities.ExternalSourceType.Meetup,
                SourceUrl = "https://www.meetup.com/sync-meta-group",
                SourceIdentifier = "sync-meta-group",
                Status = EventsApi.Data.Entities.ExternalSourceClaimStatus.Verified,
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
                mutation TriggerSync($claimId: UUID!) {
                  triggerExternalSync(claimId: $claimId) {
                    importedCount skippedCount errorCount summary
                  }
                }
                """,
            variables = new { claimId }
        });

        response.EnsureSuccessStatusCode();

        await using var verifyScope = factory.Services.CreateAsyncScope();
        var db = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var updatedClaim = await db.Set<EventsApi.Data.Entities.ExternalSourceClaim>()
            .SingleAsync(c => c.Id == claimId);

        Assert.NotNull(updatedClaim.LastSyncAtUtc);
        Assert.NotNull(updatedClaim.LastSyncSucceededAtUtc);
        Assert.Null(updatedClaim.LastSyncError);
    }

    // ── ExternalSyncEngine unit tests ─────────────────────────────────────────

    [Theory]
    [InlineData(0, 0, 0, 0, "Imported 0 events.")]
    [InlineData(1, 0, 0, 0, "Imported 1 event.")]
    [InlineData(3, 0, 0, 0, "Imported 3 events.")]
    [InlineData(1, 2, 0, 0, "Imported 1 event. Updated 2 events.")]
    [InlineData(0, 1, 0, 0, "Imported 0 events. Updated 1 event.")]
    [InlineData(2, 3, 1, 0, "Imported 2 events. Updated 3 events. Skipped 1 (concurrent duplicate).")]
    [InlineData(0, 0, 0, 1, "Imported 0 events. 1 event failed validation.")]
    [InlineData(2, 0, 0, 3, "Imported 2 events. 3 events failed validation.")]
    [InlineData(1, 1, 0, 1, "Imported 1 event. Updated 1 event. 1 event failed validation.")]
    public void ExternalSyncEngine_BuildSyncSummary_ProducesCorrectMessage(
        int imported, int updated, int skipped, int errors, string expected)
    {
        var summary = ExternalSyncEngine.BuildSyncSummary(imported, updated, skipped, errors);
        Assert.Equal(expected, summary);
    }

    [Theory]
    [InlineData(0, 1, "Imported 0 events. 1 previously imported event no longer appears upstream (preserved).")]
    [InlineData(2, 3, "Imported 2 events. 3 previously imported events no longer appear upstream (preserved).")]
    [InlineData(1, 0, "Imported 1 event.")]
    public void ExternalSyncEngine_BuildSyncSummary_IncludesOrphanedCountWhenNonZero(
        int imported, int orphaned, string expected)
    {
        var summary = ExternalSyncEngine.BuildSyncSummary(imported, 0, 0, 0, orphaned);
        Assert.Equal(expected, summary);
    }

    [Fact]
    public void ExternalSyncEngine_ApplyUpstreamUpdate_RefreshesAllNonNullFields()
    {
        var existing = new EventsApi.Data.Entities.CatalogEvent
        {
            Name = "Old Name",
            Slug = "old-slug",
            Description = "Old desc.",
            EventUrl = "https://old.example.com/event",
            VenueName = "Old Venue",
            AddressLine1 = "Old Street 1",
            City = "OldCity",
            CountryCode = "XX",
            Latitude = 0m,
            Longitude = 0m,
            StartsAtUtc = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            EndsAtUtc = new DateTime(2020, 1, 1, 2, 0, 0, DateTimeKind.Utc),
            IsFree = true,
            PriceAmount = null,
            CurrencyCode = "EUR",
            Language = null,
            Status = EventsApi.Data.Entities.EventStatus.Published,
        };

        var upstream = new EventsApi.Adapters.ExternalEventData(
            ExternalId: "ext-001",
            Name: "New Name",
            Description: "New desc.",
            EventUrl: "https://new.example.com/event",
            StartsAtUtc: new DateTime(2031, 6, 1, 10, 0, 0, DateTimeKind.Utc),
            EndsAtUtc: new DateTime(2031, 6, 1, 12, 0, 0, DateTimeKind.Utc),
            VenueName: "New Venue",
            AddressLine1: "New Street 2",
            City: "NewCity",
            CountryCode: "at",
            Latitude: 48.2m,
            Longitude: 16.4m,
            IsFree: false,
            PriceAmount: 15m,
            CurrencyCode: "usd",
            Language: "de");

        ExternalSyncEngine.ApplyUpstreamUpdate(existing, upstream);

        Assert.Equal("New Name", existing.Name);
        Assert.Equal("New desc.", existing.Description);
        Assert.Equal("https://new.example.com/event", existing.EventUrl);
        Assert.Equal("New Venue", existing.VenueName);
        Assert.Equal("New Street 2", existing.AddressLine1);
        Assert.Equal("NewCity", existing.City);
        Assert.Equal("AT", existing.CountryCode); // normalised to upper
        Assert.Equal(48.2m, existing.Latitude);
        Assert.Equal(16.4m, existing.Longitude);
        Assert.Equal(new DateTime(2031, 6, 1, 10, 0, 0, DateTimeKind.Utc), existing.StartsAtUtc);
        Assert.Equal(new DateTime(2031, 6, 1, 12, 0, 0, DateTimeKind.Utc), existing.EndsAtUtc);
        Assert.False(existing.IsFree);
        Assert.Equal(15m, existing.PriceAmount);
        Assert.Equal("USD", existing.CurrencyCode); // normalised to upper
        Assert.Equal("de", existing.Language);

        // Locally curated fields must be preserved.
        Assert.Equal("old-slug", existing.Slug);
        Assert.Equal(EventsApi.Data.Entities.EventStatus.Published, existing.Status);
    }

    [Fact]
    public void ExternalSyncEngine_ApplyUpstreamUpdate_PreservesExistingFieldsWhenUpstreamIsNull()
    {
        var existing = new EventsApi.Data.Entities.CatalogEvent
        {
            Name = "Keep This Name",
            Slug = "keep-slug",
            Description = "Keep this desc.",
            EventUrl = "https://keep.example.com/event",
            VenueName = "Keep Venue",
            AddressLine1 = "Keep Street",
            City = "KeepCity",
            CountryCode = "SK",
            Latitude = 48.1m,
            Longitude = 17.1m,
            StartsAtUtc = new DateTime(2030, 3, 1, 10, 0, 0, DateTimeKind.Utc),
            EndsAtUtc = new DateTime(2030, 3, 1, 12, 0, 0, DateTimeKind.Utc),
            IsFree = false,
            PriceAmount = 20m,
            CurrencyCode = "EUR",
            Language = "sk",
            Status = EventsApi.Data.Entities.EventStatus.Published,
        };

        // Upstream event has all nullable fields as null — only non-nullable fields update.
        var upstream = new EventsApi.Adapters.ExternalEventData(
            ExternalId: "ext-null-001",
            Name: "Updated Name", // non-null — will update
            Description: "", // empty string — will not overwrite existing description
            EventUrl: null,
            StartsAtUtc: null, // null — dates should not change
            EndsAtUtc: null,
            VenueName: null,
            AddressLine1: null,
            City: null,
            CountryCode: null,
            Latitude: null,
            Longitude: null,
            IsFree: null,
            PriceAmount: null,
            CurrencyCode: null,
            Language: null);

        ExternalSyncEngine.ApplyUpstreamUpdate(existing, upstream);

        // Name updated (non-null from upstream).
        Assert.Equal("Updated Name", existing.Name);

        // All null fields preserve existing values.
        Assert.Equal("Keep this desc.", existing.Description);
        Assert.Equal("https://keep.example.com/event", existing.EventUrl);
        Assert.Equal("Keep Venue", existing.VenueName);
        Assert.Equal("Keep Street", existing.AddressLine1);
        Assert.Equal("KeepCity", existing.City);
        Assert.Equal("SK", existing.CountryCode);
        Assert.Equal(48.1m, existing.Latitude);
        Assert.Equal(17.1m, existing.Longitude);
        Assert.Equal(new DateTime(2030, 3, 1, 10, 0, 0, DateTimeKind.Utc), existing.StartsAtUtc);
        Assert.Equal(new DateTime(2030, 3, 1, 12, 0, 0, DateTimeKind.Utc), existing.EndsAtUtc);
        Assert.False(existing.IsFree);
        Assert.Equal(20m, existing.PriceAmount);
        Assert.Equal("EUR", existing.CurrencyCode);
        Assert.Equal("sk", existing.Language);
        Assert.Equal(EventsApi.Data.Entities.EventStatus.Published, existing.Status);
    }

    [Fact]
    public void ExternalSyncEngine_ApplyUpstreamUpdate_StartsAtChangedWithoutEndsAt_PreservesPriorDuration()
    {
        // When upstream provides a new start time but omits end time, the prior duration must be
        // preserved rather than guessing +2 hours. This is critical for workshops, conferences,
        // and multi-hour meetups whose end time is stored correctly in the database.
        var existing = new EventsApi.Data.Entities.CatalogEvent
        {
            Name = "Workshop Event",
            Slug = "workshop-event",
            Description = "A three-hour workshop.",
            EventUrl = "https://example.com/workshop",
            VenueName = "Workshop Hall",
            AddressLine1 = "Main Street 1",
            City = "Vienna",
            CountryCode = "AT",
            StartsAtUtc = new DateTime(2030, 5, 10, 9, 0, 0, DateTimeKind.Utc),
            EndsAtUtc = new DateTime(2030, 5, 10, 12, 0, 0, DateTimeKind.Utc), // 3-hour duration
            IsFree = true,
            CurrencyCode = "EUR",
            Status = EventsApi.Data.Entities.EventStatus.Published,
        };

        // Upstream sends a rescheduled start, but doesn't include an explicit end time.
        var upstream = new EventsApi.Adapters.ExternalEventData(
            ExternalId: "ext-reschedule-001",
            Name: "Workshop Event",
            Description: "", // empty — will not overwrite existing description
            EventUrl: null,
            StartsAtUtc: new DateTime(2030, 6, 20, 14, 0, 0, DateTimeKind.Utc), // new start
            EndsAtUtc: null, // end time not provided by upstream
            VenueName: null, AddressLine1: null, City: null, CountryCode: null,
            Latitude: null, Longitude: null, IsFree: null,
            PriceAmount: null, CurrencyCode: null, Language: null);

        ExternalSyncEngine.ApplyUpstreamUpdate(existing, upstream);

        // Start should update to the upstream value.
        Assert.Equal(new DateTime(2030, 6, 20, 14, 0, 0, DateTimeKind.Utc), existing.StartsAtUtc);

        // End should be newStart + priorDuration (3 hours), NOT newStart + 2 hours.
        Assert.Equal(new DateTime(2030, 6, 20, 17, 0, 0, DateTimeKind.Utc), existing.EndsAtUtc);
    }

    [Fact]
    public void ExternalSyncEngine_ApplyUpstreamUpdate_OnlyEndsAtProvided_UpdatesEndWithoutTouchingStart()
    {
        // If upstream sends only EndsAtUtc (and no StartsAtUtc), only the end time should change.
        var existing = new EventsApi.Data.Entities.CatalogEvent
        {
            Name = "Conference",
            Slug = "conference",
            Description = "An all-day conference.",
            EventUrl = "https://example.com/conference",
            VenueName = "Convention Centre",
            AddressLine1 = "Convention Road 5",
            City = "Berlin",
            CountryCode = "DE",
            StartsAtUtc = new DateTime(2030, 9, 1, 9, 0, 0, DateTimeKind.Utc),
            EndsAtUtc = new DateTime(2030, 9, 1, 18, 0, 0, DateTimeKind.Utc),
            IsFree = false,
            CurrencyCode = "EUR",
            Status = EventsApi.Data.Entities.EventStatus.Published,
        };

        var upstream = new EventsApi.Adapters.ExternalEventData(
            ExternalId: "ext-endonly-001",
            Name: "", // empty — will not overwrite
            Description: "", // empty — will not overwrite
            EventUrl: null,
            StartsAtUtc: null, // not provided
            EndsAtUtc: new DateTime(2030, 9, 1, 17, 0, 0, DateTimeKind.Utc), // shortened end
            VenueName: null, AddressLine1: null, City: null, CountryCode: null,
            Latitude: null, Longitude: null, IsFree: null,
            PriceAmount: null, CurrencyCode: null, Language: null);

        ExternalSyncEngine.ApplyUpstreamUpdate(existing, upstream);

        // Start is unchanged.
        Assert.Equal(new DateTime(2030, 9, 1, 9, 0, 0, DateTimeKind.Utc), existing.StartsAtUtc);
        // End is updated from upstream.
        Assert.Equal(new DateTime(2030, 9, 1, 17, 0, 0, DateTimeKind.Utc), existing.EndsAtUtc);
    }
}


