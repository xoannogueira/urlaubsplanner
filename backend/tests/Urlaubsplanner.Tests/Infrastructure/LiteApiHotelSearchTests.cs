using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain.Hotels;
using Urlaubsplanner.Infrastructure.Hotels;

namespace Urlaubsplanner.Tests.Infrastructure;

public sealed class LiteApiHotelSearchTests
{
    // Aufbau wie in der LiteAPI-Doku: Preise in "data", Hoteldaten in "hotels".
    private const string RatesResponse = """
        {
          "data": [
            {
              "hotelId": "lp1",
              "roomTypes": [
                {
                  "offerId": "o-teuer",
                  "offerRetailRate": { "amount": 980.5, "currency": "EUR" },
                  "rates": [ { "name": "Suite", "boardName": "Frühstück", "cancellationPolicies": { "refundableTag": "RFN" } } ]
                },
                {
                  "offerId": "o-guenstig",
                  "offerRetailRate": { "amount": 612.0, "currency": "EUR" },
                  "suggestedSellingPrice": { "amount": 655.5, "currency": "EUR", "source": "providerDirect" },
                  "rates": [ { "name": "Doppelzimmer", "boardName": "Nur Übernachtung", "cancellationPolicies": { "refundableTag": "NRFN" },
                    "retailRate": { "total": [ { "amount": 612, "currency": "EUR" } ],
                      "taxesAndFees": [ { "included": true, "description": "VAT", "amount": 40 }, { "included": false, "description": "City tax", "amount": "16.00" } ] } } ]
                },
                {
                  "offerId": "o-guenstig-doppelt",
                  "offerRetailRate": { "amount": 640.0, "currency": "EUR" },
                  "rates": [ { "name": "Doppelzimmer", "boardName": "Nur Übernachtung", "cancellationPolicies": { "refundableTag": "NRFN" } } ]
                }
              ]
            },
            {
              "hotelId": "lp2",
              "roomTypes": [
                {
                  "offerId": "o-zwei-zimmer",
                  "rates": [
                    { "name": "Zimmer A", "retailRate": { "total": [ { "amount": 300, "currency": "EUR" } ], "suggestedSellingPrice": [ { "amount": 320 } ] }, "cancellationPolicies": { "refundableTag": "RFN" } },
                    { "name": "Zimmer A", "retailRate": { "total": [ { "amount": 250, "currency": "EUR" } ], "suggestedSellingPrice": [ { "amount": 270 } ] } }
                  ]
                }
              ]
            },
            { "hotelId": "ohne-daten", "roomTypes": [ { "offerRetailRate": { "amount": 1, "currency": "EUR" } } ] }
          ],
          "hotels": [
            { "id": "lp1", "name": "Hotel Miradouro", "main_photo": "https://img.example/1.jpg", "address": "Rua A 1", "city_name": "Lissabon",
              "latitude": 38.7186, "longitude": -9.1317, "rating": 8.7, "stars": 4, "review_count": 1284 },
            { "id": "lp2", "name": "Casa do Tejo", "thumbnail": "https://img.example/2-thumb.jpg", "latitude": 38.71, "longitude": -9.13, "rating": 0 }
          ],
          "sandbox": true
        }
        """;

