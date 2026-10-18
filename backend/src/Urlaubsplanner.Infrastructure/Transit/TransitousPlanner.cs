using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Urlaubsplanner.Domain.Transit;

namespace Urlaubsplanner.Infrastructure.Transit;

public sealed class TransitOptions
{
    public const string Section = "Transit";

    /// <summary>
    /// Transitous: freier, von Freiwilligen betriebener Fahrplan-Router (MOTIS) mit offenen Daten weltweit.
    /// Nutzung für nicht-kommerzielle Open-Source-Projekte erlaubt, mit erkennbarem User-Agent und Quellenangabe.
    /// </summary>
    public string BaseUrl { get; set; } = "https://api.transitous.org/";
}

/// <summary>Verbindungen mit Bus & Bahn über Transitous (MOTIS-API v6 <c>/plan</c>). Ergebnisse 10 Minuten im Speicher.</summary>
public sealed partial class TransitousPlanner(HttpClient http, IMemoryCache cache, ILogger<TransitousPlanner> logger) : ITransitPlanner
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(10);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { NumberHandling = JsonNumberHandling.AllowReadingFromString };

    public async Task<TransitPlan> PlanAsync(TransitPlanRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var url = PlanUrl(request);
        if (cache.TryGetValue(url, out TransitPlan? cached) && cached is not null)
        {
            return cached;
        }

        PlanResponse? response;
        try
        {
            using var message = await http.GetAsync(url, cancellationToken).ConfigureAwait(false);
            if (!message.IsSuccessStatusCode)
            {
                LogFailedStatus((int)message.StatusCode);
                throw new TransitUnavailableException("Die Fahrplanauskunft (Transitous) antwortet gerade nicht. Versuch es gleich noch einmal.");
            }

            response = await message.Content.ReadFromJsonAsync<PlanResponse>(Json, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception e) when (e is HttpRequestException or JsonException || (e is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            LogFailed(e);
            throw new TransitUnavailableException("Die Fahrplanauskunft (Transitous) ist gerade nicht erreichbar.", e);
        }

        var plan = Map(response);
        cache.Set(url, plan, CacheDuration);
        return plan;
    }

    internal static string PlanUrl(TransitPlanRequest request)
    {
        var query = new List<string>
        {
            "fromPlace=" + Point(request.From.Latitude, request.From.Longitude),
            "toPlace=" + Point(request.To.Latitude, request.To.Longitude),
            "time=" + Uri.EscapeDataString(request.Time.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)),
            "arriveBy=" + (request.ArriveBy ? "true" : "false"),
            "numItineraries=6",
            // Zwei Stunden Suchfenster – genug Auswahl, ohne den freiwillig betriebenen Server zu belasten.
            "searchWindow=7200",
            "detailedTransfers=false",
            // Bis zu 30 Minuten Fußweg zur ersten/von der letzten Haltestelle (Standard sind 15). Wer einen Ort statt
            // eines Bahnhofs wählt, landet in der Ortsmitte – der Bahnhof liegt oft mehr als 15 Minuten entfernt.
            "maxPreTransitTime=1800",
            "maxPostTransitTime=1800",
            "language=de",
        };
        if (!string.IsNullOrEmpty(request.Cursor))
        {
            query.Add("pageCursor=" + Uri.EscapeDataString(request.Cursor));
        }

        return "api/v6/plan?" + string.Join('&', query);

        static string Point(double lat, double lon) => string.Create(CultureInfo.InvariantCulture, $"{lat:F6},{lon:F6}");
    }

    internal static TransitPlan Map(PlanResponse? response)
    {
        if (response is null)
        {
            return new TransitPlan([], null, null);
        }

        // „direct“ = ganz ohne Bus & Bahn (z. B. zu Fuß), wenn das schnell genug geht.
        var itineraries = (response.Direct ?? []).Concat(response.Itineraries ?? [])
            .Select(MapItinerary)
            .OfType<TransitItinerary>()
            .GroupBy(i => (i.Departure, i.Arrival, Lines: string.Join('|', i.Legs.Select(l => l.Line))))
            .Select(g => g.First())
            .OrderBy(i => i.Departure)
            .ToList();
        return new TransitPlan(itineraries, NullIfEmpty(response.PreviousPageCursor), NullIfEmpty(response.NextPageCursor));
    }

    private static TransitItinerary? MapItinerary(ItineraryDto dto)
    {
        if (dto.Legs is not { Count: > 0 })
        {
            return null;
        }

        var legs = dto.Legs.Select(MapLeg).ToList();
        return new TransitItinerary(
            dto.StartTime,
            dto.EndTime,
            (int)Math.Round(dto.Duration / 60.0),
            dto.Transfers,
            legs);
    }

    private static TransitLeg MapLeg(LegDto leg) => new(
        leg.Mode,
        Line(leg),
        NullIfEmpty(leg.Headsign),
        NullIfEmpty(leg.AgencyName),
        Stop(leg.From, leg.StartTime),
        Stop(leg.To, leg.EndTime),
        (int)Math.Round(leg.Duration / 60.0),
        leg.Distance is { } d ? (int)Math.Round(d) : null,
        leg.IntermediateStops?.Count ?? 0,
        NullIfEmpty(leg.RouteColor));

    private static TransitStop Stop(PlaceDto place, DateTimeOffset time) =>
        new(place.Name, place.Lat, place.Lon, time, NullIfEmpty(place.Tz), NullIfEmpty(place.Track));

    /// <summary>„ICE 9576“, „S1“, „Bus 728“ – was auf Anzeigetafeln steht.</summary>
    private static string? Line(LegDto leg) =>
        NullIfEmpty(leg.DisplayName) ?? NullIfEmpty(leg.RouteShortName) ?? NullIfEmpty(leg.TripShortName) ?? NullIfEmpty(leg.RouteLongName);

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    [LoggerMessage(Level = LogLevel.Warning, Message = "Transitous antwortete mit {Status}")]
    private partial void LogFailedStatus(int status);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Transitous-Anfrage fehlgeschlagen")]
    private partial void LogFailed(Exception exception);

    internal sealed record PlanResponse(List<ItineraryDto>? Itineraries, List<ItineraryDto>? Direct, string? PreviousPageCursor, string? NextPageCursor);

    internal sealed record ItineraryDto(double Duration, DateTimeOffset StartTime, DateTimeOffset EndTime, int Transfers, List<LegDto>? Legs);

    internal sealed record LegDto(
        string Mode,
        PlaceDto From,
        PlaceDto To,
        double Duration,
        DateTimeOffset StartTime,
        DateTimeOffset EndTime,
        double? Distance,
        string? Headsign,
        string? AgencyName,
        string? RouteShortName,
        string? RouteLongName,
        string? TripShortName,
        string? DisplayName,
        string? RouteColor,
        List<PlaceDto>? IntermediateStops);

    internal sealed record PlaceDto(string Name, double Lat, double Lon, string? Tz, string? Track);
}
