using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain.Hotels;

namespace Urlaubsplanner.Infrastructure.Hotels;

public sealed class LiteApiOptions
{
    public const string Section = "LiteApi";

    /// <summary>Kommt aus den User Secrets bzw. einer Umgebungsvariable – nie ins Repo schreiben.</summary>
    public string? ApiKey { get; set; }

    public string BaseUrl { get; set; } = "https://api.liteapi.travel/v3.0/";

    /// <summary>Nationalität der Gäste (ISO-Code), beeinflusst bei manchen Hotels den Preis.</summary>
    public string GuestNationality { get; set; } = "DE";

    public string Currency { get; set; } = "EUR";

    /// <summary>Wie viele Hotels pro Suche höchstens abgefragt werden.</summary>
    public int MaxHotels { get; set; } = 50;

    /// <summary>Optional: Domain der eigenen LiteAPI-White-Label-Seite für direkte Buchungslinks.</summary>
    public string? WhitelabelDomain { get; set; }
}

/// <summary>
/// Hotelsuche über LiteAPI (POST /hotels/rates mit Koordinaten und Radius).
/// Pro Hotel wird nur das günstigste Angebot geholt; Ergebnisse werden 15 Minuten gecacht,
/// damit gleiche Suchen sofort da sind und das Kontingent geschont wird.
/// </summary>
public sealed partial class LiteApiHotelSearch(
    HttpClient http,
    IMemoryCache cache,
    IOptions<LiteApiOptions> options,
    TimeProvider clock,
    ILogger<LiteApiHotelSearch> logger) : IHotelSearch
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(15);

    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly LiteApiOptions _options = options.Value;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_options.ApiKey);

    public async Task<HotelSearchResult> SearchAsync(HotelSearchRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (!IsConfigured)
        {
            throw new HotelSearchNotConfiguredException();
        }

        var cacheKey = string.Create(
            CultureInfo.InvariantCulture,
            $"liteapi:{request.Center.Latitude:F4},{request.Center.Longitude:F4}:{request.RadiusMeters}:{request.Checkin}:{request.Checkout}:{string.Join('-', request.AdultsPerRoom())}");
        if (cache.TryGetValue(cacheKey, out HotelSearchResult? cached) && cached is not null)
        {
            return cached;
        }

        using var message = new HttpRequestMessage(HttpMethod.Post, "hotels/rates")
        {
            Content = JsonContent.Create(BuildRequest(request), options: Json),
        };
        message.Headers.Add("X-API-Key", _options.ApiKey);

        RatesResponse? body;
        try
        {
            using var response = await http.SendAsync(message, cancellationToken).ConfigureAwait(false);
            if (response.StatusCode == HttpStatusCode.NoContent)
            {
                body = null; // keine Verfügbarkeit
            }
            else if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                throw new HotelSearchUnavailableException("LiteAPI lehnt den API-Key ab. Ist er richtig hinterlegt?");
            }
            else if (!response.IsSuccessStatusCode)
            {
                var detail = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                LogFailedStatus((int)response.StatusCode, Truncate(detail, 300));
                throw new HotelSearchUnavailableException($"LiteAPI hat mit Fehler {(int)response.StatusCode} geantwortet.");
            }
            else
            {
                body = await response.Content.ReadFromJsonAsync<RatesResponse>(Json, cancellationToken).ConfigureAwait(false);
            }
        }
        // Zeitüberschreitung = TaskCanceledException, aber nur wenn nicht der Aufrufer selbst abgebrochen hat.
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            LogFailed(e);
            throw new HotelSearchUnavailableException("Die Hotelsuche ist gerade nicht erreichbar.", e);
        }

        var result = new HotelSearchResult(
            ToOffers(body, request, _options.WhitelabelDomain),
            body?.Sandbox ?? _options.ApiKey!.StartsWith("sand_", StringComparison.Ordinal),
            clock.GetUtcNow());
        cache.Set(cacheKey, result, CacheDuration);
        return result;
    }

    internal object BuildRequest(HotelSearchRequest request) => new
    {
        latitude = request.Center.Latitude,
        longitude = request.Center.Longitude,
        radius = request.RadiusMeters,
        checkin = request.Checkin.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        checkout = request.Checkout.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        currency = _options.Currency,
        guestNationality = _options.GuestNationality,
        occupancies = request.AdultsPerRoom().Select(adults => new { adults }).ToList(),
        maxRatesPerHotel = 1,
        limit = _options.MaxHotels,
        timeout = 8,
        includeHotelData = true,
    };

    /// <summary>Verbindet Preise (data) mit Hoteldaten (hotels) und nimmt pro Hotel das günstigste Angebot.</summary>
    internal static List<HotelOffer> ToOffers(RatesResponse? body, HotelSearchRequest request, string? whitelabelDomain)
    {
        if (body?.Data is null)
        {
            return [];
        }

        var hotels = (body.Hotels ?? []).Where(h => h.Id is not null).DistinctBy(h => h.Id).ToDictionary(h => h.Id!);
        var offers = new List<HotelOffer>();

        foreach (var entry in body.Data)
        {
            if (entry.HotelId is null || !hotels.TryGetValue(entry.HotelId, out var hotel) || string.IsNullOrWhiteSpace(hotel.Name))
            {
                continue;
            }

            var cheapest = (entry.RoomTypes ?? [])
                .Select(rt => (RoomType: rt, Price: PriceOf(rt)))
                .Where(x => x.Price is not null)
                .MinBy(x => x.Price!.Value.Amount);
            if (cheapest.RoomType is null)
            {
                continue;
            }

            var rate = cheapest.RoomType.Rates?.FirstOrDefault();
            offers.Add(new HotelOffer(
                entry.HotelId,
                hotel.Name.Trim(),
                NullIfEmpty(hotel.Address),
                hotel.Latitude,
                hotel.Longitude,
                hotel.Rating is > 0 ? hotel.Rating : null,
                hotel.ReviewCount is > 0 ? hotel.ReviewCount : null,
                hotel.Stars is > 0 ? hotel.Stars : null,
                NullIfEmpty(hotel.MainPhoto) ?? NullIfEmpty(hotel.Thumbnail),
                decimal.Round(cheapest.Price!.Value.Amount, 2),
                cheapest.Price.Value.Currency,
                NullIfEmpty(rate?.Name),
                NullIfEmpty(rate?.BoardName),
                string.Equals(rate?.CancellationPolicies?.RefundableTag, "RFN", StringComparison.OrdinalIgnoreCase),
                HotelBookingLinks.For(entry.HotelId, hotel.Name.Trim(), hotel.CityName, request, whitelabelDomain)));
        }

        return [.. offers.OrderBy(o => o.TotalPrice)];
    }

    /// <summary>Gesamtpreis des Angebots: bevorzugt offerRetailRate, sonst Summe der Zimmerpreise.</summary>
    private static (decimal Amount, string Currency)? PriceOf(RoomType roomType)
    {
        if (roomType.OfferRetailRate is { Amount: > 0 } offer)
        {
            return (offer.Amount, offer.Currency ?? "EUR");
        }

        var totals = (roomType.Rates ?? []).Select(r => r.RetailRate?.Total?.FirstOrDefault()).ToList();
        if (totals.Count == 0 || totals.Any(t => t is null || t.Amount <= 0))
        {
            return null;
        }

        return (totals.Sum(t => t!.Amount), totals[0]!.Currency ?? "EUR");
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];

    [LoggerMessage(Level = LogLevel.Warning, Message = "LiteAPI antwortete mit {Status}: {Detail}")]
    private partial void LogFailedStatus(int status, string detail);

    [LoggerMessage(Level = LogLevel.Warning, Message = "LiteAPI-Anfrage fehlgeschlagen")]
    private partial void LogFailed(Exception exception);
}

// Antwortformat von POST /hotels/rates (nur die Felder, die wir brauchen).
internal sealed record RatesResponse(List<RateEntry>? Data, List<HotelData>? Hotels, bool? Sandbox);

internal sealed record RateEntry(string? HotelId, List<RoomType>? RoomTypes);

internal sealed record RoomType(string? OfferId, Money? OfferRetailRate, List<Rate>? Rates);

internal sealed record Rate(string? Name, string? BoardName, RetailRate? RetailRate, CancellationPolicies? CancellationPolicies);

internal sealed record RetailRate(List<Money>? Total);

internal sealed record Money(decimal Amount, string? Currency);

internal sealed record CancellationPolicies(string? RefundableTag);

internal sealed record HotelData(
    string? Id,
    string? Name,
    [property: JsonPropertyName("main_photo")] string? MainPhoto,
    string? Thumbnail,
    string? Address,
    [property: JsonPropertyName("city_name")] string? CityName,
    double? Latitude,
    double? Longitude,
    double? Rating,
    double? Stars,
    [property: JsonPropertyName("review_count")] int? ReviewCount);
