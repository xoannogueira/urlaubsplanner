using Urlaubsplanner.Domain.Trips;

namespace Urlaubsplanner.Api.Contracts;

public sealed record TripRequest(string Name, int Travelers, DateOnly? StartDate, DateOnly? EndDate, string? Notes)
{
    public TripData ToData() => new(Name, Travelers, StartDate, EndDate, Notes);
}

public sealed record StageRequest(string Name, DateOnly StartDate, DateOnly EndDate, double? Latitude, double? Longitude)
{
    public StageData ToData() => new(Name, StartDate, EndDate, Latitude, Longitude);
}

public sealed record OptionRequest(
    OptionKind Kind,
    string Title,
    OptionStatus? Status,
    Guid? StageId,
    string? Url,
    decimal? Price,
    bool PricePerPerson,
    DateOnly? StartDate,
    DateOnly? EndDate,
    string? LocationName,
    double? Latitude,
    double? Longitude,
    string? Notes,
    string? ImageUrl = null,
    string? Provider = null,
    string? ExternalId = null)
{
    public OptionData ToData() => new(
        Kind,
        Title,
        Status ?? OptionStatus.Idea,
        StageId,
        Url,
        Price,
        PricePerPerson,
        StartDate,
        EndDate,
        LocationName,
        Latitude,
        Longitude,
        Notes,
        ImageUrl,
        Provider,
        ExternalId);
}

public sealed record StatusRequest(OptionStatus Status);
