using EventsApi.Configuration;
using EventsApi.Data;
using EventsApi.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace EventsApi.Tests;

public sealed class AppDbInitializerTests
{
    [Fact]
    public async Task InitializeAsync_UpgradesExistingSqliteDatabaseAndKeepsLegacyData()
    {
        var databasePath = Path.Combine(Path.GetTempPath(), $"events-upgrade-{Guid.NewGuid():N}.db");

        try
        {
            await CreateLegacyDatabaseAsync(databasePath);

            await using var dbContext = CreateSqliteDbContext(databasePath);
            var initializer = new AppDbInitializer(
                dbContext,
                new PasswordHasher<ApplicationUser>(),
                Options.Create(new SeedDataOptions()));

            await initializer.InitializeAsync();

            await using var verificationContext = CreateSqliteDbContext(databasePath);

            var upgradedEvent = await verificationContext.Events.SingleAsync();
            Assert.Equal("Legacy Prague Event", upgradedEvent.Name);
            Assert.True(upgradedEvent.IsFree);
            Assert.Null(upgradedEvent.PriceAmount);
            Assert.Equal("EUR", upgradedEvent.CurrencyCode);

            Assert.Equal(1, await verificationContext.Users.CountAsync());
            Assert.Equal(1, await verificationContext.Domains.CountAsync());
            Assert.Equal(1, await verificationContext.Events.CountAsync());
            Assert.Empty(await verificationContext.SavedSearches.ToListAsync());

            var savedSearchColumns = await GetTableColumnsAsync(verificationContext, "SavedSearches");
            Assert.Equal("TEXT", savedSearchColumns["PriceMin"]);
            Assert.Equal("TEXT", savedSearchColumns["PriceMax"]);
            Assert.Contains("AttendanceMode", savedSearchColumns.Keys);

            var eventColumns = await GetTableColumnsAsync(verificationContext, "Events");
            Assert.Contains("IsFree", eventColumns.Keys);
            Assert.Contains("PriceAmount", eventColumns.Keys);
            Assert.Contains("CurrencyCode", eventColumns.Keys);
        }
        finally
        {
            if (File.Exists(databasePath))
            {
                File.Delete(databasePath);
            }
        }
    }

    private static AppDbContext CreateSqliteDbContext(string databasePath)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={databasePath}")
            .Options;

        return new AppDbContext(options);
    }

    private static async Task CreateLegacyDatabaseAsync(string databasePath)
    {
        await using var connection = new SqliteConnection($"Data Source={databasePath}");
        await connection.OpenAsync();

        var userId = Guid.NewGuid();
        var domainId = Guid.NewGuid();
        var eventId = Guid.NewGuid();

        await ExecuteNonQueryAsync(
            connection,
            """
            CREATE TABLE "Users" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_Users" PRIMARY KEY,
                "Email" TEXT NOT NULL,
                "DisplayName" TEXT NOT NULL,
                "PasswordHash" TEXT NOT NULL,
                "Role" TEXT NOT NULL
            );

            CREATE TABLE "Domains" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_Domains" PRIMARY KEY,
                "Name" TEXT NOT NULL,
                "Slug" TEXT NOT NULL,
                "Subdomain" TEXT NOT NULL,
                "Description" TEXT NOT NULL,
                "IsActive" INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE "Events" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_Events" PRIMARY KEY,
                "Name" TEXT NOT NULL,
                "Slug" TEXT NOT NULL,
                "Description" TEXT NOT NULL,
                "EventUrl" TEXT NOT NULL,
                "VenueName" TEXT NOT NULL,
                "AddressLine1" TEXT NOT NULL,
                "City" TEXT NOT NULL,
                "CountryCode" TEXT NOT NULL,
                "Latitude" TEXT NOT NULL,
                "Longitude" TEXT NOT NULL,
                "StartsAtUtc" TEXT NOT NULL,
                "EndsAtUtc" TEXT NOT NULL,
                "SubmittedAtUtc" TEXT NOT NULL,
                "UpdatedAtUtc" TEXT NOT NULL,
                "PublishedAtUtc" TEXT NULL,
                "AdminNotes" TEXT NULL,
                "Status" TEXT NOT NULL,
                "DomainId" TEXT NOT NULL,
                "SubmittedByUserId" TEXT NOT NULL,
                "ReviewedByUserId" TEXT NULL
            );
            """);

        await using var insertCommand = connection.CreateCommand();
        insertCommand.CommandText =
            """
            INSERT INTO "Users" ("Id", "Email", "DisplayName", "PasswordHash", "Role")
            VALUES ($userId, 'legacy@example.com', 'Legacy User', 'hashed', 'CONTRIBUTOR');

            INSERT INTO "Domains" ("Id", "Name", "Slug", "Subdomain", "Description", "IsActive")
            VALUES ($domainId, 'Crypto', 'crypto', 'crypto', 'Legacy domain', 1);

            INSERT INTO "Events" (
                "Id", "Name", "Slug", "Description", "EventUrl", "VenueName", "AddressLine1", "City",
                "CountryCode", "Latitude", "Longitude", "StartsAtUtc", "EndsAtUtc", "SubmittedAtUtc",
                "UpdatedAtUtc", "PublishedAtUtc", "AdminNotes", "Status", "DomainId", "SubmittedByUserId", "ReviewedByUserId"
            )
            VALUES (
                $eventId, 'Legacy Prague Event', 'legacy-prague-event', 'Legacy event description',
                'https://events.example.com/legacy-prague-event', 'Legacy Venue', 'Legacy Street 1', 'Prague',
                'CZ', '50.075500', '14.437800', '2026-04-01T10:00:00Z', '2026-04-01T12:00:00Z',
                '2026-03-01T08:00:00Z', '2026-03-01T09:00:00Z', '2026-03-02T10:00:00Z', 'Legacy note',
                'Published', $domainId, $userId, NULL
            );
            """;
        insertCommand.Parameters.AddWithValue("$userId", userId);
        insertCommand.Parameters.AddWithValue("$domainId", domainId);
        insertCommand.Parameters.AddWithValue("$eventId", eventId);
        await insertCommand.ExecuteNonQueryAsync();
    }

    private static async Task ExecuteNonQueryAsync(SqliteConnection connection, string commandText)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = commandText;
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<Dictionary<string, string>> GetTableColumnsAsync(AppDbContext dbContext, string tableName)
    {
        await using var command = dbContext.Database.GetDbConnection().CreateCommand();
        command.CommandText = $"""PRAGMA table_info("{tableName}");""";

        if (command.Connection!.State != System.Data.ConnectionState.Open)
        {
            await command.Connection.OpenAsync();
        }

        await using var reader = await command.ExecuteReaderAsync();
        var columns = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        while (await reader.ReadAsync())
        {
            columns[reader.GetString(1)] = reader.GetString(2);
        }

        return columns;
    }
}
