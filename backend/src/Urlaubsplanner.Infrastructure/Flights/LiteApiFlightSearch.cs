using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Infrastructure.Hotels;

namespace Urlaubsplanner.Infrastructure.Flights;

/// <summary>
/// Flugsuche über LiteAPI (POST /flights/rates, gleicher API-Key wie Hotels).
/// Ergebnisse werden 15 Minuten gecacht – gleiche Suchen (z. B. aus „Andere Daten prüfen“) sind dann sofort da.
/// </summary>
public sealed partial class LiteApiFlightSearch(
    HttpClient http,
    IMemoryCache cache,
    IOptions<LiteApiOptions> options,
    TimeProvider clock,
    ILogger<LiteApiFlightSearch> logger) : IFlightSearch
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(15);

    private readonly LiteApiOptions _options = options.Value;

    public string Provider => "liteapi";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_options.ApiKey);

    public async Task<FlightSearchResult> SearchAsync(FlightSearchRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (!IsConfigured)
        {
            throw new FlightSearchNotConfiguredException();
        }

        var cacheKey = $"liteapi:flights:{string.Join('|', request.Legs.Select(l => $"{l.Origin}-{l.Destination}@{l.Date:O}"))}:{request.Adults}:{request.Cabin}";
        if (cache.TryGetValue(cacheKey, out FlightSearchResult? cached) && cached is not null)
        {
            return cached;
        }

        using var message = new HttpRequestMessage(HttpMethod.Post, "flights/rates")
        {
            Content = JsonContent.Create(BuildRequest(request), options: LiteApiHotelSearch.Json),
        };
        message.Headers.Add("X-API-Key", _options.ApiKey);

        FlightRatesResponse? body;
        try
        {
            using var response = await http.SendAsync(message, cancellationToken).ConfigureAwait(false);
            if (response.StatusCode == HttpStatusCode.NoContent)
            {
                body = null;
            }
            else if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                throw new FlightSearchUnavailableException("LiteAPI lehnt den API-Key für Flüge ab. Sind Flüge für dein Konto freigeschaltet?");
            }
            else if (!response.IsSuccessStatusCode)
            {
                var detail = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                LogFailedStatus((int)response.StatusCode, detail.Length > 300 ? detail[..300] : detail);
                throw new FlightSearchUnavailableException($"LiteAPI hat mit Fehler {(int)response.StatusCode} geantwortet.");
            }
            else
            {
                body = await response.Content.ReadFromJsonAsync<FlightRatesResponse>(LiteApiHotelSearch.Json, cancellationToken).ConfigureAwait(false);
            }
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            LogFailed(e);
            throw new FlightSearchUnavailableException("Die Flugsuche ist gerade nicht erreichbar.", e);
        }

        var result = new FlightSearchResult(ToJourneys(body, request), _options.ApiKey!.StartsWith("sand_", StringComparison.Ordinal), clock.GetUtcNow());
        cache.Set(cacheKey, result, CacheDuration);
        return result;
    }

    internal object BuildRequest(FlightSearchRequest request)
    {
        var roundTrip = request.Legs.Count == 2;
        return new Dictionary<string, object>
        {
            ["legs"] = request.Legs.Select((leg, i) =>
            {
                var item = new Dictionary<string, object>
                {
                    ["origin"] = leg.Origin,
                    ["destination"] = leg.Destination,
                    ["date"] = leg.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                };
                if (roundTrip)
                {
                    // Hin- und Rückflug (auch Gabelflug) laut Doku über direction.
                    item["direction"] = i == 0 ? "OUTBOUND" : "INBOUND";
                }

                return item;
            }).ToList(),
            ["adults"] = request.Adults,
            ["cabinClass"] = request.Cabin switch
            {
                CabinClass.PremiumEconomy => "PREMIUM_ECONOMY",
                CabinClass.Business => "BUSINESS",
                CabinClass.First => "FIRST",
                _ => "ECONOMY",
            },
            ["currency"] = _options.Currency,
            ["country"] = _options.GuestNationality,
        };
    }

    internal static List<FlightJourney> ToJourneys(FlightRatesResponse? body, FlightSearchRequest request)
    {
        var journeys = (body?.Data ?? []).SelectMany(d => d.Journeys ?? []);
        var result = new List<FlightJourney>();
        var bookingUrl = FlightBookingLinks.Kayak(request);
        var googleUrl = FlightBookingLinks.Google(request);

        foreach (var journey in journeys)
        {
            var segments = (journey.Segments ?? []).Select(ToSegment).OfType<(string Direction, FlightSegment Segment)>().ToList();
            var groups = SplitIntoLegs(segments, request);
            if (groups is null)
            {
                continue;
            }

            var legs = groups.Select((group, i) =>
            {
                var duration = journey.LegDurations?.ElementAtOrDefault(i);
                var first = group[0];
                var last = group[^1];
                return new FlightJourneyLeg(
                    first.Origin,
                    last.Destination,
                    first.Departure,
                    last.Arrival,
                    duration?.Duration?.Minutes ?? (int)(last.Arrival - first.Departure).TotalMinutes,
                    duration?.DayChange ?? (last.Arrival.Date - first.Departure.Date).Days,
                    group);
            }).ToList();

            var fares = (journey.Offers ?? (journey.CheapestOffer is null ? [] : [journey.CheapestOffer]))
                .Select(o => ToFare(o, request.Adults))
                .OfType<FlightFare>()
                .OrderBy(f => f.TotalPrice)
                .DistinctBy(f => f.Family)
                .ToList();
            if (fares.Count == 0)
            {
                continue;
            }

            result.Add(new FlightJourney(
                FlightSignature.Create(legs),
                legs,
                journey.TotalDuration?.Minutes ?? legs.Sum(l => l.DurationMinutes),
                fares,
                bookingUrl,
                googleUrl));
        }

        return [.. result.DistinctBy(j => j.Signature).OrderBy(j => j.TotalPrice).ThenBy(j => j.TotalMinutes)];
    }

    /// <summary>
    /// Ordnet die Flüge den Strecken zu: bei Hin/Rück über direction, sonst der Reihe nach bis zum Zielflughafen der Strecke.
    /// </summary>
    private static List<List<FlightSegment>>? SplitIntoLegs(List<(string Direction, FlightSegment Segment)> segments, FlightSearchRequest request)
    {
        if (segments.Count == 0)
        {
            return null;
        }

        if (request.Legs.Count == 2)
        {
            var outbound = segments.Where(s => s.Direction == "OUTBOUND").Select(s => s.Segment).OrderBy(s => s.Departure).ToList();
            var inbound = segments.Where(s => s.Direction == "INBOUND").Select(s => s.Segment).OrderBy(s => s.Departure).ToList();
            if (outbound.Count > 0 && inbound.Count > 0 && outbound.Count + inbound.Count == segments.Count)
            {
                return [outbound, inbound];
            }
        }

        var legs = new List<List<FlightSegment>>();
        var current = new List<FlightSegment>();
        foreach (var (_, segment) in segments.OrderBy(s => s.Segment.Departure))
        {
            current.Add(segment);
            if (legs.Count < request.Legs.Count && segment.Destination == request.Legs[legs.Count].Destination)
            {
                legs.Add(current);
                current = [];
            }
        }

        return current.Count == 0 && legs.Count == request.Legs.Count ? legs : null;
    }

    private static (string, FlightSegment)? ToSegment(SegmentData s)
    {
        if (s.OriginCode is null || s.DestinationCode is null || s.DepartureTime is null || s.ArrivalTime is null)
        {
            return null;
        }

        var carrierCode = s.Carrier?.MarketingCode ?? s.Carrier?.OperatingCode ?? "??";
        return (s.Direction ?? string.Empty, new FlightSegment(
            s.OriginCode,
            s.OriginName,
            s.DestinationCode,
            s.DestinationName,
            s.DepartureTime.Value,
            s.ArrivalTime.Value,
            s.Duration?.Minutes ?? (int)(s.ArrivalTime.Value - s.DepartureTime.Value).TotalMinutes,
            carrierCode,
            s.Carrier?.MarketingName ?? s.Carrier?.OperatingName,
            s.Carrier?.MarketingLogo ?? s.Carrier?.OperatingLogo,
            s.Flight?.MarketingNumber ?? s.Flight?.OperatingNumber ?? string.Empty,
            null));
    }

    private static FlightFare? ToFare(OfferData offer, int adults)
    {
        var display = offer.Pricing?.Display;
        if (display?.Total is not > 0)
        {
            return null;
        }

        var bags = offer.Baggage?.Included ?? [];
        var cabinBag = bags.FirstOrDefault(b => string.Equals(b.BagType, "cabin", StringComparison.OrdinalIgnoreCase));
        var checkedBags = bags.Where(b => string.Equals(b.BagType, "checked", StringComparison.OrdinalIgnoreCase)).ToList();
        var total = display.Total.Value;
        return new FlightFare(
            string.IsNullOrWhiteSpace(offer.Fare?.Family) ? "Standard" : offer.Fare.Family.Trim(),
            offer.SegmentFares?.FirstOrDefault()?.Cabin,
            decimal.Round(total, 2),
            decimal.Round(display.PerPassenger?.Adult?.Total is > 0 ? display.PerPassenger.Adult.Total.Value : total / adults, 2),
            display.Currency ?? "EUR",
            Kg(cabinBag?.WeightKg),
            checkedBags.Sum(b => b.Pieces ?? 1),
            Kg(checkedBags.FirstOrDefault()?.WeightKg),
            offer.Terms?.Refundable ?? false,
            offer.Terms?.Changeable ?? false,
            offer.Terms?.ChangeFee?.Pricing?.Display?.Amount,
            offer.Fare?.SeatsRemaining);
    }

    private static int? Kg(double? weight) => weight is > 0 ? (int)Math.Round(weight.Value) : null;

    [LoggerMessage(Level = LogLevel.Warning, Message = "LiteAPI-Flugsuche antwortete mit {Status}: {Detail}")]
    private partial void LogFailedStatus(int status, string detail);

    [LoggerMessage(Level = LogLevel.Warning, Message = "LiteAPI-Flugsuche fehlgeschlagen")]
    private partial void LogFailed(Exception exception);
}

