namespace EventsApi.Data.Entities;

/// <summary>
/// Lifecycle status of a hub-community association.
/// Domain administrators and global administrators can drive transitions.
/// Community administrators can initiate the request flow.
/// </summary>
public enum HubCommunityAssociationStatus
{
    /// <summary>
    /// A community administrator has requested that their group be featured in this hub.
    /// The request is awaiting review by a domain administrator or global administrator.
    /// </summary>
    Pending,

    /// <summary>
    /// The association has been approved by a domain administrator or global administrator.
    /// The entry is eligible to appear publicly when IsEnabled is also true.
    /// </summary>
    Approved,

    /// <summary>
    /// The request or association was rejected by a domain administrator or global administrator.
    /// The community administrator can re-request after a rejection.
    /// </summary>
    Rejected,
}
