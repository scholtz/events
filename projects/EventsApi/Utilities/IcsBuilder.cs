using System.Globalization;
using System.Text;
using EventsApi.Data.Entities;

namespace EventsApi.Utilities;

/// <summary>
/// Server-side ICS (iCalendar) file generator for published events.
///
/// Generates RFC 5545-compliant VCALENDAR/VEVENT output suitable for import by
/// Apple Calendar, Google Calendar, Outlook, and any standards-compliant client.
///
/// - UTC Z-suffix DTSTART/DTEND for events without a timezone.
/// - TZID= floating local time for events with an IANA timezone identifier.
/// - X-WR-TIMEZONE extension header for broader client compatibility.
/// - RFC 5545 §3.1 CRLF line endings.
/// - 75-octet line folding per RFC 5545 §3.1.
/// - Text escaping per RFC 5545 §3.3.11.
/// - One-hour fallback end time when <see cref="CatalogEvent.EndsAtUtc"/> equals
///   <see cref="CatalogEvent.StartsAtUtc"/> (default EF value indicates not set).
/// </summary>
public static class IcsBuilder
{
    /// <summary>
    /// Generates an ICS string for the given event.
    /// </summary>
    /// <param name="ev">A published <see cref="CatalogEvent"/>.</param>
    /// <param name="frontendBaseUrl">
    /// The canonical base URL of the frontend application (e.g. "https://events.biatec.io").
    /// Used to populate the VEVENT URL and description event-page link so attendees can
    /// navigate back to the platform page from inside their calendar client.
    /// </param>
    /// <returns>RFC 5545-compliant ICS string with CRLF line endings.</returns>
    public static string Build(CatalogEvent ev, string frontendBaseUrl)
    {
        var canonicalUrl = $"{frontendBaseUrl.TrimEnd('/')}/event/{ev.Slug}";

        // DTSTAMP is always UTC regardless of event timezone (wall-clock "when was this
        // calendar object created", not when the event occurs).
        var dtstamp = FormatUtcDate(DateTime.UtcNow);

        string dtstart, dtend;
        if (ev.Timezone is { Length: > 0 } tz)
        {
            dtstart = $"DTSTART;TZID={tz}:{FormatLocalDate(ev.StartsAtUtc, tz)}";
            dtend   = $"DTEND;TZID={tz}:{FormatLocalDate(EffectiveEndUtc(ev), tz)}";
        }
        else
        {
            dtstart = $"DTSTART:{FormatUtcDate(ev.StartsAtUtc)}";
            dtend   = $"DTEND:{FormatUtcDate(EffectiveEndUtc(ev))}";
        }

        // Build location string — online events use the join URL as the location field
        // so attendees have the link directly in their calendar.
        var isOnline = ev.AttendanceMode == AttendanceMode.Online;
        var isHybrid = ev.AttendanceMode == AttendanceMode.Hybrid;
        string location;
        if (isOnline)
        {
            location = !string.IsNullOrWhiteSpace(ev.EventUrl) ? ev.EventUrl : "Online event";
        }
        else
        {
            var parts = new[] { ev.VenueName, ev.AddressLine1, ev.City, ev.CountryCode }
                .Where(p => !string.IsNullOrWhiteSpace(p)).ToArray();
            location = parts.Length > 0
                ? string.Join(", ", parts)
                : (isHybrid && !string.IsNullOrWhiteSpace(ev.EventUrl) ? ev.EventUrl : "");
        }

        // Build description — append join link for hybrid events and always append the
        // canonical platform event-page URL.
        var description = ev.Description ?? string.Empty;
        if (isHybrid && !string.IsNullOrWhiteSpace(ev.EventUrl))
            description += $"\n\nJoin online: {ev.EventUrl}";
        description += $"\n\nEvent page: {canonicalUrl}";
        description = description.Trim();

        var lines = new List<string>
        {
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Events Platform//Events//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
        };

        if (ev.Timezone is { Length: > 0 })
            lines.Add($"X-WR-TIMEZONE:{ev.Timezone}");

        lines.AddRange(
        [
            "BEGIN:VEVENT",
            FoldLine($"UID:{Escape(ev.Slug + "@events-platform")}"),
            $"DTSTAMP:{dtstamp}",
            dtstart,
            dtend,
            FoldLine($"SUMMARY:{Escape(ev.Name)}"),
            FoldLine($"DESCRIPTION:{Escape(description)}"),
            FoldLine($"LOCATION:{Escape(location)}"),
            FoldLine($"URL:{canonicalUrl}"),
            "END:VEVENT",
            "END:VCALENDAR",
        ]);

        // ICS files use CRLF line endings per RFC 5545 §3.1
        return string.Join("\r\n", lines);
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    /// <summary>
    /// Returns the end time, falling back to start + 1 hour when <see cref="CatalogEvent.EndsAtUtc"/>
    /// equals <see cref="CatalogEvent.StartsAtUtc"/> (the default value EF Core stores when the
    /// organiser did not specify an explicit end).
    /// </summary>
    private static DateTime EffectiveEndUtc(CatalogEvent ev)
        => ev.EndsAtUtc > ev.StartsAtUtc ? ev.EndsAtUtc : ev.StartsAtUtc.AddHours(1);

    private static string FormatUtcDate(DateTime dt)
        => dt.ToUniversalTime().ToString("yyyyMMddTHHmmssZ", CultureInfo.InvariantCulture);

    /// <summary>
    /// Converts a UTC <see cref="DateTime"/> to a local floating datetime string (YYYYMMDDTHHMMSS,
    /// no Z suffix) in the given IANA timezone, for use with the TZID= parameter.
    /// Falls back to the UTC Z-suffix format if the timezone identifier is unrecognised.
    /// </summary>
    private static string FormatLocalDate(DateTime utc, string timezone)
    {
        try
        {
            var tz = TimeZoneInfo.FindSystemTimeZoneById(timezone);
            var local = TimeZoneInfo.ConvertTimeFromUtc(
                DateTime.SpecifyKind(utc, DateTimeKind.Utc), tz);
            return local.ToString("yyyyMMddTHHmmss", CultureInfo.InvariantCulture);
        }
        catch
        {
            // Unknown timezone — fall back to UTC representation.
            return FormatUtcDate(utc);
        }
    }

    /// <summary>
    /// Escapes special characters in ICS property text values per RFC 5545 §3.3.11.
    /// </summary>
    private static string Escape(string text)
        => text
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace(";",  "\\;",  StringComparison.Ordinal)
            .Replace(",",  "\\,",  StringComparison.Ordinal)
            .Replace("\n", "\\n",  StringComparison.Ordinal)
            .Replace("\r", string.Empty, StringComparison.Ordinal);

    /// <summary>
    /// Folds long ICS property lines to a maximum of 75 octets per RFC 5545 §3.1.
    /// Continuation lines are prefixed with a single SPACE.
    /// </summary>
    private static string FoldLine(string line)
    {
        const int Max = 75;
        if (line.Length <= Max) return line;

        var sb = new StringBuilder();
        var bytes = Encoding.UTF8.GetBytes(line);
        var offset = 0;

        while (offset < bytes.Length)
        {
            if (offset > 0) sb.Append("\r\n ");
            var chunk = Math.Min(offset == 0 ? Max : Max - 1, bytes.Length - offset);
            sb.Append(Encoding.UTF8.GetString(bytes, offset, chunk));
            offset += chunk;
        }

        return sb.ToString();
    }
}
