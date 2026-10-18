using System.Net.Sockets;
using System.Security.Authentication;
using Microsoft.Extensions.Configuration;
using Urlaubsplanner.Api.Desktop;

namespace Urlaubsplanner.Tests.Desktop;

public sealed class ConnectivityCheckTests
{
    [Fact]
    public void Fehler_werden_verstaendlich_erklaert()
    {
        Assert.Contains("Antivirenprogramm", ConnectivityCheck.Explain(new HttpRequestException("ssl", new AuthenticationException("cert"))), StringComparison.Ordinal);
        Assert.Contains("Firewall", ConnectivityCheck.Explain(new HttpRequestException("x", new SocketException((int)SocketError.ConnectionRefused))), StringComparison.Ordinal);
        Assert.Contains("DNS", ConnectivityCheck.Explain(new HttpRequestException("x", new SocketException((int)SocketError.HostNotFound))), StringComparison.Ordinal);
        Assert.Contains("Zeitüberschreitung", ConnectivityCheck.Explain(new TaskCanceledException()), StringComparison.Ordinal);
    }

    [Fact]
    public void Ziele_folgen_der_Konfiguration()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Places:PhotonUrl"] = "http://127.0.0.1:5099", ["Transit:BaseUrl"] = "http://127.0.0.1:5095/" })
            .Build();
        var targets = ConnectivityCheck.Targets(config);
        Assert.Equal("http://127.0.0.1:5099/api?q=Berlin&limit=1", targets[0].Url);
        Assert.Contains(targets, t => t.Url == "http://127.0.0.1:5095/");
        Assert.Equal(6, targets.Count);
    }

    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            request.RequestUri!.Host == "tiles.openfreemap.org"
                ? throw new HttpRequestException("blocked", new SocketException((int)SocketError.AccessDenied))
                : Task.FromResult(respond(request));
    }

    [Fact]
    public async Task Erreichbar_und_blockiert_werden_unterschieden()
    {
        using var http = new HttpClient(new Handler(_ => new HttpResponseMessage(System.Net.HttpStatusCode.NotFound)));
        var results = await ConnectivityCheck.RunAsync(http, new ConfigurationBuilder().Build(), CancellationToken.None);

        Assert.Equal(5, results.Count(r => r.Ok));
        var maps = Assert.Single(results, r => !r.Ok);
        Assert.Equal("tiles.openfreemap.org", maps.Url);
        Assert.Contains("blockiert", maps.Problem!, StringComparison.Ordinal);
    }
}
