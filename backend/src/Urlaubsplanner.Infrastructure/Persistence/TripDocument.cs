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
    List<OptionDocument> Options,
    PackingList? Packing = null,
    TripParty? Party = null,
    SearchSettings? SearchSettings = null)
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
        trip.Options.Select(OptionDocument.From).ToList(),
        trip.Packing.Items.Count + trip.Packing.Dismissed.Count > 0 ? trip.Packing : null,
        trip.Party.Members.Count + trip.Party.Expenses.Count + trip.Party.OptionShares.Count > 0 ? trip.Party : null,
        trip.SearchSettings.IsEmpty ? null : trip.SearchSettings);

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
        Options.Select(o => o.ToDomain()),
        Packing,
        Party,
        SearchSettings);
}

internal sealed record StageDocument(Guid Id, string Name, DateOnly StartDate, DateOnly EndDate, double? Latitude, double? Longitude, string? Description = null)
{
    public static StageDocument From(Stage s) => new(s.Id, s.Name, s.StartDate, s.EndDate, s.Latitude, s.Longitude, s.Description);

    public Stage ToDomain() => Stage.Restore(Id, Name, StartDate, EndDate, Latitude, Longitude, Description);
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
