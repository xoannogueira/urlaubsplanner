using System.Text.Json;
using Urlaubsplanner.Domain.Trips;

namespace Urlaubsplanner.Api.Desktop;

/// <summary>Allgemeine Vorgaben für neue Reisen (suchvorgaben.json im Datenordner).</summary>
public sealed class SearchDefaultsStore(AppPaths paths)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    private readonly Lock _gate = new();

    private string FilePath => Path.Combine(paths.DataDirectory, "suchvorgaben.json");

    public SearchSettings Get()
    {
        lock (_gate)
        {
            try
            {
                return File.Exists(FilePath)
                    ? SearchSettings.Validate(JsonSerializer.Deserialize<SearchSettings>(File.ReadAllText(FilePath), Json))
                    : SearchSettings.Empty;
            }
            catch (Exception e) when (e is IOException or JsonException or Urlaubsplanner.Domain.DomainException)
            {
                return SearchSettings.Empty;
            }
        }
    }

    public SearchSettings Set(SearchSettings settings)
    {
        var valid = SearchSettings.Validate(settings);
        lock (_gate)
        {
            Directory.CreateDirectory(paths.DataDirectory);
            var temp = FilePath + ".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(valid, Json));
            File.Move(temp, FilePath, overwrite: true);
        }

        return valid;
    }
}
