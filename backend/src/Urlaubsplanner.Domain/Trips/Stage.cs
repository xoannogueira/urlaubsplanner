namespace Urlaubsplanner.Domain.Trips;

/// <summary>
/// Ein Ort mit Zeitraum innerhalb einer Reise, z. B. "Lissabon, 12.–16. Mai".
/// </summary>
public sealed class Stage
{
    private Stage(Guid id, string name, DateOnly startDate, DateOnly endDate, double? latitude, double? longitude)
    {
        Id = id;
        Name = name;
        StartDate = startDate;
        EndDate = endDate;
        Latitude = latitude;
        Longitude = longitude;
    }

    public Guid Id { get; }

    public string Name { get; private set; }

    public DateOnly StartDate { get; private set; }

    public DateOnly EndDate { get; private set; }

    public double? Latitude { get; private set; }

    public double? Longitude { get; private set; }

    public int Nights => EndDate.DayNumber - StartDate.DayNumber;

    internal static Stage Create(StageData data) => Validate(Guid.NewGuid(), data);

    public static Stage Restore(Guid id, string name, DateOnly startDate, DateOnly endDate, double? latitude, double? longitude) =>
        new(id, name, startDate, endDate, latitude, longitude);

    internal void Update(StageData data)
    {
        var validated = Validate(Id, data);
        Name = validated.Name;
        StartDate = validated.StartDate;
        EndDate = validated.EndDate;
        Latitude = validated.Latitude;
        Longitude = validated.Longitude;
    }

    private static Stage Validate(Guid id, StageData data)
    {
        var name = Guard.RequiredText(data.Name, "name", 120);
        Guard.DateOrder(data.StartDate, data.EndDate, "endDate");
        var (lat, lng) = Guard.OptionalCoordinates(data.Latitude, data.Longitude);
        return new Stage(id, name, data.StartDate, data.EndDate, lat, lng);
    }
}

public sealed record StageData(string Name, DateOnly StartDate, DateOnly EndDate, double? Latitude = null, double? Longitude = null);
