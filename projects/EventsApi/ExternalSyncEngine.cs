using EventsApi.Adapters;
using EventsApi.Data;
using EventsApi.Data.Entities;
using EventsApi.Types;
using EventsApi.Utilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace EventsApi;

/// <summary>
/// Core engine that performs an incremental sync for a single verified external source claim.
/// Used by both the manual <c>triggerExternalSync</c> GraphQL mutation and the automated
/// <see cref="ExternalSourceSyncService"/> background service.
/// </summary>
public sealed class ExternalSyncEngine(
    AppDbContext dbContext,
    ExternalSourceAdapterFactory adapterFactory,
    ILogger<ExternalSyncEngine> logger)
{
    private readonly AppDbContext _dbContext = dbContext;
    private readonly ExternalSourceAdapterFactory _adapterFactory = adapterFactory;
    private readonly ILogger<ExternalSyncEngine> _logger = logger;

    /// <summary>
    /// Synchronises events for the given verified claim. Updates sync metadata on the claim
    /// regardless of success or failure and persists the result.
    /// </summary>
    /// <param name="claim">
    /// The verified claim to sync. Must be in <see cref="ExternalSourceClaimStatus.Verified"/> state.
    /// </param>
    /// <param name="submittedByUserId">
    /// The user ID to record as the event submitter for newly imported events.
    /// For background syncs this is the claim creator's user ID.
    /// </param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The sync result summary.</returns>
    public async Task<SyncResult> SyncClaimAsync(
        ExternalSourceClaim claim,
        Guid submittedByUserId,
        CancellationToken cancellationToken)
    {
        var claimId = claim.Id;
        var now = DateTime.UtcNow;

        IReadOnlyList<ExternalEventData> externalEvents;
        try
        {
            var adapter = _adapterFactory.GetAdapter(claim.SourceType);
            externalEvents = await adapter.FetchEventsAsync(claim.SourceIdentifier, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "External sync for claim {ClaimId} ({SourceType}/{SourceIdentifier}): adapter fetch failed.",
                claimId, claim.SourceType, claim.SourceIdentifier);

            claim.LastSyncAtUtc = now;
            claim.LastSyncError = $"Failed to fetch events from {claim.SourceType}: {ex.Message}";
            await _dbContext.SaveChangesAsync(cancellationToken);
            return new SyncResult(0, 0, 0, 1, 0, $"Sync failed: {ex.Message}");
        }

        var defaultDomain = await _dbContext.Domains.FirstOrDefaultAsync(
            d => d.IsActive, cancellationToken);

        if (defaultDomain is null)
        {
            _logger.LogWarning(
                "External sync for claim {ClaimId}: no active domain found; aborting sync.", claimId);

            claim.LastSyncAtUtc = now;
            claim.LastSyncError = "No active domain found to assign imported events.";
            await _dbContext.SaveChangesAsync(cancellationToken);
            return new SyncResult(0, 0, 0, 1, 0, "Sync failed: no active domain.");
        }

        var importedCount = 0;
        var updatedCount = 0;
        var skippedCount = 0;
        var errorCount = 0;

        // Collect all external IDs seen in this sync to detect orphaned events afterward.
        var seenExternalIds = new HashSet<string>(externalEvents.Count);

        foreach (var ext in externalEvents)
        {
            seenExternalIds.Add(ext.ExternalId);

            var existingEvent = await _dbContext.Events.SingleOrDefaultAsync(
                e => e.ExternalSourceClaimId == claimId && e.ExternalSourceEventId == ext.ExternalId,
                cancellationToken);

            if (existingEvent is not null)
            {
                // Update the existing event with the latest upstream data.
                // Moderation fields (Status, Slug, DomainId) are intentionally preserved.
                try
                {
                    ApplyUpstreamUpdate(existingEvent, ext);
                    await _dbContext.SaveChangesAsync(cancellationToken);
                    updatedCount++;

                    _logger.LogDebug(
                        "External sync for claim {ClaimId}: updated event '{ExternalId}'.",
                        claimId, ext.ExternalId);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        "External sync for claim {ClaimId}: failed to update event '{ExternalId}'.",
                        claimId, ext.ExternalId);

                    _dbContext.ChangeTracker.DetectChanges();
                    foreach (var entry in _dbContext.ChangeTracker.Entries()
                                 .Where(e => e.State == EntityState.Modified)
                                 .ToList())
                    {
                        entry.State = EntityState.Unchanged;
                    }

                    errorCount++;
                }

                continue;
            }

            if (ext.StartsAtUtc is null)
            {
                _logger.LogWarning(
                    "External sync for claim {ClaimId}: skipping event '{ExternalId}' — missing StartsAtUtc.",
                    claimId, ext.ExternalId);
                errorCount++;
                continue;
            }

            var endsAt = ext.EndsAtUtc ?? ext.StartsAtUtc.Value.AddHours(2);

            try
            {
                var catalogEvent = new CatalogEvent
                {
                    Name = (ext.Name ?? "Untitled Event").Trim(),
                    Slug = await BuildUniqueEventSlugAsync(ext.Name ?? "Untitled Event", cancellationToken),
                    Description = (ext.Description ?? string.Empty).Trim(),
                    EventUrl = (ext.EventUrl ?? string.Empty).Trim(),
                    VenueName = (ext.VenueName ?? string.Empty).Trim(),
                    AddressLine1 = (ext.AddressLine1 ?? string.Empty).Trim(),
                    City = (ext.City ?? string.Empty).Trim(),
                    CountryCode = (ext.CountryCode ?? "XX").Trim().ToUpperInvariant(),
                    Latitude = ext.Latitude ?? 0,
                    Longitude = ext.Longitude ?? 0,
                    StartsAtUtc = EnsureUtc(ext.StartsAtUtc.Value),
                    EndsAtUtc = EnsureUtc(endsAt),
                    IsFree = ext.IsFree ?? true,
                    PriceAmount = ext.PriceAmount,
                    CurrencyCode = NormalizeCurrencyCode(ext.CurrencyCode),
                    Language = ext.Language,
                    AttendanceMode = AttendanceMode.InPerson,
                    Status = EventStatus.PendingApproval,
                    DomainId = defaultDomain.Id,
                    SubmittedByUserId = submittedByUserId,
                    ExternalSourceClaimId = claimId,
                    ExternalSourceEventId = ext.ExternalId,
                };

                _dbContext.Events.Add(catalogEvent);

                _dbContext.CommunityGroupEvents.Add(new CommunityGroupEvent
                {
                    GroupId = claim.GroupId,
                    EventId = catalogEvent.Id,
                    AddedByUserId = submittedByUserId,
                });

                await _dbContext.SaveChangesAsync(cancellationToken);
                importedCount++;
            }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            {
                _logger.LogInformation(
                    "External sync for claim {ClaimId}: event '{ExternalId}' already imported (concurrent insert).",
                    claimId, ext.ExternalId);

                DetachAddedEntries();
                skippedCount++;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "External sync for claim {ClaimId}: failed to import event '{ExternalId}'.",
                    claimId, ext.ExternalId);

                DetachAddedEntries();
                errorCount++;
            }
        }

        // Detect events that were previously imported from this claim but no longer appear in
        // the upstream feed (cancelled, deleted, or unlisted on the source platform).
        // These events are NOT deleted from Biatec Events — they are preserved as-is to avoid
        // silent data loss. The count is surfaced in the result so administrators can review.
        var orphanedCount = 0;
        if (seenExternalIds.Count > 0)
        {
            // Only check for orphans when the upstream returned at least one event.
            // An empty feed is more likely a transient outage than a true mass-removal.
            var previouslyImportedIds = await _dbContext.Events
                .Where(e => e.ExternalSourceClaimId == claimId && e.ExternalSourceEventId != null)
                .Select(e => e.ExternalSourceEventId!)
                .ToListAsync(cancellationToken);

            var orphanedIds = previouslyImportedIds
                .Where(id => !seenExternalIds.Contains(id))
                .ToList();

            orphanedCount = orphanedIds.Count;

            if (orphanedCount > 0)
            {
                _logger.LogInformation(
                    "External sync for claim {ClaimId}: {OrphanedCount} previously imported event(s) " +
                    "no longer appear in the upstream feed and have been preserved as-is: {OrphanedIds}",
                    claimId, orphanedCount, string.Join(", ", orphanedIds));
            }
        }

        var summary = BuildSyncSummary(importedCount, updatedCount, skippedCount, errorCount, orphanedCount);

        claim.LastSyncAtUtc = now;
        claim.LastSyncOutcome = summary;
        claim.LastSyncImportedCount = importedCount;
        claim.LastSyncSkippedCount = skippedCount;

        if (errorCount == 0)
        {
            claim.LastSyncSucceededAtUtc = now;
            claim.LastSyncError = null;
        }
        else
        {
            claim.LastSyncError = $"{errorCount} event(s) failed during sync.";
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        return new SyncResult(importedCount, updatedCount, skippedCount, errorCount, orphanedCount, summary);
    }

    private void DetachAddedEntries()
    {
        foreach (var entry in _dbContext.ChangeTracker.Entries()
                     .Where(e => e.State == EntityState.Added)
                     .ToList())
        {
            entry.State = EntityState.Detached;
        }
    }

    internal static string BuildSyncSummary(int imported, int updated, int skipped, int errors, int orphaned = 0)
    {
        var parts = new List<string>();
        parts.Add(imported == 1 ? "Imported 1 event." : $"Imported {imported} events.");
        if (updated > 0)
            parts.Add(updated == 1 ? "Updated 1 event." : $"Updated {updated} events.");
        if (skipped > 0)
            parts.Add(skipped == 1 ? "Skipped 1 (concurrent duplicate)." : $"Skipped {skipped} (concurrent duplicates).");
        if (errors > 0)
            parts.Add(errors == 1 ? "1 event failed validation." : $"{errors} events failed validation.");
        if (orphaned > 0)
            parts.Add(orphaned == 1
                ? "1 previously imported event no longer appears upstream (preserved)."
                : $"{orphaned} previously imported events no longer appear upstream (preserved).");
        return string.Join(" ", parts);
    }

    /// <summary>
    /// Applies upstream event data to an existing imported event, preserving moderation fields.
    /// </summary>
    /// <remarks>
    /// <para><strong>Source-of-truth fields (updated from upstream):</strong>
    /// Name, Description, EventUrl, VenueName, AddressLine1, City, CountryCode,
    /// Latitude, Longitude, StartsAtUtc, EndsAtUtc, IsFree, PriceAmount, CurrencyCode, Language.</para>
    /// <para><strong>Locally curated fields (never overwritten by upstream):</strong>
    /// Status, Slug, AdminNotes, DomainId, SubmittedByUserId.</para>
    /// </remarks>
    internal static void ApplyUpstreamUpdate(CatalogEvent catalogEvent, ExternalEventData ext)
    {
        if (!string.IsNullOrWhiteSpace(ext.Name))
            catalogEvent.Name = ext.Name.Trim();
        if (!string.IsNullOrWhiteSpace(ext.Description))
            catalogEvent.Description = ext.Description.Trim();
        if (ext.EventUrl is not null)
            catalogEvent.EventUrl = ext.EventUrl.Trim();
        if (ext.VenueName is not null)
            catalogEvent.VenueName = ext.VenueName.Trim();
        if (ext.AddressLine1 is not null)
            catalogEvent.AddressLine1 = ext.AddressLine1.Trim();
        if (ext.City is not null)
            catalogEvent.City = ext.City.Trim();
        if (!string.IsNullOrWhiteSpace(ext.CountryCode))
            catalogEvent.CountryCode = ext.CountryCode.Trim().ToUpperInvariant();
        if (ext.Latitude is not null)
            catalogEvent.Latitude = ext.Latitude.Value;
        if (ext.Longitude is not null)
            catalogEvent.Longitude = ext.Longitude.Value;
        if (ext.StartsAtUtc is not null)
        {
            catalogEvent.StartsAtUtc = EnsureUtc(ext.StartsAtUtc.Value);
            var endsAt = ext.EndsAtUtc ?? ext.StartsAtUtc.Value.AddHours(2);
            catalogEvent.EndsAtUtc = EnsureUtc(endsAt);
        }
        if (ext.IsFree is not null)
            catalogEvent.IsFree = ext.IsFree.Value;
        if (ext.PriceAmount is not null)
            catalogEvent.PriceAmount = ext.PriceAmount;
        if (!string.IsNullOrWhiteSpace(ext.CurrencyCode))
            catalogEvent.CurrencyCode = NormalizeCurrencyCode(ext.CurrencyCode);
        if (ext.Language is not null)
            catalogEvent.Language = ext.Language;
        catalogEvent.UpdatedAtUtc = DateTime.UtcNow;
    }

    private static DateTime EnsureUtc(DateTime value)
        => value.Kind == DateTimeKind.Utc ? value : value.ToUniversalTime();

    private static string NormalizeCurrencyCode(string? currencyCode)
        => string.IsNullOrWhiteSpace(currencyCode) ? "EUR" : currencyCode.Trim().ToUpperInvariant();

    private async Task<string> BuildUniqueEventSlugAsync(string name, CancellationToken cancellationToken)
    {
        var baseSlug = SlugGenerator.Generate(name);
        var slug = baseSlug;
        var counter = 2;

        while (await _dbContext.Events.AnyAsync(
                   e => e.Slug == slug,
                   cancellationToken))
        {
            slug = $"{baseSlug}-{counter++}";
        }

        return slug;
    }

    private static bool IsUniqueConstraintViolation(DbUpdateException ex) =>
        ex.InnerException?.Message.Contains("UNIQUE constraint failed", StringComparison.OrdinalIgnoreCase) == true;
}
