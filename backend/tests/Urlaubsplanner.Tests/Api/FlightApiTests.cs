using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Urlaubsplanner.Domain.Activities;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Tests.Api;

/// <summary>Flug- und Flughafen-Endpunkte mit einer Fake-Flugsuche und den echten Flughafendaten.</summary>
public sealed class FlightApiTests : IDisposable
{
    private readonly string _dataFile = Path.Combine(Path.GetTempPath(), "urlaubsplanner-tests", Guid.NewGuid().ToString("N"), "trips.json");
    private readonly FakeFlightSearch _flights = new();
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    /// <summary>Liefert pro Anfrage eine Direktverbindung; Porto ist 50 € günstiger, am 13.05. ist alles ausgebucht.</summary>
    private sealed class FakeFlightSearch : IFlightSearch
    {
        private readonly ConcurrentQueue<FlightSearchRequest> _requests = new();

        public string Provider => "liteapi";

        public bool IsConfigured { get; set; } = true;

        public IReadOnlyList<FlightSearchRequest> Requests => [.. _requests];

        public Task<FlightSearchResult> SearchAsync(FlightSearchRequest request, CancellationToken cancellationToken)
        {
            _requests.Enqueue(request);
            if (request.Legs[0].Date == new DateOnly(2027, 5, 13))
            {
                return Task.FromResult(new FlightSearchResult([], true, DateTimeOffset.UnixEpoch));
            }

            var legs = request.Legs.Select((l, i) =>
            {
                var departure = l.Date.ToDateTime(new TimeOnly(10, 0));
                var segment = new FlightSegment(l.Origin, null, l.Destination, null, departure, departure.AddHours(3), 180, "EW", "Eurowings", null, $"{2600 + i}", null);
                return new FlightJourneyLeg(l.Origin, l.Destination, departure, departure.AddHours(3), 180, 0, [segment]);
            }).ToList();
            var price = request.Legs[0].Destination == "OPO" ? 400m : 450m;
            var fares = new List<FlightFare>
            {
                new("Light", "Economy", price, price / request.Adults, "EUR", 8, 0, null, false, false, null, 9),
                new("Standard", "Economy", price + 60, (price + 60) / request.Adults, "EUR", 8, 1, 23, false, true, 80, 9),
            };
            var journey = new FlightJourney(FlightSignature.Create(legs), legs, 360, fares, "https://www.kayak.de/", "https://www.google.com/");
            return Task.FromResult(new FlightSearchResult([journey], true, DateTimeOffset.UnixEpoch));
        }
    }

    private sealed class FakeActivitySearch : IActivitySearch
    {
        public ActivitySearchRequest? Last { get; private set; }

        public Task<ActivitySearchResult> SearchAsync(ActivitySearchRequest request, CancellationToken cancellationToken)
        {
            Last = request;
            var museum = new ActivitySuggestion(
                "node/4", "Museu Coleção Berardo", ActivityCategory.Museum, 38.6955, -9.2085, 0.2, "Kunstmuseum", null, null, null, "Tu-Su 10:00-19:00", true, 10, "Q1053052");
            return Task.FromResult(new ActivitySearchResult([museum], DateTimeOffset.UnixEpoch));
        }
    }

    private readonly FakeActivitySearch _activities = new();

    private sealed class FakePlaceSearch : IPlaceSearch
    {
        public Task<IReadOnlyList<Place>> SearchAsync(string query, Coordinates? near, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<Place>>([new Place("Lissabon", "Lissabon, Portugal", 38.7223, -9.1393, "city")]);
    }

    public FlightApiTests()
    {
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Storage:FilePath", _dataFile);
            builder.ConfigureTestServices(services => services.AddSingleton<IFlightSearch>(_flights).AddSingleton<IPlaceSearch>(new FakePlaceSearch()).AddSingleton<IActivitySearch>(_activities));
        });
        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
        var directory = Path.GetDirectoryName(_dataFile)!;
        if (Directory.Exists(directory))
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    private static async Task<JsonElement> ReadJson(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>())!;

