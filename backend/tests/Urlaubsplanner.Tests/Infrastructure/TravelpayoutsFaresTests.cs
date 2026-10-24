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
          { "depart_date": "2026-12-07", "value": 23, "number_of_changes": 0, "origin": "FRA", "destination": "BCN", "gate": "Ryanair" },
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