// Antwortformat von POST /flights/rates (nur die Felder, die wir brauchen).
internal sealed record FlightRatesResponse(List<FlightRatesData>? Data);

internal sealed record FlightRatesData(List<JourneyData>? Journeys);

internal sealed record JourneyData(
    OfferData? CheapestOffer,
    List<OfferData>? Offers,
    List<LegDurationData>? LegDurations,
    List<SegmentData>? Segments,
    DurationData? TotalDuration);

internal sealed record DurationData(int Minutes);

internal sealed record LegDurationData(int? DayChange, string? Direction, DurationData? Duration);

internal sealed record SegmentData(
    DateTime? DepartureTime,
    DateTime? ArrivalTime,
    string? OriginCode,
    string? DestinationCode,
    string? OriginName,
    string? DestinationName,
    string? Direction,
    DurationData? Duration,
    CarrierData? Carrier,
    FlightNumberData? Flight);

internal sealed record CarrierData(string? MarketingCode, string? MarketingName, string? MarketingLogo, string? OperatingCode, string? OperatingName, string? OperatingLogo);

internal sealed record FlightNumberData(string? MarketingNumber, string? OperatingNumber);

internal sealed record OfferData(PricingData? Pricing, BaggageData? Baggage, FareData? Fare, List<SegmentFareData>? SegmentFares, TermsData? Terms);

internal sealed record PricingData(DisplayPrice? Display);

internal sealed record DisplayPrice(decimal? Total, string? Currency, PerPassengerData? PerPassenger);

internal sealed record PerPassengerData(PassengerPrice? Adult);

internal sealed record PassengerPrice(decimal? Total);

internal sealed record BaggageData(List<BagData>? Included);

internal sealed record BagData(string? BagType, int? Pieces, double? WeightKg);

internal sealed record FareData(string? Family, int? SeatsRemaining);

internal sealed record SegmentFareData(string? Cabin);

internal sealed record TermsData(bool? Refundable, bool? Changeable, ChangeFeeData? ChangeFee);

internal sealed record ChangeFeeData(AmountPricing? Pricing);

internal sealed record AmountPricing(AmountDisplay? Display);

internal sealed record AmountDisplay(decimal? Amount);
