using System.Globalization;

namespace Urlaubsplanner.Domain.Flights;

/// <summary>
/// Links zum Buchen. Gebucht wird nicht über die App, sondern bei einem Vergleichsportal:
/// Kayak übernimmt Strecken, Daten, Personen und Klasse vollständig (auch Gabelflüge);
/// Google Flights bekommt die Suche als Text. Beide zeigen die Strecke, nicht exakt diesen einen Flug.
/// </summary>
public static class FlightBookingLinks
{
    public static string Kayak(FlightSearchRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        string Date(FlightLeg leg) => leg.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        var path = request.IsRoundTrip
            ? $"{request.Legs[0].Origin}-{request.Legs[0].Destination}/{Date(request.Legs[0])}/{Date(request.Legs[1])}"
            : string.Join('/', request.Legs.Select(l => $"{l.Origin}-{l.Destination}/{Date(l)}"));
        var cabin = request.Cabin switch
        {
            CabinClass.PremiumEconomy => "/premium",
            CabinClass.Business => "/business",
            CabinClass.First => "/first",
            _ => string.Empty,
        };
        var adults = request.Adults == 1 ? "1adult" : $"{request.Adults}adults";
        return $"https://www.kayak.de/flights/{path}/{adults}{cabin}?sort=price_a";
    }

    public static string Google(FlightSearchRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        string Date(FlightLeg leg) => leg.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        var first = request.Legs[0];
        var query = request.IsRoundTrip
            ? $"Flights from {first.Origin} to {first.Destination} on {Date(first)} through {Date(request.Legs[1])}"
            : $"Flights from {first.Origin} to {first.Destination} on {Date(first)} one way";
        query += $" {request.Adults} adults";
        if (request.Cabin != CabinClass.Economy)
        {
            query += request.Cabin == CabinClass.PremiumEconomy ? " premium economy" : $" {request.Cabin.ToString().ToLowerInvariant()}";
        }

        return $"https://www.google.com/travel/flights?q={Uri.EscapeDataString(query)}&hl=de&curr=EUR";
    }
}
