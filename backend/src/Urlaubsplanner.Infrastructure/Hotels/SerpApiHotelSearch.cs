using System.Globalization;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Domain.Hotels;
using Urlaubsplanner.Domain.Places;
using Urlaubsplanner.Infrastructure.SerpApi;

namespace Urlaubsplanner.Infrastructure.Hotels;

/// <summary>
/// Hotelpreise von Google Hotels über SerpApi (teilt sich die 250 kostenlosen Suchen pro Monat mit den Flügen).
/// Umkreissuche: eine Suche nach „Hotels {Ort}“ liefert ~20 Hotels mit Preisen mehrerer Anbieter; weitere Seiten
/// kosten je eine Suche. Gezielt nach Hotels (Neu prüfen, andere Daten) kostet eine Suche pro Hotel.
/// Ergebnisse werden eine Stunde gecacht.
/// </summary>
public sealed partial class SerpApiHotelSearch(
    HttpClient http,
    IMemoryCache cache,
    IOptions<SerpApiOptions> options,
    TimeProvider clock,
    ILogger<SerpApiHotelSearch> logger) : IHotelSearch, IPagedHotelSearch, IHotelSearchQuota
{
    /// <summary>Höchstens so viele Anbieter-Preise pro Hotel.</summary>
    internal const int MaxPricesPerHotel = 6;

    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(1);
    private static readonly TimeSpan PageDuration = TimeSpan.FromHours(3);

    private readonly SerpApiOptions _options = options.Value;

    public string Provider => "serpapi";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_options.ApiKey);

    public Task<SearchQuota?> GetQuotaAsync(CancellationToken cancellationToken) =>
        IsConfigured ? SerpApiAccount.GetQuotaAsync(http, cache, _options.ApiKey!, LogFailed, cancellationToken) : Task.FromResult<SearchQuota?>(null);

    public async Task<HotelSearchResult> SearchAsync(HotelSearchRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        EnsureConfigured();

        if (request.HotelIds.Count > 0)
        {
            // Eine Suche pro Hotel – nacheinander, damit das Stundenlimit nicht unnötig belastet wird.
            var offers = new List<HotelOffer>();
            foreach (var id in request.HotelIds)
            {
                var details = await QueryAsync<PropertyData>(DetailsQuery(request, id), cancellationToken).ConfigureAwait(false);
                if (details is not null && ToOffer(details with { PropertyToken = id }, request, _options.Currency) is { } offer)
                {
                    offers.Add(offer);
                }
            }

            return new HotelSearchResult([.. offers.OrderBy(o => o.TotalPrice)], false, clock.GetUtcNow());
        }

        var page = await QueryAsync<PropertiesResponse>(AreaQuery(request, null), cancellationToken).ConfigureAwait(false);
        return ToResult(page, request);
    }

    public async Task<HotelSearchResult> NextPageAsync(string nextPage, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        if (!cache.TryGetValue(PageKey(nextPage), out Page? state) || state is null)
        {
            throw new HotelSearchUnavailableException("Diese Suche ist abgelaufen – bitte neu suchen.");
        }

        var page = await QueryAsync<PropertiesResponse>(AreaQuery(state.Request, state.Token), cancellationToken).ConfigureAwait(false);
        return ToResult(page, state.Request);
    }

    /// <summary>Alle Hotels der ersten Seite, auch ohne Preis (= für die Daten ausgebucht). Kommt aus dem Cache der Suche.</summary>
    public async Task<IReadOnlyList<HotelListing>> ListAsync(HotelSearchRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        EnsureConfigured();
        var page = await QueryAsync<PropertiesResponse>(AreaQuery(request, null), cancellationToken).ConfigureAwait(false);
        return
        [
            .. InRadius(page?.Properties ?? [], request)
                .Where(p => !string.IsNullOrWhiteSpace(p.PropertyToken) && !string.IsNullOrWhiteSpace(p.Name))
                .DistinctBy(p => p.PropertyToken)
                .Select(p => new HotelListing(
                    p.PropertyToken!,
                    p.Name!.Trim(),
                    NullIfEmpty(p.Address),
                    p.GpsCoordinates?.Latitude,
                    p.GpsCoordinates?.Longitude,
                    Rating(p.OverallRating),
                    p.Reviews is > 0 ? p.Reviews : null,
                    p.ExtractedHotelClass is > 0 ? p.ExtractedHotelClass : null,
                    Photo(p),
                    HotelBookingLinks.BookingCom(p.Name.Trim(), request.Place, request),
                    HotelBookingLinks.Google(p.Name.Trim(), request.Place, request.Checkin, request.Checkout))),
        ];
    }

    private HotelSearchResult ToResult(PropertiesResponse? page, HotelSearchRequest request)
    {
        var offers = InRadius(page?.Properties ?? [], request)
            .Select(p => ToOffer(p, request, _options.Currency))
            .OfType<HotelOffer>()
            .DistinctBy(o => o.HotelId)
            .OrderBy(o => o.TotalPrice)
            .ToList();

        string? next = null;
        if (!string.IsNullOrEmpty(page?.SerpapiPagination?.NextPageToken))
        {
            next = Guid.NewGuid().ToString("N");
            cache.Set(PageKey(next), new Page(request, page.SerpapiPagination.NextPageToken), PageDuration);
        }

        return new HotelSearchResult(offers, false, clock.GetUtcNow(), next);
    }

    /// <summary>Google sucht per Text im ganzen Ort – Hotels außerhalb des gewählten Umkreises fallen weg.</summary>
    private static IEnumerable<PropertyData> InRadius(IEnumerable<PropertyData> properties, HotelSearchRequest request) =>
        request.Center is not { } center
            ? properties
            : properties.Where(p =>
                p.GpsCoordinates?.Latitude is not { } lat || p.GpsCoordinates.Longitude is not { } lng ||
                Coordinates.TryCreate(lat, lng) is not { } at ||
                GeoMath.DistanceKm(center, at) * 1000 <= request.RadiusMeters);

    internal static HotelOffer? ToOffer(PropertyData p, HotelSearchRequest request, string currency = "EUR")
    {
        if (string.IsNullOrWhiteSpace(p.PropertyToken) || string.IsNullOrWhiteSpace(p.Name))
        {
            return null;
        }

        var nights = Math.Max(1, request.Nights);
        decimal? Total(RateData? total, RateData? perNight) =>
            total?.ExtractedLowest is > 0 ? total.ExtractedLowest : perNight?.ExtractedLowest is > 0 ? perNight.ExtractedLowest * nights : null;

        // Preise der einzelnen Anbieter (Booking.com, Expedia, Hotelseite …) – günstigster zuerst.
        var rooms = (p.FeaturedPrices ?? []).Concat(p.Prices ?? [])
            .Where(x => !string.IsNullOrWhiteSpace(x.Source))
            .Select(x => (Source: x.Source!.Trim(), Price: Total(x.TotalRate, x.RatePerNight), x.FreeCancellation, x.Official))
            .Where(x => x.Price is > 0)
            .OrderBy(x => x.Price)
            .DistinctBy(x => x.Source, StringComparer.OrdinalIgnoreCase)
            .Take(MaxPricesPerHotel)
            .Select(x => new RoomOffer(
                x.Official == true ? $"{x.Source} (Hotelseite)" : x.Source,
                null,
                x.FreeCancellation == true,
                decimal.Round(x.Price!.Value, 2),
                currency,
                null,
                null,
                null))
            .ToList();

        var total = Total(p.TotalRate, p.RatePerNight) ?? rooms.FirstOrDefault()?.TotalPrice;
        if (total is not > 0)
        {
            return null;
        }

        var price = decimal.Round(total.Value, 2);
        if (rooms.Count == 0 || rooms[0].TotalPrice > price)
        {
            rooms.Insert(0, new RoomOffer("Google Hotels", null, false, price, currency, null, null, null));
        }

        var name = p.Name.Trim();
        var cheapest = rooms[0];
        return new HotelOffer(
            p.PropertyToken,
            name,
            NullIfEmpty(p.Address),
            p.GpsCoordinates?.Latitude,
            p.GpsCoordinates?.Longitude,
            Rating(p.OverallRating),
            p.Reviews is > 0 ? p.Reviews : null,
            p.ExtractedHotelClass is > 0 ? p.ExtractedHotelClass : null,
            Photo(p),
            cheapest.TotalPrice,
            currency,
            cheapest.Name,
            null,
            cheapest.Refundable,
            HotelBookingLinks.BookingCom(name, request.Place, request),
            HotelBookingLinks.Google(name, request.Place, request.Checkin, request.Checkout),
            null,
            null,
            null,
            rooms);
    }

    /// <summary>Google bewertet 1–5, die App (wie Booking) 0–10.</summary>
    private static double? Rating(double? overall) => overall is > 0 ? Math.Round(overall.Value * 2, 1) : null;

    private static string? Photo(PropertyData p) =>
        p.Images?.Select(i => NullIfEmpty(i.OriginalImage) ?? NullIfEmpty(i.Thumbnail)).FirstOrDefault(i => i is not null);

    internal List<KeyValuePair<string, string>> AreaQuery(HotelSearchRequest request, string? pageToken)
    {
        var place = request.Place ?? (request.Center is { } c
            ? string.Create(CultureInfo.InvariantCulture, $"{c.Latitude:F4},{c.Longitude:F4}")
            : "Hotel");
        var query = BaseQuery(request, $"Hotels {place}");
        if (pageToken is not null)
        {
            query.Add(new("next_page_token", pageToken));
        }

        return query;
    }

    internal List<KeyValuePair<string, string>> DetailsQuery(HotelSearchRequest request, string propertyToken)
    {
        var query = BaseQuery(request, request.Place ?? "Hotel");
        query.Add(new("property_token", propertyToken));
        return query;
    }

    private List<KeyValuePair<string, string>> BaseQuery(HotelSearchRequest request, string q) =>
    [
        new("engine", "google_hotels"),
        new("q", q),
        new("check_in_date", request.Checkin.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
        new("check_out_date", request.Checkout.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
        new("adults", request.Adults.ToString(CultureInfo.InvariantCulture)),
        new("currency", _options.Currency),
        new("hl", _options.Language),
        new("gl", _options.Country),
    ];

    private async Task<T?> QueryAsync<T>(List<KeyValuePair<string, string>> query, CancellationToken cancellationToken)
        where T : class, IErrorResponse
    {
        var cacheKey = "serpapi:hotels:" + string.Join('&', query.Select(p => $"{p.Key}={p.Value}"));
        if (cache.TryGetValue(cacheKey, out T? cached) && cached is not null)
        {
            return cached;
        }

        var url = "search.json?" + string.Join('&', query.Append(new("api_key", _options.ApiKey!))
            .Select(p => $"{p.Key}={Uri.EscapeDataString(p.Value)}"));
        T? body;
        try
        {
            using var response = await http.GetAsync(url, cancellationToken).ConfigureAwait(false);
            var text = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            SerpApiAccount.ForgetQuota(cache);
            body = TryParse<T>(text);
            if (!response.IsSuccessStatusCode || body?.Error is not null)
            {
                if (IsNoResults(body?.Error ?? text))
                {
                    return null;
                }

                ThrowForError(response.StatusCode, body?.Error ?? text);
            }
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            LogFailed(e);
            throw new HotelSearchUnavailableException("Google Hotels (SerpApi) ist gerade nicht erreichbar.", e);
        }

        if (body is not null)
        {
            cache.Set(cacheKey, body, CacheDuration);
        }

        return body;
    }

    private static T? TryParse<T>(string text)
        where T : class
    {
        try
        {
            return JsonSerializer.Deserialize<T>(text, SerpApiAccount.Json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool IsNoResults(string error) =>
        error.Contains("hasn't returned any results", StringComparison.OrdinalIgnoreCase);

    private void ThrowForError(HttpStatusCode status, string error)
    {
        if (status is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden || error.Contains("Invalid API key", StringComparison.OrdinalIgnoreCase))
        {
            throw new HotelSearchUnavailableException("SerpApi lehnt den API-Key ab. Ist er richtig hinterlegt (SerpApi:ApiKey)?");
        }

        if (status == HttpStatusCode.TooManyRequests || error.Contains("run out of searches", StringComparison.OrdinalIgnoreCase))
        {
            throw new HotelSearchUnavailableException("Die kostenlosen Google-Suchen für diesen Monat sind aufgebraucht.");
        }

        LogFailedStatus((int)status, error.Length > 300 ? error[..300] : error);
        throw new HotelSearchUnavailableException($"Google Hotels (SerpApi) hat mit einem Fehler geantwortet ({(int)status}).");
    }

    private void EnsureConfigured()
    {
        if (!IsConfigured)
        {
            throw new HotelSearchNotConfiguredException("Für die Hotelsuche fehlt der SerpApi-Key (siehe README, Abschnitt Flugsuche einrichten).");
        }
    }

    private static string PageKey(string id) => $"serpapi:hotels:page:{id}";

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    [LoggerMessage(Level = LogLevel.Warning, Message = "SerpApi-Hotelsuche antwortete mit {Status}: {Detail}")]
    private partial void LogFailedStatus(int status, string detail);

    [LoggerMessage(Level = LogLevel.Warning, Message = "SerpApi-Hotelsuche fehlgeschlagen")]
    private partial void LogFailed(Exception exception);

    private sealed record Page(HotelSearchRequest Request, string Token);
}

internal interface IErrorResponse
{
    string? Error { get; }
}

// Antwortformat von search.json?engine=google_hotels (nur die Felder, die wir brauchen).
internal sealed record PropertiesResponse(List<PropertyData>? Properties, PaginationData? SerpapiPagination, string? Error) : IErrorResponse;

internal sealed record PaginationData(string? NextPageToken);

/// <summary>Ein Hotel aus der Liste – oder die Detailantwort zu einem property_token (gleiche Felder, oben aufgelöst).</summary>
internal sealed record PropertyData(
    string? Name,
    string? Address,
    string? PropertyToken,
    GpsData? GpsCoordinates,
    RateData? RatePerNight,
    RateData? TotalRate,
    List<PriceData>? Prices,
    List<PriceData>? FeaturedPrices,
    int? ExtractedHotelClass,
    List<ImageData>? Images,
    double? OverallRating,
    int? Reviews,
    string? Error) : IErrorResponse;

internal sealed record GpsData(double? Latitude, double? Longitude);

internal sealed record RateData(decimal? ExtractedLowest);

internal sealed record PriceData(string? Source, bool? Official, RateData? RatePerNight, RateData? TotalRate, bool? FreeCancellation);

internal sealed record ImageData(string? Thumbnail, string? OriginalImage);
