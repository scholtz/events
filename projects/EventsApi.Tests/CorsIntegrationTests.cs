using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using EventsApi.Data;

namespace EventsApi.Tests;

/// <summary>
/// Validates that the CORS policy correctly allows the primary domain,
/// any <c>*.events.biatec.io</c> category subdomain, and rejects
/// unrecognised origins.  This is a release-blocking concern: category
/// landing pages (e.g. <c>tech.events.biatec.io</c>) must be able to
/// reach the GraphQL API.
/// </summary>
public sealed class CorsIntegrationTests
{
    /// <summary>
    /// Factory that configures explicit CORS origins including the
    /// wildcard pattern, matching the production K8s deployment values.
    /// </summary>
    private sealed class CorsTestFactory : WebApplicationFactory<Program>
    {
        private readonly string _databaseName = $"cors-tests-{Guid.NewGuid()}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");

            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["SeedData:AdminEmail"] = "admin@events.local",
                    ["SeedData:AdminDisplayName"] = "Platform Admin",
                    ["SeedData:AdminPassword"] = "ChangeMe123!",
                    // Production-equivalent CORS origins
                    ["Cors:AllowedOrigins:0"] = "https://events.biatec.io",
                    ["Cors:AllowedOrigins:1"] = "https://*.events.biatec.io",
                    ["Cors:AllowedOrigins:2"] = "http://localhost:5173",
                });
            });

            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<AppDbContext>>();
                services.RemoveAll<AppDbContext>();
                services.AddDbContext<AppDbContext>(options =>
                    options.UseInMemoryDatabase(_databaseName));
            });
        }
    }

    [Theory]
    [InlineData("https://events.biatec.io", true, "Primary domain must be allowed")]
    [InlineData("https://tech.events.biatec.io", true, "Category subdomain must be allowed")]
    [InlineData("https://crypto.events.biatec.io", true, "Category subdomain must be allowed")]
    [InlineData("https://ai-ml.events.biatec.io", true, "Hyphenated category subdomain must be allowed")]
    [InlineData("http://localhost:5173", true, "Localhost dev server must be allowed")]
    [InlineData("https://evil.example.com", false, "Unrecognised origin must be rejected")]
    [InlineData("https://events.biatec.io.attacker.com", false, "Suffix-spoofed origin must be rejected")]
    [InlineData("https://*.events.biatec.io", false, "Literal wildcard string is not a valid subdomain")]
    public async Task CorsPolicy_AllowsExpectedOriginsAndRejectsOthers(
        string origin, bool shouldBeAllowed, string because)
    {
        await using var factory = new CorsTestFactory();
        using var client = factory.CreateClient();

        // Send a preflight OPTIONS request with the Origin header
        var request = new HttpRequestMessage(HttpMethod.Options, "/graphql");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type");

        var response = await client.SendAsync(request);

        var allowOriginHeader = response.Headers.Contains("Access-Control-Allow-Origin")
            ? response.Headers.GetValues("Access-Control-Allow-Origin").FirstOrDefault()
            : null;

        if (shouldBeAllowed)
        {
            Assert.True(
                string.Equals(allowOriginHeader, origin, StringComparison.OrdinalIgnoreCase),
                $"{because}. Expected Access-Control-Allow-Origin to be '{origin}' but got '{allowOriginHeader}'.");
        }
        else
        {
            Assert.True(
                allowOriginHeader is null || !string.Equals(allowOriginHeader, origin, StringComparison.OrdinalIgnoreCase),
                $"{because}. Expected Access-Control-Allow-Origin to NOT match '{origin}' but it did.");
        }
    }

    [Fact]
    public async Task CorsPolicy_SubdomainOrigin_AllowsGraphQlPost()
    {
        await using var factory = new CorsTestFactory();
        using var client = factory.CreateClient();

        // Actual POST request from a category subdomain
        var request = new HttpRequestMessage(HttpMethod.Post, "/graphql");
        request.Headers.Add("Origin", "https://tech.events.biatec.io");
        request.Content = JsonContent.Create(new
        {
            query = "{ __typename }"
        });

        var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();

        var allowOriginHeader = response.Headers.Contains("Access-Control-Allow-Origin")
            ? response.Headers.GetValues("Access-Control-Allow-Origin").FirstOrDefault()
            : null;

        Assert.Equal("https://tech.events.biatec.io", allowOriginHeader);
    }
}
