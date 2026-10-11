using System.Net;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Urlaubsplanner.Domain.Places;
using Urlaubsplanner.Infrastructure.Places;

namespace Urlaubsplanner.Tests.Infrastructure;

public sealed class PhotonPlaceSearchTests
{
    private const string LisbonResponse = """
        {
          "type": "FeatureCollection",
          "features": [
            {
              "geometry": { "type": "Point", "coordinates": [-9.1365919, 38.7077507] },
              "properties": { "name": "Lissabon", "state": "Lissabon", "country": "Portugal", "osm_key": "place", "osm_value": "city", "type": "city" }
            },
            {
              "geometry": { "type": "Point", "coordinates": [-9.13, 38.71] },
              "properties": { "name": "Hotel Miradouro", "city": "Lissabon", "country": "Portugal", "osm_key": "tourism", "osm_value": "hotel", "type": "house" }
            },
            {
              "geometry": { "type": "Point", "coordinates": [1, 2] },
              "properties": { "country": "Ohne Namen" }
            }
          ]
        }
        """;

    private sealed class FakeHandler(Func<HttpResponseMessage> respond) : HttpMessageHandler
    {
        public int Calls { get; private set; }

        public Uri? LastUri { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            LastUri = request.RequestUri;
            return Task.FromResult(respond());
        }
    }

    private static (PhotonPlaceSearch Search, FakeHandler Handler) Create(Func<HttpResponseMessage> respond)
    {
        var handler = new FakeHandler(respond);
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://photon.test/") };
        var search = new PhotonPlaceSearch(http, new MemoryCache(new MemoryCacheOptions()), NullLogger<PhotonPlaceSearch>.Instance);
        return (search, handler);
    }

    private static HttpResponseMessage Json(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task Ergebnisse_werden_in_Orte_umgewandelt()
    {
        var (search, handler) = Create(() => Json(LisbonResponse));

        var places = await search.SearchAsync("Lissabon", null, CancellationToken.None);

        Assert.Equal(2, places.Count);
        var city = places[0];
        Assert.Equal("Lissabon", city.Name);
        Assert.Equal("Lissabon, Portugal", city.Label); // doppelter Name wird weggelassen
        Assert.Equal(38.7077507, city.Latitude, 6);
        Assert.Equal(-9.1365919, city.Longitude, 6);
        Assert.Equal("city", city.Type);
        Assert.Equal("hotel", places[1].Type);
        Assert.Contains("lang=de", handler.LastUri!.Query, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Gleiche_Suche_kommt_aus_dem_Cache()
    {
        var (search, handler) = Create(() => Json(LisbonResponse));

        await search.SearchAsync("Lissabon", null, CancellationToken.None);
        await search.SearchAsync("  lissabon ", null, CancellationToken.None);

        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task Naehe_wird_gerundet_mitgeschickt()
    {
        var (search, handler) = Create(() => Json(LisbonResponse));

        await search.SearchAsync("Hotel", new Coordinates(38.71234, -9.14567), CancellationToken.None);

        Assert.Contains("&lat=38.71&lon=-9.15", handler.LastUri!.Query, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Fehler_des_Dienstes_wird_als_nicht_erreichbar_gemeldet()
    {
        var (search, _) = Create(() => new HttpResponseMessage(HttpStatusCode.BadGateway));

        await Assert.ThrowsAsync<PlaceSearchUnavailableException>(() => search.SearchAsync("Lissabon", null, CancellationToken.None));
    }
}
