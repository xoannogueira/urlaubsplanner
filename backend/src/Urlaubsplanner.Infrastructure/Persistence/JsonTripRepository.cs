using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain.Trips;

namespace Urlaubsplanner.Infrastructure.Persistence;

public sealed class JsonStorageOptions
{
    public const string Section = "Storage";

    /// <summary>Pfad zur Datendatei. Relativ = relativ zum Arbeitsverzeichnis der API.</summary>
    public string FilePath { get; set; } = "data/trips.json";
}

/// <summary>
/// Speichert alle Reisen in einer JSON-Datei. Alles liegt zusätzlich im Speicher, Lesen ist daher sofort.
/// Schreiben läuft über eine Sperre und eine temporäre Datei, damit die Datei nie halb geschrieben ist.
/// </summary>
public sealed partial class JsonTripRepository : ITripRepository, IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly string _filePath;
    private readonly ILogger<JsonTripRepository> _logger;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private Dictionary<Guid, TripDocument>? _trips;

    public JsonTripRepository(IOptions<JsonStorageOptions> options, ILogger<JsonTripRepository> logger)
    {
        ArgumentNullException.ThrowIfNull(options);
        _filePath = Path.GetFullPath(options.Value.FilePath);
        _logger = logger;
    }

    public async Task<IReadOnlyList<Trip>> ListAsync(CancellationToken cancellationToken)
    {
        var trips = await LoadAsync(cancellationToken).ConfigureAwait(false);
        return trips.Values
            .OrderByDescending(t => t.UpdatedAt)
            .Select(t => t.ToDomain())
            .ToList();
    }

    public async Task<Trip?> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var trips = await LoadAsync(cancellationToken).ConfigureAwait(false);
        return trips.TryGetValue(id, out var doc) ? doc.ToDomain() : null;
    }

    public async Task AddAsync(Trip trip, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(trip);
        await WriteAsync(trips => trips[trip.Id] = TripDocument.From(trip), cancellationToken).ConfigureAwait(false);
    }

    public async Task<TResult?> UpdateAsync<TResult>(Guid id, Func<Trip, TResult> change, CancellationToken cancellationToken)
        where TResult : class
    {
        ArgumentNullException.ThrowIfNull(change);
        TResult? result = null;
        await WriteAsync(
            trips =>
            {
                if (!trips.TryGetValue(id, out var doc))
                {
                    return;
                }

                var trip = doc.ToDomain();
                result = change(trip);
                trips[id] = TripDocument.From(trip);
            },
            cancellationToken).ConfigureAwait(false);
        return result;
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var removed = false;
        await WriteAsync(trips => removed = trips.Remove(id), cancellationToken).ConfigureAwait(false);
        return removed;
    }

    public void Dispose() => _lock.Dispose();

    private async Task<Dictionary<Guid, TripDocument>> LoadAsync(CancellationToken cancellationToken)
    {
        if (_trips is { } loaded)
        {
            return loaded;
        }

        await _lock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            return _trips ??= await ReadFileAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>
    /// Arbeitet auf einer Kopie und übernimmt sie erst, wenn Änderung und Speichern geklappt haben.
    /// </summary>
    private async Task WriteAsync(Action<Dictionary<Guid, TripDocument>> change, CancellationToken cancellationToken)
    {
        await LoadAsync(cancellationToken).ConfigureAwait(false);
        await _lock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var copy = new Dictionary<Guid, TripDocument>(_trips!);
            change(copy);
            await WriteFileAsync(copy, cancellationToken).ConfigureAwait(false);
            _trips = copy;
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task<Dictionary<Guid, TripDocument>> ReadFileAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_filePath))
        {
            LogNewStore(_filePath);
            return [];
        }

        await using var stream = File.OpenRead(_filePath);
        var file = await JsonSerializer.DeserializeAsync<TripStoreFile>(stream, JsonOptions, cancellationToken).ConfigureAwait(false)
            ?? new TripStoreFile(TripStoreFile.CurrentVersion, []);
        LogLoaded(file.Trips.Count, _filePath);
        return file.Trips.ToDictionary(t => t.Id);
    }

    private async Task WriteFileAsync(Dictionary<Guid, TripDocument> trips, CancellationToken cancellationToken)
    {
        var directory = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var tempPath = _filePath + ".tmp";
        var file = new TripStoreFile(TripStoreFile.CurrentVersion, trips.Values.OrderBy(t => t.CreatedAt).ToList());
        await using (var stream = File.Create(tempPath))
        {
            await JsonSerializer.SerializeAsync(stream, file, JsonOptions, cancellationToken).ConfigureAwait(false);
        }

        File.Move(tempPath, _filePath, overwrite: true);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Keine Datendatei gefunden, starte leer: {Path}")]
    private partial void LogNewStore(string path);

    [LoggerMessage(Level = LogLevel.Information, Message = "{Count} Reisen geladen aus {Path}")]
    private partial void LogLoaded(int count, string path);
}
