using System.Globalization;

namespace EventsApi.Data.Entities;

public sealed class CatalogEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string Slug { get; set; }
    public required string Description { get; set; }
    public required string EventUrl { get; set; }
    public required string VenueName { get; set; }
    public required string AddressLine1 { get; set; }
    public required string City { get; set; }
    public required string CountryCode { get; set; }
    public decimal Latitude { get; set; }
    public decimal Longitude { get; set; }
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public DateTime SubmittedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? PublishedAtUtc { get; set; }
    public string? AdminNotes { get; set; }
    public EventStatus Status { get; set; } = EventStatus.PendingApproval;
    public bool IsFree { get; set; } = true;
    public decimal? PriceAmount { get; set; }
    public string CurrencyCode { get; set; } = "EUR";
    public AttendanceMode AttendanceMode { get; set; } = AttendanceMode.InPerson;
    /// <summary>
    /// IANA timezone identifier for the event's local time (e.g. "Europe/Prague",
    /// "America/New_York"). Null for legacy events where the organizer did not specify
    /// a timezone; callers should fall back to UTC in that case.
    /// </summary>
    public string? Timezone { get; set; }
    public Guid DomainId { get; set; }
    public EventDomain Domain { get; set; } = null!;
    public Guid SubmittedByUserId { get; set; }
    public ApplicationUser SubmittedBy { get; set; } = null!;
    public Guid? ReviewedByUserId { get; set; }
    public ApplicationUser? ReviewedBy { get; set; }

    public string MapUrl
    {
        get
        {
            var latitude = Latitude.ToString(CultureInfo.InvariantCulture);
            var longitude = Longitude.ToString(CultureInfo.InvariantCulture);
            return $"https://www.openstreetmap.org/?mlat={latitude}&mlon={longitude}#map=15/{latitude}/{longitude}";
        }
    }
}
