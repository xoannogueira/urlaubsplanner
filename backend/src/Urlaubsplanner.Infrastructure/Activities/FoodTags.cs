using Urlaubsplanner.Domain.Activities;

namespace Urlaubsplanner.Infrastructure.Activities;

/// <summary>OpenStreetMap-Angaben zu Restaurants & Cafés ins Deutsche übersetzen.</summary>
internal static class FoodTags
{
    private static readonly Dictionary<string, string> Cuisines = new(StringComparer.OrdinalIgnoreCase)
    {
        ["regional"] = "Regional",
        ["portuguese"] = "Portugiesisch",
        ["spanish"] = "Spanisch",
        ["tapas"] = "Tapas",
        ["italian"] = "Italienisch",
        ["pizza"] = "Pizza",
        ["french"] = "Französisch",
        ["german"] = "Deutsch",
        ["greek"] = "Griechisch",
        ["turkish"] = "Türkisch",
        ["mediterranean"] = "Mediterran",
        ["seafood"] = "Fisch & Meeresfrüchte",
        ["fish"] = "Fisch",
        ["steak_house"] = "Steakhaus",
        ["burger"] = "Burger",
        ["american"] = "Amerikanisch",
        ["mexican"] = "Mexikanisch",
        ["japanese"] = "Japanisch",
        ["sushi"] = "Sushi",
        ["chinese"] = "Chinesisch",
        ["thai"] = "Thailändisch",
        ["vietnamese"] = "Vietnamesisch",
        ["indian"] = "Indisch",
        ["asian"] = "Asiatisch",
        ["brazilian"] = "Brasilianisch",
        ["vegetarian"] = "Vegetarisch",
        ["vegan"] = "Vegan",
        ["coffee_shop"] = "Kaffee",
        ["cake"] = "Kuchen",
        ["breakfast"] = "Frühstück",
        ["ice_cream"] = "Eis",
        ["international"] = "International",
        ["kebab"] = "Kebab",
        ["crepe"] = "Crêpes",
        ["wine"] = "Wein",
        ["beer"] = "Bier",
    };

    public static bool IsFood(ActivityCategory category) =>
        category is ActivityCategory.Restaurant or ActivityCategory.Cafe or ActivityCategory.Bar or ActivityCategory.IceCream;

    /// <summary>„portuguese;seafood“ → „Portugiesisch, Fisch & Meeresfrüchte“ (höchstens drei).</summary>
    public static string? Cuisine(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var names = raw.Split([';', ','], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(c => Cuisines.TryGetValue(c, out var de) ? de : Readable(c))
            .Where(c => c.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(3)
            .ToList();
        return names.Count == 0 ? null : string.Join(", ", names);
    }

    /// <summary>„vegan“, „vegetarisch“ (nur), „vegane Auswahl“ bzw. „vegetarische Auswahl“ – sonst null.</summary>
    public static string? Diet(IReadOnlyDictionary<string, string> tags)
    {
        string? Get(string key) => tags.TryGetValue(key, out var v) ? v.Trim().ToLowerInvariant() : null;
        return (Get("diet:vegan"), Get("diet:vegetarian")) switch
        {
            ("only", _) => "vegan",
            (_, "only") => "vegetarisch",
            ("yes", _) => "vegane Auswahl",
            (_, "yes") => "vegetarische Auswahl",
            _ => null,
        };
    }

    private static string Readable(string value)
    {
        var text = value.Replace('_', ' ').Trim();
        return text.Length == 0 ? text : char.ToUpperInvariant(text[0]) + text[1..];
    }
}
