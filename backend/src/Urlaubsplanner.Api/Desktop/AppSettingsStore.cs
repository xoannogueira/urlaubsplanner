using System.Text.Json;
using System.Text.Json.Nodes;

namespace Urlaubsplanner.Api.Desktop;

/// <summary>
/// Einstellungen, die in der App selbst eingetragen werden (z. B. der SerpApi-Key), als settings.json im Datenordner.
/// Die Datei ist eine normale Konfigurationsquelle – nach dem Speichern wird die Konfiguration neu geladen,
/// damit der neue Key sofort gilt.
/// </summary>
public sealed class AppSettingsStore(AppPaths paths, IConfiguration configuration)
{
    private static readonly JsonSerializerOptions Indented = new() { WriteIndented = true };

    private readonly Lock _gate = new();

    public bool HasSerpApiKey() =>
        Read()["SerpApi"]?["ApiKey"]?.GetValue<string>() is { Length: > 0 };

    public void SetSerpApiKey(string? apiKey) =>
        Update(root =>
        {
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                (root["SerpApi"] as JsonObject)?.Remove("ApiKey");
                return;
            }

            if (root["SerpApi"] is not JsonObject section)
            {
                section = [];
                root["SerpApi"] = section;
            }

            section["ApiKey"] = apiKey;
        });

    private JsonObject Read()
    {
        try
        {
            return File.Exists(paths.SettingsFile) && JsonNode.Parse(File.ReadAllText(paths.SettingsFile)) is JsonObject root ? root : [];
        }
        catch (Exception e) when (e is JsonException or IOException)
        {
            return [];
        }
    }

    private void Update(Action<JsonObject> change)
    {
        lock (_gate)
        {
            var root = Read();
            change(root);
            Directory.CreateDirectory(paths.DataDirectory);
            var temp = paths.SettingsFile + ".tmp";
            File.WriteAllText(temp, root.ToJsonString(Indented));
            File.Move(temp, paths.SettingsFile, overwrite: true);
        }

        // Sofort neu laden statt auf den Datei-Watcher zu warten.
        (configuration as IConfigurationRoot)?.Reload();
    }
}
