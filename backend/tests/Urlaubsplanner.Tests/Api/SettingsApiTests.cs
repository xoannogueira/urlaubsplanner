using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Urlaubsplanner.Domain;

namespace Urlaubsplanner.Tests.Api;

/// <summary>Setzt eine Umgebungsvariable für den Datenordner – deshalb nicht parallel zu anderen API-Tests.</summary>
[CollectionDefinition(nameof(SettingsApiTests), DisableParallelization = true)]
public sealed class SettingsTestGroup;

/// <summary>Eigenen SerpApi-Key in der App eintragen: prüfen, speichern (settings.json im Datenordner), entfernen.</summary>
[Collection(nameof(SettingsApiTests))]
public sealed class SettingsApiTests : IDisposable
{
    private const string ValidKey = "a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0abcd";

    private readonly string _dataFile = Path.Combine(Path.GetTempPath(), "urlaubsplanner-tests", Guid.NewGuid().ToString("N"), "trips.json");
    private readonly FakeKeyCheck _check = new();
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    private sealed class FakeKeyCheck : ISearchKeyCheck
    {
        public List<string> Checked { get; } = [];

        public Task<SearchQuota?> CheckAsync(string apiKey, CancellationToken cancellationToken)
        {
            Checked.Add(apiKey);
            return Task.FromResult(apiKey == ValidKey ? new SearchQuota(243, 250) : null);
        }
    }

    public SettingsApiTests()
    {
        // Der Datenordner (settings.json) wird schon beim Start der App bestimmt – vor den Test-Einstellungen.
        Environment.SetEnvironmentVariable("URLAUBSPLANNER_DATA", Path.GetDirectoryName(_dataFile));
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Storage:FilePath", _dataFile);
            builder.ConfigureTestServices(services => services.AddSingleton<ISearchKeyCheck>(_check));
        });
        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("URLAUBSPLANNER_DATA", null);
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

    private string SettingsFile => Path.Combine(Path.GetDirectoryName(_dataFile)!, "settings.json");

    [Fact]
    public async Task Gueltiger_Key_wird_geprueft_gespeichert_und_sofort_genutzt()
    {
        var before = await ReadJson(await _client.GetAsync("/api/settings"));
        Assert.False(before.GetProperty("serpApi").GetProperty("configured").GetBoolean());
        Assert.False(before.GetProperty("desktop").GetBoolean());

        var response = await _client.PutAsJsonAsync("/api/settings/serpapi", new { apiKey = $"  {ValidKey}  " });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = await ReadJson(response);
        Assert.Equal("••••abcd", saved.GetProperty("hint").GetString());
        Assert.Equal(243, saved.GetProperty("quota").GetProperty("left").GetInt32());
        Assert.Equal([ValidKey], _check.Checked);

        Assert.Contains(ValidKey, await File.ReadAllTextAsync(SettingsFile), StringComparison.Ordinal);
        var after = await ReadJson(await _client.GetAsync("/api/settings"));
        var serpApi = after.GetProperty("serpApi");
        Assert.True(serpApi.GetProperty("configured").GetBoolean());
        Assert.True(serpApi.GetProperty("fromApp").GetBoolean());
        Assert.DoesNotContain(ValidKey, after.GetRawText(), StringComparison.Ordinal);

        // Flug- und Hotelsuche sehen den Key ohne Neustart.
        Assert.True((await ReadJson(await _client.GetAsync("/api/flights/status"))).GetProperty("configured").GetBoolean());
        Assert.True((await ReadJson(await _client.GetAsync("/api/hotels/status"))).GetProperty("configured").GetBoolean());

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync("/api/settings/serpapi")).StatusCode);
        Assert.False((await ReadJson(await _client.GetAsync("/api/settings"))).GetProperty("serpApi").GetProperty("configured").GetBoolean());
        Assert.DoesNotContain(ValidKey, await File.ReadAllTextAsync(SettingsFile), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Falscher_oder_unbekannter_Key_wird_nicht_gespeichert()
    {
        var malformed = await _client.PutAsJsonAsync("/api/settings/serpapi", new { apiKey = "kein key!" });
        Assert.Equal(HttpStatusCode.BadRequest, malformed.StatusCode);
        Assert.Empty(_check.Checked);

        var unknown = await _client.PutAsJsonAsync("/api/settings/serpapi", new { apiKey = new string('f', 64) });
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.Contains("kennt diesen Key nicht", await unknown.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.False(File.Exists(SettingsFile));
    }

    [Fact]
    public async Task App_Info_und_Lebenszeichen_ausserhalb_der_Desktop_App()
    {
        var info = await ReadJson(await _client.GetAsync("/api/app/info"));
        Assert.Equal("urlaubsplanner", info.GetProperty("app").GetString());
        Assert.False(info.GetProperty("desktop").GetBoolean());

        Assert.Equal(HttpStatusCode.NoContent, (await _client.PostAsync("/api/app/heartbeat", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.PostAsync("/api/app/closing", null)).StatusCode);
    }
}
