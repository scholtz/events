using EventsApi.Data.Entities;

namespace EventsApi.Types;

public sealed class EventFilterInput
{
    public string? SearchText { get; init; }
    public string? DomainSlug { get; init; }
    public string? DomainSubdomain { get; init; }
    public string? City { get; init; }
    public string? LocationText { get; init; }
    public DateTime? StartsFromUtc { get; init; }
    public DateTime? StartsToUtc { get; init; }
    public bool? IsFree { get; init; }
    public decimal? PriceMin { get; init; }
    public decimal? PriceMax { get; init; }
    public EventSortOption? SortBy { get; init; }
    public EventStatus? Status { get; init; }
    public AttendanceMode? AttendanceMode { get; init; }
    /// <summary>
    /// BCP 47 language tag to filter events by their primary language (e.g. "en", "cs", "de").
    /// When provided, only events with a matching Language value are returned.
    /// Events with a null Language are excluded from language-specific queries.
    /// </summary>
    public string? Language { get; init; }
    /// <summary>
    /// IANA timezone identifier to filter events by their configured timezone (e.g. "Europe/Prague").
    /// When provided, only events with a matching Timezone value are returned.
    /// Events with a null Timezone are excluded from timezone-specific queries.
    /// </summary>
    public string? Timezone { get; init; }
}

public sealed class RegisterUserInput
{
    public required string Email { get; init; }
    public required string DisplayName { get; init; }
    public required string Password { get; init; }
}

public sealed class LoginInput
{
    public required string Email { get; init; }
    public required string Password { get; init; }
}

public sealed class EventSubmissionInput
{
    public required string DomainSlug { get; init; }
    /// <summary>
    /// Optional additional tag slugs for the event. The primary DomainSlug is always
    /// included automatically. Pass extra domain slugs to associate the event with
    /// multiple categories/tags.
    /// </summary>
    public List<string>? AdditionalTagSlugs { get; init; }
    public required string Name { get; init; }
    public required string Description { get; init; }
    public required string EventUrl { get; init; }
    public required string VenueName { get; init; }
    public required string AddressLine1 { get; init; }
    public required string City { get; init; }
    public string CountryCode { get; init; } = "CZ";
    public bool IsFree { get; init; } = true;
    public decimal? PriceAmount { get; init; }
    public string CurrencyCode { get; init; } = "EUR";
    public decimal Latitude { get; init; }
    public decimal Longitude { get; init; }
    public DateTime StartsAtUtc { get; init; }
    public DateTime EndsAtUtc { get; init; }
    public AttendanceMode AttendanceMode { get; init; } = AttendanceMode.InPerson;
    /// <summary>
    /// IANA timezone identifier for the event (e.g. "Europe/Prague", "America/New_York").
    /// Optional; legacy events without this field will fall back to UTC for calendar export.
    /// </summary>
    public string? Timezone { get; init; }
    /// <summary>
    /// BCP 47 language tag for the primary language of the event (e.g. "en", "cs", "sk", "de").
    /// Optional; events without a language are shown in all language-filter contexts.
    /// </summary>
    public string? Language { get; init; }

    /// <summary>
    /// Optional community group to associate this event with.
    /// The caller must be an active Admin or EventManager in the specified group.
    /// The association is created immediately; the event will appear on the community page
    /// once it is approved and published.
    /// </summary>
    public Guid? CommunityGroupId { get; init; }
}

public sealed class SavedSearchInput
{
    public required string Name { get; init; }
    public EventFilterInput? Filter { get; init; }
}

public sealed class ReviewEventInput
{
    public EventStatus Status { get; init; }
    public string? AdminNotes { get; init; }
}

public sealed class DomainInput
{
    public Guid? Id { get; init; }
    public required string Name { get; init; }
    public required string Slug { get; init; }
    public required string Subdomain { get; init; }
    public string? Description { get; init; }
    public bool IsActive { get; init; } = true;
    /// <summary>Short editorial "About this hub" overview.</summary>
    public string? OverviewContent { get; init; }
    /// <summary>Guidance about what types of events belong in this hub.</summary>
    public string? WhatBelongsHere { get; init; }
    /// <summary>Optional custom call-to-action text for the organizer submission prompt.</summary>
    public string? SubmitEventCta { get; init; }
    /// <summary>Optional curator/admin attribution shown as a trust cue.</summary>
    public string? CuratorCredit { get; init; }
}

/// <summary>Input for updating curator-managed hub overview content for a domain.</summary>
public sealed class UpdateDomainOverviewInput
{
    public Guid DomainId { get; init; }
    /// <summary>Short tagline (hero subtitle) for the hub, max 150 chars. Pass null to clear.</summary>
    public string? Tagline { get; init; }
    /// <summary>Short editorial "About this hub" overview. Pass null to clear.</summary>
    public string? OverviewContent { get; init; }
    /// <summary>Guidance about what types of events belong in this hub. Pass null to clear.</summary>
    public string? WhatBelongsHere { get; init; }
    /// <summary>Optional custom call-to-action text for the organizer submission prompt. Pass null to clear.</summary>
    public string? SubmitEventCta { get; init; }
    /// <summary>Optional curator/admin attribution shown as a trust cue. Pass null to clear.</summary>
    public string? CuratorCredit { get; init; }
}

