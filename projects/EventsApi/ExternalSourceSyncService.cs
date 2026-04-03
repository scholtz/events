using EventsApi.Data;
using EventsApi.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace EventsApi;

/// <summary>
/// Background hosted service that periodically synchronises events for all active,
/// verified external-source claims that have auto-sync enabled.
///
/// Scheduling rules:
///  - Runs one sync cycle immediately on startup, then every hour.
///  - Only processes claims in <see cref="ExternalSourceClaimStatus.Verified"/> state
///    that have <see cref="ExternalSourceClaim.IsAutoSyncEnabled"/> set to true.
///  - Each claim is synced at most once per cycle; claims whose last attempt was
///    within the last hour are skipped to avoid redundant work.
///  - Sync is idempotent: duplicate events are skipped without creating new records.
///  - Per-claim failures are logged and recorded in sync metadata but do not abort
///    the overall cycle — remaining claims continue to be processed.
/// </summary>
public sealed class ExternalSourceSyncService(
    IServiceScopeFactory scopeFactory,
    ILogger<ExternalSourceSyncService> logger) : BackgroundService
{
    private static readonly TimeSpan _interval = TimeSpan.FromHours(1);
    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<ExternalSourceSyncService> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("ExternalSourceSyncService started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunSyncCycleAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Unhandled error during external source sync cycle");
            }

            if (stoppingToken.IsCancellationRequested) break;

            await Task.Delay(_interval, stoppingToken).ConfigureAwait(false);
        }

        _logger.LogInformation("ExternalSourceSyncService stopped");
    }

    /// <summary>
    /// Executes one full sync cycle: fetches all eligible claims and syncs each one.
    /// Exposed as internal so integration tests can invoke it directly without waiting for the timer.
    /// </summary>
    internal async Task RunSyncCycleAsync(CancellationToken cancellationToken)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var engine = scope.ServiceProvider.GetRequiredService<ExternalSyncEngine>();

        var cutoff = DateTime.UtcNow.Subtract(_interval);

        // Load all verified, auto-sync-enabled claims that have not been attempted recently.
        var claims = await dbContext.ExternalSourceClaims
            .Where(c =>
                c.Status == ExternalSourceClaimStatus.Verified &&
                c.IsAutoSyncEnabled &&
                (c.LastSyncAtUtc == null || c.LastSyncAtUtc < cutoff))
            .ToListAsync(cancellationToken);

        if (claims.Count == 0)
        {
            _logger.LogDebug("ExternalSourceSyncService: no claims due for sync in this cycle.");
            return;
        }

        _logger.LogInformation(
            "ExternalSourceSyncService: syncing {Count} claim(s) in this cycle.", claims.Count);

        foreach (var claim in claims)
        {
            if (cancellationToken.IsCancellationRequested) break;

            try
            {
                _logger.LogInformation(
                    "ExternalSourceSyncService: starting sync for claim {ClaimId} ({SourceType}/{SourceIdentifier}).",
                    claim.Id, claim.SourceType, claim.SourceIdentifier);

                var result = await engine.SyncClaimAsync(
                    claim,
                    claim.CreatedByUserId,
                    cancellationToken);

                _logger.LogInformation(
                    "ExternalSourceSyncService: claim {ClaimId} sync complete — {Summary}",
                    claim.Id, result.Summary);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex,
                    "ExternalSourceSyncService: unhandled error syncing claim {ClaimId}; skipping to next claim.",
                    claim.Id);
            }
        }
    }
}
