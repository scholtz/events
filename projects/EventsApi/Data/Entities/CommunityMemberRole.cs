namespace EventsApi.Data.Entities;

public enum CommunityMemberRole
{
    /// <summary>Founding owner; can transfer ownership and do everything an Admin can do.</summary>
    Owner,
    /// <summary>Group administrator; can manage members, requests, and community settings.</summary>
    Admin,
    /// <summary>Can associate events with the group but cannot manage members or settings.</summary>
    EventManager,
    /// <summary>Regular member with read-only access to group content.</summary>
    Member,
}
