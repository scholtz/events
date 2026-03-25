using EventsApi.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace EventsApi.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<ApplicationUser> Users => Set<ApplicationUser>();
    public DbSet<EventDomain> Domains => Set<EventDomain>();
    public DbSet<CatalogEvent> Events => Set<CatalogEvent>();
    public DbSet<SavedSearch> SavedSearches => Set<SavedSearch>();
    public DbSet<FavoriteEvent> FavoriteEvents => Set<FavoriteEvent>();
    public DbSet<CalendarAnalyticsAction> CalendarAnalyticsActions => Set<CalendarAnalyticsAction>();
    public DbSet<DiscoveryAnalyticsAction> DiscoveryAnalyticsActions => Set<DiscoveryAnalyticsAction>();
    public DbSet<DomainAdministrator> DomainAdministrators => Set<DomainAdministrator>();
    public DbSet<DomainFeaturedEvent> DomainFeaturedEvents => Set<DomainFeaturedEvent>();
    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();
    public DbSet<EventReminder> EventReminders => Set<EventReminder>();
    public DbSet<CommunityGroup> CommunityGroups => Set<CommunityGroup>();
    public DbSet<CommunityMembership> CommunityMemberships => Set<CommunityMembership>();
    public DbSet<CommunityGroupEvent> CommunityGroupEvents => Set<CommunityGroupEvent>();
    public DbSet<ExternalSourceClaim> ExternalSourceClaims => Set<ExternalSourceClaim>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ApplicationUser>(entity =>
        {
            entity.HasIndex(user => user.Email).IsUnique();
            entity.Property(user => user.Email).HasMaxLength(256);
            entity.Property(user => user.DisplayName).HasMaxLength(200);
            entity.Property(user => user.Role).HasConversion<string>().HasMaxLength(32);
            entity.Property(user => user.PasswordHash).HasMaxLength(512);
        });

        modelBuilder.Entity<EventDomain>(entity =>
        {
            entity.HasIndex(domain => domain.Slug).IsUnique();
            entity.HasIndex(domain => domain.Subdomain).IsUnique();
            entity.Property(domain => domain.Name).HasMaxLength(120);
            entity.Property(domain => domain.Slug).HasMaxLength(120);
            entity.Property(domain => domain.Subdomain).HasMaxLength(120);
            entity.Property(domain => domain.Description).HasMaxLength(1000);
            entity.Property(domain => domain.PrimaryColor).HasMaxLength(32);
            entity.Property(domain => domain.AccentColor).HasMaxLength(32);
            entity.Property(domain => domain.LogoUrl).HasMaxLength(1000);
            entity.Property(domain => domain.BannerUrl).HasMaxLength(1000);
            entity.Property(domain => domain.OverviewContent).HasMaxLength(2000);
            entity.Property(domain => domain.WhatBelongsHere).HasMaxLength(2000);
            entity.Property(domain => domain.SubmitEventCta).HasMaxLength(200);
            entity.Property(domain => domain.CuratorCredit).HasMaxLength(200);

            entity.HasOne(domain => domain.CreatedBy)
                .WithMany()
                .HasForeignKey(domain => domain.CreatedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<DomainFeaturedEvent>(entity =>
        {
            // Each event can only be featured once per domain
            entity.HasIndex(fe => new { fe.DomainId, fe.EventId }).IsUnique();

            entity.HasOne(fe => fe.Domain)
                .WithMany()
                .HasForeignKey(fe => fe.DomainId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(fe => fe.Event)
                .WithMany()
                .HasForeignKey(fe => fe.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DomainAdministrator>(entity =>
        {
            entity.HasIndex(da => new { da.DomainId, da.UserId }).IsUnique();

            entity.HasOne(da => da.Domain)
                .WithMany(domain => domain.Administrators)
                .HasForeignKey(da => da.DomainId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(da => da.User)
                .WithMany()
                .HasForeignKey(da => da.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CatalogEvent>(entity =>
        {
            entity.HasIndex(catalogEvent => catalogEvent.Slug).IsUnique();
            entity.Property(catalogEvent => catalogEvent.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(catalogEvent => catalogEvent.Name).HasMaxLength(200);
            entity.Property(catalogEvent => catalogEvent.Slug).HasMaxLength(200);
            entity.Property(catalogEvent => catalogEvent.Description).HasMaxLength(4000);
            entity.Property(catalogEvent => catalogEvent.EventUrl).HasMaxLength(1000);
            entity.Property(catalogEvent => catalogEvent.VenueName).HasMaxLength(200);
            entity.Property(catalogEvent => catalogEvent.AddressLine1).HasMaxLength(250);
            entity.Property(catalogEvent => catalogEvent.City).HasMaxLength(120);
            entity.Property(catalogEvent => catalogEvent.CountryCode).HasMaxLength(8);
            entity.Property(catalogEvent => catalogEvent.AdminNotes).HasMaxLength(1000);
            entity.Property(catalogEvent => catalogEvent.Latitude).HasPrecision(9, 6);
            entity.Property(catalogEvent => catalogEvent.Longitude).HasPrecision(9, 6);
            entity.Property(catalogEvent => catalogEvent.CurrencyCode).HasMaxLength(8);
            entity.Property(catalogEvent => catalogEvent.PriceAmount).HasPrecision(10, 2);
            entity.Property(catalogEvent => catalogEvent.AttendanceMode).HasConversion<string>().HasMaxLength(32);
            entity.Property(catalogEvent => catalogEvent.Language).HasMaxLength(16);

            entity.HasOne(catalogEvent => catalogEvent.Domain)
                .WithMany(domain => domain.Events)
                .HasForeignKey(catalogEvent => catalogEvent.DomainId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(catalogEvent => catalogEvent.SubmittedBy)
                .WithMany(user => user.SubmittedEvents)
                .HasForeignKey(catalogEvent => catalogEvent.SubmittedByUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(catalogEvent => catalogEvent.ReviewedBy)
                .WithMany(user => user.ReviewedEvents)
                .HasForeignKey(catalogEvent => catalogEvent.ReviewedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<SavedSearch>(entity =>
        {
            entity.Property(savedSearch => savedSearch.Name).HasMaxLength(160);
            entity.Property(savedSearch => savedSearch.SearchText).HasMaxLength(200);
            entity.Property(savedSearch => savedSearch.DomainSlug).HasMaxLength(120);
            entity.Property(savedSearch => savedSearch.LocationText).HasMaxLength(200);
            entity.Property(savedSearch => savedSearch.PriceMin).HasPrecision(10, 2);
            entity.Property(savedSearch => savedSearch.PriceMax).HasPrecision(10, 2);
            entity.Property(savedSearch => savedSearch.SortBy).HasConversion<string>().HasMaxLength(32);
            entity.Property(savedSearch => savedSearch.Language).HasMaxLength(16);
            entity.Property(savedSearch => savedSearch.Timezone).HasMaxLength(64);

            entity.HasOne(savedSearch => savedSearch.User)
                .WithMany(user => user.SavedSearches)
                .HasForeignKey(savedSearch => savedSearch.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<FavoriteEvent>(entity =>
        {
            entity.HasIndex(favorite => new { favorite.UserId, favorite.EventId }).IsUnique();

            entity.HasOne(favorite => favorite.User)
                .WithMany(user => user.FavoriteEvents)
                .HasForeignKey(favorite => favorite.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(favorite => favorite.Event)
                .WithMany()
                .HasForeignKey(favorite => favorite.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CalendarAnalyticsAction>(entity =>
        {
            entity.Property(action => action.Provider).HasMaxLength(32);

            entity.HasIndex(action => action.EventId);
            entity.HasIndex(action => action.TriggeredAtUtc);

            entity.HasOne(action => action.Event)
                .WithMany()
                .HasForeignKey(action => action.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DiscoveryAnalyticsAction>(entity =>
        {
            entity.Property(action => action.ActionType).HasMaxLength(32);
            entity.Property(action => action.EventSlug).HasMaxLength(200);

            entity.HasIndex(action => action.ActionType);
            entity.HasIndex(action => action.TriggeredAtUtc);
        });

        modelBuilder.Entity<PushSubscription>(entity =>
        {
            entity.Property(ps => ps.Endpoint).HasMaxLength(2000);
            entity.Property(ps => ps.P256dh).HasMaxLength(256);
            entity.Property(ps => ps.Auth).HasMaxLength(128);

            // One subscription per user (replace on re-subscribe from same browser)
            entity.HasIndex(ps => ps.UserId).IsUnique();

            entity.HasOne(ps => ps.User)
                .WithMany(user => user.PushSubscriptions)
                .HasForeignKey(ps => ps.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EventReminder>(entity =>
        {
            // Unique reminder per user/event/offset combination to prevent duplicate schedules
            entity.HasIndex(er => new { er.UserId, er.EventId, er.OffsetHours }).IsUnique();

            entity.HasIndex(er => er.ScheduledForUtc);

            entity.HasOne(er => er.User)
                .WithMany(user => user.EventReminders)
                .HasForeignKey(er => er.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(er => er.Event)
                .WithMany()
                .HasForeignKey(er => er.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CommunityGroup>(entity =>
        {
            entity.HasIndex(cg => cg.Slug).IsUnique();
            entity.Property(cg => cg.Name).HasMaxLength(200);
            entity.Property(cg => cg.Slug).HasMaxLength(200);
            entity.Property(cg => cg.Summary).HasMaxLength(500);
            entity.Property(cg => cg.Description).HasMaxLength(4000);
            entity.Property(cg => cg.Visibility).HasConversion<string>().HasMaxLength(16);

            entity.HasOne(cg => cg.CreatedBy)
                .WithMany()
                .HasForeignKey(cg => cg.CreatedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<CommunityMembership>(entity =>
        {
            entity.HasIndex(cm => new { cm.GroupId, cm.UserId }).IsUnique();
            entity.Property(cm => cm.Role).HasConversion<string>().HasMaxLength(32);
            entity.Property(cm => cm.Status).HasConversion<string>().HasMaxLength(32);

            entity.HasOne(cm => cm.Group)
                .WithMany(cg => cg.Memberships)
                .HasForeignKey(cm => cm.GroupId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(cm => cm.User)
                .WithMany()
                .HasForeignKey(cm => cm.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(cm => cm.ReviewedBy)
                .WithMany()
                .HasForeignKey(cm => cm.ReviewedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<CommunityGroupEvent>(entity =>
        {
            entity.HasIndex(cge => new { cge.GroupId, cge.EventId }).IsUnique();

            entity.HasOne(cge => cge.Group)
                .WithMany(cg => cg.GroupEvents)
                .HasForeignKey(cge => cge.GroupId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(cge => cge.Event)
                .WithMany()
                .HasForeignKey(cge => cge.EventId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(cge => cge.AddedBy)
                .WithMany()
                .HasForeignKey(cge => cge.AddedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<CatalogEvent>(entity =>
        {
            entity.Property(ce => ce.ExternalSourceEventId).HasMaxLength(1000);
        });

        modelBuilder.Entity<ExternalSourceClaim>(entity =>
        {
            // One claim per (group, source-type, identifier) triple prevents duplicate claims
            entity.HasIndex(esc => new { esc.GroupId, esc.SourceType, esc.SourceIdentifier }).IsUnique();

            entity.Property(esc => esc.SourceType).HasConversion<string>().HasMaxLength(32);
            entity.Property(esc => esc.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(esc => esc.SourceUrl).HasMaxLength(1000);
            entity.Property(esc => esc.SourceIdentifier).HasMaxLength(500);
            entity.Property(esc => esc.LastSyncOutcome).HasMaxLength(500);

            entity.HasOne(esc => esc.Group)
                .WithMany()
                .HasForeignKey(esc => esc.GroupId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(esc => esc.CreatedBy)
                .WithMany()
                .HasForeignKey(esc => esc.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
