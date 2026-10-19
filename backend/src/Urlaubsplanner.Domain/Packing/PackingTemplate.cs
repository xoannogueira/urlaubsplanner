namespace Urlaubsplanner.Domain.Packing;

/// <summary>Ein Eintrag einer Packlisten-Vorlage – ohne Haken, die gelten nur für eine Reise.</summary>
public sealed record PackingTemplateItem(string Text, string Category, string? SuggestionKey = null);

/// <summary>Gespeicherte Packliste, die man in neue Reisen übernehmen kann (z. B. „Strandurlaub“).</summary>
public sealed record PackingTemplate(Guid Id, string Name, IReadOnlyList<PackingTemplateItem> Items, DateTimeOffset UpdatedAt)
{
    public const int MaxTemplates = 50;
    public const int MaxItems = 300;

    /// <summary>Name und Einträge prüfen und bereinigen (doppelte Einträge fallen weg).</summary>
    public static PackingTemplate Create(Guid id, string? name, IEnumerable<PackingTemplateItem>? items, DateTimeOffset now)
    {
        var cleanName = Guard.RequiredText(name, "name", 80);
        var list = (items ?? []).ToList();
        if (list.Count == 0)
        {
            throw new DomainException("items", "Die Packliste ist leer – erst Sachen eintragen, dann als Vorlage speichern.");
        }

        if (list.Count > MaxItems)
        {
            throw new DomainException("items", $"Höchstens {MaxItems} Einträge.");
        }

        var cleaned = list
            .Select(i => new PackingTemplateItem(
                Guard.RequiredText(i?.Text, "text", 120),
                Guard.OptionalText(i?.Category, "category", 40) ?? "Sonstiges",
                Guard.OptionalText(i?.SuggestionKey, "suggestionKey", 60)))
            .DistinctBy(i => i.Text.ToUpperInvariant())
            .ToList();
        return new PackingTemplate(id, cleanName, cleaned, now);
    }
}
