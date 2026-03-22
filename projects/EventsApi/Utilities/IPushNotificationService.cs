using EventsApi.Data.Entities;

namespace EventsApi.Utilities;

/// <summary>
/// Abstraction over Web Push notification dispatch.
/// The default implementation uses System.Net.Http with VAPID authentication when keys are configured.
/// When VAPID keys are absent (development or test) dispatch is skipped silently.
/// </summary>
public interface IPushNotificationService
{
    /// <summary>
    /// Send a push notification to a specific subscription.
    /// </summary>
    /// <param name="subscription">The target push subscription.</param>
    /// <param name="title">The notification title.</param>
    /// <param name="body">The notification body text.</param>
    /// <param name="url">The URL to open when the notification is clicked.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>True if the notification was dispatched successfully; false if the subscription is invalid/expired.</returns>
    Task<bool> SendAsync(
        PushSubscription subscription,
        string title,
        string body,
        string url,
        CancellationToken cancellationToken = default);
}
