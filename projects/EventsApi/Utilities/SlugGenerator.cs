using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace EventsApi.Utilities;

public static partial class SlugGenerator
{
    public static string Generate(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return Guid.NewGuid().ToString("n")[..8];
        }

        var normalized = value.Trim().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);

        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(character);
            }
        }

        var slug = InvalidCharacters().Replace(builder.ToString().ToLowerInvariant(), "-");
        slug = DuplicateSeparators().Replace(slug, "-").Trim('-');

        return string.IsNullOrWhiteSpace(slug)
            ? Guid.NewGuid().ToString("n")[..8]
            : slug;
    }

    [GeneratedRegex("[^a-z0-9]+", RegexOptions.Compiled)]
    private static partial Regex InvalidCharacters();

    [GeneratedRegex("-{2,}", RegexOptions.Compiled)]
    private static partial Regex DuplicateSeparators();
}
