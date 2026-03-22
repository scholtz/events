using EventsApi.Data.Entities;

namespace EventsApi.Utilities;

/// <summary>
/// Abstraction over Web Push notification dispatch.
/// The default implementation uses standards-compliant Web Push delivery with VAPID authentication.
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
    /// <returns>
    /// A delivery result describing whether the notification was delivered,
    /// the subscription is stale, the failure is retryable, or push delivery is misconfigured.
    /// </returns>
    Task<PushDeliveryResult> SendAsync(
        PushSubscription subscription,
        string title,
        string body,
        string url,
        CancellationToken cancellationToken = default);
}
