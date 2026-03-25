using EventsApi.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace EventsApi.Tests.Infrastructure;

public sealed class EventsApiWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _databaseName = $"events-tests-{Guid.NewGuid()}";
    private readonly Action<IServiceCollection>? _additionalServices;

    public EventsApiWebApplicationFactory(Action<IServiceCollection>? additionalServices = null)
    {
        _additionalServices = additionalServices;
    }

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

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<AppDbContext>();
            services.AddDbContext<AppDbContext>(options =>
                options.UseInMemoryDatabase(_databaseName));

            _additionalServices?.Invoke(services);
        });
    }
}
