using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Infrastructure.Travelpayouts;

namespace Urlaubsplanner.Tests.Infrastructure;

public sealed class TravelpayoutsFaresTests
{
    // So antwortet month-matrix (gekürzt): ein Eintrag pro Abflugtag, auch Tage aus anderen Monaten kommen vor.
    private const string Matrix = """
        { "success": true, "data": [
          { "depart_date": "2026-12-07", "value": 23, "number_of_changes": 0, "origin": "FRA", "destination": "BCN", "found_at": "2026-10-21T08:00:00+04:00", "actual": true },
          { "depart_date": "2026-12-09", "value": 15, "number_of_changes": 0, "actual": false },
          { "depart_date": "2026-12-04", "value": 58.5, "number_of_changes": 1 },
          { "depart_date": "2027-01-02", "value": 99, "number_of_changes": 0 },
          { "depart_date": "kaputt", "value": 10 }
        ] }
        """;

    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<HttpRequestMessage> Calls { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls.Add(request);
            return Task.FromResult(respond(request));
        }
    }

    private sealed class Monitor(TravelpayoutsOptions value) : IOptionsMonitor<TravelpayoutsOptions>
    {
        public TravelpayoutsOptions CurrentValue => value;

        public TravelpayoutsOptions Get(string? name) => value;

        public IDisposable? OnChange(Action<TravelpayoutsOptions, string?> listener) => null;
    }

    private static HttpResponseMessage Json(string body, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static (TravelpayoutsFares Fares, Handler Handler) Create(Func<HttpRequestMessage, HttpResponseMessage> respond, string? token = "geheim")
    {
        var handler = new Handler(respond);
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://travelpayouts.test/") };
        return (new TravelpayoutsFares(http, new Monitor(new TravelpayoutsOptions { Token = token })), handler);
    }

    [Fact]
    public async Task Liest_Tagespreise_des_Monats_und_schickt_den_Token_nur_im_Header()
    {
        var (fares, handler) = Create(_ => Json(Matrix));
        var result = await fares.MonthAsync("FRA", "BCN", new DateOnly(2026, 12, 15), CancellationToken.None);

        Assert.Equal([new DateOnly(2026, 12, 4), new DateOnly(2026, 12, 7)], result.Select(f => f.Date));
        Assert.Equal(58.5m, result[0].Price);
        Assert.Equal(1, result[0].Stops);
        var call = Assert.Single(handler.Calls);
        Assert.Equal("geheim", call.Headers.GetValues("X-Access-Token").Single());
        Assert.DoesNotContain("geheim", call.RequestUri!.ToString(), StringComparison.Ordinal);
        Assert.Contains("month=2026-12-01", call.RequestUri.Query, StringComparison.Ordinal);
        Assert.Contains("market=de", call.RequestUri.Query, StringComparison.Ordinal);
        Assert.Contains("limit=31", call.RequestUri.Query, StringComparison.Ordinal);
        Assert.Equal(new DateOnly(2026, 10, 21), result[1].Found); // nicht mehr gültiges Angebot (9.12.) fehlt
    }

    // So antwortet prices_for_dates für einen Tag (gekürzt, wie im Test mit echtem Token).
    private const string Day = """
        { "success": true, "data": [
          { "departure_at": "2026-12-14T06:45:00+01:00", "price": 43, "airline": "EW", "flight_number": 2520, "transfers": 0, "duration_to": 110,
            "link": "/search/STR1412BCN1?t=EW1797&search_date=21102026&expected_price=43" },
          { "departure_at": "2026-12-14T17:15:00+01:00", "price": 61, "airline": "VY", "flight_number": "1209", "transfers": 0, "duration": 120,
            "link": "https://boese.example/weiter" },
          { "departure_at": "2026-12-15T06:45:00+01:00", "price": 30, "airline": "EW", "flight_number": 2520, "transfers": 0 }
        ] }
        """;

    [Fact]
    public async Task Konkreter_Flug_eines_Tages_mit_Link_zu_Aviasales()
    {
        var (fares, handler) = Create(_ => Json(Day));
        var flights = await fares.DayAsync("STR", "BCN", new DateOnly(2026, 12, 14), CancellationToken.None);

        Assert.Equal(2, flights.Count); // anderer Tag fällt raus
        var first = flights[0];
        Assert.Equal("2026-12-14T06:45", first.Departure);
        Assert.Equal(("EW", "2520", 0, 110), (first.Airline, first.FlightNumber, first.Stops, first.DurationMinutes));
        Assert.StartsWith("https://www.aviasales.com/search/STR1412BCN1", first.Link, StringComparison.Ordinal);
        Assert.Equal(new DateOnly(2026, 10, 21), first.Found);
        Assert.Null(flights[1].Link); // fremde Adressen werden nicht übernommen
        Assert.Contains("departure_at=2026-12-14", handler.Calls[0].RequestUri!.Query, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, "{}", IndicativeSourceState.Rejected)]
    [InlineData(HttpStatusCode.OK, """{ "success": false, "error": "Unauthorized: invalid token" }""", IndicativeSourceState.Rejected)]
    [InlineData(HttpStatusCode.TooManyRequests, "{}", IndicativeSourceState.Limited)]
    [InlineData(HttpStatusCode.BadGateway, "", IndicativeSourceState.Unreachable)]
    public async Task Pruefung_erkennt_ungueltigen_Token_und_Stoerungen(HttpStatusCode status, string body, IndicativeSourceState expected)
    {
        var (fares, _) = Create(_ => Json(body, status));
        Assert.Equal(expected, await fares.CheckAsync(CancellationToken.None));
    }

    [Fact]
    public async Task Ohne_Token_wird_gar_nicht_gefragt()
    {
        var (fares, handler) = Create(_ => Json(Matrix), token: null);
        Assert.False(fares.IsConfigured);
        Assert.Equal(IndicativeSourceState.Missing, await fares.CheckAsync(CancellationToken.None));
        Assert.Empty(handler.Calls);
    }
}
