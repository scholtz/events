namespace EventsApi.Data.Entities;

/// <summary>
/// Stores a browser Web Push subscription for a user.
/// One user may have at most one active subscription (per browser/device profile).
/// </summary>
public sealed class PushSubscription
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required Guid UserId { get; set; }

    /// <summary>The push endpoint URL supplied by the browser's push service.</summary>
    public required string Endpoint { get; set; }

    /// <summary>ECDH P-256 public key (base64url-encoded) from the browser's PushSubscription.getKey("p256dh").</summary>
    public required string P256dh { get; set; }

    /// <summary>Authentication secret (base64url-encoded) from the browser's PushSubscription.getKey("auth").</summary>
    public required string Auth { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    // Navigation
    public ApplicationUser User { get; set; } = null!;
}
