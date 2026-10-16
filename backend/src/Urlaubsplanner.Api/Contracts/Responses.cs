using Urlaubsplanner.Domain.Trips;

namespace Urlaubsplanner.Api.Contracts;

public sealed record TripListItem(
    Guid Id,
    string Name,
    int Travelers,
    DateOnly? StartDate,
    DateOnly? EndDate,
    IReadOnlyList<string> StageNames,
    decimal TotalCost,
    decimal CostPerPerson,
    int ChosenCount,
    int BookedCount,
    int FavoriteCount,
    DateTimeOffset UpdatedAt)
{
    public static TripListItem From(Trip trip)
    {
        var summary = TripSummaryCalculator.Calculate(trip);
        return new TripListItem(
            trip.Id,
            trip.Name,
            trip.Travelers,
            summary.StartDate,
            summary.EndDate,
            trip.Stages.Select(s => s.Name).ToList(),
            summary.TotalCost,
            summary.CostPerPerson,
            summary.ChosenCount,
            summary.BookedCount,
            trip.Options.Count(o => o.Status == OptionStatus.Favorite),
            trip.UpdatedAt);
    }
}

public sealed record TripResponse(
    Guid Id,
    string Name,
    int Travelers,
    DateOnly? StartDate,
    DateOnly? EndDate,
    string? Notes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<StageResponse> Stages,
    IReadOnlyList<OptionResponse> Options,
    PackingList Packing,
    TripParty Party)
{
    public static TripResponse From(Trip trip) => new(
        trip.Id,
        trip.Name,
        trip.Travelers,
        trip.StartDate,
        trip.EndDate,
        trip.Notes,
        trip.CreatedAt,
        trip.UpdatedAt,
        trip.Stages.Select(StageResponse.From).ToList(),
        trip.Options.OrderBy(o => o.CreatedAt).Select(o => OptionResponse.From(o, trip.Travelers)).ToList(),
        trip.Packing,
        trip.Party);
}

public sealed record StageResponse(Guid Id, string Name, DateOnly StartDate, DateOnly EndDate, int Nights, double? Latitude, double? Longitude, string? Description)
{
    public static StageResponse From(Stage s) => new(s.Id, s.Name, s.StartDate, s.EndDate, s.Nights, s.Latitude, s.Longitude, s.Description);
}

public sealed record OptionResponse(
    Guid Id,
    OptionKind Kind,
    OptionStatus Status,
    Guid? StageId,
    string Title,
    string? Url,
    decimal? Price,
    bool PricePerPerson,
    decimal? TotalPrice,
    DateOnly? StartDate,
    DateOnly? EndDate,
    string? LocationName,
    double? Latitude,
    double? Longitude,
    string? Notes,
    string Provider,
    string? ExternalId,
    string? ImageUrl,
    DateTimeOffset? PriceCheckedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt)
{
    public static OptionResponse From(TripOption o, int travelers) => new(
        o.Id, o.Kind, o.Status, o.StageId, o.Title, o.Url, o.Price, o.PricePerPerson, o.TotalPrice(travelers),
        o.StartDate, o.EndDate, o.LocationName, o.Latitude, o.Longitude, o.Notes, o.Provider, o.ExternalId, o.ImageUrl, o.PriceCheckedAt,
        o.CreatedAt, o.UpdatedAt);
}