    [Fact]
    public async Task Mehrere_Zielflughaefen_werden_einzeln_gesucht_und_zusammengefuehrt()
    {
        var response = await _client.PostAsJsonAsync("/api/flights/search", new
        {
            legs = new object[]
            {
                new { origins = new[] { "STR" }, destinations = new[] { "LIS", "OPO" }, date = "2027-05-12" },
                new { origins = new[] { "LIS" }, destinations = new[] { "STR" }, date = "2027-05-19" },
            },
            adults = 2,
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await ReadJson(response);
        Assert.Equal(2, body.GetProperty("requests").GetInt32());
        Assert.Equal(2, _flights.Requests.Count);
        var journeys = body.GetProperty("journeys");
        Assert.Equal(2, journeys.GetArrayLength());
        Assert.Equal(400, journeys[0].GetProperty("totalPrice").GetDecimal()); // Porto günstiger → zuerst
        Assert.Equal("Standard", journeys[0].GetProperty("fares")[1].GetProperty("family").GetString());
        Assert.Equal("EW", journeys[0].GetProperty("legs")[0].GetProperty("segments")[0].GetProperty("carrierCode").GetString());
        Assert.Equal(0, journeys[0].GetProperty("legs")[0].GetProperty("stops").GetInt32());
    }

    [Fact]
    public async Task Zu_viele_Kombinationen_liefern_Feldfehler()
    {
        var response = await _client.PostAsJsonAsync("/api/flights/search", new
        {
            legs = new[] { new { origins = new[] { "STR", "FRA", "MUC" }, destinations = new[] { "LIS", "OPO", "FAO" }, date = "2027-05-12" } },
            adults = 2,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await ReadJson(response)).GetProperty("errors").TryGetProperty("legs", out _));
        Assert.Empty(_flights.Requests);
    }

    [Fact]
    public async Task Ausweichdaten_verschieben_alle_Strecken_gemeinsam()
    {
        var body = await ReadJson(await _client.PostAsJsonAsync("/api/flights/alternatives", new
        {
            legs = new[] { new { origin = "STR", destination = "LIS", date = "2027-05-12" }, new { origin = "OPO", destination = "STR", date = "2027-05-19" } },
            adults = 2,
        }));

        Assert.Equal(6, body.GetProperty("requests").GetInt32());
        var windows = body.GetProperty("windows");
        Assert.Equal(-3, windows[0].GetProperty("shiftDays").GetInt32());
        Assert.Equal("2027-05-09", windows[0].GetProperty("dates")[0].GetString());
        Assert.Equal("2027-05-16", windows[0].GetProperty("dates")[1].GetString());
        var plusOne = windows[3];
        Assert.Equal(1, plusOne.GetProperty("shiftDays").GetInt32());
        Assert.Equal(JsonValueKind.Null, plusOne.GetProperty("cheapestPrice").ValueKind); // 13.05. ausgebucht
        Assert.Equal(450, windows[0].GetProperty("cheapestPrice").GetDecimal());
    }

    [Fact]
    public async Task Gemerkter_Flug_wird_mit_Tarif_neu_geprueft()
    {
        var available = await ReadJson(await _client.PostAsJsonAsync("/api/flights/recheck", new
        {
            signature = "STR-LIS@2027-05-12:EW2600|LIS-STR@2027-05-19:EW2601#Standard",
            adults = 2,
        }));
        Assert.True(available.GetProperty("available").GetBoolean());
        Assert.Equal("Standard", available.GetProperty("fare").GetProperty("family").GetString());
        Assert.Equal(510, available.GetProperty("fare").GetProperty("totalPrice").GetDecimal());

        var gone = await ReadJson(await _client.PostAsJsonAsync("/api/flights/recheck", new
        {
            signature = "STR-LIS@2027-05-12:LH1234|LIS-STR@2027-05-19:EW2601",
            adults = 2,
        }));
        Assert.False(gone.GetProperty("available").GetBoolean());
        Assert.Equal(1, gone.GetProperty("alternatives").GetInt32());

        var broken = await _client.PostAsJsonAsync("/api/flights/recheck", new { signature = "kaputt", adults = 2 });
        Assert.Equal(HttpStatusCode.BadRequest, broken.StatusCode);
    }

    [Fact]
    public async Task Flugsuche_ohne_Key_meldet_nicht_eingerichtet()
    {
        _flights.IsConfigured = false;

        var status = await ReadJson(await _client.GetAsync("/api/flights/status"));
        Assert.False(status.GetProperty("configured").GetBoolean());
        Assert.Equal("liteapi", status.GetProperty("provider").GetString());
        Assert.False(status.GetProperty("stepwise").GetBoolean());
        var response = await _client.PostAsJsonAsync("/api/flights/search", new
        {
            legs = new[] { new { origins = new[] { "STR" }, destinations = new[] { "LIS" }, date = "2027-05-12" } },
            adults = 2,
        });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("urn:urlaubsplanner:flight-search-not-configured", (await ReadJson(response)).GetProperty("type").GetString());
    }

    [Fact]
    public async Task Flughafensuche_findet_auch_ueber_deutsche_Ortsnamen()
    {
        var direct = await ReadJson(await _client.GetAsync("/api/airports?q=STR"));
        Assert.Equal("STR", direct[0].GetProperty("code").GetString());

        var viaPlace = await ReadJson(await _client.GetAsync("/api/airports?q=Lissabon"));
        var lis = viaPlace.EnumerateArray().First(a => a.GetProperty("code").GetString() == "LIS");
        Assert.Equal("Lissabon", lis.GetProperty("near").GetString());
        Assert.True(lis.GetProperty("distanceKm").GetDouble() < 10);
    }

    [Fact]
    public async Task Flughaefen_im_Umkreis_und_nach_Code()
    {
        var near = await ReadJson(await _client.GetAsync("/api/airports/near?lat=41.15&lon=-8.61&radiusKm=100"));
        Assert.Equal("OPO", near[0].GetProperty("code").GetString());

        var lookup = await ReadJson(await _client.GetAsync("/api/airports/lookup?codes=STR,lis,XXX"));
        Assert.Equal(2, lookup.GetArrayLength());
    }

    [Fact]
    public async Task Aktivitaeten_Vorschlaege_mit_Kategorie_und_begrenztem_Umkreis()
    {
        var body = await ReadJson(await _client.GetAsync("/api/activities?lat=38.6970&lon=-9.2070&radiusMeters=999999&offset=0&limit=10&category=Museum&sort=Distance"));

        Assert.Equal("Museum", body.GetProperty("activities")[0].GetProperty("category").GetString());
        Assert.Equal(1, body.GetProperty("total").GetInt32());
        Assert.Equal("Museum", body.GetProperty("categories")[0].GetProperty("category").GetString());
        Assert.Equal(50000, body.GetProperty("radiusMeters").GetInt32());
        Assert.Equal(50000, _activities.Last!.RadiusMeters);

        var missing = await _client.GetAsync("/api/activities");
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
    }

    [Fact]
    public async Task Vorschlag_laesst_sich_als_Aktivitaet_merken()
    {
        var trip = await ReadJson(await _client.PostAsJsonAsync("/api/trips", new { name = "Portugal", travelers = 2 }));
        var id = trip.GetProperty("id").GetString();

        var response = await _client.PostAsJsonAsync($"/api/trips/{id}/options", new { kind = "Activity", title = "Museu Coleção Berardo", provider = "osm", externalId = "node/4" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("osm", (await ReadJson(response)).GetProperty("options")[0].GetProperty("provider").GetString());
    }
}
