using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Trips;
using Urlaubsplanner.Infrastructure.Persistence;

namespace Urlaubsplanner.Tests.Infrastructure;

public sealed class JsonTripRepositoryTests : IDisposable
{
    private static readonly DateTimeOffset Now = new(2026, 10, 9, 12, 0, 0, TimeSpan.Zero);
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "urlaubsplanner-tests", Guid.NewGuid().ToString("N"));

    private string FilePath => Path.Combine(_directory, "trips.json");

    private JsonTripRepository CreateRepository() =>
        new(Options.Create(new JsonStorageOptions { FilePath = FilePath }), NullLogger<JsonTripRepository>.Instance);

    public void Dispose()
    {
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }

    [Fact]
    public async Task Reise_ueberlebt_einen_Neustart()
    {
        var trip = Trip.Create(new TripData("Portugal", 4), Now);
        var stage = trip.AddStage(new StageData("Lissabon", new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16), 38.72, -9.14), Now);
        trip.AddOption(new OptionData(OptionKind.Hotel, "Hotel", OptionStatus.Selected, stage.Id, "https://example.com/", 284.5m), Now);

        using (var repository = CreateRepository())
        {
            await repository.AddAsync(trip, CancellationToken.None);
        }

        using var reloaded = CreateRepository();
        var loaded = await reloaded.GetAsync(trip.Id, CancellationToken.None);

        Assert.NotNull(loaded);
        Assert.Equal("Portugal", loaded.Name);
        var loadedStage = Assert.Single(loaded.Stages);
        Assert.Equal(38.72, loadedStage.Latitude);
        var option = Assert.Single(loaded.Options);
        Assert.Equal(OptionStatus.Selected, option.Status);
        Assert.Equal(284.5m, option.Price);
        Assert.Equal(stage.Id, option.StageId);
    }

    [Fact]
    public async Task Fehlgeschlagene_Aenderung_wird_nicht_gespeichert()
    {
        using var repository = CreateRepository();
        var trip = Trip.Create(new TripData("Portugal", 4), Now);
        await repository.AddAsync(trip, CancellationToken.None);

        await Assert.ThrowsAsync<DomainException>(() =>
            repository.UpdateAsync<object>(
                trip.Id,
                t =>
                {
                    t.Update(new TripData("Neuer Name", 4), Now);
                    t.Update(new TripData("", 4), Now); // wirft
                    return t;
                },
                CancellationToken.None));

        var loaded = await repository.GetAsync(trip.Id, CancellationToken.None);
        Assert.Equal("Portugal", loaded!.Name);
    }

    [Fact]
    public async Task Aenderung_an_unbekannter_Reise_liefert_null()
    {
        using var repository = CreateRepository();
        var result = await repository.UpdateAsync<object>(Guid.NewGuid(), t => t, CancellationToken.None);
        Assert.Null(result);
        Assert.False(File.Exists(FilePath) && (await File.ReadAllTextAsync(FilePath)).Contains("Portugal", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Loeschen_entfernt_die_Reise()
    {
        using var repository = CreateRepository();
        var trip = Trip.Create(new TripData("Weg damit", 1), Now);
        await repository.AddAsync(trip, CancellationToken.None);

        Assert.True(await repository.DeleteAsync(trip.Id, CancellationToken.None));
        Assert.False(await repository.DeleteAsync(trip.Id, CancellationToken.None));
        Assert.Empty(await repository.ListAsync(CancellationToken.None));
    }

    [Fact]
    public async Task Gleichzeitige_Aenderungen_gehen_nicht_verloren()
    {
        using var repository = CreateRepository();
        var trip = Trip.Create(new TripData("Parallel", 2), Now);
        await repository.AddAsync(trip, CancellationToken.None);

        await Task.WhenAll(Enumerable.Range(0, 20).Select(i =>
            repository.UpdateAsync(trip.Id, t => t.AddOption(new OptionData(OptionKind.Activity, $"Option {i}"), Now), CancellationToken.None)));

        var loaded = await repository.GetAsync(trip.Id, CancellationToken.None);
        Assert.Equal(20, loaded!.Options.Count);
    }
}
