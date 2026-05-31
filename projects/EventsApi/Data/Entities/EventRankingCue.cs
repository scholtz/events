namespace EventsApi.Data.Entities;

/// <summary>
/// A concise, deterministic explanation of why a public event surfaces where it does
/// in discovery results. Computed purely from the event's own public fields (start date
/// and publication date), so it never leaks moderation-only or non-public data.
///
/// The cue is intentionally coarse — at most one label per event — so the UI can present
/// a calm, editorial signal ("Upcoming soon", "Recently added") without reproducing the
/// server's full ranking logic on the client.
/// </summary>
public enum EventRankingCue
{
    /// <summary>No notable ranking cue — the event is beyond both immediacy windows.</summary>
    None,

    /// <summary>Starts within the next few days; signals immediacy to attendees.</summary>
    UpcomingSoon,

    /// <summary>Published recently; signals freshly added content.</summary>
    RecentlyAdded
}
