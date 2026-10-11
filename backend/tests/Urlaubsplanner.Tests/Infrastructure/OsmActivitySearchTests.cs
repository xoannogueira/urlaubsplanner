using System.Net;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain.Activities;
using Urlaubsplanner.Infrastructure.Activities;

namespace Urlaubsplanner.Tests.Infrastructure;

public sealed class OsmActivitySearchTests
{
    // Aufbau wie bei Overpass („out center tags“): Knoten mit lat/lon, Wege mit center.
    private const string Overpass = """
        {
          "elements": [
            { "type": "way", "id": 1, "center": { "lat": 38.6979, "lon": -9.2063 },
              "tags": { "name": "Mosteiro dos Jerónimos", "tourism": "attraction", "historic": "monastery", "wikidata": "Q193131", "wikipedia": "pt:Mosteiro dos Jerónimos" } },
            { "type": "node", "id": 2, "lat": 38.6980, "lon": -9.2060,
              "tags": { "name": "Mosteiro dos Jerónimos", "tourism": "attraction", "wikidata": "Q193131" } },
            { "type": "way", "id": 3, "center": { "lat": 38.6916, "lon": -9.2160 },
              "tags": { "name": "Torre de Belém", "name:de": "Turm von Belém", "historic": "fort", "wikidata": "Q213366", "wikimedia_commons": "File:Torre de Belém.jpg" } },
            { "type": "node", "id": 4, "lat": 38.6955, "lon": -9.2085,
              "tags": { "name": "Museu Coleção Berardo", "tourism": "museum", "wikidata": "Q1053052", "fee": "no",
                        "opening_hours": "Tu-Su 10:00-19:00", "website": "https://www.museuberardo.pt" } },
            { "type": "node", "id": 5, "lat": 38.7010, "lon": -9.2000, "tags": { "name": "Miradouro do Restelo", "tourism": "viewpoint" } },
            { "type": "node", "id": 6, "lat": 38.7000, "lon": -9.2100, "tags": { "tourism": "viewpoint" } },
            { "type": "node", "id": 7, "lat": 38.7000, "lon": -9.2100, "tags": { "name": "Bank", "amenity": "bench" } }
          ]
        }
        """;

    // Aufbau wie bei der Wikidata-SPARQL-Schnittstelle (application/sparql-results+json).
    private const string Sparql = """
        {
          "head": { "vars": [ "item", "label", "desc", "descEn", "image", "links", "dewiki", "enwiki" ] },
          "results": { "bindings": [
            { "item": { "type": "uri", "value": "http://www.wikidata.org/entity/Q193131" },
              "label": { "xml:lang": "de", "type": "literal", "value": "Hieronymuskloster" },
              "desc": { "xml:lang": "de", "type": "literal", "value": "kloster in Lissabon, Portugal" },
              "image": { "type": "uri", "value": "http://commons.wikimedia.org/wiki/Special:FilePath/Jeronimos.jpg" },
              "links": { "datatype": "http://www.w3.org/2001/XMLSchema#integer", "type": "literal", "value": "60" },
              "dewiki": { "type": "uri", "value": "https://de.wikipedia.org/wiki/Hieronymitenkloster" } },
            { "item": { "type": "uri", "value": "http://www.wikidata.org/entity/Q193131" },
              "image": { "type": "uri", "value": "http://commons.wikimedia.org/wiki/Special:FilePath/Zweites.jpg" },
              "links": { "type": "literal", "value": "60" } },
            { "item": { "type": "uri", "value": "http://www.wikidata.org/entity/Q213366" },
              "descEn": { "xml:lang": "en", "type": "literal", "value": "fortified tower in Lisbon" },
              "links": { "type": "literal", "value": "80" },
              "enwiki": { "type": "uri", "value": "https://en.wikipedia.org/wiki/Bel%C3%A9m_Tower" } },
            { "item": { "type": "uri", "value": "http://www.wikidata.org/entity/Q1053052" },
              "links": { "type": "literal", "value": "10" } }
          ] }
        }
        """;

    private static readonly ActivitySearchRequest Request = ActivitySearchRequest.Create(38.6970, -9.2070, 3000);

    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<string> Calls { get; } = [];

        public string? OverpassQuery { get; private set; }

