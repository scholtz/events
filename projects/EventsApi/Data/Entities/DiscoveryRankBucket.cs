namespace EventsApi.Data.Entities;

/// <summary>
/// Identifies the discovery ranking bucket an event falls into.
/// This bucket is computed server-side and exposed to clients so
/// frontends can render transparent, localisable ranking cues
/// without reproducing the ranking rules themselves.
/// </summary>
public enum DiscoveryRankBucket
{
    /// <summary>
    /// The event starts within the next 7 days — it is imminently actionable.
    /// </summary>
    UpcomingSoon,

    /// <summary>
    /// The event was published within the last 14 days and starts in the future
    /// (but not within the UpcomingSoon window) — it is fresh content worth surfacing.
    /// </summary>
    RecentlyAdded,

    /// <summary>
    /// The event is upcoming but outside both the UpcomingSoon and RecentlyAdded windows.
    /// </summary>
    Upcoming,

    /// <summary>
    /// The event start date is in the past — it has already occurred.
    /// </summary>
    Past,
}
