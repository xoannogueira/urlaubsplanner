using System.Text.Json;
using Urlaubsplanner.Api.Desktop;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Packing;

namespace Urlaubsplanner.Api.Packing;

/// <summary>
/// Packlisten-Vorlagen für alle Reisen, als packvorlagen.json im Datenordner (neben den Reisen).
/// Geschrieben wird über eine temporäre Datei, damit beim Absturz keine halbe Datei zurückbleibt.
/// </summary>
public sealed class PackingTemplateStore(AppPaths paths, TimeProvider clock)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    private readonly Lock _gate = new();

    private string FilePath => Path.Combine(paths.DataDirectory, "packvorlagen.json");

    public IReadOnlyList<PackingTemplate> List()
    {
        lock (_gate)
        {
            return Read().OrderBy(t => t.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
        }
    }

    /// <summary>Neue Vorlage – gibt es schon eine mit dem Namen, wird sie ersetzt (so „überschreibt“ man eine Vorlage).</summary>
    public PackingTemplate Save(string? name, IEnumerable<PackingTemplateItem>? items)
    {
        lock (_gate)
        {
            var all = Read();
            var existing = all.Find(t => string.Equals(t.Name, name?.Trim(), StringComparison.OrdinalIgnoreCase));
            if (existing is null && all.Count >= PackingTemplate.MaxTemplates)
            {
                throw new DomainException("name", $"Höchstens {PackingTemplate.MaxTemplates} Vorlagen – lösch eine alte.");
            }

            var template = PackingTemplate.Create(existing?.Id ?? Guid.NewGuid(), name, items, clock.GetUtcNow());
            all.RemoveAll(t => t.Id == template.Id);
            all.Add(template);
            Write(all);
            return template;
        }
    }

    public PackingTemplate Rename(Guid id, string? name)
    {
        lock (_gate)
        {
            var all = Read();
            var template = all.Find(t => t.Id == id) ?? throw new NotFoundException("Vorlage", id);
            var renamed = PackingTemplate.Create(id, name, template.Items, clock.GetUtcNow());
            if (all.Exists(t => t.Id != id && string.Equals(t.Name, renamed.Name, StringComparison.OrdinalIgnoreCase)))
            {
                throw new DomainException("name", "Eine Vorlage mit diesem Namen gibt es schon.");
            }

            all[all.IndexOf(template)] = renamed;
            Write(all);
            return renamed;
        }
    }

    public void Delete(Guid id)
    {
        lock (_gate)
        {
            var all = Read();
            if (all.RemoveAll(t => t.Id == id) == 0)
            {
                throw new NotFoundException("Vorlage", id);
            }

            Write(all);
        }
    }

    private List<PackingTemplate> Read()
    {
        if (!File.Exists(FilePath))
        {
            return [];
        }

        // Eine kaputte Datei nicht still überschreiben – lieber Fehler melden, damit nichts verloren geht.
        return JsonSerializer.Deserialize<List<PackingTemplate>>(File.ReadAllText(FilePath), Json) ?? [];
    }

    private void Write(List<PackingTemplate> templates)
    {
        Directory.CreateDirectory(paths.DataDirectory);
        var temp = FilePath + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(templates, Json));
        File.Move(temp, FilePath, overwrite: true);
    }
}
