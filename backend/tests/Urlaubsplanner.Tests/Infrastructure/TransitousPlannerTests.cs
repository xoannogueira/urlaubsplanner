using System.Net;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Urlaubsplanner.Domain.Places;
using Urlaubsplanner.Domain.Transit;
using Urlaubsplanner.Infrastructure.Transit;

namespace Urlaubsplanner.Tests.Infrastructure;

public sealed class TransitousPlannerTests
{
    // Aufbau wie die MOTIS-API v6 (/api/v6/plan): Zeiten in UTC, Zeitzone pro Halt.
    private const string Plan = """
        {
          "requestParameters": {}, "debugOutput": {},
          "from": { "name": "START", "lat": 48.78, "lon": 9.18 },
          "to": { "name": "END", "lat": 48.88, "lon": 2.36 },
          "direct": [],
          "itineraries": [
            {
              "id": "a", "duration": 11580, "transfers": 0,
              "startTime": "2027-05-12T06:43:00Z", "endTime": "2027-05-12T09:56:00Z",
              "legs": [
                {
                  "mode": "WALK", "duration": 420, "distance": 510.4,
                  "startTime": "2027-05-12T06:43:00Z", "endTime": "2027-05-12T06:50:00Z",
                  "from": { "name": "START", "lat": 48.78, "lon": 9.18 },
                  "to": { "name": "Stuttgart Hbf", "lat": 48.784, "lon": 9.182, "tz": "Europe/Berlin", "track": "9" },
                  "legGeometry": { "points": "", "precision": 6, "length": 0 }
                },
                {
                  "mode": "HIGHSPEED_RAIL", "duration": 11040, "distance": 620000,
                  "startTime": "2027-05-12T06:50:00Z", "endTime": "2027-05-12T09:54:00Z",
                  "displayName": "ICE 9576", "routeShortName": "9576", "headsign": "Paris Est", "agencyName": "DB Fernverkehr AG", "routeColor": "",
                  "from": { "name": "Stuttgart Hbf", "lat": 48.784, "lon": 9.182, "tz": "Europe/Berlin", "track": "9" },
                  "to": { "name": "Paris Est", "lat": 48.876, "lon": 2.359, "tz": "Europe/Paris", "track": "4" },
                  "intermediateStops": [ { "name": "Karlsruhe Hbf", "lat": 49, "lon": 8.4 }, { "name": "Strasbourg", "lat": 48.58, "lon": 7.73 } ],
                  "legGeometry": { "points": "", "precision": 6, "length": 0 }
                },
                {
                  "mode": "WALK", "duration": 120,
                  "startTime": "2027-05-12T09:54:00Z", "endTime": "2027-05-12T09:56:00Z",
                  "from": { "name": "Paris Est", "lat": 48.876, "lon": 2.359, "tz": "Europe/Paris" },
                  "to": { "name": "END", "lat": 48.88, "lon": 2.36 },
                  "legGeometry": { "points": "", "precision": 6, "length": 0 }
                }
              ]
            }
          ],
          "previousPageCursor": "EARLIER", "nextPageCursor": "LATER"
        }
        """;

    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<HttpRequestMessage> Calls { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls.Add(request);
            return Task.FromResult(respond(request));
        }
    }

    private static readonly TransitPlanRequest Request = new(
        Coordinates.TryCreate(48.78, 9.18)!.Value,
        Coordinates.TryCreate(48.88, 2.36)!.Value,
        new DateTimeOffset(2027, 5, 12, 8, 30, 0, TimeSpan.FromHours(2)),
        ArriveBy: false,
        Cursor: null);

    private static (TransitousPlanner Planner, FakeHandler Handler) Create(Func<HttpRequestMessage, HttpResponseMessage> respond)
    {
        var handler = new FakeHandler(respond);
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://transitous.test/") };
        return (new TransitousPlanner(http, new MemoryCache(new MemoryCacheOptions()), NullLogger<TransitousPlanner>.Instance), handler);
    }

    private static HttpResponseMessage Json(string body) => new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task Verbindung_mit_Zug_und_Fusswegen()
    {
        var (planner, _) = Create(_ => Json(Plan));
        var plan = await planner.PlanAsync(Request, CancellationToken.None);

        var trip = Assert.Single(plan.Itineraries);
        Assert.Equal(193, trip.DurationMinutes);
        Assert.Equal(0, trip.Transfers);
        Assert.Equal(new DateTimeOffset(2027, 5, 12, 6, 43, 0, TimeSpan.Zero), trip.Departure);
        Assert.Equal(["WALK", "HIGHSPEED_RAIL", "WALK"], trip.Legs.Select(l => l.Mode));

        var train = trip.Legs[1];
        Assert.Equal("ICE 9576", train.Line);
        Assert.Equal("Paris Est", train.Headsign);
        Assert.Equal("DB Fernverkehr AG", train.Agency);
        Assert.Equal(2, train.Stops);
        Assert.Equal("Europe/Berlin", train.From.TimeZone);
        Assert.Equal("9", train.From.Track);
        Assert.Equal("Europe/Paris", train.To.TimeZone);
        Assert.Null(train.Color);
        Assert.Equal(510, trip.Legs[0].DistanceMeters);

        Assert.Equal("EARLIER", plan.EarlierCursor);
        Assert.Equal("LATER", plan.LaterCursor);
    }

    [Fact]
    public async Task Anfrage_in_UTC_mit_Suchfenster_und_Cursor()
    {
        var (planner, handler) = Create(_ => Json(Plan));
        await planner.PlanAsync(Request with { Cursor = "abc=", ArriveBy = true }, CancellationToken.None);

        var url = handler.Calls.Single().RequestUri!.ToString();
        Assert.StartsWith("https://transitous.test/api/v6/plan?", url, StringComparison.Ordinal);
        Assert.Contains("fromPlace=48.780000,9.180000", url, StringComparison.Ordinal);
        Assert.Contains("toPlace=48.880000,2.360000", url, StringComparison.Ordinal);
        Assert.Contains("time=2027-05-12T06%3A30%3A00Z", url, StringComparison.Ordinal);
        Assert.Contains("arriveBy=true", url, StringComparison.Ordinal);
        Assert.Contains("pageCursor=abc%3D", url, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Gleiche_Suche_kommt_aus_dem_Speicher()
    {
        var (planner, handler) = Create(_ => Json(Plan));
        await planner.PlanAsync(Request, CancellationToken.None);
        await planner.PlanAsync(Request, CancellationToken.None);

        Assert.Single(handler.Calls);
    }

    [Fact]
    public async Task Fussweg_ohne_Bus_und_Bahn_kommt_mit()
    {
        const string walk = """
            { "direct": [ { "duration": 900, "transfers": 0, "startTime": "2027-05-12T06:30:00Z", "endTime": "2027-05-12T06:45:00Z",
              "legs": [ { "mode": "WALK", "duration": 900, "distance": 1100, "startTime": "2027-05-12T06:30:00Z", "endTime": "2027-05-12T06:45:00Z",
                "from": { "name": "START", "lat": 1, "lon": 1 }, "to": { "name": "END", "lat": 1.01, "lon": 1 } } ] } ],
              "itineraries": [], "previousPageCursor": "", "nextPageCursor": "" }
            """;
        var (planner, _) = Create(_ => Json(walk));
        var plan = await planner.PlanAsync(Request, CancellationToken.None);

        Assert.Equal("WALK", Assert.Single(Assert.Single(plan.Itineraries).Legs).Mode);
        Assert.Null(plan.LaterCursor);
    }

    [Fact]
    public async Task Ausfall_wird_verstaendlich_gemeldet()
    {
        var (planner, _) = Create(_ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
        await Assert.ThrowsAsync<TransitUnavailableException>(() => planner.PlanAsync(Request, CancellationToken.None));
    }
}
