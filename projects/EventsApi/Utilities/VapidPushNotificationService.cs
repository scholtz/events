using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using EventsApi.Configuration;
using EventsApi.Data.Entities;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace EventsApi.Utilities;

/// <summary>
/// Sends Web Push notifications using VAPID authentication over HTTPS.
///
/// VAPID protocol summary:
///  1. Sign a JWT with the server's EC private key (P-256 curve).
///  2. Include the JWT in an Authorization: vapid t=...,k=... header.
///  3. POST the encrypted payload to the subscription endpoint.
///
/// When VAPID keys are not configured, push dispatch is skipped and the method
/// returns false — this prevents test/dev environments from throwing startup errors.
///
/// NOTE: Message payload encryption (RFC 8291 / ECDH-ES + AES-128-GCM) is complex
/// to implement from scratch. For a production deployment, add the WebPush NuGet
/// package (dotnet add package WebPush). The stub below sends an empty push to
/// trigger the browser's existing subscription (no encrypted body), which is
/// sufficient for browsers that already display a default notification. A fully
/// encrypted payload requires the third-party package or a manual ECDH implementation.
/// </summary>
public sealed class VapidPushNotificationService(
    IOptions<VapidOptions> vapidOptions,
    IHttpClientFactory httpClientFactory,
    ILogger<VapidPushNotificationService> logger) : IPushNotificationService
{
    private readonly VapidOptions _vapid = vapidOptions.Value;
    private readonly IHttpClientFactory _httpClientFactory = httpClientFactory;
    private readonly ILogger<VapidPushNotificationService> _logger = logger;

    public async Task<bool> SendAsync(
        PushSubscription subscription,
        string title,
        string body,
        string url,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(_vapid.PublicKey) || string.IsNullOrEmpty(_vapid.PrivateKey))
        {
            _logger.LogDebug(
                "VAPID keys not configured — skipping push notification dispatch for subscription {Endpoint}",
                subscription.Endpoint);
            return false;
        }

        try
        {
            var payload = JsonSerializer.Serialize(new
            {
                title,
                body,
                url,
                icon = "/pwa-192x192.png"
            });

            var vapidJwt = BuildVapidJwt(subscription.Endpoint);
            var client = _httpClientFactory.CreateClient("push");

            using var request = new HttpRequestMessage(HttpMethod.Post, subscription.Endpoint);
            request.Headers.Add("Authorization", $"vapid t={vapidJwt},k={_vapid.PublicKey}");
            request.Headers.Add("TTL", "86400");

            // Send an unencrypted payload so the SW can receive the data directly.
            // Production hardening: encrypt with ECDH-ES + AES-128-GCM (RFC 8291).
            request.Content = new StringContent(payload, Encoding.UTF8, "application/json");

            var response = await client.SendAsync(request, cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                return true;
            }

            if ((int)response.StatusCode is 404 or 410)
            {
                // Subscription is gone — caller should remove it from the database
                _logger.LogInformation(
                    "Push subscription {Endpoint} is expired or invalid ({Status})",
                    subscription.Endpoint, response.StatusCode);
                return false;
            }

            _logger.LogWarning(
                "Push notification to {Endpoint} failed with HTTP {Status}",
                subscription.Endpoint, response.StatusCode);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception sending push notification to {Endpoint}", subscription.Endpoint);
            return false;
        }
    }

    /// <summary>
    /// Builds a minimal VAPID JWT for the given endpoint origin.
    /// Signs it with the ECDH P-256 private key using ES256 (ECDSA + SHA-256).
    /// </summary>
    private string BuildVapidJwt(string endpoint)
    {
        var uri = new Uri(endpoint);
        var audience = $"{uri.Scheme}://{uri.Host}";

        var header = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(new { typ = "JWT", alg = "ES256" }));
        var claims = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(new
        {
            aud = audience,
            exp = DateTimeOffset.UtcNow.AddHours(12).ToUnixTimeSeconds(),
            sub = _vapid.Subject
        }));

        var signingInput = $"{header}.{claims}";

        using var ecdsa = ECDsa.Create();
        ecdsa.ImportPkcs8PrivateKey(Base64UrlDecode(_vapid.PrivateKey), out _);
        var signature = ecdsa.SignData(Encoding.UTF8.GetBytes(signingInput), HashAlgorithmName.SHA256);
        return $"{signingInput}.{Base64UrlEncode(signature)}";
    }

    private static string Base64UrlEncode(byte[] data)
        => Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string s)
    {
        s = s.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4)
        {
            case 2: s += "=="; break;
            case 3: s += "="; break;
        }
        return Convert.FromBase64String(s);
    }
}
