using System.Globalization;
using System.Text.RegularExpressions;

namespace Urlaubsplanner.Domain.Flights;

public enum CabinClass
{
    Economy,
    PremiumEconomy,
    Business,
    First,
}

/// <summary>Eine Strecke der Reise, z. B. STR → LIS am 12.05.</summary>
public sealed record FlightLeg(string Origin, string Destination, DateOnly Date);

/// <summary>
/// Flugsuche mit festen Flughäfen pro Strecke. Hin &amp; zurück = 2 Strecken, Gabelflug = 2 Strecken mit
/// unterschiedlichen Flughäfen, Nur Hinflug = 1 Strecke, Mehrere Stopps = bis zu 6 Strecken.
/// </summary>
public sealed partial record FlightSearchRequest
{
    public const int MaxLegs = 6;
    public const int MaxAdults = 9;

    /// <summary>Airlines verkaufen höchstens ca. 11 Monate im Voraus.</summary>
    public const int MaxDaysAhead = 330;

    private FlightSearchRequest(IReadOnlyList<FlightLeg> legs, int adults, CabinClass cabin)
    {
        Legs = legs;
        Adults = adults;
        Cabin = cabin;
    }

    public IReadOnlyList<FlightLeg> Legs { get; }

    public int Adults { get; }

    public CabinClass Cabin { get; }

    /// <summary>Hin- und Rückflug zwischen denselben Flughäfen.</summary>
    public bool IsRoundTrip =>
        Legs.Count == 2 && Legs[0].Origin == Legs[1].Destination && Legs[0].Destination == Legs[1].Origin;

    public static FlightSearchRequest Create(IEnumerable<FlightLeg>? legs, int adults, CabinClass cabin, DateOnly today)
    {
        var list = (legs ?? []).Select((leg, i) => Validate(leg, i, today)).ToList();
        if (list.Count == 0)
        {
            throw new DomainException("legs", "Mindestens eine Strecke angeben.");
        }

        if (list.Count > MaxLegs)
        {
            throw new DomainException("legs", $"Höchstens {MaxLegs} Strecken.");
        }

        for (var i = 1; i < list.Count; i++)
        {
            if (list[i].Date < list[i - 1].Date)
            {
                throw new DomainException($"legs[{i}].date", "Die Strecken müssen zeitlich nacheinander liegen.");
            }
        }

        Guard.InRange(adults, "adults", 1, MaxAdults);
        if (!Enum.IsDefined(cabin))
        {
            throw new DomainException("cabin", "Unbekannte Klasse.");
        }

        return new FlightSearchRequest(list, adults, cabin);
    }

    /// <summary>Ohne Prüfung – nur für Links aus Flügen, die ein Anbieter schon geliefert hat.</summary>
    public static FlightSearchRequest ForLinks(IReadOnlyList<FlightLeg> legs, int adults, CabinClass cabin) => new(legs, adults, cabin);

    /// <summary>Gleiche Strecken, alle Termine um <paramref name="days"/> verschoben (für Ausweichdaten).</summary>
    public FlightSearchRequest ShiftedBy(int days) =>
        new([.. Legs.Select(l => l with { Date = l.Date.AddDays(days) })], Adults, Cabin);

    public static string NormalizeCode(string? code) => (code ?? string.Empty).Trim().ToUpperInvariant();

    public static bool IsAirportCode(string code) => AirportCode().IsMatch(code);

