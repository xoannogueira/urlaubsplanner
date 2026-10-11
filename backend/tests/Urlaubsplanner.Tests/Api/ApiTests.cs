using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Tests.Api;

/// <summary>Startet die echte API im Speicher, mit eigener Datendatei und einer Fake-Ortssuche.</summary>
public sealed class ApiTests : IDisposable
{
    private readonly string _dataFile = Path.Combine(Path.GetTempPath(), "urlaubsplanner-tests", Guid.NewGuid().ToString("N"), "trips.json");
    private readonly FakePlaceSearch _places = new();
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
            builder.ConfigureTestServices(services => services.AddSingleton<IPlaceSearch>(_places));
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
