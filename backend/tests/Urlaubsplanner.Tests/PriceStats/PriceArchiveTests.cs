using Microsoft.Extensions.Logging.Abstractions;
using Urlaubsplanner.Api.Desktop;
using Urlaubsplanner.Api.PriceStats;
using Urlaubsplanner.Domain.Flights;

namespace Urlaubsplanner.Tests.PriceStats;

public sealed class PriceArchiveTests : IDisposable
{
    private static readonly DateTimeOffset Now = new(2026, 10, 22, 10, 0, 0, TimeSpan.Zero);
    private readonly string _root = Path.Combine(Path.GetTempPath(), "urlaubsplanner-tests", Guid.NewGuid().ToString("N"));

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private PriceArchive Archive() => new(new AppPaths(true, _root), NullLogger<PriceArchive>.Instance);

    private static FlightJourney Journey(string signature, decimal total, string carrier = "Eurowings", params FlightJourneyLeg[] more)
    {
        var segment = new FlightSegment("STR", null, "LIS", null, new DateTime(2026, 11, 12, 9, 15, 0), new DateTime(2026, 11, 12, 11, 40, 0), 205, "EW", carrier, null, "EW2604", null);
        var leg = new FlightJourneyLeg("STR", "LIS", segment.Departure, segment.Arrival, 205, 0, [segment]);
        var fare = new FlightFare("Basic", null, total, total / 2, "EUR", null, null, null, false, false, null, null);
        return new FlightJourney(signature, [leg, .. more], 205, [fare], "https://book", "https://google");
    }

    [Fact]
    public void Preise_werden_einmal_pro_Tag_und_Verbindung_gemerkt()
    {
        var archive = Archive();
        archive.Record([Journey("A", 300), Journey("B", 260, "TAP")], new DateOnly(2026, 11, 17), "suche", Now);
        archive.Record([Journey("A", 300)], new DateOnly(2026, 11, 17), "suche", Now.AddHours(1)); // gleich → nicht nochmal
        archive.Record([Journey("A", 280)], new DateOnly(2026, 11, 17), "wächter", Now.AddHours(2)); // anderer Preis → ja

        var records = archive.Records("STR", "LIS");
        Assert.Equal(3, records.Count);
        var first = records[0];
        Assert.Equal((new DateOnly(2026, 11, 12), "09:15", "Eurowings", 150m, 300m), (first.DepartureDate, first.DepartureTime, first.Airline, first.PricePerAdult, first.TotalPrice));
        Assert.Equal(new DateOnly(2026, 11, 17), first.ReturnDate);
        Assert.Empty(archive.Records("STR", "BCN"));

        // Neu geladen (App-Neustart) bleiben die Einträge erhalten.
        Assert.Equal(3, Archive().Records().Count);
    }

    [Fact]
    public void Preisverlauf_ersetzt_den_aelteren_zu_denselben_Daten()
    {
        var archive = Archive();
        var day = new DateOnly(2026, 11, 12);
        var insights = new FlightPriceInsights(260, "low", 280, 380, [new PricePoint(new DateOnly(2026, 10, 1), 320), new PricePoint(new DateOnly(2026, 10, 2), 300)]);
        archive.RecordHistory("STR", "LIS", day, null, insights, Now);
        archive.RecordHistory("STR", "LIS", day, null, insights with { Lowest = 250 }, Now.AddDays(1));
        archive.RecordHistory("STR", "LIS", day.AddDays(1), null, insights, Now);
        archive.RecordHistory("STR", "LIS", day, null, insights with { History = [] }, Now); // ohne Verlauf → ignoriert

        var histories = archive.Histories("STR", "LIS");
        Assert.Equal(2, histories.Count);
        Assert.Equal(250m, histories.Single(h => h.DepartureDate == day).Lowest);
    }
}
