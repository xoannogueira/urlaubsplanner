using System.Net;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain.Hotels;
using Urlaubsplanner.Infrastructure.Hotels;
using Urlaubsplanner.Infrastructure.SerpApi;

namespace Urlaubsplanner.Tests.Infrastructure;

public sealed class SerpApiHotelSearchTests
{
    private static readonly DateOnly Today = new(2026, 10, 11);

    /// <summary>Lissabon, 3 Nächte, 4 Personen, 3 km Umkreis um die Baixa.</summary>
    private static readonly HotelSearchRequest Lissabon = HotelSearchRequest.Create(
        38.7105, -9.1365, 3000, new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 15), 4, 2, Today, "Lissabon");

    /// <summary>Drei Hotels im Format von SerpApi: eins mit Anbieterpreisen, eins nur mit Preis pro Nacht, eins ausgebucht, eins weit weg.</summary>
    private const string Properties = """
        {
          "properties": [
            {
              "type": "hotel",
              "name": "Hotel Miradouro",
              "property_token": "tok-miradouro",
              "gps_coordinates": { "latitude": 38.7139, "longitude": -9.1334 },
              "rate_per_night": { "lowest": "€204", "extracted_lowest": 204 },
              "total_rate": { "lowest": "€612", "extracted_lowest": 612 },
              "prices": [
                { "source": "Booking.com", "rate_per_night": { "extracted_lowest": 210 } },
                { "source": "Expedia", "rate_per_night": { "extracted_lowest": 204 } },
                { "source": "Booking.com", "rate_per_night": { "extracted_lowest": 230 } }
              ],
              "extracted_hotel_class": 4,
              "images": [ { "thumbnail": "https://img/thumb.jpg", "original_image": "https://img/big.jpg" } ],
              "overall_rating": 4.4,
              "reviews": 1873
            },
            {
              "name": "Casa Baixa",
              "property_token": "tok-baixa",
              "gps_coordinates": { "latitude": 38.7100, "longitude": -9.1380 },
              "rate_per_night": { "extracted_lowest": 150 },
              "overall_rating": 4.0
            },
            {
              "name": "Ausgebucht Palace",
              "property_token": "tok-voll",
              "gps_coordinates": { "latitude": 38.7110, "longitude": -9.1370 }
            },
            {
              "name": "Hotel Cascais",
              "property_token": "tok-cascais",
              "gps_coordinates": { "latitude": 38.6967, "longitude": -9.4207 },
              "total_rate": { "extracted_lowest": 300 }
            }
          ],
          "serpapi_pagination": { "next_page_token": "seite-2" }
        }
        """;

    private const string Details = """
        {
          "name": "Hotel Miradouro",
          "address": "Rua da Prata 1, Lissabon",
          "gps_coordinates": { "latitude": 38.7139, "longitude": -9.1334 },
          "featured_prices": [
            { "source": "Hotel Miradouro", "official": true, "total_rate": { "extracted_lowest": 590 }, "free_cancellation": true }
          ],
          "prices": [
            { "source": "Booking.com", "total_rate": { "extracted_lowest": 630 } }
          ],
          "overall_rating": 4.4
        }
        """;

    private sealed class FakeHandler(Func<Uri, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<Uri> Calls { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls.Add(request.RequestUri!);
            return Task.FromResult(respond(request.RequestUri!));
        }
    }

    private static HttpResponseMessage Json(string body, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static (SerpApiHotelSearch Search, FakeHandler Handler) Create(Func<Uri, HttpResponseMessage>? respond = null)
    {
        var handler = new FakeHandler(respond ?? (uri => Json(uri.Query.Contains("property_token", StringComparison.Ordinal) ? Details : Properties)));
        var search = new SerpApiHotelSearch(
            new HttpClient(handler) { BaseAddress = new Uri("https://serpapi.test/") },
            new MemoryCache(new MemoryCacheOptions()),
            Options.Create(new SerpApiOptions { ApiKey = "secret" }),
            TimeProvider.System,
            NullLogger<SerpApiHotelSearch>.Instance);
        return (search, handler);
    }

    private static string Query(Uri uri, string name) =>
        Uri.UnescapeDataString(uri.Query.TrimStart('?').Split('&').First(p => p.StartsWith(name + "=", StringComparison.Ordinal))[(name.Length + 1)..]);

    [Fact]
    public async Task Umkreissuche_liefert_Hotels_mit_Anbieterpreisen_im_Umkreis()
    {
        var (search, handler) = Create();

        var result = await search.SearchAsync(Lissabon, CancellationToken.None);

        Assert.False(result.Sandbox);
        Assert.NotNull(result.NextPage);
        Assert.Equal(["tok-baixa", "tok-miradouro"], result.Hotels.Select(h => h.HotelId));

        var baixa = result.Hotels[0];
        Assert.Equal(450m, baixa.TotalPrice); // 150 € × 3 Nächte
        Assert.Equal(8.0, baixa.Rating);

        var miradouro = result.Hotels[1];
        Assert.Equal(612m, miradouro.TotalPrice);
        Assert.Equal("Expedia", miradouro.RoomName);
        Assert.Equal(["Expedia", "Booking.com"], miradouro.Rooms.Select(r => r.Name));
        Assert.Equal(630m, miradouro.Rooms[1].TotalPrice);
        Assert.Equal(8.8, miradouro.Rating);
        Assert.Equal(1873, miradouro.ReviewCount);
        Assert.Equal(4, miradouro.Stars);
        Assert.Equal("https://img/big.jpg", miradouro.PhotoUrl);
        Assert.Contains("booking.com", miradouro.BookingUrl, StringComparison.Ordinal);

        var uri = Assert.Single(handler.Calls);
        Assert.Equal("google_hotels", Query(uri, "engine"));
        Assert.Equal("Hotels Lissabon", Query(uri, "q"));
        Assert.Equal("2027-05-12", Query(uri, "check_in_date"));
        Assert.Equal("4", Query(uri, "adults"));
        Assert.Equal("EUR", Query(uri, "currency"));
    }

    [Fact]
    public async Task Ausgebuchte_kommen_ohne_weitere_Suche_aus_dem_Cache()
    {
        var (search, handler) = Create();
        await search.SearchAsync(Lissabon, CancellationToken.None);

        var listed = await search.ListAsync(Lissabon, CancellationToken.None);

        Assert.Contains(listed, h => h.HotelId == "tok-voll");
        Assert.DoesNotContain(listed, h => h.HotelId == "tok-cascais");
        Assert.Single(handler.Calls);
    }

    [Fact]
    public async Task Weitere_Hotels_kommen_mit_dem_Seiten_Token()
    {
        var (search, handler) = Create();
        var first = await search.SearchAsync(Lissabon, CancellationToken.None);

        await search.NextPageAsync(first.NextPage!, CancellationToken.None);

        Assert.Equal("seite-2", Query(handler.Calls[^1], "next_page_token"));
        await Assert.ThrowsAsync<HotelSearchUnavailableException>(() => search.NextPageAsync("unbekannt", CancellationToken.None));
    }

    [Fact]
    public async Task Gemerktes_Hotel_wird_einzeln_mit_allen_Anbietern_geprueft()
    {
        var (search, handler) = Create();
        var request = HotelSearchRequest.ForHotels(["tok-miradouro"], new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 15), 4, 2, Today, "Hotel Miradouro");

        var result = await search.SearchAsync(request, CancellationToken.None);

        var hotel = Assert.Single(result.Hotels);
        Assert.Equal("tok-miradouro", hotel.HotelId);
        Assert.Equal(590m, hotel.TotalPrice);
        Assert.True(hotel.Refundable);
        Assert.Equal("Hotel Miradouro (Hotelseite)", hotel.RoomName);
        Assert.Equal("Rua da Prata 1, Lissabon", hotel.Address);
        Assert.Equal("tok-miradouro", Query(handler.Calls[0], "property_token"));
        Assert.Equal("Hotel Miradouro", Query(handler.Calls[0], "q"));
    }

    [Fact]
    public async Task Keine_Ergebnisse_ist_leer_Kontingent_aufgebraucht_ist_ein_Fehler()
    {
        var (empty, _) = Create(_ => Json("""{ "error": "Google Hotels hasn't returned any results for this query." }"""));
        Assert.Empty((await empty.SearchAsync(Lissabon, CancellationToken.None)).Hotels);

        var (used, _) = Create(_ => Json("""{ "error": "Your account has run out of searches." }""", HttpStatusCode.TooManyRequests));
        var error = await Assert.ThrowsAsync<HotelSearchUnavailableException>(() => used.SearchAsync(Lissabon, CancellationToken.None));
        Assert.Contains("aufgebraucht", error.Message, StringComparison.Ordinal);
    }
}
