namespace EventsApi.Security;

public sealed record AuthenticatedSession(string Token, DateTime ExpiresAtUtc);
