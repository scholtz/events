namespace EventsApi.Configuration;

/// <summary>
/// VAPID (Voluntary Application Server Identification) keys for Web Push.
/// These must be generated once and stored securely (e.g. in environment variables or secret manager).
///
/// Generate with: openssl ecparam -name prime256v1 -genkey -noout -out vapid-private.pem
/// Or use the vapid-keygen CLI: npx web-push generate-vapid-keys
///
/// Leave empty to disable push notification delivery (subscriptions will still be stored).
/// </summary>
public sealed class VapidOptions
{
    /// <summary>The VAPID public key in base64url format (to share with the browser).</summary>
    public string PublicKey { get; set; } = string.Empty;

    /// <summary>The VAPID private key in base64url format (kept secret on the server).</summary>
    public string PrivateKey { get; set; } = string.Empty;

    /// <summary>Contact email or URL for the VAPID "sub" claim (e.g. "mailto:admin@example.com").</summary>
    public string Subject { get; set; } = "mailto:admin@events.local";
}
