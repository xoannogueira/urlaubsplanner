using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Urlaubsplanner.Domain.Hotels;
using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Tests.Api;

/// <summary>Startet die echte API im Speicher, mit eigener Datendatei und einer Fake-Ortssuche.</summary>
public sealed class ApiTests : IDisposable
{
    private readonly string _dataFile = Path.Combine(Path.GetTempPath(), "urlaubsplanner-tests", Guid.NewGuid().ToString("N"), "trips.json");
    private sealed class FakeHotelSearch : IHotelSearch
    {
        private readonly System.Collections.Concurrent.ConcurrentQueue<HotelSearchRequest> _requests = new();

        public string Provider => "liteapi";

        public bool IsConfigured { get; set; } = true;

        public HotelSearchRequest? Last { get; private set; }

        public IReadOnlyList<HotelSearchRequest> Requests => [.. _requests];

        /// <summary>Für diese Anreise gibt es keine Zimmer.</summary>
        public DateOnly? SoldOutCheckin { get; set; }

        public Task<HotelSearchResult> SearchAsync(HotelSearchRequest request, CancellationToken cancellationToken)
        {
            if (!IsConfigured)
            {
                throw new HotelSearchNotConfiguredException();
            }

            Last = request;
            _requests.Enqueue(request);
            if (request.Checkin == SoldOutCheckin)
            {
                return Task.FromResult(new HotelSearchResult([], true, DateTimeOffset.UnixEpoch));
            }

            var room = new RoomOffer("Doppelzimmer", null, true, 612m, "EUR", 650m, null, null);
            var offer = new HotelOffer(
                "lp1", "Hotel Miradouro", "Rua A 1", 38.71, -9.13, 8.7, 1284, 4, null, 612m, "EUR", "Doppelzimmer", null, true, "https://www.booking.com/", "https://www.google.com/travel/search", 650m, null, null, [room]);
            return Task.FromResult(new HotelSearchResult([offer], true, DateTimeOffset.UnixEpoch));
        }

        public Task<IReadOnlyList<HotelListing>> ListAsync(HotelSearchRequest request, CancellationToken cancellationToken)
        {
            Last = request;
            IReadOnlyList<HotelListing> hotels =
            [
                new("lp1", "Hotel Miradouro", null, 38.71, -9.13, 8.7, 1284, 4, null, "https://www.booking.com/", "https://www.google.com/travel/search"),
                new("lp9", "Ausgebucht Palace", null, 38.72, -9.12, 9.1, 50, 5, null, "https://www.booking.com/", "https://www.google.com/travel/search"),
            ];
            return Task.FromResult(hotels);
        }
    }

    private readonly FakePlaceSearch _places = new();
    private readonly FakeHotelSearch _hotels = new();
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    private sealed class FakePlaceSearch : IPlaceSearch
    {
        public Coordinates? LastNear { get; private set; }

        public Task<IReadOnlyList<Place>> SearchAsync(string query, Coordinates? near, CancellationToken cancellationToken)
        {
            LastNear = near;
            return Task.FromResult<IReadOnlyList<Place>>([new Place("Lissabon", "Lissabon, Portugal", 38.7, -9.1, "city")]);
        }
    }

