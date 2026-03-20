namespace EventsApi.Data.Entities;

/// <summary>
/// Join entity that grants a user administrator privileges over an <see cref="EventDomain"/>.
/// Domain administrators can approve/reject events within their domain and customise
/// the domain's visual style.  Global administrators can manage these assignments.
/// </summary>
public sealed class DomainAdministrator
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DomainId { get; set; }
    public EventDomain Domain { get; set; } = null!;
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
