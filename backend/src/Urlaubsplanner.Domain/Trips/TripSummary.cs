namespace Urlaubsplanner.Domain.Trips;

/// <summary>
/// Kennzahlen einer Reise für Übersicht, Dashboard und Checkliste.
/// Gezählt werden nur Optionen mit Status "Ausgewählt" oder "Gebucht".
/// </summary>
public sealed record TripSummary(
    int Travelers,
    DateOnly? StartDate,
    DateOnly? EndDate,
    int? Days,
    int Nights,
    int StageCount,
    decimal TotalCost,
    decimal CostPerPerson,
    decimal BookedCost,
    decimal OpenCost,
    int ChosenCount,
    int BookedCount,
    int MissingPriceCount,
    IReadOnlyList<KindCost> CostByKind,
    IReadOnlyList<StageCost> CostByStage,
    IReadOnlyList<TripGap> Gaps);

public sealed record KindCost(OptionKind Kind, decimal Total, int Count);

/// <summary>Kosten einer Etappe. <c>StageId</c> = <c>null</c> steht für Optionen ohne Etappe.</summary>
public sealed record StageCost(Guid? StageId, string Name, decimal Total);

public enum TripGapKind
{
    /// <summary>Innerhalb einer Etappe gibt es Nächte ohne ausgewähltes Hotel.</summary>
    MissingHotel,

    /// <summary>Nächte im Reisezeitraum, die keiner Etappe zugeordnet sind (zwischen, vor oder nach Etappen).</summary>
    BetweenStages,
}

/// <summary>Lücke von <c>From</c> (erste Nacht) bis <c>To</c> (Morgen nach der letzten Nacht).</summary>
public sealed record TripGap(TripGapKind Kind, Guid? StageId, string? StageName, DateOnly From, DateOnly To);

public static class TripSummaryCalculator
{
    public static TripSummary Calculate(Trip trip)
    {
        ArgumentNullException.ThrowIfNull(trip);

        var stages = trip.Stages;
        var chosen = trip.Options.Where(o => o.Status.IsChosen()).ToList();

        // Der Reisezeitraum umfasst immer alle Etappen (siehe Trip) – er ist der eine Zeitraum.
        var start = trip.StartDate;
        var end = trip.EndDate;
        int? days = start is { } s && end is { } e ? e.DayNumber - s.DayNumber + 1 : null;
        var nights = days is { } d ? Math.Max(0, d - 1) : 0;

        decimal Cost(TripOption o) => o.TotalPrice(trip.Travelers) ?? 0m;

        var total = chosen.Sum(Cost);
        var booked = chosen.Where(o => o.Status == OptionStatus.Booked).Sum(Cost);

        var byKind = chosen
            .GroupBy(o => o.Kind)
            .Select(g => new KindCost(g.Key, g.Sum(Cost), g.Count()))
            .OrderByDescending(k => k.Total)
            .ToList();

        var byStage = stages
            .Select(st => new StageCost(st.Id, st.Name, chosen.Where(o => o.StageId == st.Id).Sum(Cost)))
            .ToList();
        var unassigned = chosen.Where(o => o.StageId is null).ToList();
        if (unassigned.Count > 0)
        {
            byStage.Add(new StageCost(null, "Ganze Reise", unassigned.Sum(Cost)));
        }

        return new TripSummary(
            trip.Travelers,
            start,
            end,
            days,
            nights,
            stages.Count,
            total,
            trip.Travelers > 0 ? decimal.Round(total / trip.Travelers, 2) : total,
            booked,
            total - booked,
            chosen.Count,
            chosen.Count(o => o.Status == OptionStatus.Booked),
            chosen.Count(o => o.Price is null),
            byKind,
            byStage,
            FindGaps(stages, chosen, start, end));
    }

    private static List<TripGap> FindGaps(IReadOnlyList<Stage> stages, List<TripOption> chosen, DateOnly? start, DateOnly? end)
    {
        var gaps = new List<TripGap>();
        if (stages.Count > 0 && start is { } s && s < stages[0].StartDate)
        {
            gaps.Add(new TripGap(TripGapKind.BetweenStages, null, null, s, stages[0].StartDate));
        }

        for (var i = 0; i < stages.Count; i++)
        {
            var stage = stages[i];
            var hotels = chosen.Where(o => o.Kind == OptionKind.Hotel && o.StageId == stage.Id).ToList();
            gaps.AddRange(MissingHotelNights(stage, hotels));

            if (i + 1 < stages.Count && stages[i + 1].StartDate > stage.EndDate)
            {
                gaps.Add(new TripGap(TripGapKind.BetweenStages, null, null, stage.EndDate, stages[i + 1].StartDate));
            }
        }

        var lastEnd = stages.Count > 0 ? stages.Max(x => x.EndDate) : (DateOnly?)null;
        if (lastEnd is { } l && end is { } e && l < e)
        {
            gaps.Add(new TripGap(TripGapKind.BetweenStages, null, null, l, e));
        }

        return gaps;
    }

    /// <summary>
    /// Ein Hotel ohne eigene Daten deckt die ganze Etappe ab; mit Daten nur die Nächte von Start bis Ende.
    /// Zusammenhängende fehlende Nächte werden zu einer Lücke zusammengefasst.
    /// </summary>
    private static IEnumerable<TripGap> MissingHotelNights(Stage stage, List<TripOption> hotels)
    {
        DateOnly? gapStart = null;
        for (var night = stage.StartDate; night < stage.EndDate; night = night.AddDays(1))
        {
            var current = night;
            var covered = hotels.Exists(h =>
                (h.StartDate ?? stage.StartDate) <= current && current < (h.EndDate ?? stage.EndDate));

            if (!covered && gapStart is null)
            {
                gapStart = current;
            }
            else if (covered && gapStart is { } from)
            {
                yield return new TripGap(TripGapKind.MissingHotel, stage.Id, stage.Name, from, current);
                gapStart = null;
            }
        }

        if (gapStart is { } open)
        {
            yield return new TripGap(TripGapKind.MissingHotel, stage.Id, stage.Name, open, stage.EndDate);
        }
    }
}
