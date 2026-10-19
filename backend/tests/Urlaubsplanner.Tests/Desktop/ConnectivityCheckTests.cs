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
    public void Gescheitertes_Aushandeln_ist_kein_Zertifikatsproblem()
    {
        // So meldet es .NET auf dem Mac, wenn der Server nur TLS 1.3 spricht.
        var mac = new HttpRequestException("ssl", new AuthenticationException("Authentication failed", new InvalidOperationException("handshake failure")));
        Assert.Equal(ConnectivityCheck.Kinds.Encryption, ConnectivityCheck.Classify(mac).Kind);
        Assert.Contains("TLS 1.3", ConnectivityCheck.Explain(mac), StringComparison.Ordinal);

        var cert = new HttpRequestException("ssl", new AuthenticationException("The remote certificate is invalid because of errors in the certificate chain: UntrustedRoot"));
        Assert.Equal(ConnectivityCheck.Kinds.Certificate, ConnectivityCheck.Classify(cert).Kind);
    }

    [Fact]
    public void Ziele_folgen_der_Konfiguration()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Places:PhotonUrl"] = "http://127.0.0.1:5099", ["Transit:BaseUrl"] = "http://127.0.0.1:5095/" })
            .Build();
        var targets = ConnectivityCheck.Targets(config);
        Assert.Equal("http://127.0.0.1:5099/api?q=Berlin&limit=1", Assert.Single(targets[0].Urls));
        Assert.Contains(targets, t => t.Urls.Contains("http://127.0.0.1:5095/"));
        Assert.Equal(3, targets.Single(t => t.Name.StartsWith("Aktivitäten", StringComparison.Ordinal)).Urls.Count);
        Assert.Equal(6, targets.Count);
    }

    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            request.RequestUri!.Host switch
            {
                "tiles.openfreemap.org" => throw new HttpRequestException("blocked", new SocketException((int)SocketError.AccessDenied)),
                "overpass-api.de" => throw new HttpRequestException("ssl", new AuthenticationException("failed", new InvalidOperationException("handshake failure"))),
                _ => Task.FromResult(respond(request)),
            };
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
        Assert.Equal(ConnectivityCheck.Kinds.Blocked, maps.Kind);

        // Ein Overpass-Server scheitert, die anderen antworten: Dienst gilt als erreichbar, mit Hinweis.
        var activities = Assert.Single(results, r => r.Name.StartsWith("Aktivitäten", StringComparison.Ordinal));
        Assert.True(activities.Ok);
        Assert.NotEqual("overpass-api.de", activities.Url);
        Assert.Contains("overpass-api.de", activities.Note!, StringComparison.Ordinal);
        Assert.Contains("handshake failure", activities.Detail!, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Alle_Ausweichserver_kaputt_meldet_den_Fehler()
    {
        using var http = new HttpClient(new Handler(_ => new HttpResponseMessage(System.Net.HttpStatusCode.OK)));
        var results = await ConnectivityCheck.RunAsync(http, new ConfigurationBuilder().Build(), CancellationToken.None, ["https://overpass-api.de/api/interpreter"]);

        var activities = Assert.Single(results, r => r.Name.StartsWith("Aktivitäten", StringComparison.Ordinal));
        Assert.False(activities.Ok);
        Assert.Equal(ConnectivityCheck.Kinds.Encryption, activities.Kind);
    }
}
