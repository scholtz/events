using System.Net;
using System.Text.Json;
using EventsApi.Configuration;
using EventsApi.Data.Entities;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WebPush;
using EntityPushSubscription = EventsApi.Data.Entities.PushSubscription;
using WebPushSubscription = WebPush.PushSubscription;

namespace EventsApi.Utilities;

/// <summary>
/// Sends Web Push notifications using the WebPush library so reminder payloads are
/// encrypted and delivered in an RFC-compliant format.
/// </summary>
public sealed class VapidPushNotificationService(
    IOptions<VapidOptions> vapidOptions,
    IWebPushClient webPushClient,
    ILogger<VapidPushNotificationService> logger) : IPushNotificationService
{
    private readonly VapidOptions _vapid = vapidOptions.Value;
    private readonly IWebPushClient _webPushClient = webPushClient;
    private readonly ILogger<VapidPushNotificationService> _logger = logger;

    public async Task<PushDeliveryResult> SendAsync(
        EntityPushSubscription subscription,
        string title,
        string body,
        string url,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_vapid.PublicKey) || string.IsNullOrWhiteSpace(_vapid.PrivateKey))
        {
            _logger.LogWarning("VAPID keys are not configured; push reminder dispatch is deferred.");
            return PushDeliveryResult.Misconfigured("VAPID keys are not configured.");
        }

        var payload = JsonSerializer.Serialize(new
        {
            title,
            body,
            url,
            icon = "/pwa-192x192.png"
        });

        try
        {
            var pushSubscription = new WebPushSubscription(
                subscription.Endpoint,
                subscription.P256dh,
                subscription.Auth);
            var vapidDetails = new VapidDetails(_vapid.Subject, _vapid.PublicKey, _vapid.PrivateKey);

            await _webPushClient.SendNotificationAsync(
                pushSubscription,
                payload,
                vapidDetails,
                cancellationToken);

            return PushDeliveryResult.Delivered();
        }
        catch (WebPushException ex) when (ex.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
        {
            _logger.LogInformation(
                "Push subscription {Endpoint} is stale ({StatusCode})",
                subscription.Endpoint,
                ex.StatusCode);
            return PushDeliveryResult.Stale(ex.StatusCode, ex.Message);
        }
        catch (WebPushException ex)
        {
            _logger.LogWarning(
                ex,
                "Retryable push delivery failure for {Endpoint} with HTTP {StatusCode}",
                subscription.Endpoint,
                ex.StatusCode);
            return PushDeliveryResult.Retryable(ex.StatusCode, ex.Message);
        }
        catch (Exception ex) when (ex is ArgumentException or FormatException)
        {
            _logger.LogError(
                ex,
                "Invalid VAPID configuration prevented push delivery for {Endpoint}",
                subscription.Endpoint);
            return PushDeliveryResult.Misconfigured("Invalid VAPID configuration.");
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(
                ex,
                "Retryable HTTP error while sending push notification to {Endpoint}",
                subscription.Endpoint);
            return PushDeliveryResult.Retryable(detail: ex.Message);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(
                ex,
                "Push delivery timed out for {Endpoint}",
                subscription.Endpoint);
            return PushDeliveryResult.Retryable(detail: ex.Message);
        }
    }
}
