using System.Net;

namespace EventsApi.Utilities;

public enum PushDeliveryStatus
{
    Success,
    StaleSubscription,
    RetryableFailure,
    Misconfigured
}

public sealed record PushDeliveryResult(
    PushDeliveryStatus Status,
    HttpStatusCode? HttpStatusCode = null,
    string? Detail = null)
{
    public static PushDeliveryResult Delivered()
        => new(PushDeliveryStatus.Success);

    public static PushDeliveryResult Stale(HttpStatusCode? statusCode = null, string? detail = null)
        => new(PushDeliveryStatus.StaleSubscription, statusCode, detail);

    public static PushDeliveryResult Retryable(HttpStatusCode? statusCode = null, string? detail = null)
        => new(PushDeliveryStatus.RetryableFailure, statusCode, detail);

    public static PushDeliveryResult Misconfigured(string? detail = null)
        => new(PushDeliveryStatus.Misconfigured, null, detail);
}
