using System.Net;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Infrastructure.Flights;
using Urlaubsplanner.Infrastructure.SerpApi;

namespace Urlaubsplanner.Tests.Infrastructure;

public sealed class SerpApiFlightSearchTests
{
    private static readonly DateOnly Today = new(2026, 10, 11);

    private static readonly FlightSearchRequest HinUndZurueck = FlightSearchRequest.Create(
        [new FlightLeg("STR", "LIS", new DateOnly(2027, 5, 12)), new FlightLeg("LIS", "STR", new DateOnly(2027, 5, 19))],
        2,
        CabinClass.Economy,
        Today);

    /// <summary>Hinflüge (ohne Token) und Rückflüge (mit departure_token), im Format von SerpApi.</summary>
    private const string Outbound = """
        {
          "search_metadata": { "status": "Success" },
          "best_flights": [
            {
              "flights": [
                { "departure_airport": { "name": "Stuttgart Airport", "id": "STR", "time": "2027-05-12 06:00" },
                  "arrival_airport": { "name": "Zurich Airport", "id": "ZRH", "time": "2027-05-12 07:00" },
                  "duration": 60, "airplane": "Airbus A220", "airline": "SWISS", "airline_logo": "https://logo/LX.png",
                  "travel_class": "Economy", "flight_number": "LX 1179" },
                { "departure_airport": { "name": "Zurich Airport", "id": "ZRH", "time": "2027-05-12 08:30" },
                  "arrival_airport": { "name": "Humberto Delgado Airport", "id": "LIS", "time": "2027-05-12 10:25" },
                  "duration": 175, "airline": "SWISS", "travel_class": "Economy", "flight_number": "LX 2084" }
              ],
              "layovers": [ { "duration": 90, "name": "Zurich Airport", "id": "ZRH" } ],
              "total_duration": 325,
              "price": 612,
              "type": "Round trip",
              "departure_token": "tok-lx"
            }
          ],
          "other_flights": [
            {
              "flights": [
                { "departure_airport": { "name": "Stuttgart Airport", "id": "STR", "time": "2027-05-12 9:15" },
                  "arrival_airport": { "name": "Humberto Delgado Airport", "id": "LIS", "time": "2027-05-12 11:50" },
                  "duration": 215, "airline": "Eurowings", "travel_class": "Economy", "flight_number": "EW 2604" }
              ],
              "total_duration": 215,
              "price": 540,
              "departure_token": "tok-ew"
            },
            { "flights": [], "price": 100, "departure_token": "kaputt" }
          ]
        }
        """;