    private static readonly HotelSearchRequest Request = HotelSearchRequest.Create(
        38.72, -9.14, 3000, new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16), 4, 2, new DateOnly(2026, 10, 11));

    private sealed class FakeHandler(Func<HttpResponseMessage> respond) : HttpMessageHandler
    {
        public int Calls { get; private set; }

        public HttpRequestMessage? Last { get; private set; }

        public string? LastBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            Last = request;
            LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return respond();
        }
    }

    private static (LiteApiHotelSearch Search, FakeHandler Handler) Create(Func<HttpResponseMessage> respond, string? apiKey = "sand_test")
    {
        var handler = new FakeHandler(respond);
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://liteapi.test/v3.0/") };
        var options = Options.Create(new LiteApiOptions { ApiKey = apiKey });
        var search = new LiteApiHotelSearch(http, new MemoryCache(new MemoryCacheOptions()), options, TimeProvider.System, NullLogger<LiteApiHotelSearch>.Instance);
        return (search, handler);
    }

    private static HttpResponseMessage Json(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task Guenstigstes_Angebot_pro_Hotel_mit_Hoteldaten()
    {
        var (search, _) = Create(() => Json(RatesResponse));

        var result = await search.SearchAsync(Request, CancellationToken.None);

        Assert.True(result.Sandbox);
        Assert.Equal(2, result.Hotels.Count); // "ohne-daten" fehlt, weil es keine Hoteldaten gibt

        var casa = result.Hotels[0]; // nach Preis sortiert
        Assert.Equal("Casa do Tejo", casa.Name);
        Assert.Equal(550m, casa.TotalPrice); // Summe beider Zimmer
        Assert.Equal("https://img.example/2-thumb.jpg", casa.PhotoUrl);
        Assert.Null(casa.Rating); // 0 = keine Bewertung

        var miradouro = result.Hotels[1];
        Assert.Equal(612m, miradouro.TotalPrice);
        Assert.Equal("Doppelzimmer", miradouro.RoomName);
        Assert.Equal("Nur Übernachtung", miradouro.BoardName);
        Assert.False(miradouro.Refundable);
        Assert.Equal(8.7, miradouro.Rating);
        Assert.Equal(1284, miradouro.ReviewCount);
        Assert.Equal(4, miradouro.Stars);
        Assert.Contains("booking.com", miradouro.BookingUrl, StringComparison.Ordinal);
        Assert.Contains("Lissabon", Uri.UnescapeDataString(miradouro.BookingUrl), StringComparison.Ordinal);
        Assert.StartsWith("https://www.google.com/travel/search?q=", miradouro.GoogleUrl, StringComparison.Ordinal);
        Assert.Contains("&ts=", miradouro.GoogleUrl, StringComparison.Ordinal);

        // Zimmervarianten: Suite + Doppelzimmer; das zweite, teurere Doppelzimmer-Angebot fällt weg.
        Assert.Equal(["Doppelzimmer", "Suite"], miradouro.Rooms.Select(r => r.Name!).ToArray());
        Assert.Equal(655.5m, miradouro.MarketPrice);
        Assert.Equal(16m, miradouro.PayAtProperty); // nur die nicht enthaltene Kurtaxe
        Assert.Equal("City tax", miradouro.PayAtPropertyLabel);
        Assert.True(miradouro.Rooms[1].Refundable);
        Assert.Null(miradouro.Rooms[1].MarketPrice);

        Assert.Equal("2× Zimmer A", casa.RoomName);
        Assert.Equal(590m, casa.MarketPrice); // Summe pro Zimmer
        Assert.False(casa.Refundable); // nur ein Zimmer ist stornierbar
        Assert.Contains("Hotel Miradouro, Lissabon", Uri.UnescapeDataString(miradouro.GoogleUrl), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Suche_nach_IDs_schickt_hotelIds_statt_Ort()
    {
        var (search, handler) = Create(() => Json(RatesResponse));
        var request = HotelSearchRequest.ForHotels(["lp1", "lp2"], new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16), 2, 1, new DateOnly(2026, 10, 11));

        await search.SearchAsync(request, CancellationToken.None);

        using var body = JsonDocument.Parse(handler.LastBody!);
        var root = body.RootElement;
        Assert.False(root.TryGetProperty("latitude", out _));
        Assert.Equal(["lp1", "lp2"], root.GetProperty("hotelIds").EnumerateArray().Select(e => e.GetString()!).ToArray());
    }

    [Fact]
    public async Task Andere_Daten_werden_nicht_aus_dem_Cache_beantwortet()
    {
        var (search, handler) = Create(() => Json(RatesResponse));

        await search.SearchAsync(Request, CancellationToken.None);
        await search.SearchAsync(Request.WithDates(new DateOnly(2027, 5, 13), new DateOnly(2027, 5, 17)), CancellationToken.None);

        Assert.Equal(2, handler.Calls);
    }

    private const string ListResponse = """
        {
          "data": [
            { "id": "lp1", "name": "Hotel Miradouro", "main_photo": "https://img.example/1.jpg", "address": "Rua A 1", "city": "Lisbon",
              "latitude": 38.7186, "longitude": -9.1317, "rating": 8.7, "stars": 4, "reviewCount": 1284 },
            { "id": "lp9", "name": "  ", "latitude": 38.7, "longitude": -9.1 },
            { "id": "lp1", "name": "Doppelt" }
          ]
        }
        """;

    [Fact]
    public async Task Hotelliste_im_Umkreis_mit_Links_fuer_den_Zeitraum()
    {
        var (search, handler) = Create(() => Json(ListResponse));
        var small = HotelSearchRequest.Create(38.72, -9.14, 500, new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16), 4, 2, new DateOnly(2026, 10, 11));

        var hotels = await search.ListAsync(small, CancellationToken.None);

        var uri = handler.Last!.RequestUri!.ToString();
        Assert.StartsWith("https://liteapi.test/v3.0/data/hotels?latitude=38.72&longitude=-9.14&radius=1000", uri, StringComparison.Ordinal); // min. 1000 m
        var hotel = Assert.Single(hotels); // ohne Namen und doppelt fallen weg
        Assert.Equal("Hotel Miradouro", hotel.Name);
        Assert.Equal(1284, hotel.ReviewCount);
        Assert.Equal("https://img.example/1.jpg", hotel.PhotoUrl);
        Assert.Contains("checkin=2027-05-12", hotel.BookingUrl, StringComparison.Ordinal);

        await search.ListAsync(small, CancellationToken.None);
        Assert.Equal(1, handler.Calls); // Stammdaten kommen aus dem Cache
    }

    [Fact]
    public async Task Anfrage_enthaelt_Key_Ort_Daten_und_Zimmer()
    {
        var (search, handler) = Create(() => Json(RatesResponse));

        await search.SearchAsync(Request, CancellationToken.None);

        Assert.Equal("https://liteapi.test/v3.0/hotels/rates", handler.Last!.RequestUri!.ToString());
        Assert.Equal("sand_test", handler.Last.Headers.GetValues("X-API-Key").Single());
        using var body = JsonDocument.Parse(handler.LastBody!);
        var root = body.RootElement;
        Assert.Equal(38.72, root.GetProperty("latitude").GetDouble());
        Assert.Equal(3000, root.GetProperty("radius").GetInt32());
        Assert.Equal("2027-05-12", root.GetProperty("checkin").GetString());
        Assert.Equal("EUR", root.GetProperty("currency").GetString());
        Assert.Equal(2, root.GetProperty("occupancies").GetArrayLength());
        Assert.Equal(2, root.GetProperty("occupancies")[0].GetProperty("adults").GetInt32());
        Assert.Equal(10, root.GetProperty("maxRatesPerHotel").GetInt32()); // mehrere Zimmervarianten
    }

    [Fact]
    public async Task Gleiche_Suche_kommt_aus_dem_Cache()
    {
        var (search, handler) = Create(() => Json(RatesResponse));

        await search.SearchAsync(Request, CancellationToken.None);
        await search.SearchAsync(Request, CancellationToken.None);

        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task Keine_Verfuegbarkeit_liefert_leere_Liste()
    {
        var (search, _) = Create(() => new HttpResponseMessage(HttpStatusCode.NoContent));

        var result = await search.SearchAsync(Request, CancellationToken.None);

        Assert.Empty(result.Hotels);
    }

    [Fact]
    public async Task Abgelehnter_Key_wird_verstaendlich_gemeldet()
    {
        var (search, _) = Create(() => new HttpResponseMessage(HttpStatusCode.Unauthorized));

        var e = await Assert.ThrowsAsync<HotelSearchUnavailableException>(() => search.SearchAsync(Request, CancellationToken.None));
        Assert.Contains("API-Key", e.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Serverfehler_wird_als_nicht_erreichbar_gemeldet()
    {
        var (search, _) = Create(() => new HttpResponseMessage(HttpStatusCode.InternalServerError) { Content = new StringContent("boom") });

        await Assert.ThrowsAsync<HotelSearchUnavailableException>(() => search.SearchAsync(Request, CancellationToken.None));
    }

    [Fact]
    public async Task Zeitueberschreitung_wird_als_nicht_erreichbar_gemeldet()
    {
        var (search, _) = Create(() => throw new TaskCanceledException("timeout"));

        await Assert.ThrowsAsync<HotelSearchUnavailableException>(() => search.SearchAsync(Request, CancellationToken.None));
    }

    [Fact]
    public async Task Ohne_Key_wird_nicht_gesucht()
    {
        var (search, handler) = Create(() => Json(RatesResponse), apiKey: "  ");

        Assert.False(search.IsConfigured);
        await Assert.ThrowsAsync<HotelSearchNotConfiguredException>(() => search.SearchAsync(Request, CancellationToken.None));
        Assert.Equal(0, handler.Calls);
    }
}
