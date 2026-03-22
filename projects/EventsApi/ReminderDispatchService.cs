using EventsApi.Data;
using EventsApi.Data.Entities;
using EventsApi.Utilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace EventsApi;

/// <summary>
/// Background hosted service that periodically scans for due event reminders and dispatches
/// push notifications.
///
/// Scheduling rules:
///  - Runs every 15 minutes.
///  - Dispatches reminders where ScheduledForUtc is within the next 15 minutes (or in the past but not yet sent).
///  - Only dispatches reminders for events that are still PUBLISHED and have a future start time.
///  - After successful dispatch the SentAtUtc timestamp is set to prevent duplicate sends.
///  - If the user's push subscription returns 404/410 the stale subscription is removed.
/// </summary>
public sealed class ReminderDispatchService(
    IServiceScopeFactory scopeFactory,
    ILogger<ReminderDispatchService> logger) : BackgroundService
{
    private static readonly TimeSpan _interval = TimeSpan.FromMinutes(15);
    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<ReminderDispatchService> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("ReminderDispatchService started");

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(_interval, stoppingToken).ConfigureAwait(false);

            if (stoppingToken.IsCancellationRequested) break;

            try
            {
                await DispatchDueRemindersAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Error during reminder dispatch cycle");
            }
        }

        _logger.LogInformation("ReminderDispatchService stopped");
    }

    private async Task DispatchDueRemindersAsync(CancellationToken cancellationToken)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var pushService = scope.ServiceProvider.GetRequiredService<IPushNotificationService>();

        var now = DateTime.UtcNow;
        var lookAhead = now.Add(_interval).AddMinutes(1); // small buffer

        // Find reminders that are due and not yet sent
        var dueReminders = await dbContext.EventReminders
            .Where(r => r.SentAtUtc == null && r.ScheduledForUtc <= lookAhead)
            .Include(r => r.Event)
            .Include(r => r.User)
                .ThenInclude(u => u.PushSubscriptions)
            .ToListAsync(cancellationToken);

        if (dueReminders.Count == 0) return;

        _logger.LogInformation("Dispatching {Count} due reminder(s)", dueReminders.Count);

        var staleSubscriptionUserIds = new HashSet<Guid>();

        foreach (var reminder in dueReminders)
        {
            // Skip if event is no longer published or is in the past
            if (reminder.Event.Status != EventStatus.Published ||
                reminder.Event.StartsAtUtc <= now)
            {
                reminder.SentAtUtc = now; // mark as done so we don't retry
                continue;
            }

            var subscription = reminder.User.PushSubscriptions.FirstOrDefault();
            if (subscription is null)
            {
                // User has no subscription — mark reminder as done
                reminder.SentAtUtc = now;
                continue;
            }

            if (staleSubscriptionUserIds.Contains(reminder.UserId))
            {
                // Already detected stale subscription for this user in this cycle
                reminder.SentAtUtc = now;
                continue;
            }

            var hoursUntil = (int)Math.Round((reminder.Event.StartsAtUtc - now).TotalHours);
            var body = hoursUntil <= 1
                ? $"{reminder.Event.Name} starts in about 1 hour."
                : $"{reminder.Event.Name} starts in {hoursUntil} hour{(hoursUntil == 1 ? "" : "s")}.";

            var eventUrl = $"/event/{reminder.Event.Slug}";

            var dispatched = await pushService.SendAsync(
                subscription,
                $"Reminder: {reminder.Event.Name}",
                body,
                eventUrl,
                cancellationToken);

            if (dispatched)
            {
                reminder.SentAtUtc = now;
                _logger.LogDebug("Reminder dispatched for event '{Event}' to user {UserId}", reminder.Event.Name, reminder.UserId);
            }
            else
            {
                // Check if subscription is stale (404/410) — push service returns false for those
                // We mark reminder as sent to prevent repeated failed attempts this cycle
                reminder.SentAtUtc = now;
                staleSubscriptionUserIds.Add(reminder.UserId);
            }
        }

        // Remove stale subscriptions
        if (staleSubscriptionUserIds.Count > 0)
        {
            var staleSubscriptions = await dbContext.PushSubscriptions
                .Where(ps => staleSubscriptionUserIds.Contains(ps.UserId))
                .ToListAsync(cancellationToken);
            dbContext.PushSubscriptions.RemoveRange(staleSubscriptions);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
