using EventsApi.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace EventsApi.Tests.Infrastructure;

public sealed class EventsApiWebApplicationFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((_, configurationBuilder) =>
        {
            configurationBuilder.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:EventsCatalog"] = "Data Source=events-tests.db",
                ["SeedData:AdminEmail"] = "admin@events.local",
                ["SeedData:AdminDisplayName"] = "Platform Admin",
                ["SeedData:AdminPassword"] = "ChangeMe123!"
            });
        });
    }
}