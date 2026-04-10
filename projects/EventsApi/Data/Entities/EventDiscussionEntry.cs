using HotChocolate;

namespace EventsApi.Data.Entities;

/// <summary>
/// A single entry in an event's discussion thread.
/// Supports one level of replies (top-level questions and organizer/admin replies).
/// </summary>
public sealed class EventDiscussionEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid EventId { get; set; }

    [GraphQLIgnore]
    public CatalogEvent Event { get; set; } = null!;

    public Guid AuthorId { get; set; }

    [GraphQLIgnore]
    public ApplicationUser Author { get; set; } = null!;

    /// <summary>
    /// Visible author display name. Copied at post time so renames don't rewrite history.
    /// </summary>
    public required string AuthorDisplayName { get; set; }

    /// <summary>
    /// Role badge shown in the UI: ATTENDEE, ORGANIZER, or ADMIN.
    /// Computed at post time from the author's role and relationship to the event.
    /// </summary>
    public required string AuthorRole { get; set; }

    /// <summary>The body text of the question or reply.</summary>
    public required string Body { get; set; }

    /// <summary>
    /// When non-null this entry is a reply to the specified parent entry.
    /// Only one level of nesting is supported.
    /// </summary>
    public Guid? ParentEntryId { get; set; }

    [GraphQLIgnore]
    public EventDiscussionEntry? ParentEntry { get; set; }

    /// <summary>True when the entry has been hidden by an organizer or admin.</summary>
    public bool IsHidden { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