    private static FlightLeg Validate(FlightLeg? leg, int index, DateOnly today)
    {
        if (leg is null)
        {
            throw new DomainException($"legs[{index}]", "Strecke fehlt.");
        }

        var origin = NormalizeCode(leg.Origin);
        var destination = NormalizeCode(leg.Destination);
        if (!IsAirportCode(origin))
        {
            throw new DomainException($"legs[{index}].origin", "Bitte einen Abflughafen wählen (3-Buchstaben-Code wie STR).");
        }

        if (!IsAirportCode(destination))
        {
            throw new DomainException($"legs[{index}].destination", "Bitte einen Zielflughafen wählen (3-Buchstaben-Code wie LIS).");
        }

        if (origin == destination)
        {
            throw new DomainException($"legs[{index}].destination", "Start und Ziel sind gleich.");
        }

        if (leg.Date < today)
        {
            throw new DomainException($"legs[{index}].date", "Das Datum liegt in der Vergangenheit.");
        }

        if (leg.Date > today.AddDays(MaxDaysAhead))
        {
            throw new DomainException($"legs[{index}].date", "Flüge lassen sich höchstens ca. 11 Monate im Voraus suchen.");
        }

        return new FlightLeg(origin, destination, leg.Date);
    }

    [GeneratedRegex("^[A-Z]{3}$")]
    private static partial Regex AirportCode();
}

/// <summary>Eine Strecke mit mehreren möglichen Flughäfen (z. B. alle Flughäfen im Umkreis des Ziels).</summary>
public sealed record FlightLegOptions(IReadOnlyList<string> Origins, IReadOnlyList<string> Destinations, DateOnly Date);

/// <summary>
/// LiteAPI sucht pro Anfrage genau einen Flughafen je Start und Ziel. Mehrere Flughäfen ergeben deshalb mehrere
/// Anfragen (alle Kombinationen) – begrenzt, damit das Kontingent geschont wird.
/// </summary>
public static class FlightQuery
{
    public const int MaxAirportsPerSide = 4;
    public const int MaxCombinations = 8;

    public static IReadOnlyList<FlightSearchRequest> Expand(IReadOnlyList<FlightLegOptions>? legs, int adults, CabinClass cabin, DateOnly today)
    {
        if (legs is null || legs.Count == 0)
        {
            throw new DomainException("legs", "Mindestens eine Strecke angeben.");
        }

        var perLeg = legs.Select((leg, i) => Choices(leg, i)).ToList();
        var count = perLeg.Aggregate(1L, (n, choices) => n * choices.Count);
        if (count > MaxCombinations)
        {
            throw new DomainException("legs", $"Das wären {count} Suchen – höchstens {MaxCombinations}. Wähle weniger Flughäfen.");
        }

        IEnumerable<IReadOnlyList<FlightLeg>> combinations = [[]];
        foreach (var choices in perLeg)
        {
            combinations = combinations.SelectMany(prefix => choices.Select(choice => (IReadOnlyList<FlightLeg>)[.. prefix, choice]));
        }

        return [.. combinations.Select(c => FlightSearchRequest.Create(c, adults, cabin, today))];
    }

    /// <summary>
    /// Für Anbieter, die mehrere Flughäfen pro Seite in einer Anfrage suchen (SerpApi/Google Flights):
    /// gleiche Prüfungen, aber keine Obergrenze für Kombinationen.
    /// </summary>
    public static FlightMultiRequest Combine(IReadOnlyList<FlightLegOptions>? legs, int adults, CabinClass cabin, DateOnly today)
    {
        if (legs is null || legs.Count == 0)
        {
            throw new DomainException("legs", "Mindestens eine Strecke angeben.");
        }

        var perLeg = legs.Select((leg, i) => Choices(leg, i)).ToList();
        for (var i = 0; i < perLeg.Count; i++)
        {
            if (perLeg[i].Count == 0)
            {
                throw new DomainException($"legs[{i}].destinations", "Start und Ziel sind gleich.");
            }
        }

        // Datum, Reihenfolge, Personen und Klasse wie bei einer Einzelsuche prüfen.
        FlightSearchRequest.Create(perLeg.Select(c => c[0]), adults, cabin, today);
        var normalized = legs.Select((leg, i) => new FlightLegOptions(
            [.. perLeg[i].Select(l => l.Origin).Distinct()],
            [.. perLeg[i].Select(l => l.Destination).Distinct()],
            leg.Date)).ToList();
        return new FlightMultiRequest(normalized, adults, cabin);
    }

