namespace Urlaubsplanner.Domain.Trips;

/// <summary>
/// Ein Flug, Hotel, eine Aktivität o. Ä., die für die Reise in Frage kommt.
/// In Phase 1 werden Optionen manuell (mit Link) angelegt; später kommen sie auch aus Such-APIs.
/// </summary>
public sealed class TripOption
{
    private TripOption(Guid id, OptionKind kind, OptionStatus status, string provider, DateTimeOffset createdAt)
    {
        Id = id;
        Kind = kind;
        Status = status;
        Provider = provider;
        CreatedAt = createdAt;
        UpdatedAt = createdAt;
        Title = string.Empty;
    }

    public Guid Id { get; }

    public OptionKind Kind { get; private set; }

    public OptionStatus Status { get; private set; }

    /// <summary>Etappe, zu der die Option gehört. <c>null</c> = gilt für die ganze Reise.</summary>
    public Guid? StageId { get; private set; }

    public string Title { get; private set; }

    public string? Url { get; private set; }

    /// <summary>Preis in Euro. Bedeutung hängt von <see cref="PricePerPerson"/> ab.</summary>
    public decimal? Price { get; private set; }

    public bool PricePerPerson { get; private set; }

    public DateOnly? StartDate { get; private set; }

    public DateOnly? EndDate { get; private set; }

    public string? LocationName { get; private set; }

    public double? Latitude { get; private set; }

    public double? Longitude { get; private set; }

    public string? Notes { get; private set; }

    /// <summary>Woher die Option stammt, z. B. "manual". Später "liteapi", "ignav" …</summary>
    public string Provider { get; }

    /// <summary>Wann der Preis zuletzt geprüft wurde. Preise sind immer nur Momentaufnahmen.</summary>
    public DateTimeOffset? PriceCheckedAt { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public decimal? TotalPrice(int travelers) =>
        Price is null ? null : PricePerPerson ? Price.Value * travelers : Price.Value;

    internal static TripOption Create(OptionData data, DateTimeOffset now)
    {
        var option = new TripOption(Guid.NewGuid(), data.Kind, data.Status, "manual", now);
        option.Apply(data, now);
        return option;
    }

    public static TripOption Restore(
        Guid id,
        OptionKind kind,
        OptionStatus status,
        Guid? stageId,
        string title,
        string? url,
        decimal? price,
        bool pricePerPerson,
        DateOnly? startDate,
        DateOnly? endDate,
        string? locationName,
        double? latitude,
        double? longitude,
        string? notes,
        string provider,
        DateTimeOffset? priceCheckedAt,
        DateTimeOffset createdAt,
        DateTimeOffset updatedAt) =>
        new(id, kind, status, provider, createdAt)
        {
            StageId = stageId,
            Title = title,
            Url = url,
            Price = price,
            PricePerPerson = pricePerPerson,
            StartDate = startDate,
            EndDate = endDate,
            LocationName = locationName,
            Latitude = latitude,
            Longitude = longitude,
            Notes = notes,
            PriceCheckedAt = priceCheckedAt,
            UpdatedAt = updatedAt,
        };

    internal void Update(OptionData data, DateTimeOffset now) => Apply(data, now);

    internal void ChangeStatus(OptionStatus status, DateTimeOffset now)
    {
        if (!Enum.IsDefined(status))
        {
            throw new DomainException("status", "Unbekannter Status.");
        }

        Status = status;
        UpdatedAt = now;
    }

    internal void DetachFromStage(DateTimeOffset now)
    {
        StageId = null;
        UpdatedAt = now;
    }

    private void Apply(OptionData data, DateTimeOffset now)
    {
        if (!Enum.IsDefined(data.Kind))
        {
            throw new DomainException("kind", "Unbekannte Art.");
        }

        if (!Enum.IsDefined(data.Status))
        {
            throw new DomainException("status", "Unbekannter Status.");
        }

        var title = Guard.RequiredText(data.Title, "title", 200);
        var url = Guard.OptionalWebUrl(data.Url, "url");
        var price = Guard.OptionalPrice(data.Price, "price");
        Guard.DateOrder(data.StartDate, data.EndDate, "endDate");
        var (lat, lng) = Guard.OptionalCoordinates(data.Latitude, data.Longitude);

        Kind = data.Kind;
        Status = data.Status;
        StageId = data.StageId;
        Title = title;
        Url = url;
        PriceCheckedAt = price != Price ? (price is null ? null : now) : PriceCheckedAt;
        Price = price;
        PricePerPerson = data.PricePerPerson;
        StartDate = data.StartDate;
        EndDate = data.EndDate;
        LocationName = Guard.OptionalText(data.LocationName, "locationName", 200);
        Latitude = lat;
        Longitude = lng;
        Notes = Guard.OptionalText(data.Notes, "notes", 4000);
        UpdatedAt = now;
    }
}

public sealed record OptionData(
    OptionKind Kind,
    string Title,
    OptionStatus Status = OptionStatus.Idea,
    Guid? StageId = null,
    string? Url = null,
    decimal? Price = null,
    bool PricePerPerson = false,
    DateOnly? StartDate = null,
    DateOnly? EndDate = null,
    string? LocationName = null,
    double? Latitude = null,
    double? Longitude = null,
    string? Notes = null);
