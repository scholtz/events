using System.Security.Claims;
using EventsApi.Data.Entities;

namespace EventsApi.Security;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetRequiredUserId(this ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new InvalidOperationException("The current user is missing an identifier claim.");

        return Guid.Parse(value);
    }

    public static bool IsAdmin(this ClaimsPrincipal principal)
        => principal.IsInRole(ApplicationUserRole.Admin.ToString());
}
