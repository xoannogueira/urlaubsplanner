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