    private static List<FlightLeg> Choices(FlightLegOptions? leg, int index)
    {
        if (leg is null)
        {
            throw new DomainException($"legs[{index}]", "Strecke fehlt.");
        }

        var origins = Codes(leg.Origins, $"legs[{index}].origins", "Abflughafen");
        var destinations = Codes(leg.Destinations, $"legs[{index}].destinations", "Zielflughafen");
        return [.. origins.SelectMany(o => destinations.Where(d => d != o).Select(d => new FlightLeg(o, d, leg.Date)))];
    }

    private static List<string> Codes(IReadOnlyList<string>? codes, string field, string label)
    {
        var list = (codes ?? []).Select(FlightSearchRequest.NormalizeCode).Where(c => c.Length > 0).Distinct().ToList();
        if (list.Count == 0)
        {
            throw new DomainException(field, $"Bitte mindestens einen {label} wählen.");
        }

        if (list.Count > MaxAirportsPerSide)
        {
            throw new DomainException(field, $"Höchstens {MaxAirportsPerSide} Flughäfen pro Seite.");
        }

        return list;
    }
}

/// <summary>Geprüfte Suche mit mehreren Flughäfen pro Strecke (siehe <see cref="FlightQuery.Combine"/>).</summary>
public sealed record FlightMultiRequest(IReadOnlyList<FlightLegOptions> Legs, int Adults, CabinClass Cabin);

/// <summary>Ein einzelner Flug (ohne Umstieg).</summary>
public sealed record FlightSegment(
    string Origin,
    string? OriginName,
    string Destination,
    string? DestinationName,
    DateTime Departure,
    DateTime Arrival,
    int DurationMinutes,
    string CarrierCode,
    string? CarrierName,
    string? CarrierLogo,
    string FlightNumber,
    string? Aircraft);

/// <summary>Eine Strecke einer Verbindung, ggf. mit Umstiegen.</summary>
/// <param name="DayChange">Ankunft so viele Tage nach dem Abflugtag (+1 = am nächsten Tag).</param>
public sealed record FlightJourneyLeg(
    string Origin,
    string Destination,
    DateTime Departure,
    DateTime Arrival,
    int DurationMinutes,
    int DayChange,
    IReadOnlyList<FlightSegment> Segments)
{
    public int Stops => Segments.Count - 1;
}

/// <summary>Ein Tarif einer Verbindung (Light, Standard, Flex …).</summary>
/// <param name="TotalPrice">Für alle Reisenden zusammen.</param>
/// <param name="CheckedBags">Anzahl Aufgabegepäckstücke pro Person (0 = nur Handgepäck, null = unbekannt).</param>
public sealed record FlightFare(
    string Family,
    string? Cabin,
    decimal TotalPrice,
    decimal PricePerAdult,
    string Currency,
    int? CabinBagKg,
    int? CheckedBags,
    int? CheckedBagKg,
    bool Refundable,
    bool Changeable,
    decimal? ChangeFee,
    int? SeatsRemaining);

/// <summary>Eine buchbare Verbindung über alle Strecken; Tarife günstigster zuerst.</summary>
/// <param name="Signature">Eindeutige Kennung aus Strecken, Daten und Flugnummern (siehe <see cref="FlightSignature"/>).</param>
/// <param name="Continuation">
/// Gesetzt, wenn erst ein Teil der Strecken feststeht (Google Flights liefert erst den Hinflug, der Rückflug wird danach
/// gewählt). Der Preis ist dann der günstigste Gesamtpreis mit diesem Hinflug.
/// </param>
public sealed record FlightJourney(
    string Signature,
    IReadOnlyList<FlightJourneyLeg> Legs,
    int TotalMinutes,
    IReadOnlyList<FlightFare> Fares,
    string BookingUrl,
    string GoogleUrl,
    string? Continuation = null)
{
    public decimal TotalPrice => Fares[0].TotalPrice;
}

/// <summary>Ein Tagespreis aus dem Preisverlauf von Google Flights.</summary>
public sealed record PricePoint(DateOnly Date, decimal Price);