/// <summary>Input for adding or removing a domain administrator.</summary>
public sealed class DomainAdministratorInput
{
    public Guid DomainId { get; init; }
    public Guid UserId { get; init; }
}

/// <summary>Input for updating a domain's visual style/branding.</summary>
public sealed class UpdateDomainStyleInput
{
    public Guid DomainId { get; init; }
    /// <summary>CSS hex color for the primary brand color, e.g. "#137fec".</summary>
    public string? PrimaryColor { get; init; }
    /// <summary>CSS hex color for the accent/secondary color.</summary>
    public string? AccentColor { get; init; }
    /// <summary>Absolute URL to the domain logo image.</summary>
    public string? LogoUrl { get; init; }
    /// <summary>Absolute URL to the domain banner/hero image.</summary>
    public string? BannerUrl { get; init; }
}

/// <summary>
/// Input for replacing the full ordered featured-events list for a domain hub.
/// Only global admins or domain administrators can call this.
/// Maximum 5 events per domain. Events must be published and belong to this domain.
/// Pass an empty list to clear all featured events.
/// </summary>
public sealed class SetDomainFeaturedEventsInput
{
    public Guid DomainId { get; init; }

    /// <summary>
    /// Ordered list of event IDs to feature. The first ID gets DisplayOrder 0.
    /// Maximum 5 entries. Duplicate IDs are silently de-duplicated.
    /// </summary>
    public List<Guid> EventIds { get; init; } = [];
}

public sealed class UpdateUserRoleInput
{
    public Guid UserId { get; init; }
    public ApplicationUserRole Role { get; init; }
}

/// <summary>
/// Input for recording an add-to-calendar action.
/// Accepted providers: ICS, GOOGLE, OUTLOOK.
/// </summary>
public sealed class TrackCalendarActionInput
{
    public Guid EventId { get; init; }
    public required string Provider { get; init; }
}

/// <summary>
/// Input for recording a discovery interaction (search, filter change, result click, filter clear).
/// No personal data is collected — only aggregate, anonymous product signals.
/// Accepted action types: SEARCH, FILTER_CHANGE, FILTER_CLEAR, RESULT_CLICK.
/// </summary>
public sealed class TrackDiscoveryActionInput
{
    /// <summary>Type of interaction: SEARCH, FILTER_CHANGE, FILTER_CLEAR, or RESULT_CLICK.</summary>
    public required string ActionType { get; init; }

    /// <summary>For RESULT_CLICK: the public slug of the event opened. Null for other action types.</summary>
    public string? EventSlug { get; init; }

    /// <summary>Number of filters active when the interaction occurred.</summary>
    public int ActiveFilterCount { get; init; }

    /// <summary>Number of results visible at the time of the interaction. Null for RESULT_CLICK.</summary>
    public int? ResultCount { get; init; }
}

/// <summary>
/// Input for registering (or replacing) a browser Web Push subscription for the authenticated user.
/// Call this after the browser's PushManager.subscribe() resolves.
/// </summary>
public sealed class RegisterPushSubscriptionInput
{
    /// <summary>The push endpoint URL from PushSubscription.endpoint.</summary>
    public required string Endpoint { get; init; }

    /// <summary>Base64url-encoded ECDH P-256 key from PushSubscription.getKey("p256dh").</summary>
    public required string P256dh { get; init; }

    /// <summary>Base64url-encoded authentication secret from PushSubscription.getKey("auth").</summary>
    public required string Auth { get; init; }
}

/// <summary>
/// Input for enabling (or updating) a push reminder for a saved event.
/// </summary>
public sealed class EnableEventReminderInput
{
    public Guid EventId { get; init; }

    /// <summary>
    /// How many hours before the event start time the reminder should fire.
    /// Supported values: 24 (one day before), 1 (one hour before).
    /// Defaults to 24 if not specified.
    /// </summary>
    public int OffsetHours { get; init; } = 24;
}

// ── External source claim inputs ──────────────────────────────────────────────

/// <summary>
/// Input for adding an external source ownership claim to a community group.
/// Only group admins may call addExternalSourceClaim.
/// </summary>
public sealed class AddExternalSourceClaimInput
{
    /// <summary>The external platform type (MEETUP or LUMA).</summary>
    public ExternalSourceType SourceType { get; init; }

    /// <summary>
    /// Canonical URL of the external profile or group.
    /// For Meetup: https://www.meetup.com/{group-slug}
    /// For Luma:   https://lu.ma/{calendar-slug}
    /// </summary>
    public required string SourceUrl { get; init; }
}

