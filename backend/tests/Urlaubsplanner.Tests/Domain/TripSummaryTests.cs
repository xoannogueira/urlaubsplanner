using Urlaubsplanner.Domain.Trips;

namespace Urlaubsplanner.Tests.Domain;

public sealed class TripSummaryTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 9, 12, 0, 0, TimeSpan.Zero);

    private static (Trip Trip, Stage Lisbon, Stage Porto) PortugalTrip()
    {
        var trip = Trip.Create(new TripData("Portugal", 4), Now);
        var lisbon = trip.AddStage(new StageData("Lissabon", new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16)), Now);
        var porto = trip.AddStage(new StageData("Porto", new DateOnly(2027, 5, 16), new DateOnly(2027, 5, 19)), Now);
        return (trip, lisbon, porto);
    }

    [Fact]
    public void Nur_ausgewaehlte_und_gebuchte_Optionen_zaehlen()
    {
        var (trip, lisbon, _) = PortugalTrip();
        trip.AddOption(new OptionData(OptionKind.Hotel, "Idee", OptionStatus.Idea, lisbon.Id, Price: 500m), Now);
        trip.AddOption(new OptionData(OptionKind.Hotel, "Favorit", OptionStatus.Favorite, lisbon.Id, Price: 600m), Now);
        trip.AddOption(new OptionData(OptionKind.Hotel, "Gewählt", OptionStatus.Selected, lisbon.Id, Price: 1136m), Now);
        trip.AddOption(new OptionData(OptionKind.Flight, "Hinflug", OptionStatus.Booked, Price: 189m, PricePerPerson: true), Now);

        var summary = TripSummaryCalculator.Calculate(trip);

        Assert.Equal(1136m + 756m, summary.TotalCost);
        Assert.Equal(756m, summary.BookedCost);
        Assert.Equal(1136m, summary.OpenCost);
        Assert.Equal(473m, summary.CostPerPerson);
        Assert.Equal(2, summary.ChosenCount);
        Assert.Equal(1, summary.BookedCount);
    }

    [Fact]
    public void Kosten_pro_Etappe_und_ohne_Etappe()
    {
        var (trip, lisbon, porto) = PortugalTrip();
        trip.AddOption(new OptionData(OptionKind.Hotel, "Lissabon", OptionStatus.Selected, lisbon.Id, Price: 1000m), Now);
        trip.AddOption(new OptionData(OptionKind.Flight, "Flug", OptionStatus.Selected, Price: 200m), Now);

        var summary = TripSummaryCalculator.Calculate(trip);

        Assert.Equal(1000m, summary.CostByStage.Single(s => s.StageId == lisbon.Id).Total);
        Assert.Equal(0m, summary.CostByStage.Single(s => s.StageId == porto.Id).Total);
        Assert.Equal(200m, summary.CostByStage.Single(s => s.StageId is null).Total);
    }

    [Fact]
    public void Dauer_ergibt_sich_aus_den_Etappen()
    {
        var (trip, _, _) = PortugalTrip();
        var summary = TripSummaryCalculator.Calculate(trip);

        Assert.Equal(new DateOnly(2027, 5, 12), summary.StartDate);
        Assert.Equal(new DateOnly(2027, 5, 19), summary.EndDate);
        Assert.Equal(8, summary.Days);
        Assert.Equal(7, summary.Nights);
    }

    [Fact]
    public void Ohne_Etappen_gelten_die_Reisedaten()
    {
        var trip = Trip.Create(new TripData("Japan", 2, new DateOnly(2027, 10, 2), new DateOnly(2027, 10, 11)), Now);
        var summary = TripSummaryCalculator.Calculate(trip);

        Assert.Equal(10, summary.Days);
        Assert.Empty(summary.Gaps);
    }

    [Fact]
    public void Hotel_ohne_Daten_deckt_die_ganze_Etappe_ab()
    {
        var (trip, lisbon, porto) = PortugalTrip();
        trip.AddOption(new OptionData(OptionKind.Hotel, "Lissabon", OptionStatus.Selected, lisbon.Id), Now);
        trip.AddOption(new OptionData(OptionKind.Hotel, "Porto", OptionStatus.Booked, porto.Id), Now);

        Assert.Empty(TripSummaryCalculator.Calculate(trip).Gaps);
    }

    [Fact]
    public void Fehlende_Naechte_werden_als_eine_Luecke_gemeldet()
    {
        var (trip, lisbon, porto) = PortugalTrip();
        // Hotel nur 12.–14. → Nächte 14. und 15. fehlen
        trip.AddOption(
            new OptionData(OptionKind.Hotel, "Kurz", OptionStatus.Selected, lisbon.Id, StartDate: new DateOnly(2027, 5, 12), EndDate: new DateOnly(2027, 5, 14)),
            Now);
        trip.AddOption(new OptionData(OptionKind.Hotel, "Porto", OptionStatus.Selected, porto.Id), Now);

        var gap = Assert.Single(TripSummaryCalculator.Calculate(trip).Gaps);
        Assert.Equal(TripGapKind.MissingHotel, gap.Kind);
        Assert.Equal(lisbon.Id, gap.StageId);
        Assert.Equal(new DateOnly(2027, 5, 14), gap.From);
        Assert.Equal(new DateOnly(2027, 5, 16), gap.To);
    }

    [Fact]
    public void Favoriten_schliessen_keine_Luecke()
    {
        var (trip, lisbon, porto) = PortugalTrip();
        trip.AddOption(new OptionData(OptionKind.Hotel, "Nur Favorit", OptionStatus.Favorite, lisbon.Id), Now);
        trip.AddOption(new OptionData(OptionKind.Hotel, "Porto", OptionStatus.Selected, porto.Id), Now);

        var gap = Assert.Single(TripSummaryCalculator.Calculate(trip).Gaps);
        Assert.Equal(lisbon.Id, gap.StageId);
    }

    [Fact]
    public void Tage_zwischen_Etappen_werden_gemeldet()
    {
        var trip = Trip.Create(new TripData("Rundreise", 2), Now);
        var a = trip.AddStage(new StageData("A", new DateOnly(2027, 5, 1), new DateOnly(2027, 5, 3)), Now);
        var b = trip.AddStage(new StageData("B", new DateOnly(2027, 5, 5), new DateOnly(2027, 5, 7)), Now);
        trip.AddOption(new OptionData(OptionKind.Hotel, "A", OptionStatus.Selected, a.Id), Now);
        trip.AddOption(new OptionData(OptionKind.Hotel, "B", OptionStatus.Selected, b.Id), Now);

        var gap = Assert.Single(TripSummaryCalculator.Calculate(trip).Gaps);
        Assert.Equal(TripGapKind.BetweenStages, gap.Kind);
        Assert.Equal(new DateOnly(2027, 5, 3), gap.From);
        Assert.Equal(new DateOnly(2027, 5, 5), gap.To);
    }

    [Fact]
    public void Optionen_ohne_Preis_werden_gezaehlt()
    {
        var (trip, lisbon, _) = PortugalTrip();
        trip.AddOption(new OptionData(OptionKind.Activity, "Ohne Preis", OptionStatus.Selected, lisbon.Id), Now);

        var summary = TripSummaryCalculator.Calculate(trip);
        Assert.Equal(1, summary.MissingPriceCount);
        Assert.Equal(0m, summary.TotalCost);
    }
}
