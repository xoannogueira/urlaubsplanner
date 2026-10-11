namespace Urlaubsplanner.Domain.Hotels;

/// <summary>Ein alternativer Zeitraum mit gleicher Nächteanzahl.</summary>
/// <param name="ShiftDays">Verschiebung gegenüber dem Wunschzeitraum, z. B. -2 = zwei Tage früher.</param>
public sealed record DateWindow(DateOnly Checkin, DateOnly Checkout, int ShiftDays);

/// <summary>
/// Ausweichdaten für ausgebuchte Hotels: gleiche Nächteanzahl, Anreise um bis zu ±<c>maxShiftDays</c> verschoben.
/// LiteAPI kennt keine flexiblen Daten, deshalb kostet jeder Zeitraum eine eigene Abfrage –
/// unabhängig davon, wie viele Hotels geprüft werden.
/// </summary>
public static class HotelDateAlternatives
{
    public const int DefaultShiftDays = 3;
    public const int MaxShiftDays = 7;

    /// <summary>Reihenfolge nach Nähe zum Wunschtermin: -1, +1, -2, +2, … Zeiträume in der Vergangenheit fallen weg.</summary>
    public static IReadOnlyList<DateWindow> Windows(DateOnly checkin, DateOnly checkout, DateOnly today, int maxShiftDays = DefaultShiftDays)
    {
        Guard.InRange(maxShiftDays, "shiftDays", 1, MaxShiftDays);
        var windows = new List<DateWindow>();
        for (var distance = 1; distance <= maxShiftDays; distance++)
        {
            foreach (var shift in new[] { -distance, distance })
            {
                var start = checkin.AddDays(shift);
                if (start >= today)
                {
                    windows.Add(new DateWindow(start, checkout.AddDays(shift), shift));
                }
            }
        }

        return windows;
    }
}
