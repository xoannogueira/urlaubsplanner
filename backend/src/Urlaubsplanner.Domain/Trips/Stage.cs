namespace Urlaubsplanner.Domain.Trips;

/// <summary>
/// Ein Ort mit Zeitraum innerhalb einer Reise, z. B. "Lissabon, 12.–16. Mai".
/// </summary>
public sealed class Stage
{
    private Stage(Guid id, string name, DateOnly startDate, DateOnly endDate, double? latitude, double? longitude, string? description = null)
    {
        Id = id;
        Description = description;
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

    /// <summary>Freie Beschreibung, z. B. was man dort vorhat.</summary>
    public string? Description { get; private set; }

    public int Nights => EndDate.DayNumber - StartDate.DayNumber;

    internal static Stage Create(StageData data) => Validate(Guid.NewGuid(), data);

    public static Stage Restore(Guid id, string name, DateOnly startDate, DateOnly endDate, double? latitude, double? longitude, string? description = null) =>
        new(id, name, startDate, endDate, latitude, longitude, description);

    internal void Update(StageData data)
    {
        var validated = Validate(Id, data);
        Name = validated.Name;
        StartDate = validated.StartDate;
        EndDate = validated.EndDate;
        Latitude = validated.Latitude;
        Longitude = validated.Longitude;
        Description = validated.Description;
    }

    /// <summary>Nur die Daten verschieben (Reisezeitraum geändert) – Ort und Beschreibung bleiben.</summary>
    internal void ChangeDates(DateOnly startDate, DateOnly endDate)
    {
        Guard.DateOrder(startDate, endDate, "endDate");
        StartDate = startDate;
        EndDate = endDate;
    }

    private static Stage Validate(Guid id, StageData data)
    {
        var name = Guard.RequiredText(data.Name, "name", 120);
        Guard.DateOrder(data.StartDate, data.EndDate, "endDate");
        var (lat, lng) = Guard.OptionalCoordinates(data.Latitude, data.Longitude);
        var description = Guard.OptionalText(data.Description, "description", 2000);
        return new Stage(id, name, data.StartDate, data.EndDate, lat, lng, description);
    }
}

public sealed record StageData(string Name, DateOnly StartDate, DateOnly EndDate, double? Latitude = null, double? Longitude = null, string? Description = null);
