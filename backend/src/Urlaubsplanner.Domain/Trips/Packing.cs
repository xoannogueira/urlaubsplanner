namespace Urlaubsplanner.Domain.Trips;

/// <summary>
/// Ein Eintrag der Packliste. <see cref="SuggestionKey"/> ist gesetzt, wenn der Eintrag aus einem Vorschlag der App stammt –
/// so schlägt die App ihn nicht doppelt vor.
/// </summary>
public sealed record PackingItem(Guid Id, string Text, string Category, bool Packed, string? SuggestionKey = null);

/// <summary>Packliste einer Reise. <see cref="Dismissed"/>: Vorschläge, die weggeklickt wurden und nicht wiederkommen sollen.</summary>
public sealed record PackingList(IReadOnlyList<PackingItem> Items, IReadOnlyList<string> Dismissed)
{
    public const int MaxItems = 300;

    public static PackingList Empty { get; } = new([], []);

    internal static PackingList Validate(PackingList list)
    {
        ArgumentNullException.ThrowIfNull(list);
        var items = list.Items ?? [];
        if (items.Count > MaxItems)
        {
            throw new DomainException("items", $"Höchstens {MaxItems} Einträge.");
        }

        if (items.Select(i => i.Id).Distinct().Count() != items.Count)
        {
            throw new DomainException("items", "Doppelte Einträge.");
        }

        var cleaned = items
            .Select(i => i with
            {
                Text = Guard.RequiredText(i.Text, "text", 120),
                Category = Guard.OptionalText(i.Category, "category", 40) ?? "Sonstiges",
                SuggestionKey = Guard.OptionalText(i.SuggestionKey, "suggestionKey", 60),
            })
            .ToList();
        var dismissed = (list.Dismissed ?? [])
            .Select(d => Guard.RequiredText(d, "dismissed", 60))
            .Distinct(StringComparer.Ordinal)
            .Take(MaxItems)
            .ToList();
        return new PackingList(cleaned, dismissed);
    }
}
