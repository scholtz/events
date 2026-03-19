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
    }
}
