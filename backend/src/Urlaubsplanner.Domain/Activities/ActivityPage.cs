namespace Urlaubsplanner.Domain.Activities;

public enum ActivitySort
{
    /// <summary>Bekannteste zuerst (Reihenfolge der Suche).</summary>
    Popular,
    Distance,
}

/// <param name="Total">Treffer insgesamt (nach Kategorie und Suchtext).</param>
/// <param name="Categories">Anzahl pro Kategorie – nach Suchtext, aber ohne Kategoriefilter, damit alle Chips sichtbar bleiben.</param>
public sealed record ActivityPage(
    IReadOnlyList<ActivitySuggestion> Activities,
    int Total,
    int Offset,
    IReadOnlyList<CategoryCount> Categories);

public sealed record CategoryCount(ActivityCategory Category, int Count);

/// <summary>Filtert und blättert die (gecachte) Vorschlagsliste, z. B. 10 Stück pro Seite.</summary>
public static class ActivityPaging
{
    public const int DefaultLimit = 10;
    public const int MaxLimit = 50;

    public static ActivityPage Page(
        IReadOnlyList<ActivitySuggestion> all,
        ActivityCategory? category,
        string? query,
        ActivitySort sort,
        int offset,
        int limit)
    {
        ArgumentNullException.ThrowIfNull(all);
        Guard.InRange(offset, "offset", 0, 10_000);
        Guard.InRange(limit, "limit", 1, MaxLimit);
        var q = query?.Trim() ?? string.Empty;

        var matching = all
            .Where(a => q.Length == 0 ||
                a.Name.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                (a.Description?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (a.Cuisine?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false))
            .ToList();
        var categories = matching
            .GroupBy(a => a.Category)
            .Select(g => new CategoryCount(g.Key, g.Count()))
            .OrderByDescending(c => c.Count)
            .ThenBy(c => c.Category)
            .ToList();

        IEnumerable<ActivitySuggestion> filtered = matching.Where(a => category is null || a.Category == category);
        if (sort == ActivitySort.Distance)
        {
            filtered = filtered.OrderBy(a => a.DistanceKm);
        }

        var list = filtered.ToList();
        return new ActivityPage([.. list.Skip(offset).Take(limit)], list.Count, offset, categories);
    }
}