/// <summary>
/// Preiseinschätzung von Google Flights zu einer Suche: günstigster Preis, Einstufung („low“, „typical“, „high“),
/// üblicher Bereich und Verlauf der letzten Wochen (ein Preis pro Tag, nicht nach Airline getrennt).
/// </summary>
public sealed record FlightPriceInsights(decimal? Lowest, string? Level, decimal? TypicalLow, decimal? TypicalHigh, IReadOnlyList<PricePoint> History);

public sealed record FlightSearchResult(IReadOnlyList<FlightJourney> Journeys, bool Sandbox, DateTimeOffset FetchedAt, FlightPriceInsights? Insights = null);

public interface IFlightSearch
{
    /// <summary>"liteapi" oder "serpapi" – das Frontend passt Texte und Filter daran an.</summary>
    string Provider { get; }

    bool IsConfigured { get; }

    Task<FlightSearchResult> SearchAsync(FlightSearchRequest request, CancellationToken cancellationToken);
}

/// <summary>Anbieter, die mehrere Flughäfen pro Seite in einer Anfrage suchen – spart Abfragen.</summary>
public interface IMultiAirportFlightSearch
{
    Task<FlightSearchResult> SearchAsync(FlightMultiRequest request, CancellationToken cancellationToken);
}

/// <summary>Anbieter, die Verbindungen schrittweise liefern: erst Hinflug, nach der Wahl die Rückflüge.</summary>
public interface IStepwiseFlightSearch
{
    /// <summary>Nächste Strecke zu einer Teil-Verbindung (<see cref="FlightJourney.Continuation"/>).</summary>
    Task<FlightSearchResult> ContinueAsync(string continuation, CancellationToken cancellationToken);

    /// <summary>
    /// Sucht genau die Verbindung zu einer Kennung (Schritt für Schritt). Gibt die gefundene Verbindung zurück
    /// und das Ergebnis des ersten Schritts (für „andere Verbindungen ab …“).
    /// </summary>
    Task<(FlightJourney? Journey, FlightSearchResult First)> FindAsync(FlightSearchRequest request, string signature, CancellationToken cancellationToken);
}

public interface IFlightSearchQuota
{
    Task<SearchQuota?> GetQuotaAsync(CancellationToken cancellationToken);
}

public sealed class FlightSearchNotConfiguredException(string message)
    : Exception(message)
{
    public FlightSearchNotConfiguredException()
        : this("Für die Flugsuche fehlt der LiteAPI-Key (siehe README, Abschnitt Hotelsuche – der Key gilt auch für Flüge).")
    {
    }
}

public sealed class FlightSearchUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>
/// Kennung einer Verbindung, z. B. „STR-LIS@2027-05-12:EW2042+EW7602|OPO-STR@2027-05-19:EW2713“.
/// Daraus lässt sich die Suche später wiederholen (gemerkte Flüge neu prüfen).
/// </summary>
public static class FlightSignature
{
    public static string Create(IEnumerable<FlightJourneyLeg> legs) =>
        string.Join('|', legs.Select(l =>
            $"{l.Origin}-{l.Destination}@{l.Departure.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)}:" +
            string.Join('+', l.Segments.Select(s => s.CarrierCode + s.FlightNumber))));

    /// <summary>Strecken aus einer Kennung; null, wenn sie nicht lesbar ist.</summary>
    public static IReadOnlyList<FlightLeg>? ParseLegs(string? signature)
    {
        if (string.IsNullOrWhiteSpace(signature))
        {
            return null;
        }

        var legs = new List<FlightLeg>();
        foreach (var part in signature.Split('#')[0].Split('|'))
        {
            var at = part.IndexOf('@', StringComparison.Ordinal);
            var colon = part.IndexOf(':', StringComparison.Ordinal);
            var route = at > 0 ? part[..at].Split('-') : [];
            if (at < 0 || colon < at || route.Length != 2 ||
                !DateOnly.TryParseExact(part[(at + 1)..colon], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            {
                return null;
            }

            legs.Add(new FlightLeg(route[0], route[1], date));
        }

        return legs;
    }
}
