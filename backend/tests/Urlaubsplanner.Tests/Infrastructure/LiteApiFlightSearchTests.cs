using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Infrastructure.Flights;
using Urlaubsplanner.Infrastructure.Hotels;

namespace Urlaubsplanner.Tests.Infrastructure;

public sealed class LiteApiFlightSearchTests
{
    private static readonly FlightSearchRequest Gabelflug = FlightSearchRequest.Create(
        [new FlightLeg("STR", "LIS", new DateOnly(2027, 5, 12)), new FlightLeg("OPO", "STR", new DateOnly(2027, 5, 19))],
        2,
        CabinClass.Economy,
        new DateOnly(2026, 10, 11));

    private sealed class FakeHandler(Func<HttpResponseMessage> respond) : HttpMessageHandler
    {
        public int Calls { get; private set; }

        public string? LastBody { get; private set; }

        public Uri? LastUri { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            LastUri = request.RequestUri;
            LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return respond();
        }
    }

    private static (LiteApiFlightSearch Search, FakeHandler Handler) Create(Func<HttpResponseMessage> respond)
    {
        var handler = new FakeHandler(respond);
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://liteapi.test/v3.0/") };
        var search = new LiteApiFlightSearch(
            http,
            new MemoryCache(new MemoryCacheOptions()),
            Options.Create(new LiteApiOptions { ApiKey = "sand_test" }),
            TimeProvider.System,
            NullLogger<LiteApiFlightSearch>.Instance);
        return (search, handler);
    }

    private static HttpResponseMessage Json(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task Echte_Antwort_wird_in_Strecken_Fluege_und_Tarife_zerlegt()
    {
        var (search, _) = Create(() => Json(LiteApiFlightFixture.Response));

        var result = await search.SearchAsync(Gabelflug, CancellationToken.None);

        Assert.True(result.Sandbox);
        Assert.Equal(2, result.Journeys.Count);

        var direct = result.Journeys[0]; // günstigste zuerst
        Assert.Equal(467.04m, direct.TotalPrice);
        Assert.Equal("STR-LIS@2027-05-12:EW2604|OPO-STR@2027-05-19:EW2713", direct.Signature);
        Assert.Equal(0, direct.Legs[0].Stops);
        Assert.Equal("Eurowings", direct.Legs[0].Segments[0].CarrierName);
        Assert.Equal(180, direct.Legs[0].DurationMinutes);
        Assert.Equal(new DateTime(2027, 5, 12, 14, 25, 0), direct.Legs[0].Departure);

        var fare = direct.Fares[0];
        Assert.Equal("Smart", fare.Family);
        Assert.Equal(233.52m, fare.PricePerAdult);
        Assert.Equal(8, fare.CabinBagKg);
        Assert.Equal(1, fare.CheckedBags);
        Assert.Equal(23, fare.CheckedBagKg);
        Assert.False(fare.Refundable);
        Assert.True(fare.Changeable);
        Assert.Equal(80m, fare.ChangeFee);
        Assert.Equal(["Smart", "Smart Flex"], direct.Fares.Select(f => f.Family).ToArray()); // je Tarif nur der günstigste

        var withStop = result.Journeys[1];
        Assert.Equal(1, withStop.Legs[0].Stops);
        Assert.Equal("STR", withStop.Legs[0].Origin);
        Assert.Equal("LIS", withStop.Legs[0].Destination);
        Assert.Equal(["STR", "HAM"], withStop.Legs[0].Segments.Select(s => s.Origin).ToArray());
        Assert.Equal(425, withStop.Legs[0].DurationMinutes);
        Assert.Equal(580, withStop.TotalMinutes);
        Assert.StartsWith("https://www.kayak.de/flights/STR-LIS/2027-05-12/OPO-STR/2027-05-19/2adults", withStop.BookingUrl, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Anfrage_enthaelt_Strecken_mit_Richtung_Personen_und_Klasse()
    {
        var (search, handler) = Create(() => Json(LiteApiFlightFixture.Response));

        await search.SearchAsync(Gabelflug, CancellationToken.None);

        Assert.Equal("https://liteapi.test/v3.0/flights/rates", handler.LastUri!.ToString());
        using var body = JsonDocument.Parse(handler.LastBody!);
        var legs = body.RootElement.GetProperty("legs");
        Assert.Equal("OPO", legs[1].GetProperty("origin").GetString());
        Assert.Equal("INBOUND", legs[1].GetProperty("direction").GetString());
        Assert.Equal("2027-05-19", legs[1].GetProperty("date").GetString());
        Assert.Equal(2, body.RootElement.GetProperty("adults").GetInt32());
        Assert.Equal("ECONOMY", body.RootElement.GetProperty("cabinClass").GetString());
    }

    [Fact]
    public async Task Gleiche_Suche_kommt_aus_dem_Cache()
    {
        var (search, handler) = Create(() => Json(LiteApiFlightFixture.Response));

        await search.SearchAsync(Gabelflug, CancellationToken.None);
        await search.SearchAsync(Gabelflug, CancellationToken.None);

        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task Abgelehnter_Key_und_Fehler_werden_gemeldet()
    {
        var (denied, _) = Create(() => new HttpResponseMessage(HttpStatusCode.Forbidden));
        var e = await Assert.ThrowsAsync<FlightSearchUnavailableException>(() => denied.SearchAsync(Gabelflug, CancellationToken.None));
        Assert.Contains("freigeschaltet", e.Message, StringComparison.Ordinal);

        var (broken, _) = Create(() => Json("{ kaputt"));
        await Assert.ThrowsAsync<FlightSearchUnavailableException>(() => broken.SearchAsync(Gabelflug, CancellationToken.None));
    }
}

public sealed class AirportDirectoryTests
{
    private static readonly AirportDirectory Directory = new();

    [Fact]
    public void Eingebettete_Daten_sind_vollstaendig()
    {
        Assert.True(Directory.Count > 3000);
        var str = Directory.Find("str");
        Assert.NotNull(str);
        Assert.Equal("Stuttgart", str.City);
        Assert.True(str.Major);
    }

    [Fact]
    public void Suche_nach_Code_Stadt_und_Stichwort()
    {
        Assert.Equal("LIS", Directory.Search("LIS", 5)[0].Code);
        Assert.Equal("LIS", Directory.Search("lisbon", 5)[0].Code);
        Assert.Contains(Directory.Search("Lisboa", 5), a => a.Code == "LIS"); // Stichwort
        Assert.Contains(Directory.Search("munchen", 5), a => a.Code == "MUC"); // ohne Umlaut
        Assert.Empty(Directory.Search("x", 5));
    }

    [Fact]
    public void Flughaefen_im_Umkreis_naechster_zuerst()
    {
        var near = Directory.Near(new Urlaubsplanner.Domain.Places.Coordinates(38.7223, -9.1393), 150, 5);

        Assert.Equal("LIS", near[0].Airport.Code);
        Assert.True(near[0].DistanceKm < 10);
        Assert.All(near, n => Assert.True(n.DistanceKm <= 150));
    }

    [Theory]
    [InlineData("Lisboa, Açores", "lisboa, acores")]
    [InlineData("Großraum", "grossraum")]
    public void Normalisiert_Akzente_und_Umlaute(string input, string expected)
    {
        Assert.Equal(expected, AirportDirectory.Normalize(input));
    }
}
