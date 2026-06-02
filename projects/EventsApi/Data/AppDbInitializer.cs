using System.Data;
using System.Globalization;
using System.Text;
using EventsApi.Configuration;
using EventsApi.Data.Entities;
using EventsApi.Utilities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.Extensions.Options;
using Microsoft.Data.Sqlite;

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
        await EnsureSchemaAsync(cancellationToken);

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
                IsFree = false,
                PriceAmount = 129m,
                CurrencyCode = "EUR",
                AttendanceMode = AttendanceMode.InPerson,
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
                IsFree = true,
                CurrencyCode = "EUR",
                AttendanceMode = AttendanceMode.Online,
                PublishedAtUtc = DateTime.UtcNow,
                AdminNotes = "Seeded example for AI catalog."
            }
        };

        _dbContext.Events.AddRange(events);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        if (!_dbContext.Database.IsSqlite())
        {
            // Relational providers other than SQLite (e.g. PostgreSQL in production) are not
            // covered by the SQLite-specific bootstrap below. EnsureCreatedAsync only creates
            // the schema for a brand-new database and never alters an existing one, so a
            // long-lived database that predates newer entity columns ends up missing them.
            // Querying such a database throws (surfaced to GraphQL clients as the opaque
            // "Unexpected Execution Error"). Reconcile any missing columns from the EF model
            // so the schema stays in sync after upgrades. Non-relational providers (e.g. the
            // in-memory provider used by tests) have no database schema to reconcile.
            if (_dbContext.Database.IsRelational())
            {
                await EnsureModelColumnsAsync(cancellationToken);
            }

            return;
        }

        await EnsureEventColumnAsync("IsFree", cancellationToken);
        await EnsureEventColumnAsync("PriceAmount", cancellationToken);
        await EnsureEventColumnAsync("CurrencyCode", cancellationToken);
        await EnsureEventColumnAsync("AttendanceMode", cancellationToken);
        await EnsureEventColumnAsync("Timezone", cancellationToken);
        await EnsureEventColumnAsync("Language", cancellationToken);
        await EnsureEventColumnAsync("ExternalSourceClaimId", cancellationToken);
        await EnsureEventColumnAsync("ExternalSourceEventId", cancellationToken);

        if (!await TableExistsAsync("SavedSearches", cancellationToken))
        {
            // EF Core maps SQLite decimal columns to TEXT when using EnsureCreated().
            // Keep the manual bootstrap table aligned so saved-search prices round-trip
            // consistently for both fresh databases and upgraded existing databases.
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "SavedSearches" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_SavedSearches" PRIMARY KEY,
                    "UserId" TEXT NOT NULL,
                    "Name" TEXT NOT NULL,
                    "SearchText" TEXT NULL,
                    "DomainSlug" TEXT NULL,
                    "LocationText" TEXT NULL,
                    "StartsFromUtc" TEXT NULL,
                    "StartsToUtc" TEXT NULL,
                    "IsFree" INTEGER NULL,
                    "PriceMin" TEXT NULL,
                    "PriceMax" TEXT NULL,
                    "SortBy" TEXT NOT NULL,
                    "AttendanceMode" TEXT NULL,
                    "Language" TEXT NULL,
                    "Timezone" TEXT NULL,
                    "CreatedAtUtc" TEXT NOT NULL,
                    "UpdatedAtUtc" TEXT NOT NULL,
                    CONSTRAINT "FK_SavedSearches_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
                );
                CREATE INDEX "IX_SavedSearches_UserId" ON "SavedSearches" ("UserId");
                """,
                cancellationToken);
        }
        else
        {
            await EnsureSavedSearchColumnAsync("AttendanceMode", cancellationToken);
            await EnsureSavedSearchColumnAsync("Language", cancellationToken);
            await EnsureSavedSearchColumnAsync("Timezone", cancellationToken);
        }

        if (!await TableExistsAsync("FavoriteEvents", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "FavoriteEvents" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_FavoriteEvents" PRIMARY KEY,
                    "UserId" TEXT NOT NULL,
                    "EventId" TEXT NOT NULL,
                    "CreatedAtUtc" TEXT NOT NULL,
                    CONSTRAINT "FK_FavoriteEvents_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_FavoriteEvents_Events_EventId" FOREIGN KEY ("EventId") REFERENCES "Events" ("Id") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX "IX_FavoriteEvents_UserId_EventId" ON "FavoriteEvents" ("UserId", "EventId");
                CREATE INDEX "IX_FavoriteEvents_EventId" ON "FavoriteEvents" ("EventId");
                """,
                cancellationToken);
        }

        if (!await TableExistsAsync("CalendarAnalyticsActions", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "CalendarAnalyticsActions" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_CalendarAnalyticsActions" PRIMARY KEY,
                    "EventId" TEXT NOT NULL,
                    "Provider" TEXT NOT NULL,
                    "TriggeredAtUtc" TEXT NOT NULL,
                    CONSTRAINT "FK_CalendarAnalyticsActions_Events_EventId" FOREIGN KEY ("EventId") REFERENCES "Events" ("Id") ON DELETE CASCADE
                );
                CREATE INDEX "IX_CalendarAnalyticsActions_EventId" ON "CalendarAnalyticsActions" ("EventId");
                CREATE INDEX "IX_CalendarAnalyticsActions_TriggeredAtUtc" ON "CalendarAnalyticsActions" ("TriggeredAtUtc");
                """,
                cancellationToken);
        }

        if (!await TableExistsAsync("DiscoveryAnalyticsActions", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "DiscoveryAnalyticsActions" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_DiscoveryAnalyticsActions" PRIMARY KEY,
                    "ActionType" TEXT NOT NULL,
                    "EventSlug" TEXT NULL,
                    "ActiveFilterCount" INTEGER NOT NULL,
                    "ResultCount" INTEGER NULL,
                    "TriggeredAtUtc" TEXT NOT NULL
                );
                CREATE INDEX "IX_DiscoveryAnalyticsActions_ActionType" ON "DiscoveryAnalyticsActions" ("ActionType");
                CREATE INDEX "IX_DiscoveryAnalyticsActions_TriggeredAtUtc" ON "DiscoveryAnalyticsActions" ("TriggeredAtUtc");
                """,
                cancellationToken);
        }

        // ── Domain style columns and creator ─────────────────────────────────
        await EnsureDomainColumnAsync("CreatedByUserId", cancellationToken);
        await EnsureDomainColumnAsync("PrimaryColor", cancellationToken);
        await EnsureDomainColumnAsync("AccentColor", cancellationToken);
        await EnsureDomainColumnAsync("LogoUrl", cancellationToken);
        await EnsureDomainColumnAsync("BannerUrl", cancellationToken);
        // ── Domain hub overview content columns ───────────────────────────────
        await EnsureDomainColumnAsync("OverviewContent", cancellationToken);
        await EnsureDomainColumnAsync("Tagline", cancellationToken);
        await EnsureDomainColumnAsync("WhatBelongsHere", cancellationToken);
        await EnsureDomainColumnAsync("SubmitEventCta", cancellationToken);
        await EnsureDomainColumnAsync("CuratorCredit", cancellationToken);

        // ── DomainFeaturedEvents table ────────────────────────────────────────
        if (!await TableExistsAsync("DomainFeaturedEvents", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "DomainFeaturedEvents" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_DomainFeaturedEvents" PRIMARY KEY,
                    "DomainId" TEXT NOT NULL,
                    "EventId" TEXT NOT NULL,
                    "DisplayOrder" INTEGER NOT NULL DEFAULT 0,
                    "CreatedAtUtc" TEXT NOT NULL,
                    CONSTRAINT "FK_DomainFeaturedEvents_Domains_DomainId" FOREIGN KEY ("DomainId") REFERENCES "Domains" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_DomainFeaturedEvents_Events_EventId" FOREIGN KEY ("EventId") REFERENCES "Events" ("Id") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX "IX_DomainFeaturedEvents_DomainId_EventId" ON "DomainFeaturedEvents" ("DomainId", "EventId");
                CREATE INDEX "IX_DomainFeaturedEvents_DomainId_DisplayOrder" ON "DomainFeaturedEvents" ("DomainId", "DisplayOrder");
                """,
                cancellationToken);
        }

        // ── DomainLinks table ─────────────────────────────────────────────────
        if (!await TableExistsAsync("DomainLinks", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "DomainLinks" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_DomainLinks" PRIMARY KEY,
                    "DomainId" TEXT NOT NULL,
                    "Title" TEXT NOT NULL,
                    "Url" TEXT NOT NULL,
                    "DisplayOrder" INTEGER NOT NULL DEFAULT 0,
                    "CreatedAtUtc" TEXT NOT NULL,
                    CONSTRAINT "FK_DomainLinks_Domains_DomainId" FOREIGN KEY ("DomainId") REFERENCES "Domains" ("Id") ON DELETE CASCADE
                );
                CREATE INDEX "IX_DomainLinks_DomainId_DisplayOrder" ON "DomainLinks" ("DomainId", "DisplayOrder");
                """,
                cancellationToken);
        }

        // ── DomainCuratedCommunities join table ──────────────────────────────
        if (!await TableExistsAsync("DomainCuratedCommunities", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "DomainCuratedCommunities" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_DomainCuratedCommunities" PRIMARY KEY,
                    "DomainId" TEXT NOT NULL,
                    "GroupId" TEXT NOT NULL,
                    "DisplayOrder" INTEGER NOT NULL DEFAULT 0,
                    "IsEnabled" INTEGER NOT NULL DEFAULT 1,
                    "Annotation" TEXT NULL,
                    "CreatedAtUtc" TEXT NOT NULL,
                    CONSTRAINT "FK_DomainCuratedCommunities_Domains_DomainId" FOREIGN KEY ("DomainId") REFERENCES "Domains" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_DomainCuratedCommunities_CommunityGroups_GroupId" FOREIGN KEY ("GroupId") REFERENCES "CommunityGroups" ("Id") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX "IX_DomainCuratedCommunities_DomainId_GroupId" ON "DomainCuratedCommunities" ("DomainId", "GroupId");
                CREATE INDEX "IX_DomainCuratedCommunities_DomainId_DisplayOrder" ON "DomainCuratedCommunities" ("DomainId", "DisplayOrder");
                """,
                cancellationToken);
        }

        // ── DomainAdministrators join table ──────────────────────────────────
        if (!await TableExistsAsync("DomainAdministrators", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "DomainAdministrators" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_DomainAdministrators" PRIMARY KEY,
                    "DomainId" TEXT NOT NULL,
                    "UserId" TEXT NOT NULL,
                    "CreatedAtUtc" TEXT NOT NULL,
                    CONSTRAINT "FK_DomainAdministrators_Domains_DomainId" FOREIGN KEY ("DomainId") REFERENCES "Domains" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_DomainAdministrators_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX "IX_DomainAdministrators_DomainId_UserId" ON "DomainAdministrators" ("DomainId", "UserId");
                """,
                cancellationToken);
        }

        // ── PushSubscriptions table ───────────────────────────────────────────
        if (!await TableExistsAsync("PushSubscriptions", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "PushSubscriptions" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_PushSubscriptions" PRIMARY KEY,
                    "UserId" TEXT NOT NULL,
                    "Endpoint" TEXT NOT NULL,
                    "P256dh" TEXT NOT NULL,
                    "Auth" TEXT NOT NULL,
                    "CreatedAtUtc" TEXT NOT NULL,
                    "UpdatedAtUtc" TEXT NOT NULL,
                    CONSTRAINT "FK_PushSubscriptions_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX "IX_PushSubscriptions_UserId" ON "PushSubscriptions" ("UserId");
                """,
                cancellationToken);
        }

        // ── EventReminders table ──────────────────────────────────────────────
        if (!await TableExistsAsync("EventReminders", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "EventReminders" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_EventReminders" PRIMARY KEY,
                    "UserId" TEXT NOT NULL,
                    "EventId" TEXT NOT NULL,
                    "OffsetHours" INTEGER NOT NULL DEFAULT 24,
                    "ScheduledForUtc" TEXT NOT NULL,
                    "SentAtUtc" TEXT NULL,
                    "CreatedAtUtc" TEXT NOT NULL,
                    CONSTRAINT "FK_EventReminders_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_EventReminders_Events_EventId" FOREIGN KEY ("EventId") REFERENCES "Events" ("Id") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX "IX_EventReminders_UserId_EventId_OffsetHours" ON "EventReminders" ("UserId", "EventId", "OffsetHours");
                CREATE INDEX "IX_EventReminders_ScheduledForUtc" ON "EventReminders" ("ScheduledForUtc");
                """,
                cancellationToken);
        }

        // ── CommunityGroups table ─────────────────────────────────────────────
        if (!await TableExistsAsync("CommunityGroups", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "CommunityGroups" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_CommunityGroups" PRIMARY KEY,
                    "Name" TEXT NOT NULL,
                    "Slug" TEXT NOT NULL,
                    "Summary" TEXT NULL,
                    "Description" TEXT NULL,
                    "Visibility" TEXT NOT NULL DEFAULT 'Public',
                    "IsActive" INTEGER NOT NULL DEFAULT 1,
                    "CreatedAtUtc" TEXT NOT NULL,
                    "CreatedByUserId" TEXT NULL,
                    CONSTRAINT "FK_CommunityGroups_Users_CreatedByUserId" FOREIGN KEY ("CreatedByUserId") REFERENCES "Users" ("Id") ON DELETE SET NULL
                );
                CREATE UNIQUE INDEX "IX_CommunityGroups_Slug" ON "CommunityGroups" ("Slug");
                """,
                cancellationToken);
        }

        // ── CommunityMemberships table ────────────────────────────────────────
        if (!await TableExistsAsync("CommunityMemberships", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "CommunityMemberships" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_CommunityMemberships" PRIMARY KEY,
                    "GroupId" TEXT NOT NULL,
                    "UserId" TEXT NOT NULL,
                    "Role" TEXT NOT NULL DEFAULT 'Member',
                    "Status" TEXT NOT NULL DEFAULT 'Pending',
                    "CreatedAtUtc" TEXT NOT NULL,
                    "ReviewedAtUtc" TEXT NULL,
                    "ReviewedByUserId" TEXT NULL,
                    CONSTRAINT "FK_CommunityMemberships_CommunityGroups_GroupId" FOREIGN KEY ("GroupId") REFERENCES "CommunityGroups" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_CommunityMemberships_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_CommunityMemberships_Users_ReviewedByUserId" FOREIGN KEY ("ReviewedByUserId") REFERENCES "Users" ("Id") ON DELETE SET NULL
                );
                CREATE UNIQUE INDEX "IX_CommunityMemberships_GroupId_UserId" ON "CommunityMemberships" ("GroupId", "UserId");
                """,
                cancellationToken);
        }
        else
        {
            // Migrate existing groups: for each group that has no Owner yet, promote the
            // earliest active Admin (the group creator) to Owner to enforce ownership semantics.
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                UPDATE "CommunityMemberships"
                SET "Role" = 'Owner'
                WHERE "Role" = 'Admin'
                  AND "Status" = 'Active'
                  AND "Id" IN (
                      SELECT cm."Id"
                      FROM "CommunityMemberships" cm
                      WHERE cm."Role" = 'Admin'
                        AND cm."Status" = 'Active'
                        AND NOT EXISTS (
                            SELECT 1 FROM "CommunityMemberships" o
                            WHERE o."GroupId" = cm."GroupId" AND o."Role" = 'Owner' AND o."Status" = 'Active'
                        )
                      GROUP BY cm."GroupId"
                      HAVING cm."CreatedAtUtc" = MIN(cm."CreatedAtUtc")
                  );
                """,
                cancellationToken);
        }

        // ── CommunityGroupEvents table ────────────────────────────────────────
        if (!await TableExistsAsync("CommunityGroupEvents", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "CommunityGroupEvents" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_CommunityGroupEvents" PRIMARY KEY,
                    "GroupId" TEXT NOT NULL,
                    "EventId" TEXT NOT NULL,
                    "AddedAtUtc" TEXT NOT NULL,
                    "AddedByUserId" TEXT NULL,
                    CONSTRAINT "FK_CommunityGroupEvents_CommunityGroups_GroupId" FOREIGN KEY ("GroupId") REFERENCES "CommunityGroups" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_CommunityGroupEvents_Events_EventId" FOREIGN KEY ("EventId") REFERENCES "Events" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_CommunityGroupEvents_Users_AddedByUserId" FOREIGN KEY ("AddedByUserId") REFERENCES "Users" ("Id") ON DELETE SET NULL
                );
                CREATE UNIQUE INDEX "IX_CommunityGroupEvents_GroupId_EventId" ON "CommunityGroupEvents" ("GroupId", "EventId");
                """,
                cancellationToken);
        }

        // ── ExternalSourceClaims table ────────────────────────────────────────
        if (!await TableExistsAsync("ExternalSourceClaims", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "ExternalSourceClaims" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_ExternalSourceClaims" PRIMARY KEY,
                    "GroupId" TEXT NOT NULL,
                    "SourceType" TEXT NOT NULL,
                    "SourceUrl" TEXT NOT NULL,
                    "SourceIdentifier" TEXT NOT NULL,
                    "Status" TEXT NOT NULL DEFAULT 'PendingReview',
                    "CreatedByUserId" TEXT NOT NULL,
                    "CreatedAtUtc" TEXT NOT NULL,
                    "LastSyncAtUtc" TEXT NULL,
                    "LastSyncSucceededAtUtc" TEXT NULL,
                    "LastSyncOutcome" TEXT NULL,
                    "LastSyncError" TEXT NULL,
                    "LastSyncImportedCount" INTEGER NULL,
                    "LastSyncSkippedCount" INTEGER NULL,
                    "IsAutoSyncEnabled" INTEGER NOT NULL DEFAULT 1,
                    "AdminNote" TEXT NULL,
                    CONSTRAINT "FK_ExternalSourceClaims_CommunityGroups_GroupId" FOREIGN KEY ("GroupId") REFERENCES "CommunityGroups" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_ExternalSourceClaims_Users_CreatedByUserId" FOREIGN KEY ("CreatedByUserId") REFERENCES "Users" ("Id") ON DELETE RESTRICT
                );
                CREATE UNIQUE INDEX "IX_ExternalSourceClaims_GroupId_SourceType_SourceIdentifier"
                    ON "ExternalSourceClaims" ("GroupId", "SourceType", "SourceIdentifier");
                """,
                cancellationToken);
        }
        else
        {
            // Migrate existing ExternalSourceClaims tables that predate newer columns.
            await EnsureExternalSourceClaimColumnAsync("AdminNote", cancellationToken);
            await EnsureExternalSourceClaimColumnAsync("LastSyncSucceededAtUtc", cancellationToken);
            await EnsureExternalSourceClaimColumnAsync("LastSyncError", cancellationToken);
            await EnsureExternalSourceClaimColumnAsync("IsAutoSyncEnabled", cancellationToken);
        }

        // Add the deduplication index on Events(ExternalSourceClaimId, ExternalSourceEventId)
        // if it doesn't exist yet (new databases have it via EF; existing databases need migration).
        await EnsureIndexAsync(
            "IX_Events_ExternalSourceClaimId_ExternalSourceEventId",
            """
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_Events_ExternalSourceClaimId_ExternalSourceEventId"
                ON "Events" ("ExternalSourceClaimId", "ExternalSourceEventId")
                WHERE "ExternalSourceClaimId" IS NOT NULL AND "ExternalSourceEventId" IS NOT NULL;
            """,
            cancellationToken);

        // ── ScheduledFeaturedEvents table ─────────────────────────────────────
        if (!await TableExistsAsync("ScheduledFeaturedEvents", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "ScheduledFeaturedEvents" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_ScheduledFeaturedEvents" PRIMARY KEY,
                    "DomainId" TEXT NOT NULL,
                    "EventId" TEXT NOT NULL,
                    "StartsAtUtc" TEXT NOT NULL,
                    "EndsAtUtc" TEXT NOT NULL,
                    "Priority" INTEGER NOT NULL DEFAULT 0,
                    "CreatedAtUtc" TEXT NOT NULL,
                    "CreatedByUserId" TEXT NULL,
                    CONSTRAINT "FK_ScheduledFeaturedEvents_Domains_DomainId" FOREIGN KEY ("DomainId") REFERENCES "Domains" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_ScheduledFeaturedEvents_Events_EventId" FOREIGN KEY ("EventId") REFERENCES "Events" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_ScheduledFeaturedEvents_Users_CreatedByUserId" FOREIGN KEY ("CreatedByUserId") REFERENCES "Users" ("Id") ON DELETE SET NULL
                );
                CREATE INDEX "IX_ScheduledFeaturedEvents_DomainId_StartsAtUtc" ON "ScheduledFeaturedEvents" ("DomainId", "StartsAtUtc");
                CREATE INDEX "IX_ScheduledFeaturedEvents_EndsAtUtc" ON "ScheduledFeaturedEvents" ("EndsAtUtc");
                """,
                cancellationToken);
        }

        // ── EventDiscussionEntries table ──────────────────────────────────────
        if (!await TableExistsAsync("EventDiscussionEntries", cancellationToken))
        {
            await _dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE "EventDiscussionEntries" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_EventDiscussionEntries" PRIMARY KEY,
                    "EventId" TEXT NOT NULL,
                    "AuthorId" TEXT NOT NULL,
                    "AuthorDisplayName" TEXT NOT NULL,
                    "AuthorRole" TEXT NOT NULL DEFAULT 'ATTENDEE',
                    "Body" TEXT NOT NULL,
                    "ParentEntryId" TEXT NULL,
                    "IsHidden" INTEGER NOT NULL DEFAULT 0,
                    "CreatedAtUtc" TEXT NOT NULL,
                    "UpdatedAtUtc" TEXT NOT NULL,
                    CONSTRAINT "FK_EventDiscussionEntries_Events_EventId" FOREIGN KEY ("EventId") REFERENCES "Events" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_EventDiscussionEntries_Users_AuthorId" FOREIGN KEY ("AuthorId") REFERENCES "Users" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_EventDiscussionEntries_EventDiscussionEntries_ParentEntryId" FOREIGN KEY ("ParentEntryId") REFERENCES "EventDiscussionEntries" ("Id") ON DELETE RESTRICT
                );
                CREATE INDEX "IX_EventDiscussionEntries_EventId" ON "EventDiscussionEntries" ("EventId");
                CREATE INDEX "IX_EventDiscussionEntries_CreatedAtUtc" ON "EventDiscussionEntries" ("CreatedAtUtc");
                """,
                cancellationToken);
        }
    }

    /// <summary>
    /// Reconciles the live relational schema with the EF Core model by adding any columns the
    /// model expects but the database is missing. This handles schema drift on relational
    /// providers such as PostgreSQL, where <c>EnsureCreatedAsync</c> only bootstraps a brand-new
    /// database and never alters an existing one. A long-lived database that predates newer
    /// entity columns would otherwise be missing them, and querying such a database throws —
    /// surfaced to GraphQL clients as the opaque "Unexpected Execution Error".
    ///
    /// Only additive, idempotent <c>ALTER TABLE ... ADD COLUMN</c> statements are issued, derived
    /// from the model's own column names and store types, so no data is dropped or rewritten and
    /// future columns are picked up automatically. Tables that do not yet exist are left to
    /// <c>EnsureCreatedAsync</c> (fresh databases) and are skipped here.
    /// </summary>
    private async Task EnsureModelColumnsAsync(CancellationToken cancellationToken)
    {
        foreach (var entityType in _dbContext.Model.GetEntityTypes())
        {
            var storeObject = StoreObjectIdentifier.Create(entityType, StoreObjectType.Table);
            if (storeObject is null)
            {
                continue;
            }

            var table = storeObject.Value;
            var existingColumns = await GetExistingColumnsAsync(table.Name, table.Schema, cancellationToken);
            if (existingColumns.Count == 0)
            {
                // The table is absent (or not visible). Creating tables is out of scope here;
                // fresh databases get them from EnsureCreatedAsync.
                continue;
            }

            foreach (var property in entityType.GetProperties())
            {
                var columnName = property.GetColumnName(table);
                if (columnName is null || existingColumns.Contains(columnName))
                {
                    continue;
                }

                var ddl = BuildAddColumnDdl(table, columnName, property);
                await _dbContext.Database.ExecuteSqlRawAsync(ddl, cancellationToken);
            }
        }
    }

    private async Task<HashSet<string>> GetExistingColumnsAsync(
        string tableName,
        string? schema,
        CancellationToken cancellationToken)
    {
        var connection = _dbContext.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        await using var command = connection.CreateCommand();
        command.CommandText = schema is null
            ? "SELECT column_name FROM information_schema.columns WHERE table_name = @table;"
            : "SELECT column_name FROM information_schema.columns WHERE table_name = @table AND table_schema = @schema;";

        var tableParameter = command.CreateParameter();
        tableParameter.ParameterName = "@table";
        tableParameter.Value = tableName;
        command.Parameters.Add(tableParameter);

        if (schema is not null)
        {
            var schemaParameter = command.CreateParameter();
            schemaParameter.ParameterName = "@schema";
            schemaParameter.Value = schema;
            command.Parameters.Add(schemaParameter);
        }

        var columns = new HashSet<string>(StringComparer.Ordinal);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            columns.Add(reader.GetString(0));
        }

        return columns;
    }

    private static string BuildAddColumnDdl(StoreObjectIdentifier table, string columnName, IProperty property)
    {
        var qualifiedTable = table.Schema is null
            ? $"\"{table.Name}\""
            : $"\"{table.Schema}\".\"{table.Name}\"";

        var builder = new StringBuilder()
            .Append("ALTER TABLE ").Append(qualifiedTable)
            .Append(" ADD COLUMN \"").Append(columnName).Append("\" ")
            .Append(property.GetColumnType(table));

        if (property.IsColumnNullable(table))
        {
            builder.Append(" NULL");
        }
        else
        {
            builder.Append(" NOT NULL");

            // Existing rows need a value for a new NOT NULL column, so emit a DEFAULT derived
            // from the model (or a type-appropriate fallback) to keep the ALTER safe on a
            // populated table.
            var defaultClause = BuildDefaultClause(property);
            if (defaultClause is not null)
            {
                builder.Append(" DEFAULT ").Append(defaultClause);
            }
        }

        return builder.Append(';').ToString();
    }

    private static string? BuildDefaultClause(IProperty property)
    {
        var defaultValueSql = property.GetDefaultValueSql();
        if (!string.IsNullOrWhiteSpace(defaultValueSql))
        {
            return defaultValueSql;
        }

        var defaultValue = property.GetDefaultValue();
        if (defaultValue is not null)
        {
            return FormatSqlLiteral(defaultValue);
        }

        var clrType = Nullable.GetUnderlyingType(property.ClrType) ?? property.ClrType;
        if (clrType.IsEnum || clrType == typeof(string))
        {
            return "''";
        }

        if (clrType == typeof(bool))
        {
            return "FALSE";
        }

        if (clrType == typeof(Guid))
        {
            return "'00000000-0000-0000-0000-000000000000'";
        }

        if (clrType == typeof(DateTime) || clrType == typeof(DateTimeOffset))
        {
            return "CURRENT_TIMESTAMP";
        }

        if (clrType == typeof(int) || clrType == typeof(long) || clrType == typeof(short)
            || clrType == typeof(byte) || clrType == typeof(decimal) || clrType == typeof(double)
            || clrType == typeof(float))
        {
            return "0";
        }

        return null;
    }

    private static string FormatSqlLiteral(object value)
    {
        switch (value)
        {
            case bool boolean:
                return boolean ? "TRUE" : "FALSE";
            case byte or short or int or long or decimal or double or float:
                return Convert.ToString(value, CultureInfo.InvariantCulture)!;
            case string text:
                return "'" + text.Replace("'", "''") + "'";
            default:
                return "'" + value.ToString()!.Replace("'", "''") + "'";
        }
    }

    private async Task EnsureSavedSearchColumnAsync(string columnName, CancellationToken cancellationToken)
    {
        if (await TableColumnExistsAsync("SavedSearches", columnName, cancellationToken))
        {
            return;
        }

        var commandText = columnName switch
        {
            "AttendanceMode" => """ALTER TABLE "SavedSearches" ADD COLUMN "AttendanceMode" TEXT NULL;""",
            "Language" => """ALTER TABLE "SavedSearches" ADD COLUMN "Language" TEXT NULL;""",
            "Timezone" => """ALTER TABLE "SavedSearches" ADD COLUMN "Timezone" TEXT NULL;""",
            _ => throw new InvalidOperationException($"Unsupported saved-search column '{columnName}'.")
        };

        await _dbContext.Database.ExecuteSqlRawAsync(commandText, cancellationToken);
    }

    private async Task EnsureDomainColumnAsync(string columnName, CancellationToken cancellationToken)
    {
        if (await TableColumnExistsAsync("Domains", columnName, cancellationToken))
        {
            return;
        }

        var commandText = columnName switch
        {
            "CreatedByUserId" => """ALTER TABLE "Domains" ADD COLUMN "CreatedByUserId" TEXT NULL;""",
            "PrimaryColor" => """ALTER TABLE "Domains" ADD COLUMN "PrimaryColor" TEXT NULL;""",
            "AccentColor" => """ALTER TABLE "Domains" ADD COLUMN "AccentColor" TEXT NULL;""",
            "LogoUrl" => """ALTER TABLE "Domains" ADD COLUMN "LogoUrl" TEXT NULL;""",
            "BannerUrl" => """ALTER TABLE "Domains" ADD COLUMN "BannerUrl" TEXT NULL;""",
            "OverviewContent" => """ALTER TABLE "Domains" ADD COLUMN "OverviewContent" TEXT NULL;""",
            "Tagline" => """ALTER TABLE "Domains" ADD COLUMN "Tagline" TEXT NULL;""",
            "WhatBelongsHere" => """ALTER TABLE "Domains" ADD COLUMN "WhatBelongsHere" TEXT NULL;""",
            "SubmitEventCta" => """ALTER TABLE "Domains" ADD COLUMN "SubmitEventCta" TEXT NULL;""",
            "CuratorCredit" => """ALTER TABLE "Domains" ADD COLUMN "CuratorCredit" TEXT NULL;""",
            _ => throw new InvalidOperationException($"Unsupported domain column '{columnName}'.")
        };

        await _dbContext.Database.ExecuteSqlRawAsync(commandText, cancellationToken);
    }

    private async Task EnsureEventColumnAsync(string columnName, CancellationToken cancellationToken)
    {
        if (await TableColumnExistsAsync("Events", columnName, cancellationToken))
        {
            return;
        }

        var commandText = columnName switch
        {
            "IsFree" => """ALTER TABLE "Events" ADD COLUMN "IsFree" INTEGER NOT NULL DEFAULT 1;""",
            "PriceAmount" => """ALTER TABLE "Events" ADD COLUMN "PriceAmount" TEXT NULL;""",
            "CurrencyCode" => """ALTER TABLE "Events" ADD COLUMN "CurrencyCode" TEXT NOT NULL DEFAULT 'EUR';""",
            "AttendanceMode" => """ALTER TABLE "Events" ADD COLUMN "AttendanceMode" TEXT NOT NULL DEFAULT 'InPerson';""",
            "Timezone" => """ALTER TABLE "Events" ADD COLUMN "Timezone" TEXT NULL;""",
            "Language" => """ALTER TABLE "Events" ADD COLUMN "Language" TEXT NULL;""",
            "ExternalSourceClaimId" => """ALTER TABLE "Events" ADD COLUMN "ExternalSourceClaimId" TEXT NULL;""",
            "ExternalSourceEventId" => """ALTER TABLE "Events" ADD COLUMN "ExternalSourceEventId" TEXT NULL;""",
            _ => throw new InvalidOperationException($"Unsupported event column '{columnName}'.")
        };

        await _dbContext.Database.ExecuteSqlRawAsync(commandText, cancellationToken);
    }

    /// <summary>
    /// Generic helper: adds a column to an existing table only if the column is absent.
    /// The caller is responsible for providing the correct DDL snippet.
    /// </summary>
    private async Task EnsureColumnAsync(
        string tableName,
        string columnName,
        string ddlSnippet,
        CancellationToken cancellationToken)
    {
        if (await TableColumnExistsAsync(tableName, columnName, cancellationToken))
        {
            return;
        }

        await _dbContext.Database.ExecuteSqlRawAsync(ddlSnippet, cancellationToken);
    }

    private async Task EnsureExternalSourceClaimColumnAsync(string columnName, CancellationToken cancellationToken)
    {
        var ddl = columnName switch
        {
            "AdminNote" => """ALTER TABLE "ExternalSourceClaims" ADD COLUMN "AdminNote" TEXT NULL;""",
            "LastSyncSucceededAtUtc" => """ALTER TABLE "ExternalSourceClaims" ADD COLUMN "LastSyncSucceededAtUtc" TEXT NULL;""",
            "LastSyncError" => """ALTER TABLE "ExternalSourceClaims" ADD COLUMN "LastSyncError" TEXT NULL;""",
            "IsAutoSyncEnabled" => """ALTER TABLE "ExternalSourceClaims" ADD COLUMN "IsAutoSyncEnabled" INTEGER NOT NULL DEFAULT 1;""",
            _ => throw new InvalidOperationException($"Unsupported ExternalSourceClaims column '{columnName}'.")
        };

        await EnsureColumnAsync("ExternalSourceClaims", columnName, ddl, cancellationToken);
    }

    /// <summary>
    /// Executes a DDL statement only if the specified index does not yet exist in sqlite_master.
    /// Idempotent — safe to call on every startup.
    /// </summary>
    private async Task EnsureIndexAsync(string indexName, string ddl, CancellationToken cancellationToken)
    {
        var connection = (SqliteConnection)_dbContext.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
            await connection.OpenAsync(cancellationToken);

        await using var checkCmd = connection.CreateCommand();
        checkCmd.CommandText = "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = $name LIMIT 1;";
        checkCmd.Parameters.AddWithValue("$name", indexName);
        var exists = await checkCmd.ExecuteScalarAsync(cancellationToken);
        if (exists is not null)
            return;

        await _dbContext.Database.ExecuteSqlRawAsync(ddl, cancellationToken);
    }

    private async Task<bool> TableExistsAsync(string tableName, CancellationToken cancellationToken)
    {
        var connection = (SqliteConnection)_dbContext.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $name LIMIT 1;";
        command.Parameters.AddWithValue("$name", tableName);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null;
    }

    private async Task<bool> TableColumnExistsAsync(string tableName, string columnName, CancellationToken cancellationToken)
    {
        var connection = (SqliteConnection)_dbContext.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        await using var command = connection.CreateCommand();
        command.CommandText = tableName switch
        {
            "Events" => """PRAGMA table_info("Events");""",
            "SavedSearches" => """PRAGMA table_info("SavedSearches");""",
            "Domains" => """PRAGMA table_info("Domains");""",
            "ExternalSourceClaims" => """PRAGMA table_info("ExternalSourceClaims");""",
            _ => throw new InvalidOperationException($"Unsupported schema table '{tableName}'.")
        };
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            if (string.Equals(reader.GetString(1), columnName, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
