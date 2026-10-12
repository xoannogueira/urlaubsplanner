using System.Globalization;
using System.Text;
using System.Text.Json;

namespace Urlaubsplanner.Domain.Hotels;

/// <summary>
/// Baut den Link, über den ein Hotel am Ende gebucht wird.
/// Standard ist eine vorausgefüllte Booking.com-Suche; ist eine LiteAPI-White-Label-Seite eingerichtet,
/// führt der Link direkt zum Hotel auf dieser Seite.
/// </summary>
public static class HotelBookingLinks
{
    public static string For(string hotelId, string hotelName, string? city, HotelSearchRequest request, string? whitelabelDomain)
    {
        ArgumentNullException.ThrowIfNull(request);
        return string.IsNullOrWhiteSpace(whitelabelDomain)
            ? BookingCom(hotelName, city, request)
            : Whitelabel(whitelabelDomain, hotelId, request);
    }

    public static string BookingCom(string hotelName, string? city, HotelSearchRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var query = string.IsNullOrWhiteSpace(city) ? hotelName : $"{hotelName}, {city}";
        var parameters = new Dictionary<string, string>
        {
            ["ss"] = query,
            ["checkin"] = Iso(request.Checkin),
            ["checkout"] = Iso(request.Checkout),
            ["group_adults"] = request.Adults.ToString(CultureInfo.InvariantCulture),
            ["no_rooms"] = request.Rooms.ToString(CultureInfo.InvariantCulture),
            ["group_children"] = "0",
        };
        return "https://www.booking.com/searchresults.html?" + string.Join('&', parameters.Select(p => $"{p.Key}={Uri.EscapeDataString(p.Value)}"));
    }

    /// <summary>
    /// Google Hotels vergleicht viele Anbieter. Google hat kein offizielles Linkformat; die Reisedaten stecken
    /// im inoffiziellen <c>ts</c>-Parameter (Protobuf, Base64). Personen und Zimmer lassen sich so nicht übergeben –
    /// Google nimmt dort seine Voreinstellung (meist 2 Personen).
    /// </summary>
    public static string Google(string hotelName, string? city, DateOnly? checkin = null, DateOnly? checkout = null)
    {
        var query = string.IsNullOrWhiteSpace(city) ? hotelName : $"{hotelName}, {city}";
        var url = $"https://www.google.com/travel/search?q={Uri.EscapeDataString(query)}&hl=de&gl=de";
        return checkin is { } from && checkout is { } to && to > from
            ? $"{url}&qs=CAE4AA&ts={Uri.EscapeDataString(GoogleDates(from, to))}&ap=MAE"
            : url;
    }

    /// <summary>
    /// Direkt die Seite des Hotels bei Google Hotels (Reiter „Preise“ mit allen Anbietern) statt einer Suchergebnisliste.
    /// Die Kennung ist der <c>property_token</c> von Google Hotels; Reisedaten wie bei <see cref="Google"/>.
    /// </summary>
    public static string GoogleHotel(string propertyToken, string hotelName, string? city, DateOnly checkin, DateOnly checkout)
    {
        var query = string.IsNullOrWhiteSpace(city) ? hotelName : $"{hotelName}, {city}";
        var url = $"https://www.google.com/travel/hotels/entity/{Uri.EscapeDataString(propertyToken)}/prices?q={Uri.EscapeDataString(query)}&hl=de&gl=de";
        return checkout > checkin ? $"{url}&qs=CAE4AA&ts={Uri.EscapeDataString(GoogleDates(checkin, checkout))}&ap=MAE" : url;
    }

    /// <summary>
    /// Baut den <c>ts</c>-Wert: {1: 1, 3: {1: {3: ""}, 2: {2: {1: Anreise, 2: Abreise, 3: Nächte}, 6: {1: 1}}}},
    /// ein Datum jeweils als {1: Jahr, 2: Monat, 3: Tag}.
    /// </summary>
    public static string GoogleDates(DateOnly checkin, DateOnly checkout)
    {
        static byte[] Date(DateOnly d) => [.. Varint(1, d.Year), .. Varint(2, d.Month), .. Varint(3, d.Day)];

        var range = Concat(Field(1, Date(checkin)), Field(2, Date(checkout)), Varint(3, checkout.DayNumber - checkin.DayNumber));
        var stay = Concat(Field(2, range), Field(6, Varint(1, 1)));
        var search = Concat(Field(1, Field(3, [])), Field(2, stay));
        var message = Concat(Varint(1, 1), Field(3, search));
        return Convert.ToBase64String(message).TrimEnd('=');
    }

    private static byte[] Concat(params byte[][] parts) => [.. parts.SelectMany(p => p)];

    /// <summary>Feld mit Länge (Protobuf wire type 2).</summary>
    private static byte[] Field(int number, byte[] content) => [.. Encode((ulong)((number << 3) | 2)), .. Encode((ulong)content.Length), .. content];

    /// <summary>Zahlenfeld (Protobuf wire type 0).</summary>
    private static byte[] Varint(int number, int value) => [.. Encode((ulong)(number << 3)), .. Encode((ulong)value)];

    private static byte[] Encode(ulong value)
    {
        var bytes = new List<byte>();
        do
        {
            var b = (byte)(value & 0x7F);
            value >>= 7;
            bytes.Add(value > 0 ? (byte)(b | 0x80) : b);
        }
        while (value > 0);
        return [.. bytes];
    }

    /// <summary>Format laut LiteAPI-Doku: /hotels/{id}?checkin=…&amp;checkout=…&amp;occupancies=base64(JSON).</summary>
    public static string Whitelabel(string domain, string hotelId, HotelSearchRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var host = domain.Trim().TrimEnd('/');
        if (!host.StartsWith("http", StringComparison.OrdinalIgnoreCase))
        {
            host = "https://" + host;
        }

        var occupancies = JsonSerializer.Serialize(request.AdultsPerRoom().Select(a => new { adults = a, children = Array.Empty<int>() }));
        var encoded = Convert.ToBase64String(Encoding.UTF8.GetBytes(occupancies));
        return $"{host}/hotels/{Uri.EscapeDataString(hotelId)}?checkin={Iso(request.Checkin)}&checkout={Iso(request.Checkout)}&occupancies={Uri.EscapeDataString(encoded)}";
    }

    private static string Iso(DateOnly date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}