    private const string Inbound = """
        {
          "best_flights": [
            {
              "flights": [
                { "departure_airport": { "id": "LIS", "time": "2027-05-19 22:40" },
                  "arrival_airport": { "id": "STR", "time": "2027-05-20 02:30" },
                  "duration": 170, "airline": "Eurowings", "flight_number": "EW 2605" }
              ],
              "total_duration": 170,
              "price": 560
            }
          ]
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

    private static (SerpApiFlightSearch Search, FakeHandler Handler) Create(Func<Uri, HttpResponseMessage>? respond = null)
    {
        var handler = new FakeHandler(respond ?? (uri => Json(uri.Query.Contains("departure_token", StringComparison.Ordinal) ? Inbound : Outbound)));
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://serpapi.test/") };
        var search = new SerpApiFlightSearch(
            http,
            new MemoryCache(new MemoryCacheOptions()),
            Options.Create(new SerpApiOptions { ApiKey = "secret" }),
            TimeProvider.System,
            NullLogger<SerpApiFlightSearch>.Instance);
        return (search, handler);
    }

    private static string Query(Uri uri, string name) =>
        Uri.UnescapeDataString(uri.Query.TrimStart('?').Split('&').First(p => p.StartsWith(name + "=", StringComparison.Ordinal))[(name.Length + 1)..]);

    [Fact]
    public async Task Hin_und_zurueck_liefert_erst_die_Hinfluege_mit_Gesamtpreis()
    {
        var (search, handler) = Create();

        var result = await search.SearchAsync(HinUndZurueck, CancellationToken.None);

        Assert.False(result.Sandbox);
        Assert.Equal(2, result.Journeys.Count);
        var cheapest = result.Journeys[0];
        Assert.Equal("STR-LIS@2027-05-12:EW2604", cheapest.Signature);
        Assert.Single(cheapest.Legs);
        Assert.NotNull(cheapest.Continuation);
        Assert.Equal(540m, cheapest.TotalPrice);
        Assert.Equal(270m, cheapest.Fares[0].PricePerAdult);
        Assert.Null(cheapest.Fares[0].CheckedBags);

        var swiss = result.Journeys[1];
        Assert.Equal("STR-LIS@2027-05-12:LX1179+LX2084", swiss.Signature);
        Assert.Equal(1, swiss.Legs[0].Stops);
        Assert.Equal(325, swiss.Legs[0].DurationMinutes);
        Assert.Equal("SWISS", swiss.Legs[0].Segments[0].CarrierName);

        var uri = Assert.Single(handler.Calls);
        Assert.Equal("1", Query(uri, "type"));
        Assert.Equal("STR", Query(uri, "departure_id"));
        Assert.Equal("2027-05-19", Query(uri, "return_date"));
        Assert.Equal("2", Query(uri, "adults"));
        Assert.Equal("EUR", Query(uri, "currency"));
        Assert.Equal("true", Query(uri, "show_hidden"));
        Assert.Equal("true", Query(uri, "deep_search"));
    }

    [Fact]
    public async Task Rueckfluege_kommen_mit_dem_gewaehlten_Hinflug_und_sind_dann_vollstaendig()
    {
        var (search, handler) = Create();
        var outbound = await search.SearchAsync(HinUndZurueck, CancellationToken.None);

        var result = await search.ContinueAsync(outbound.Journeys[0].Continuation!, CancellationToken.None);

        var journey = Assert.Single(result.Journeys);
        Assert.Null(journey.Continuation);
        Assert.Equal(2, journey.Legs.Count);
        Assert.Equal("STR-LIS@2027-05-12:EW2604|LIS-STR@2027-05-19:EW2605", journey.Signature);
        Assert.Equal(1, journey.Legs[1].DayChange);
        Assert.Equal(560m, journey.TotalPrice);
        Assert.Equal("tok-ew", Query(handler.Calls[^1], "departure_token"));
        Assert.Contains("kayak.de/flights/STR-LIS/2027-05-12/2027-05-19/2adults", journey.BookingUrl, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Gleiche_Suche_kommt_aus_dem_Cache()
    {
        var (search, handler) = Create();

        await search.SearchAsync(HinUndZurueck, CancellationToken.None);
        await search.SearchAsync(HinUndZurueck, CancellationToken.None);

        Assert.Single(handler.Calls);
    }

    [Fact]
    public async Task Mehrere_Flughaefen_gehen_in_einer_Suche_und_Gabelflug_als_Multi_City()
    {
        var (search, handler) = Create();
        var request = FlightQuery.Combine(
            [
                new FlightLegOptions(["STR", "FRA"], ["LIS"], new DateOnly(2027, 5, 12)),
                new FlightLegOptions(["OPO"], ["STR"], new DateOnly(2027, 5, 19)),
            ],
            1,
            CabinClass.Business,
            Today);

        await search.SearchAsync(request, CancellationToken.None);

        var uri = Assert.Single(handler.Calls);
        Assert.Equal("3", Query(uri, "type"));
        Assert.Equal("3", Query(uri, "travel_class"));
        Assert.Contains("\"departure_id\":\"STR,FRA\"", Query(uri, "multi_city_json"), StringComparison.Ordinal);
        Assert.Contains("\"departure_id\":\"OPO\"", Query(uri, "multi_city_json"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Gemerkter_Flug_wird_Schritt_fuer_Schritt_wiedergefunden()
    {
        var (search, handler) = Create();

        var (journey, first) = await search.FindAsync(HinUndZurueck, "STR-LIS@2027-05-12:EW2604|LIS-STR@2027-05-19:EW2605#Light", CancellationToken.None);

        Assert.NotNull(journey);
        Assert.Equal(560m, journey.TotalPrice);
        Assert.Equal(2, first.Journeys.Count);
        Assert.Equal(2, handler.Calls.Count);
    }

    [Fact]
    public async Task Nicht_mehr_angebotener_Flug_ergibt_null()
    {
        var (search, handler) = Create();

        var (journey, _) = await search.FindAsync(HinUndZurueck, "STR-LIS@2027-05-12:TP1234|LIS-STR@2027-05-19:EW2605", CancellationToken.None);

        Assert.Null(journey);
        Assert.Single(handler.Calls);
    }

    [Fact]
    public async Task Keine_Ergebnisse_ist_kein_Fehler_aufgebrauchtes_Kontingent_schon()
    {
        var (empty, _) = Create(_ => Json("""{ "error": "Google Flights hasn't returned any results for this query." }"""));
        Assert.Empty((await empty.SearchAsync(HinUndZurueck, CancellationToken.None)).Journeys);

        var (used, _) = Create(_ => Json("""{ "error": "Your account has run out of searches." }""", HttpStatusCode.TooManyRequests));
        var error = await Assert.ThrowsAsync<FlightSearchUnavailableException>(() => used.SearchAsync(HinUndZurueck, CancellationToken.None));
        Assert.Contains("aufgebraucht", error.Message, StringComparison.Ordinal);

        var (badKey, _) = Create(_ => Json("""{ "error": "Invalid API key." }""", HttpStatusCode.Unauthorized));
        await Assert.ThrowsAsync<FlightSearchUnavailableException>(() => badKey.SearchAsync(HinUndZurueck, CancellationToken.None));
    }

    [Fact]
    public async Task Abgelaufene_Auswahl_gibt_verstaendlichen_Fehler()
    {
        var (search, _) = Create();

        var error = await Assert.ThrowsAsync<FlightSearchUnavailableException>(() => search.ContinueAsync("unbekannt", CancellationToken.None));

        Assert.Contains("neu starten", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Kontingent_kommt_aus_der_Konto_Abfrage()
    {
        var (search, handler) = Create(_ => Json("""{ "searches_per_month": 250, "plan_searches_left": 243, "total_searches_left": 243 }"""));

        var quota = await search.GetQuotaAsync(CancellationToken.None);

        Assert.Equal(new SearchQuota(243, 250), quota);
        Assert.StartsWith("/account.json", handler.Calls[0].AbsolutePath, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("LH 1234", "LH", "1234")]
    [InlineData("U22604", "U2", "2604")]
    [InlineData("TP 1 075", "TP", "1075")]
    public void Flugnummer_wird_in_Airline_und_Nummer_zerlegt(string value, string carrier, string number)
    {
        Assert.Equal((carrier, number), SerpApiFlightSearch.SplitFlightNumber(value));
    }
}