/// <summary>
/// Input for selectively importing specific events from a linked external source.
/// Use previewExternalEvents to obtain the ExternalId values before calling importExternalEvents.
/// Only group admins may call importExternalEvents.
/// </summary>
public sealed class ImportExternalEventsInput
{
    /// <summary>
    /// Stable external identifiers of the events to import.
    /// These correspond to ExternalEventPreview.ExternalId values returned by
    /// previewExternalEvents. Events that have already been imported are silently
    /// skipped; events not found in the current fetch are also skipped.
    /// </summary>
    public required List<string> ExternalIds { get; init; }
}

/// <summary>
/// Input for creating a new community group. The creator automatically becomes the group admin.
/// </summary>
public sealed class CreateCommunityGroupInput
{
    public required string Name { get; init; }

    /// <summary>
    /// URL-friendly identifier for the group. Must be unique and contain only lowercase
    /// letters, digits, and hyphens.
    /// </summary>
    public required string Slug { get; init; }

    public string? Summary { get; init; }
    public string? Description { get; init; }
    public CommunityVisibility Visibility { get; init; } = CommunityVisibility.Public;
}

/// <summary>
/// Input for editing community group metadata. Only group admins may call this.
/// </summary>
public sealed class UpdateCommunityGroupInput
{
    public string? Name { get; init; }
    public string? Summary { get; init; }
    public string? Description { get; init; }
    public CommunityVisibility? Visibility { get; init; }
    public bool? IsActive { get; init; }
}

/// <summary>
/// Input for reviewing a pending membership request (approve or reject).
/// Only group admins may call this.
/// </summary>
public sealed class ReviewMembershipRequestInput
{
    public bool Approve { get; init; }
}

/// <summary>
/// Input for associating a published event with a community group.
/// The caller must be a group admin or event manager for the group,
/// and must own the event (or be a global admin).
/// </summary>
public sealed class CommunityGroupEventInput
{
    public Guid GroupId { get; init; }
    public Guid EventId { get; init; }
}

/// <summary>
/// A single community/external link entry for a domain hub.
/// </summary>
public sealed class DomainLinkItem
{
    /// <summary>Short human-readable label, e.g. "Community website" or "Join our Discord".</summary>
    public required string Title { get; init; }
    /// <summary>Absolute URL the link points to. Must start with https:// or http://.</summary>
    public required string Url { get; init; }
}

/// <summary>
/// Input for replacing the curated community/external links for a domain hub.
/// The full list is replaced atomically — pass an empty list to remove all links.
/// Restricted to domain administrators and global administrators.
/// Maximum 10 links per hub.
/// </summary>
public sealed class SetDomainLinksInput
{
    public Guid DomainId { get; init; }
    /// <summary>Ordered list of links to set. DisplayOrder is assigned from the list position (0-based).</summary>
    public required List<DomainLinkItem> Links { get; init; }
}

/// <summary>
/// Input for a global admin to approve or reject an external-source ownership claim.
/// Only global admins may call reviewExternalSourceClaim.
/// </summary>
public sealed class ReviewExternalSourceClaimInput
{
    /// <summary>ID of the claim to review.</summary>
    public Guid ClaimId { get; init; }

    /// <summary>
    /// New status for the claim.
    /// Only Verified and Rejected are valid targets; PendingReview is not a valid transition.
    /// </summary>
    public ExternalSourceClaimStatus NewStatus { get; init; }

    /// <summary>Optional admin note attached to the review decision (e.g. rejection reason).</summary>
    public string? AdminNote { get; init; }
}

/// <summary>
/// Input for creating a new time-windowed scheduled featured-event entry.
/// The event must be published and belong to the target domain hub.
/// StartsAtUtc must be before EndsAtUtc.
/// Maximum 20 active scheduled entries per domain.
/// </summary>
public sealed class ScheduleFeaturedEventInput
{
    public Guid DomainId { get; init; }
    public Guid EventId { get; init; }

    /// <summary>UTC date-time when the promotion window opens (inclusive).</summary>
    public DateTime StartsAtUtc { get; init; }

    /// <summary>UTC date-time when the promotion window closes (exclusive).</summary>
    public DateTime EndsAtUtc { get; init; }

    /// <summary>
    /// Explicit priority for conflict resolution — lower value = displayed first.
    /// Defaults to 0 when omitted.
    /// </summary>
    public int Priority { get; init; } = 0;
}

/// <summary>
/// Input for updating an existing scheduled featured-event entry.
/// </summary>
public sealed class UpdateScheduledFeaturedEventInput
{
    public Guid ScheduleId { get; init; }

    /// <summary>Updated UTC start of the promotion window.</summary>
    public DateTime StartsAtUtc { get; init; }

    /// <summary>Updated UTC end of the promotion window.</summary>
    public DateTime EndsAtUtc { get; init; }

    /// <summary>Updated priority for conflict resolution.</summary>
    public int Priority { get; init; } = 0;
}
