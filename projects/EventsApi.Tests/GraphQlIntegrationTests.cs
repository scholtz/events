using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using EventsApi.Tests.Infrastructure;

namespace EventsApi.Tests;

public sealed class GraphQlIntegrationTests
{
    [Fact]
    public async Task EventsQuery_ReturnsSeededPragueCryptoEvent()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        using var client = factory.CreateClient();

        using var document = await ExecuteGraphQlAsync(
            client,
            """
            query ($filter: EventFilterInput) {
              events(filter: $filter) {
                name
                city
                mapUrl
                domain {
                  slug
                }
              }
            }
            """,
            new
            {
                filter = new
                {
                    domainSlug = "crypto",
                    city = "Prague"
                }
            });

        var events = document.RootElement.GetProperty("data").GetProperty("events");
        Assert.True(events.GetArrayLength() > 0);
        Assert.Equal("Prague Crypto Builders Meetup", events[0].GetProperty("name").GetString());
        Assert.Equal("crypto", events[0].GetProperty("domain").GetProperty("slug").GetString());
        Assert.Equal("Prague", events[0].GetProperty("city").GetString());
        Assert.Contains("openstreetmap.org", events[0].GetProperty("mapUrl").GetString());
    }

    [Fact]
    public async Task RegisterAndSubmitEvent_CreatesPendingDashboardItem()
    {
        await using var factory = new EventsApiWebApplicationFactory();
        using var client = factory.CreateClient();

        using var registerDocument = await ExecuteGraphQlAsync(
            client,
            """
            mutation ($input: RegisterUserInput!) {
              registerUser(input: $input) {
                token
                user {
                  email
                }
              }
            }
            """,
            new
            {
                input = new
                {
                    email = "alice@example.com",
                    displayName = "Alice",
                    password = "Password123!"
                }
            });

        var token = registerDocument.RootElement.GetProperty("data").GetProperty("registerUser").GetProperty("token").GetString();
        Assert.False(string.IsNullOrWhiteSpace(token));

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var startsAtUtc = DateTime.UtcNow.AddMonths(1).AddDays(3);
        var endsAtUtc = startsAtUtc.AddHours(2);

        using var submitDocument = await ExecuteGraphQlAsync(
            client,
            """
            mutation ($input: EventSubmissionInput!) {
              submitEvent(input: $input) {
                name
                status
                domain {
                  slug
                }
              }
            }
            """,
            new
            {
                input = new
                {
                    domainSlug = "crypto",
                    name = "Alice Prague Side Event",
                    description = "A community-led evening session for crypto founders visiting Prague.",
                    eventUrl = "https://events.example.com/alice-prague-side-event",
                    venueName = "Campus Hybernska",
                    addressLine1 = "Hybernská 4",
                    city = "Prague",
                    countryCode = "CZ",
                    latitude = 50.087000m,
                    longitude = 14.432000m,
                    startsAtUtc,
                    endsAtUtc
                }
            });

        var submittedEvent = submitDocument.RootElement.GetProperty("data").GetProperty("submitEvent");
        Assert.Equal("PENDING_APPROVAL", submittedEvent.GetProperty("status").GetString());
        Assert.Equal("crypto", submittedEvent.GetProperty("domain").GetProperty("slug").GetString());

        using var dashboardDocument = await ExecuteGraphQlAsync(
            client,
            """
            query {
              myDashboard {
                totalSubmittedEvents
                pendingApprovalEvents
                managedEvents {
                  name
                }
              }
            }
            """);

        var dashboard = dashboardDocument.RootElement.GetProperty("data").GetProperty("myDashboard");
        Assert.Equal(1, dashboard.GetProperty("totalSubmittedEvents").GetInt32());
        Assert.Equal(1, dashboard.GetProperty("pendingApprovalEvents").GetInt32());
        Assert.Equal("Alice Prague Side Event", dashboard.GetProperty("managedEvents")[0].GetProperty("name").GetString());
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
}