        public List<string> Hosts { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls.Add(request.RequestUri!.Host.StartsWith("overpass", StringComparison.Ordinal) ? "overpass.test" : request.RequestUri.Host);
            Hosts.Add(request.RequestUri.Host);
            if (request.RequestUri.Host.StartsWith("overpass", StringComparison.Ordinal))
            {
                OverpassQuery = Uri.UnescapeDataString((await request.Content!.ReadAsStringAsync(cancellationToken)).Replace('+', ' '));
            }

            return respond(request);
        }
    }

    private static HttpResponseMessage Json(string body) => new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static (OsmActivitySearch Search, FakeHandler Handler) Create(Func<HttpRequestMessage, HttpResponseMessage> respond)
    {
        var handler = new FakeHandler(respond);
        var settings = new ActivityOptions { WikidataSparqlUrl = "https://wikidata.test/sparql" };
        settings.OverpassUrls.Clear();
        settings.OverpassUrls.Add("https://overpass.test/api/interpreter");
        settings.OverpassUrls.Add("https://overpass2.test/api/interpreter");
        var options = Options.Create(settings);
        var search = new OsmActivitySearch(new HttpClient(handler), new MemoryCache(new MemoryCacheOptions()), options, TimeProvider.System, NullLogger<OsmActivitySearch>.Instance);
        return (search, handler);
    }

    private static HttpResponseMessage Both(HttpRequestMessage r) => Json(r.RequestUri!.Host.StartsWith("overpass", StringComparison.Ordinal) ? Overpass : Sparql);

    [Fact]
    public async Task Orte_werden_mit_Wikidata_angereichert_und_nach_Bekanntheit_sortiert()
    {
        var (search, handler) = Create(Both);

        var result = await search.SearchAsync(Request, CancellationToken.None);

        Assert.Equal(["Turm von Belém", "Mosteiro dos Jerónimos", "Museu Coleção Berardo", "Miradouro do Restelo"], result.Activities.Select(a => a.Name).ToArray());
        Assert.Equal(["overpass.test", "wikidata.test"], handler.Calls.ToArray());

        var torre = result.Activities[0];
        Assert.Equal(ActivityCategory.Castle, torre.Category);
        Assert.Equal(80, torre.Popularity);
        Assert.Equal("Fortified tower in Lisbon", torre.Description); // englisch, wenn es kein Deutsch gibt; großgeschrieben
        Assert.Equal("https://commons.wikimedia.org/wiki/Special:FilePath/Torre_de_Bel%C3%A9m.jpg?width=480", torre.ImageUrl); // OSM-Foto zuerst
        Assert.Equal("https://en.wikipedia.org/wiki/Bel%C3%A9m_Tower", torre.WikipediaUrl);
        Assert.Equal("way/3", torre.Id);

        var mosteiro = result.Activities[1];
        Assert.Equal(ActivityCategory.Sight, mosteiro.Category);
        Assert.Equal("Kloster in Lissabon, Portugal", mosteiro.Description);
        Assert.Equal("https://commons.wikimedia.org/wiki/Special:FilePath/Jeronimos.jpg?width=480", mosteiro.ImageUrl);
        Assert.Equal("https://de.wikipedia.org/wiki/Hieronymitenkloster", mosteiro.WikipediaUrl);
        Assert.Equal("way/1", mosteiro.Id); // Gebäude statt doppeltem Punkt

        var museum = result.Activities[2];
        Assert.Equal(ActivityCategory.Museum, museum.Category);
        Assert.Equal(true, museum.FreeEntry);
        Assert.Equal("Tu-Su 10:00-19:00", museum.OpeningHours);
        Assert.Equal("https://www.museuberardo.pt/", museum.Website);
        Assert.True(museum.DistanceKm is > 0.1 and < 0.3);

        Assert.Equal(0, result.Activities[3].Popularity);
    }

    [Fact]
    public async Task Abfrage_sucht_im_Umkreis_nach_den_Kategorien()
    {
        var (search, handler) = Create(Both);

        await search.SearchAsync(Request, CancellationToken.None);

        // Rechteck um ±3 km statt „around“ (schneller auf dem Server)
        Assert.Contains("[bbox:38.67005,-9.24153,38.72395,-9.17247]", handler.OverpassQuery, StringComparison.Ordinal);
        Assert.DoesNotContain("around", handler.OverpassQuery, StringComparison.Ordinal);
        Assert.Contains("museum", handler.OverpassQuery, StringComparison.Ordinal);
        Assert.Contains("[out:json]", handler.OverpassQuery, StringComparison.Ordinal);
        Assert.Contains("wd:Q193131 wd:Q213366 wd:Q1053052", OsmActivitySearch.BuildSparql(["Q193131", "Q213366", "Q1053052", "kaputt"]), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Ohne_Wikidata_gibt_es_trotzdem_Vorschlaege()
    {
        var (search, _) = Create(r => r.RequestUri!.Host == "overpass.test" ? Json(Overpass) : new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));


        var result = await search.SearchAsync(Request, CancellationToken.None);

        Assert.Equal(4, result.Activities.Count);
        Assert.All(result.Activities, a => Assert.Equal(0, a.Popularity));
        Assert.Equal("https://pt.wikipedia.org/wiki/Mosteiro_dos_Jer%C3%B3nimos", result.Activities.First(a => a.Id == "way/1").WikipediaUrl);
    }

    [Fact]
    public async Task Ausgelastete_OpenStreetMap_Server_werden_verstaendlich_gemeldet()
    {
        var (search, handler) = Create(_ => new HttpResponseMessage(HttpStatusCode.TooManyRequests));

        var e = await Assert.ThrowsAsync<ActivitySearchUnavailableException>(() => search.SearchAsync(Request, CancellationToken.None));
        Assert.Contains("ausgelastet", e.Message, StringComparison.Ordinal);
        Assert.Equal(["overpass.test", "overpass2.test"], handler.Hosts.ToArray()); // beide Server probiert
    }

    [Fact]
    public async Task Faellt_ein_Server_aus_springt_der_naechste_ein()
    {
        var (search, handler) = Create(r => r.RequestUri!.Host switch
        {
            "overpass.test" => new HttpResponseMessage(HttpStatusCode.GatewayTimeout),
            _ => Both(r),
        });

        var result = await search.SearchAsync(Request, CancellationToken.None);

        Assert.Equal(4, result.Activities.Count);
        Assert.Equal(["overpass.test", "overpass2.test", "wikidata.test"], handler.Hosts.ToArray());
    }

    [Fact]
    public async Task Zeitueberschreitung_mit_remark_gilt_als_Fehler()
    {
        const string timeout = """{ "elements": [], "remark": "runtime error: Query timed out in \"query\" at line 1 after 26 seconds." }""";
        var (search, _) = Create(r => r.RequestUri!.Host.StartsWith("overpass", StringComparison.Ordinal) ? Json(timeout) : Json(Sparql));

        var e = await Assert.ThrowsAsync<ActivitySearchUnavailableException>(() => search.SearchAsync(Request, CancellationToken.None));
        Assert.Contains("Zeitüberschreitung", e.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Ecken_des_Rechtecks_ausserhalb_des_Umkreises_fallen_weg()
    {
        var (search, _) = Create(Both);

        var result = await search.SearchAsync(ActivitySearchRequest.Create(38.6970, -9.2070, 600), CancellationToken.None);

        Assert.All(result.Activities, a => Assert.True(a.DistanceKm <= 0.6));
    }

    [Fact]
    public async Task Gleiche_Suche_kommt_aus_dem_Cache()
    {
        var (search, handler) = Create(Both);

        await search.SearchAsync(Request, CancellationToken.None);
        await search.SearchAsync(ActivitySearchRequest.Create(38.69701, -9.20702, 3000), CancellationToken.None);

        Assert.Equal(2, handler.Calls.Count);
    }

    [Fact]
    public async Task Gleichzeitige_gleiche_Suchen_fragen_OpenStreetMap_nur_einmal()
    {
        // Overpass antwortet erst, wenn wir es freigeben – so laufen alle Anfragen garantiert gleichzeitig.
        var release = new TaskCompletionSource();
        var overpassCalls = 0;
        var handler = new BlockingHandler(async r =>
        {
            if (r.RequestUri!.Host.StartsWith("overpass", StringComparison.Ordinal))
            {
                Interlocked.Increment(ref overpassCalls);
                await release.Task;
                return Json(Overpass);
            }

            return Json(Sparql);
        });
        var settings = new ActivityOptions { WikidataSparqlUrl = "https://wikidata.test/sparql" };
        settings.OverpassUrls.Clear();
        settings.OverpassUrls.Add("https://overpass.test/api/interpreter");
        var search = new OsmActivitySearch(new HttpClient(handler), new MemoryCache(new MemoryCacheOptions()), Options.Create(settings), TimeProvider.System, NullLogger<OsmActivitySearch>.Instance);

        using var abort = new CancellationTokenSource();
        var cancelled = search.SearchAsync(Request, abort.Token);
        var others = Enumerable.Range(0, 4).Select(_ => search.SearchAsync(Request, CancellationToken.None)).ToList();
        await abort.CancelAsync(); // z. B. Filter im Frontend gewechselt
        release.SetResult();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => cancelled);
        var results = await Task.WhenAll(others);
        Assert.Equal(1, overpassCalls);
        Assert.All(results, r => Assert.Equal(4, r.Activities.Count));

        // Danach kommt alles aus dem Cache.
        await search.SearchAsync(Request, CancellationToken.None);
        Assert.Equal(1, overpassCalls);
    }

    private sealed class BlockingHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => respond(request);
    }

    [Theory]
    [InlineData("pt:Torre de Belém", "https://pt.wikipedia.org/wiki/Torre_de_Bel%C3%A9m")]
    [InlineData("kaputt", null)]
    [InlineData("https://evil.example", null)]
    public void Wikipedia_Tag_wird_zum_Link(string tag, string? expected)
    {
        Assert.Equal(expected, OsmActivitySearch.WikipediaUrl(tag));
    }
}
