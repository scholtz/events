namespace EventsApi.Data.Entities;

/// <summary>
/// Supported external event source platforms for community ownership claims.
/// Add new values here to extend the integration to additional sources.
/// </summary>
public enum ExternalSourceType
{
    Meetup,
    Luma,
}
