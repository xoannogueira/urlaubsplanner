namespace Urlaubsplanner.Domain;

internal static class Guard
{
    public static string RequiredText(string? value, string field, int maxLength)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            throw new DomainException(field, "Darf nicht leer sein.");
        }

        return MaxLength(trimmed, field, maxLength);
    }

    public static string? OptionalText(string? value, string field, int maxLength)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : MaxLength(trimmed, field, maxLength);
    }

    private static string MaxLength(string value, string field, int maxLength) =>
        value.Length <= maxLength ? value : throw new DomainException(field, $"Darf höchstens {maxLength} Zeichen lang sein.");

    public static int InRange(int value, string field, int min, int max)
    {
        if (value < min || value > max)
        {
            throw new DomainException(field, $"Muss zwischen {min} und {max} liegen.");
        }

        return value;
    }

    public static void DateOrder(DateOnly? start, DateOnly? end, string field)
    {
        if (start is { } s && end is { } e && e < s)
        {
            throw new DomainException(field, "Das Enddatum darf nicht vor dem Startdatum liegen.");
        }
    }

    /// <summary>
    /// Nur http(s)-Links sind erlaubt, damit keine "javascript:"-Links als Buchungsbutton landen.
    /// </summary>
    public static string? OptionalWebUrl(string? value, string field)
    {
        var trimmed = OptionalText(value, field, 2048);
        if (trimmed is null)
        {
            return null;
        }

        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new DomainException(field, "Muss ein gültiger http- oder https-Link sein.");
        }

        return uri.ToString();
    }

    public static decimal? OptionalPrice(decimal? value, string field)
    {
        if (value is < 0 or > 10_000_000)
        {
            throw new DomainException(field, "Der Preis muss zwischen 0 und 10.000.000 liegen.");
        }

        return value is null ? null : decimal.Round(value.Value, 2);
    }

    public static (double? Lat, double? Lng) OptionalCoordinates(double? latitude, double? longitude)
    {
        if (latitude is null != longitude is null)
        {
            throw new DomainException("latitude", "Breiten- und Längengrad nur zusammen angeben.");
        }

        if (latitude is < -90 or > 90)
        {
            throw new DomainException("latitude", "Muss zwischen -90 und 90 liegen.");
        }

        if (longitude is < -180 or > 180)
        {
            throw new DomainException("longitude", "Muss zwischen -180 und 180 liegen.");
        }

        return (latitude, longitude);
    }
}
