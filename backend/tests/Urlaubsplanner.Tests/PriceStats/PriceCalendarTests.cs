using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Urlaubsplanner.Api.Desktop;
using Urlaubsplanner.Api.PriceStats;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Flights;

namespace Urlaubsplanner.Tests.PriceStats;

public sealed class PriceCalendarTests : IDisposable
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.Now);
    private readonly string _root = Path.Combine(Path.GetTempPath(), "urlaubsplanner-tests", Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    private static PriceCalendarRequest Request(int fromDays, int toDays, CalendarPattern pattern, int? nights = 7) =>
        new(["STR"], ["LIS"], Today.AddDays(fromDays), Today.AddDays(toDays), nights, pattern);

    [Fact]
    public void Abflugtage_nach_Muster()
    {
        Assert.Equal(31, PriceCalendarRules.Dates(Request(10, 40, CalendarPattern.Daily), Today).Count);
        Assert.Equal(16, PriceCalendarRules.Dates(Request(10, 40, CalendarPattern.EveryOther), Today).Count);
        Assert.Equal(5, PriceCalendarRules.Dates(Request(10, 40, CalendarPattern.Weekly), Today).Count);
        Assert.All(PriceCalendarRules.Dates(Request(10, 40, CalendarPattern.Weekends), Today), d => Assert.Contains(d.DayOfWeek, new[] { DayOfWeek.Friday, DayOfWeek.Saturday }));
    }

    [Fact]
    public void Zu_viele_Suchen_oder_falscher_Zeitraum_werden_abgelehnt()
    {
        Assert.Throws<DomainException>(() => PriceCalendarRules.Dates(Request(10, 150, CalendarPattern.Daily), Today)); // > 100 Suchen
        Assert.Throws<DomainException>(() => PriceCalendarRules.Dates(Request(0, 20, CalendarPattern.Daily), Today)); // heute
        Assert.Throws<DomainException>(() => PriceCalendarRules.Dates(Request(10, 250, CalendarPattern.Weekly), Today)); // > 6 Monate
        Assert.Throws<DomainException>(() => PriceCalendarRules.Dates(Request(300, 330, CalendarPattern.Weekly), Today)); // Rückflug zu spät
    }

    private sealed class FakeSearch(int left) : IFlightSearch, IMultiAirportFlightSearch, IFlightSearchQuota
    {
        public string Provider => "serpapi";

        public bool IsConfigured => true;

        public int Calls { get; private set; }

        public Task<FlightSearchResult> SearchAsync(FlightSearchRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();

        public Task<FlightSearchResult> SearchAsync(FlightMultiRequest request, CancellationToken cancellationToken)
        {
            Calls++;
            var date = request.Legs[0].Date;
            var dep = date.ToDateTime(new TimeOnly(9, 15));
            var segment = new FlightSegment("STR", null, "LIS", null, dep, dep.AddHours(3), 180, "EW", "Eurowings", null, "2604", null);
            var price = 100m + date.Day; // je Tag anders
            var fare = new FlightFare("Basic", null, price, price, "EUR", null, null, null, false, false, null, null);
            var journey = new FlightJourney($"STR-LIS@{date:yyyy-MM-dd}:EW2604", [new FlightJourneyLeg("STR", "LIS", dep, dep.AddHours(3), 180, 0, [segment])], 180, [fare], "b", "g");
            return Task.FromResult(new FlightSearchResult([journey], false, DateTimeOffset.UtcNow));
        }

        public Task<SearchQuota?> GetQuotaAsync(CancellationToken cancellationToken) => Task.FromResult<SearchQuota?>(new SearchQuota(left, 250));
    }

    /// <summary>Aviasales-Ersatz: STR→LIS kostet 40 € + Tag, LIS→STR 30 €; FRA→LIS nur an geraden Tagen 20 €.</summary>
    private sealed class FakeFares : IIndicativeFares
    {
        public IndicativeSourceState? Fail { get; set; }

        public List<string> Calls { get; } = [];

        public bool IsConfigured => true;

        public Task<IndicativeSourceState> CheckAsync(CancellationToken cancellationToken) => Task.FromResult(Fail ?? IndicativeSourceState.Ok);

        public Task<IReadOnlyList<IndicativeFare>> MonthAsync(string origin, string destination, DateOnly month, CancellationToken cancellationToken)
        {
            Calls.Add($"{origin}-{destination}-{month:yyyy-MM}");
            if (Fail is { } state)
            {
                throw new IndicativeFaresException(state, "Fehler");
            }

            var days = Enumerable.Range(0, DateTime.DaysInMonth(month.Year, month.Month)).Select(month.AddDays);
            IReadOnlyList<IndicativeFare> fares = (origin, destination) switch
            {
                ("STR", "LIS") => [.. days.Select(d => new IndicativeFare(d, 40 + d.Day, "EW", 0))],
                ("LIS", "STR") => [.. days.Select(d => new IndicativeFare(d, 30, "EW", 0))],
                ("FRA", "LIS") => [.. days.Where(d => d.Day % 2 == 0).Select(d => new IndicativeFare(d, 20, "FR", 0))],
                ("LIS", "FRA") => [.. days.Select(d => new IndicativeFare(d, 25, "FR", 0))],
                _ => [],
            };
            return Task.FromResult(fares);
        }
    }

    private FakeFares _fares = new();

    private PriceSourceMonitor? _monitor;

    private (PriceCalendarRunner Runner, PriceCalendarStore Store, PriceArchive Archive, FakeSearch Search) Create(int quotaLeft)
    {
        var paths = new AppPaths(true, _root);
        var search = new FakeSearch(quotaLeft);
        var services = new ServiceCollection().AddSingleton<IFlightSearch>(search).AddSingleton<IIndicativeFares>(_fares).BuildServiceProvider();
        _monitor = new PriceSourceMonitor(services.GetRequiredService<IServiceScopeFactory>(), TimeProvider.System, NullLogger<PriceSourceMonitor>.Instance);
        var store = new PriceCalendarStore(paths);
        var archive = new PriceArchive(paths, NullLogger<PriceArchive>.Instance);
        PriceCalendarRunner.Pause = TimeSpan.Zero;
        PriceCalendarRunner.AviasalesPause = TimeSpan.Zero;
        var runner = new PriceCalendarRunner(store, archive, services.GetRequiredService<IServiceScopeFactory>(), TimeProvider.System, _monitor, NullLogger<PriceCalendarRunner>.Instance);
        return (runner, store, archive, search);
    }

    [Fact]
    public async Task Kalender_laedt_jeden_Tag_und_fuellt_das_Archiv()
    {
        var (runner, store, archive, search) = Create(200);
        var started = await runner.StartAsync(Request(20, 33, CalendarPattern.EveryOther, nights: 5), CancellationToken.None);
        Assert.Equal(7, started.Total);

        for (var i = 0; i < 100 && store.Get(started.Id)!.State == CalendarState.Running; i++)
        {
            await Task.Delay(50);
        }

        var done = store.Get(started.Id)!;
        Assert.Equal(CalendarState.Done, done.State);
        Assert.Equal(7, done.Days.Count);
        Assert.All(done.Days, d => Assert.Equal("Eurowings", d.Airline));
        Assert.All(done.Days, d => Assert.Equal("STR-LIS", d.Route));
        Assert.All(done.Days, d => Assert.Equal("EW2604", d.Flight));
        Assert.Equal(7, search.Calls);
        Assert.Equal(7, archive.Records("STR", "LIS").Count);
        Assert.All(archive.Records("STR", "LIS"), r => Assert.Equal("kalender", r.Source));
        runner.Dispose();
    }

    [Fact]
    public async Task Zu_wenig_Kontingent_wird_vorher_abgelehnt()
    {
        var (runner, _, _, search) = Create(20);
        await Assert.ThrowsAsync<DomainException>(() => runner.StartAsync(Request(10, 40, CalendarPattern.Daily), CancellationToken.None));
        Assert.Equal(0, search.Calls);
        runner.Dispose();
    }

    [Fact]
    public async Task Ungenutztes_auslagern_und_zurueckholen()
    {
        var (runner, store, archive, _) = Create(200);
        var old = DateTimeOffset.UtcNow.AddDays(-40);
        var segment = new FlightSegment("STR", null, "BCN", null, new DateTime(2026, 12, 1, 9, 0, 0), new DateTime(2026, 12, 1, 11, 0, 0), 120, "VY", "Vueling", null, "VY1", null);
        var journey = new FlightJourney("x", [new FlightJourneyLeg("STR", "BCN", segment.Departure, segment.Arrival, 120, 0, [segment])], 120, [new FlightFare("B", null, 99, 99, "EUR", null, null, null, false, false, null, null)], "b", "g");
        archive.Record([journey], null, "suche", old);
        store.Save(new PriceCalendar(Guid.NewGuid(), ["STR"], ["BCN"], new DateOnly(2026, 12, 1), new DateOnly(2026, 12, 31), null, CalendarPattern.Weekly, old, old, CalendarState.Done, 5, [], null));
        archive.Record([journey with { Signature = "frisch", Legs = [journey.Legs[0] with { Origin = "FRA" }] }], null, "suche", DateTimeOffset.UtcNow);

        var offload = new DataOffload(new AppPaths(true, _root), archive, store);
        Assert.Equal(2, offload.OffloadUnused(30, DateTimeOffset.UtcNow));
        Assert.Single(offload.Stored()); // nur die frische Strecke bleibt
        Assert.Empty(store.List());
        var files = offload.Offloaded();
        Assert.Equal(2, files.Count);

        foreach (var f in files)
        {
            offload.Restore(f.Name);
        }

        Assert.Single(archive.Records("STR", "BCN"));
        Assert.Single(store.List());
        Assert.Empty(offload.Offloaded());
        Assert.Throws<DomainException>(() => offload.Delete("../trips.json"));
        runner.Dispose();
    }

    [Fact]
    public void Ausgewaehltes_und_seit_30_Tagen_Ungenutztes_loeschen()
    {
        var (runner, store, archive, _) = Create(200);
        var old = DateTimeOffset.UtcNow.AddDays(-40);
        var segment = new FlightSegment("STR", null, "BCN", null, new DateTime(2026, 12, 1, 9, 0, 0), new DateTime(2026, 12, 1, 11, 0, 0), 120, "VY", "Vueling", null, "VY1", null);
        var journey = new FlightJourney("x", [new FlightJourneyLeg("STR", "BCN", segment.Departure, segment.Arrival, 120, 0, [segment])], 120, [new FlightFare("B", null, 99, 99, "EUR", null, null, null, false, false, null, null)], "b", "g");
        archive.Record([journey], null, "suche", old);
        archive.Record([journey with { Signature = "frisch", Legs = [journey.Legs[0] with { Origin = "FRA" }] }], null, "suche", DateTimeOffset.UtcNow);
        archive.Record([journey with { Signature = "bleibt", Legs = [journey.Legs[0] with { Origin = "MUC" }] }], null, "suche", DateTimeOffset.UtcNow);
        store.Save(new PriceCalendar(Guid.NewGuid(), ["STR"], ["BCN"], new DateOnly(2026, 12, 1), new DateOnly(2026, 12, 31), null, CalendarPattern.Weekly, old, old, CalendarState.Done, 5, [], null));
        var offload = new DataOffload(new AppPaths(true, _root), archive, store);

        // Nur ausgewählt: die frische Strecke FRA → BCN
        Assert.Equal(1, offload.DeleteSelected(new DeleteDataRequest(["strecke:FRA-BCN"], null, null), DateTimeOffset.UtcNow));
        Assert.Empty(archive.Records("FRA", "BCN"));
        Assert.Equal(3, offload.Stored().Count);

        // Mit „Ungenutzte mitlöschen“: alte Strecke und alter Kalender, MUC → BCN bleibt
        Assert.Equal(2, offload.DeleteSelected(new DeleteDataRequest([], [], 30), DateTimeOffset.UtcNow));
        var left = Assert.Single(offload.Stored());
        Assert.Equal("MUC-BCN", left.Key);
        Assert.Empty(store.List());
        Assert.Throws<DomainException>(() => offload.DeleteSelected(new DeleteDataRequest(null, null, 0), DateTimeOffset.UtcNow));
        runner.Dispose();
    }

    private static async Task<PriceCalendar> WaitAsync(PriceCalendarStore store, Guid id)
    {
        for (var i = 0; i < 100 && store.Get(id)!.State == CalendarState.Running; i++)
        {
            await Task.Delay(50);
        }

        return store.Get(id)!;
    }

    [Fact]
    public async Task Aviasales_setzt_Hin_und_Rueckflug_zusammen_und_kostet_keine_Google_Suche()
    {
        var (runner, store, archive, search) = Create(200);
        // Jeden Tag über mehr als 100 Tage – bei Google zu viel, bei Aviasales kein Problem.
        var request = new PriceCalendarRequest(["STR", "FRA"], ["LIS"], Today.AddDays(10), Today.AddDays(130), 7, CalendarPattern.Daily, PriceSource.Aviasales);
        var started = await runner.StartAsync(request, CancellationToken.None);
        var done = await WaitAsync(store, started.Id);

        Assert.Equal(CalendarState.Done, done.State);
        Assert.Equal(PriceSource.Aviasales, done.Source);
        Assert.Equal(121, done.Days.Count);
        foreach (var day in done.Days)
        {
            // FRA an geraden Tagen: 20 + 25 = 45; sonst STR: 40 + Tag + 30
            var expected = day.Date.Day % 2 == 0 ? 45m : 70 + day.Date.Day;
            Assert.Equal(Math.Min(expected, 70 + day.Date.Day), day.Cheapest);
            Assert.Equal(day.Date.Day % 2 == 0 ? "FRA-LIS" : "STR-LIS", day.Route);
        }

        Assert.Equal(0, search.Calls);
        Assert.Empty(archive.Records("STR", "LIS"));
        // Jede Strecke und jeder Monat nur einmal abgefragt
        Assert.Equal(_fares.Calls.Count, _fares.Calls.Distinct().Count());
        runner.Dispose();
    }

    [Fact]
    public async Task Abgelehnter_Aviasales_Token_bricht_ab_und_sperrt_die_Quelle()
    {
        _fares.Fail = IndicativeSourceState.Rejected;
        var (runner, store, _, _) = Create(200);
        var request = Request(10, 40, CalendarPattern.Daily) with { Source = PriceSource.Aviasales };
        var done = await WaitAsync(store, (await runner.StartAsync(request, CancellationToken.None)).Id);

        Assert.Equal(CalendarState.Failed, done.State);
        Assert.Equal(IndicativeSourceState.Rejected, _monitor!.Current.State);
        await Assert.ThrowsAsync<DomainException>(() => runner.StartAsync(request, CancellationToken.None));
        runner.Dispose();
    }

    [Fact]
    public async Task Startpruefung_meldet_den_Stand_der_Quelle()
    {
        Create(200).Runner.Dispose();
        Assert.True((await _monitor!.CheckAsync(CancellationToken.None)).Usable);
        _fares.Fail = IndicativeSourceState.Rejected;
        var status = await _monitor.CheckAsync(CancellationToken.None);
        Assert.False(status.Usable);
        Assert.Contains("Google", status.Message, StringComparison.Ordinal);
    }
}