    public ApiTests()
    {
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Storage:FilePath", _dataFile);
            builder.UseSetting("Activities:Prefetch", "false");
            builder.ConfigureTestServices(services => services.AddSingleton<IPlaceSearch>(_places).AddSingleton<IHotelSearch>(_hotels));
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

    private async Task<string> CreateTrip(string name = "Portugal", int travelers = 4)
    {
        var response = await _client.PostAsJsonAsync("/api/trips", new { name, travelers });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await ReadJson(response)).GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task Kompletter_Ablauf_Reise_Etappe_Option_Zusammenfassung()
    {
        var id = await CreateTrip();

        var withStage = await ReadJson(await _client.PostAsJsonAsync($"/api/trips/{id}/stages", new
        {
            name = "Lissabon",
            startDate = "2027-05-12",
            endDate = "2027-05-16",
            latitude = 38.72,
            longitude = -9.14,
        }));
        var stage = withStage.GetProperty("stages")[0];
        Assert.Equal(4, stage.GetProperty("nights").GetInt32());
        var stageId = stage.GetProperty("id").GetString();

        var withOption = await ReadJson(await _client.PostAsJsonAsync($"/api/trips/{id}/options", new
        {
            kind = "Flight",
            title = "STR → LIS",
            status = "Selected",
            stageId,
            url = "https://www.skyscanner.de/",
            price = 189,
            pricePerPerson = true,
        }));
        var option = withOption.GetProperty("options")[0];
        Assert.Equal(756m, option.GetProperty("totalPrice").GetDecimal());
        Assert.Equal("Selected", option.GetProperty("status").GetString());

        var optionId = option.GetProperty("id").GetString();
        var booked = await _client.PatchAsJsonAsync($"/api/trips/{id}/options/{optionId}/status", new { status = "Booked" });
        Assert.Equal(HttpStatusCode.OK, booked.StatusCode);

        var summary = await ReadJson(await _client.GetAsync($"/api/trips/{id}/summary"));
        Assert.Equal(756m, summary.GetProperty("totalCost").GetDecimal());
        Assert.Equal(756m, summary.GetProperty("bookedCost").GetDecimal());
        Assert.Equal("MissingHotel", summary.GetProperty("gaps")[0].GetProperty("kind").GetString());

        var list = await ReadJson(await _client.GetAsync("/api/trips"));
        Assert.Equal(1, list.GetArrayLength());
        Assert.Equal("Lissabon", list[0].GetProperty("stageNames")[0].GetString());
    }

    [Fact]
    public async Task Ungueltiger_Link_liefert_Feldfehler()
    {
        var id = await CreateTrip();
        var response = await _client.PostAsJsonAsync($"/api/trips/{id}/options", new { kind = "Hotel", title = "X", url = "javascript:alert(1)" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await ReadJson(response);
        Assert.True(body.GetProperty("errors").TryGetProperty("url", out _));
    }

    [Fact]
    public async Task Unbekannte_Art_liefert_400_statt_500()
    {
        var id = await CreateTrip();
        var response = await _client.PostAsJsonAsync($"/api/trips/{id}/options", new { kind = "Boot", title = "X" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Unbekannte_Reise_liefert_404()
    {
        var response = await _client.GetAsync($"/api/trips/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Unbekannte_Option_liefert_404()
    {
        var id = await CreateTrip();
        var response = await _client.DeleteAsync($"/api/trips/{id}/options/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Reise_loeschen()
    {
        var id = await CreateTrip();
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/trips/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.DeleteAsync($"/api/trips/{id}")).StatusCode);
    }

    [Fact]
    public async Task Ortssuche_liefert_Treffer()
    {
        var places = await ReadJson(await _client.GetAsync("/api/places?q=Lissabon"));
        Assert.Equal("Lissabon, Portugal", places[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Ortssuche_gibt_die_Naehe_weiter_und_ignoriert_ungueltige_Koordinaten()
    {
        await _client.GetAsync("/api/places?q=Hotel&lat=38.71&lon=-9.14");
        Assert.Equal(new Coordinates(38.71, -9.14), _places.LastNear);

        await _client.GetAsync("/api/places?q=Hotel&lat=200&lon=-9.14");
        Assert.Null(_places.LastNear);
    }

    [Theory]
    [InlineData("")]
    [InlineData("a")]
    public async Task Ortssuche_braucht_mindestens_zwei_Zeichen(string query)
    {
        var response = await _client.GetAsync($"/api/places?q={query}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static object HotelSearch(string checkin = "2027-05-12", string checkout = "2027-05-16", int adults = 4) =>
        new { latitude = 38.72, longitude = -9.14, checkin, checkout, adults };

    [Fact]
    public async Task Hotelsuche_liefert_Treffer_und_teilt_Zimmer_auf()
    {
        var response = await _client.PostAsJsonAsync("/api/hotels/search", HotelSearch(adults: 5));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await ReadJson(response);
        Assert.Equal("Hotel Miradouro", body.GetProperty("hotels")[0].GetProperty("name").GetString());
        Assert.True(body.GetProperty("sandbox").GetBoolean());
        Assert.Equal(4, body.GetProperty("nights").GetInt32());
        Assert.Equal(3, body.GetProperty("rooms").GetInt32()); // 5 Personen → standardmäßig 3 Zimmer
        Assert.Equal(3000, _hotels.Last!.RadiusMeters);
    }

    [Fact]
    public async Task Hotelsuche_mit_ungueltigen_Daten_liefert_Feldfehler()
    {
        var response = await _client.PostAsJsonAsync("/api/hotels/search", HotelSearch(checkin: "2027-05-16", checkout: "2027-05-12"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await ReadJson(response)).GetProperty("errors").TryGetProperty("checkout", out _));
    }

    [Fact]
    public async Task Hotelsuche_ohne_Key_meldet_nicht_eingerichtet()
    {
        _hotels.IsConfigured = false;

        var status = await ReadJson(await _client.GetAsync("/api/hotels/status"));
        Assert.False(status.GetProperty("configured").GetBoolean());
        Assert.Equal("liteapi", status.GetProperty("provider").GetString());
        Assert.False(status.GetProperty("paged").GetBoolean());

        var response = await _client.PostAsJsonAsync("/api/hotels/search", HotelSearch());
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("urn:urlaubsplanner:hotel-search-not-configured", (await ReadJson(response)).GetProperty("type").GetString());
    }

    [Fact]
    public async Task Hotelsuche_nach_IDs_braucht_keinen_Ort()
    {
        var response = await _client.PostAsJsonAsync("/api/hotels/search", new { checkin = "2027-05-12", checkout = "2027-05-16", adults = 2, hotelIds = new[] { "lp1" } });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(_hotels.Last!.Center);
        Assert.Equal(["lp1"], _hotels.Last.HotelIds.ToArray());
    }

    [Fact]
    public async Task Hotelsuche_ohne_Ort_und_ohne_IDs_liefert_Feldfehler()
    {
        var response = await _client.PostAsJsonAsync("/api/hotels/search", new { checkin = "2027-05-12", checkout = "2027-05-16", adults = 2 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Hotels_im_Umkreis_enthalten_auch_ausgebuchte()
    {
        var body = await ReadJson(await _client.PostAsJsonAsync("/api/hotels/nearby", HotelSearch()));

        Assert.Equal(2, body.GetProperty("hotels").GetArrayLength());
        Assert.Equal("lp9", body.GetProperty("hotels")[1].GetProperty("hotelId").GetString());
    }

    [Fact]
    public async Task Ausweichdaten_pruefen_jeden_Zeitraum_mit_einer_Abfrage()
    {
        _hotels.SoldOutCheckin = new DateOnly(2027, 5, 11);

        var body = await ReadJson(await _client.PostAsJsonAsync("/api/hotels/alternatives", new
        {
            hotelIds = new[] { "lp1", "lp9" },
            checkin = "2027-05-12",
            checkout = "2027-05-16",
            adults = 4,
        }));

        Assert.Equal(6, body.GetProperty("requests").GetInt32());
        Assert.Equal(6, _hotels.Requests.Count);
        Assert.All(_hotels.Requests, r => Assert.Equal(["lp1", "lp9"], r.HotelIds.ToArray()));
        Assert.All(_hotels.Requests, r => Assert.Equal(4, r.Nights));

        var windows = body.GetProperty("windows");
        Assert.Equal("2027-05-11", windows[0].GetProperty("checkin").GetString()); // erst 1 Tag früher …
        Assert.Equal(0, windows[0].GetProperty("hotels").GetArrayLength()); // … da ausgebucht
        Assert.Equal("2027-05-13", windows[1].GetProperty("checkin").GetString()); // … dann 1 Tag später
        Assert.Equal(612, windows[1].GetProperty("hotels")[0].GetProperty("totalPrice").GetDecimal());
    }

    [Fact]
    public async Task Ausweichdaten_ohne_Hotels_liefern_Feldfehler()
    {
        var response = await _client.PostAsJsonAsync("/api/hotels/alternatives", new { hotelIds = Array.Empty<string>(), checkin = "2027-05-12", checkout = "2027-05-16", adults = 4 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await ReadJson(response)).GetProperty("errors").TryGetProperty("hotelIds", out _));
    }

    [Fact]
    public async Task Preis_bestaetigen_setzt_Pruefzeitpunkt_auch_bei_gleichem_Preis()
    {
        var id = await CreateTrip();
        var created = await ReadJson(await _client.PostAsJsonAsync($"/api/trips/{id}/options", new { kind = "Hotel", title = "Hotel Miradouro" }));
        var optionId = created.GetProperty("options")[0].GetProperty("id").GetString();

        var trip = await ReadJson(await _client.PatchAsJsonAsync($"/api/trips/{id}/options/{optionId}/price", new { price = 612 }));
        var option = trip.GetProperty("options")[0];
        Assert.Equal(612, option.GetProperty("price").GetDecimal());
        Assert.Equal(JsonValueKind.String, option.GetProperty("priceCheckedAt").ValueKind);

        var negative = await _client.PatchAsJsonAsync($"/api/trips/{id}/options/{optionId}/price", new { price = -1 });
        Assert.Equal(HttpStatusCode.BadRequest, negative.StatusCode);
    }

    [Fact]
    public async Task Gemerktes_Hotel_behaelt_Herkunft_und_Bild()
    {
        var id = await CreateTrip();
        var trip = await ReadJson(await _client.PostAsJsonAsync($"/api/trips/{id}/options", new
        {
            kind = "Hotel",
            title = "Hotel Miradouro",
            status = "Favorite",
            price = 612,
            provider = "liteapi",
            externalId = "lp1",
            imageUrl = "https://img.example/1.jpg",
        }));
        var option = trip.GetProperty("options")[0];
        Assert.Equal("liteapi", option.GetProperty("provider").GetString());
        Assert.Equal("lp1", option.GetProperty("externalId").GetString());
        Assert.Equal("https://img.example/1.jpg", option.GetProperty("imageUrl").GetString());

        var unknown = await _client.PostAsJsonAsync($"/api/trips/{id}/options", new { kind = "Hotel", title = "X", provider = "hacker" });
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
    }

    [Fact]
    public async Task Fehlende_Datei_liefert_404_statt_HTML()
    {
        var response = await _client.GetAsync("/assets/gibt-es-nicht.mjs");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.NotEqual("text/html", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Unbekannter_API_Pfad_liefert_404()
    {
        var response = await _client.GetAsync("/api/gibt-es-nicht");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
