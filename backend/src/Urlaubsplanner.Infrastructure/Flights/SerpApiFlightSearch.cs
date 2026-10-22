using System.Globalization;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Infrastructure.SerpApi;

namespace Urlaubsplanner.Infrastructure.Flights;

/// <summary>
/// Flugpreise von Google Flights über SerpApi (kostenlos: 250 Suchen pro Monat).
/// Google liefert schrittweise: die erste Suche ergibt die Hinflüge mit dem günstigsten Gesamtpreis,
/// die Rückflüge zu einem Hinflug kosten eine weitere Suche (<see cref="ContinueAsync"/>).
/// Mehrere Flughäfen pro Seite gehen in einer einzigen Suche. Ergebnisse werden eine Stunde gecacht,
/// damit gleiche Suchen kein Kontingent verbrauchen.
/// </summary>
public sealed partial class SerpApiFlightSearch(
    HttpClient http,
    IMemoryCache cache,
    IOptions<SerpApiOptions> options,
    TimeProvider clock,
    ILogger<SerpApiFlightSearch> logger) : IFlightSearch, IMultiAirportFlightSearch, IStepwiseFlightSearch, IFlightSearchQuota
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(1);

    /// <summary>Länger als der Such-Cache, damit gecachte Ergebnisse immer noch weiterführen.</summary>
    private static readonly TimeSpan ContinuationDuration = TimeSpan.FromHours(3);

    internal static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    private readonly SerpApiOptions _options = options.Value;

    public string Provider => "serpapi";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_options.ApiKey);

    public Task<FlightSearchResult> SearchAsync(FlightSearchRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var context = new SearchContext(
            [.. request.Legs.Select(l => new FlightLegOptions([l.Origin], [l.Destination], l.Date))],
            request.Adults,
            request.Cabin);
        return RunAsync(context, [], null, cancellationToken);
    }

    public Task<FlightSearchResult> SearchAsync(FlightMultiRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        return RunAsync(new SearchContext(request.Legs, request.Adults, request.Cabin), [], null, cancellationToken);
    }

    public Task<FlightSearchResult> ContinueAsync(string continuation, CancellationToken cancellationToken)
    {
        if (!cache.TryGetValue(ContinuationKey(continuation), out Step? step) || step is null)
        {
            throw new FlightSearchUnavailableException("Diese Auswahl ist abgelaufen – bitte die Suche neu starten.");
        }

        return RunAsync(step.Context, step.Known, step.DepartureToken, cancellationToken);
    }

    public async Task<(FlightJourney? Journey, FlightSearchResult First)> FindAsync(
        FlightSearchRequest request,
        string signature,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(signature);
        var parts = signature.Split('#')[0].Split('|');
        var first = await SearchAsync(request, cancellationToken).ConfigureAwait(false);
        var current = first;
        for (var i = 0; i < parts.Length; i++)
        {
            var prefix = string.Join('|', parts[..(i + 1)]);
            var journey = current.Journeys.FirstOrDefault(j => j.Signature == prefix);
            if (journey is null)
            {
                return (null, first);
            }

            if (journey.Continuation is null || i == parts.Length - 1)
            {
                return (journey.Continuation is null && i == parts.Length - 1 ? journey : null, first);
            }

            current = await ContinueAsync(journey.Continuation, cancellationToken).ConfigureAwait(false);
        }

        return (null, first);
    }

    public Task<SearchQuota?> GetQuotaAsync(CancellationToken cancellationToken) =>
        IsConfigured ? SerpApiAccount.GetQuotaAsync(http, cache, _options.ApiKey!, LogFailed, cancellationToken) : Task.FromResult<SearchQuota?>(null);

    /// <summary>Kontingent neu laden lassen (nach einer Suche, die nicht aus dem Cache kam).</summary>
    private void ForgetQuota() => SerpApiAccount.ForgetQuota(cache);

    private async Task<FlightSearchResult> RunAsync(
        SearchContext context,
        IReadOnlyList<FlightJourneyLeg> known,
        string? departureToken,
        CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            throw NotConfigured();
        }

        var query = BuildQuery(context, departureToken);
        var cacheKey = "serpapi:flights:" + string.Join('&', query.Select(p => $"{p.Key}={p.Value}"));
        if (cache.TryGetValue(cacheKey, out FlightSearchResult? cached) && cached is not null)
        {
            return cached;
        }

        var url = "search.json?" + string.Join('&', query.Append(new("api_key", _options.ApiKey!))
            .Select(p => $"{p.Key}={Uri.EscapeDataString(p.Value)}"));

        SearchResponse? body;
        try
        {
            using var response = await http.GetAsync(url, cancellationToken).ConfigureAwait(false);
            var text = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            body = TryParse(text);
            ForgetQuota();
            if (!response.IsSuccessStatusCode || body?.Error is not null)
            {
                ThrowForError(response.StatusCode, body?.Error ?? text);
            }
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            LogFailed(e);
            throw new FlightSearchUnavailableException("Google Flights (SerpApi) ist gerade nicht erreichbar.", e);
        }

        var result = new FlightSearchResult(ToJourneys(body, context, known), false, clock.GetUtcNow(), Insights(body?.PriceInsights));
        cache.Set(cacheKey, result, CacheDuration);
        return result;
    }

    internal static FlightPriceInsights? Insights(PriceInsightsData? data)
    {
        if (data is null)
        {
            return null;
        }

        var history = (data.PriceHistory ?? [])
            .Where(p => p.Count >= 2 && p[0] > 0 && p[1] > 0)
            .Select(p => new PricePoint(DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeSeconds((long)p[0]).UtcDateTime), (decimal)p[1]))
            .GroupBy(p => p.Date)
            .Select(g => g.Last())
            .OrderBy(p => p.Date)
            .ToList();
        var range = data.TypicalPriceRange is { Count: 2 } r ? r : null;
        return new FlightPriceInsights(data.LowestPrice, data.PriceLevel, range?[0], range?[1], history);
    }

    private static SearchResponse? TryParse(string text)
    {
        try
        {
            return JsonSerializer.Deserialize<SearchResponse>(text, Json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>„Keine Ergebnisse“ ist kein Fehler – alles andere schon.</summary>
    private void ThrowForError(HttpStatusCode status, string error)
    {
        if (error.Contains("hasn't returned any results", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        if (status is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden || error.Contains("Invalid API key", StringComparison.OrdinalIgnoreCase))
        {
            throw new FlightSearchUnavailableException("SerpApi lehnt den API-Key ab. Ist er richtig hinterlegt (SerpApi:ApiKey)?");
        }

        if (status == HttpStatusCode.TooManyRequests || error.Contains("run out of searches", StringComparison.OrdinalIgnoreCase))
        {
            throw new FlightSearchUnavailableException("Die kostenlosen Google-Suchen für diesen Monat sind aufgebraucht.");
        }

        LogFailedStatus((int)status, error.Length > 300 ? error[..300] : error);
        throw new FlightSearchUnavailableException($"Google Flights (SerpApi) hat mit einem Fehler geantwortet ({(int)status}).");
    }

    internal List<KeyValuePair<string, string>> BuildQuery(SearchContext context, string? departureToken)
    {
        string Codes(IReadOnlyList<string> codes) => string.Join(',', codes);
        string Day(DateOnly date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        var legs = context.Legs;
        var query = new List<KeyValuePair<string, string>> { new("engine", "google_flights") };
        if (legs.Count == 1)
        {
            query.Add(new("type", "2"));
            query.Add(new("departure_id", Codes(legs[0].Origins)));
            query.Add(new("arrival_id", Codes(legs[0].Destinations)));
            query.Add(new("outbound_date", Day(legs[0].Date)));
        }
        else if (IsRoundTrip(context))
        {
            query.Add(new("type", "1"));
            query.Add(new("departure_id", Codes(legs[0].Origins)));
            query.Add(new("arrival_id", Codes(legs[0].Destinations)));
            query.Add(new("outbound_date", Day(legs[0].Date)));
            query.Add(new("return_date", Day(legs[1].Date)));
        }
        else
        {
            query.Add(new("type", "3"));
            query.Add(new("multi_city_json", JsonSerializer.Serialize(legs.Select(l => new Dictionary<string, string>
            {
                ["departure_id"] = Codes(l.Origins),
                ["arrival_id"] = Codes(l.Destinations),
                ["date"] = Day(l.Date),
            }))));
        }

        query.Add(new("adults", context.Adults.ToString(CultureInfo.InvariantCulture)));
        query.Add(new("travel_class", context.Cabin switch
        {
            CabinClass.PremiumEconomy => "2",
            CabinClass.Business => "3",
            CabinClass.First => "4",
            _ => "1",
        }));
        query.Add(new("currency", _options.Currency));
        query.Add(new("hl", _options.Language));
        query.Add(new("gl", _options.Country));
        if (_options.ShowHidden)
        {
            query.Add(new("show_hidden", "true"));
        }

        if (_options.DeepSearch)
        {
            query.Add(new("deep_search", "true"));
        }
        if (departureToken is not null)
        {
            query.Add(new("departure_token", departureToken));
        }

        return query;
    }

    internal static bool IsRoundTrip(SearchContext context) =>
        context.Legs.Count == 2 &&
        context.Legs[1].Origins.ToHashSet().SetEquals(context.Legs[0].Destinations) &&
        context.Legs[1].Destinations.ToHashSet().SetEquals(context.Legs[0].Origins);

    internal List<FlightJourney> ToJourneys(SearchResponse? body, SearchContext context, IReadOnlyList<FlightJourneyLeg> known)
    {
        var items = (body?.BestFlights ?? []).Concat(body?.OtherFlights ?? []);
        var result = new List<FlightJourney>();
        foreach (var item in items)
        {
            if (item.Price is not > 0)
            {
                continue;
            }

            var segments = (item.Flights ?? []).Select(ToSegment).OfType<FlightSegment>().ToList();
            if (segments.Count == 0 || segments.Count != item.Flights!.Count)
            {
                continue;
            }

            var first = segments[0];
            var last = segments[^1];
            var leg = new FlightJourneyLeg(
                first.Origin,
                last.Destination,
                first.Departure,
                last.Arrival,
                item.TotalDuration ?? (int)(last.Arrival - first.Departure).TotalMinutes,
                (last.Arrival.Date - first.Departure.Date).Days,
                segments);
            List<FlightJourneyLeg> legs = [.. known, leg];
            var complete = legs.Count >= context.Legs.Count;

            string? continuation = null;
            if (!complete)
            {
                if (string.IsNullOrEmpty(item.DepartureToken))
                {
                    continue;
                }

                continuation = Guid.NewGuid().ToString("N");
                cache.Set(ContinuationKey(continuation), new Step(context, legs, item.DepartureToken), ContinuationDuration);
            }

            var price = decimal.Round(item.Price.Value, 2);
            var fare = new FlightFare(
                "Google Flights",
                item.Flights[0].TravelClass,
                price,
                decimal.Round(price / context.Adults, 2),
                _options.Currency,
                null,
                null,
                null,
                false,
                false,
                null,
                null);
            var links = LinkRequest(context, legs);
            result.Add(new FlightJourney(
                FlightSignature.Create(legs),
                legs,
                legs.Sum(l => l.DurationMinutes),
                [fare],
                FlightBookingLinks.Kayak(links),
                FlightBookingLinks.Google(links),
                continuation));
        }

        return [.. result.DistinctBy(j => j.Signature).OrderBy(j => j.TotalPrice).ThenBy(j => j.TotalMinutes)];
    }

    /// <summary>Links mit den tatsächlichen Flughäfen der gewählten Strecken, für den Rest die gesuchten.</summary>
    private static FlightSearchRequest LinkRequest(SearchContext context, List<FlightJourneyLeg> legs) =>
        FlightSearchRequest.ForLinks(
            [.. context.Legs.Select((l, i) => i < legs.Count
                ? new FlightLeg(legs[i].Origin, legs[i].Destination, DateOnly.FromDateTime(legs[i].Departure))
                : new FlightLeg(l.Origins[0], l.Destinations[0], l.Date))],
            context.Adults,
            context.Cabin);

    private static FlightSegment? ToSegment(FlightData f)
    {
        var departure = ParseTime(f.DepartureAirport?.Time);
        var arrival = ParseTime(f.ArrivalAirport?.Time);
        if (f.DepartureAirport?.Id is null || f.ArrivalAirport?.Id is null || departure is null || arrival is null)
        {
            return null;
        }

        var (carrier, number) = SplitFlightNumber(f.FlightNumber);
        return new FlightSegment(
            f.DepartureAirport.Id,
            f.DepartureAirport.Name,
            f.ArrivalAirport.Id,
            f.ArrivalAirport.Name,
            departure.Value,
            arrival.Value,
            f.Duration ?? (int)(arrival.Value - departure.Value).TotalMinutes,
            carrier,
            f.Airline,
            f.AirlineLogo,
            number,
            f.Airplane);
    }

    /// <summary>"LH 1234" → ("LH", "1234"); "U22604" → ("U2", "2604").</summary>
    internal static (string Carrier, string Number) SplitFlightNumber(string? value)
    {
        var text = (value ?? string.Empty).Trim();
        var space = text.IndexOf(' ', StringComparison.Ordinal);
        if (space > 0)
        {
            return (text[..space], text[(space + 1)..].Replace(" ", string.Empty, StringComparison.Ordinal));
        }

        return text.Length > 2 ? (text[..2], text[2..]) : ("??", text);
    }

    private static DateTime? ParseTime(string? value) =>
        DateTime.TryParseExact(value, ["yyyy-MM-dd HH:mm", "yyyy-MM-dd H:mm"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var time)
            ? time
            : null;

    private static string ContinuationKey(string id) => $"serpapi:step:{id}";

    private static FlightSearchNotConfiguredException NotConfigured() =>
        new("Für die Flugsuche fehlt der SerpApi-Key (siehe README, Abschnitt Flugsuche).");

    [LoggerMessage(Level = LogLevel.Warning, Message = "SerpApi-Flugsuche antwortete mit {Status}: {Detail}")]
    private partial void LogFailedStatus(int status, string detail);

    [LoggerMessage(Level = LogLevel.Warning, Message = "SerpApi-Anfrage fehlgeschlagen")]
    private partial void LogFailed(Exception exception);

    internal sealed record SearchContext(IReadOnlyList<FlightLegOptions> Legs, int Adults, CabinClass Cabin);

    private sealed record Step(SearchContext Context, IReadOnlyList<FlightJourneyLeg> Known, string DepartureToken);
}

// Antwortformat von search.json?engine=google_flights (nur die Felder, die wir brauchen).
internal sealed record SearchResponse(List<ItineraryData>? BestFlights, List<ItineraryData>? OtherFlights, string? Error, PriceInsightsData? PriceInsights = null);

/// <summary>„price_insights“: price_history ist eine Liste aus [Unix-Zeit, Preis].</summary>
internal sealed record PriceInsightsData(decimal? LowestPrice, string? PriceLevel, List<decimal>? TypicalPriceRange, List<List<double>>? PriceHistory);

internal sealed record ItineraryData(List<FlightData>? Flights, int? TotalDuration, decimal? Price, string? DepartureToken);

internal sealed record FlightData(
    AirportData? DepartureAirport,
    AirportData? ArrivalAirport,
    int? Duration,
    string? Airplane,
    string? Airline,
    string? AirlineLogo,
    string? TravelClass,
    string? FlightNumber);

internal sealed record AirportData(string? Name, string? Id, string? Time);
