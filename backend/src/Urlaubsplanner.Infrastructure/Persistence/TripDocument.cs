using Urlaubsplanner.Domain.Trips;

namespace Urlaubsplanner.Infrastructure.Persistence;

/// <summary>
/// So liegt eine Reise in der JSON-Datei. Bewusst getrennt vom Domain-Modell,
/// damit sich das Speicherformat unabhängig von der Fachlogik entwickeln kann.
/// </summary>
internal sealed record TripDocument(
    Guid Id,
    string Name,
    int Travelers,
    DateOnly? StartDate,
    DateOnly? EndDate,
    string? Notes,
    string? OwnerId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    List<StageDocument> Stages,
    List<OptionDocument> Options)
{
    public static TripDocument From(Trip trip) => new(
        trip.Id,
        trip.Name,
        trip.Travelers,
        trip.StartDate,
        trip.EndDate,
        trip.Notes,
        trip.OwnerId,
        trip.CreatedAt,
        trip.UpdatedAt,
        trip.Stages.Select(StageDocument.From).ToList(),
        trip.Options.Select(OptionDocument.From).ToList());

    public Trip ToDomain() => Trip.Restore(
        Id,
        Name,
        Travelers,
        StartDate,
        EndDate,
        Notes,
        OwnerId,
        CreatedAt,
        UpdatedAt,
        Stages.Select(s => s.ToDomain()),
        Options.Select(o => o.ToDomain()));
}

internal sealed record StageDocument(Guid Id, string Name, DateOnly StartDate, DateOnly EndDate, double? Latitude, double? Longitude)
{
    public static StageDocument From(Stage s) => new(s.Id, s.Name, s.StartDate, s.EndDate, s.Latitude, s.Longitude);

    public Stage ToDomain() => Stage.Restore(Id, Name, StartDate, EndDate, Latitude, Longitude);
}

internal sealed record OptionDocument(
    Guid Id,
    OptionKind Kind,
    OptionStatus Status,
    Guid? StageId,
    string Title,
    string? Url,
    decimal? Price,
    bool PricePerPerson,
    DateOnly? StartDate,
    DateOnly? EndDate,
    string? LocationName,
    double? Latitude,
    double? Longitude,
    string? Notes,
    string Provider,
    DateTimeOffset? PriceCheckedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? ExternalId = null,
    string? ImageUrl = null)
{
    public static OptionDocument From(TripOption o) => new(
        o.Id, o.Kind, o.Status, o.StageId, o.Title, o.Url, o.Price, o.PricePerPerson, o.StartDate, o.EndDate,
        o.LocationName, o.Latitude, o.Longitude, o.Notes, o.Provider, o.PriceCheckedAt, o.CreatedAt, o.UpdatedAt, o.ExternalId, o.ImageUrl);

    public TripOption ToDomain() => TripOption.Restore(
        Id, Kind, Status, StageId, Title, Url, Price, PricePerPerson, StartDate, EndDate,
        LocationName, Latitude, Longitude, Notes, Provider, ExternalId, ImageUrl, PriceCheckedAt, CreatedAt, UpdatedAt);
}

internal sealed record TripStoreFile(int Version, List<TripDocument> Trips)
{
    public const int CurrentVersion = 1;
}
