namespace Urlaubsplanner.Domain.Trips;

/// <summary>
/// Ein Flug, Hotel, eine Aktivität o. Ä., die für die Reise in Frage kommt.
/// In Phase 1 werden Optionen manuell (mit Link) angelegt; später kommen sie auch aus Such-APIs.
/// </summary>
public sealed class TripOption
{
    /// <summary>Erlaubte Herkunft einer Option. "manual" = selbst eingetragen.</summary>
    public static readonly IReadOnlySet<string> KnownProviders = new HashSet<string>(StringComparer.Ordinal) { "manual", "liteapi", "osm" };

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

    /// <summary>Woher die Option stammt: "manual" oder ein Suchanbieter wie "liteapi".</summary>
    public string Provider { get; }

    /// <summary>ID beim Anbieter (z. B. LiteAPI-Hotel-ID). Damit erkennt die Suche bereits gemerkte Treffer.</summary>
    public string? ExternalId { get; private set; }

    /// <summary>Vorschaubild, z. B. das Hotelfoto aus der Suche.</summary>
    public string? ImageUrl { get; private set; }

    /// <summary>Wann der Preis zuletzt geprüft wurde. Preise sind immer nur Momentaufnahmen.</summary>
    public DateTimeOffset? PriceCheckedAt { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public decimal? TotalPrice(int travelers) =>
        Price is null ? null : PricePerPerson ? Price.Value * travelers : Price.Value;

    internal static TripOption Create(OptionData data, DateTimeOffset now)
    {
        var provider = data.Provider ?? "manual";
        if (!KnownProviders.Contains(provider))
        {
            throw new DomainException("provider", "Unbekannte Herkunft.");
        }

        var option = new TripOption(Guid.NewGuid(), data.Kind, data.Status, provider, now)
        {
            ExternalId = Guard.OptionalText(data.ExternalId, "externalId", 200),
        };
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
        string? externalId,
        string? imageUrl,
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
            ExternalId = externalId,
            ImageUrl = imageUrl,
            PriceCheckedAt = priceCheckedAt,
            UpdatedAt = updatedAt,
        };

    internal void Update(OptionData data, DateTimeOffset now) => Apply(data, now);

    /// <summary>Preis wurde (neu) geprüft – setzt den Prüfzeitpunkt auch dann, wenn der Preis gleich geblieben ist.</summary>
    internal void ConfirmPrice(decimal price, DateTimeOffset now)
    {
        Price = Guard.OptionalPrice(price, "price");
        PriceCheckedAt = now;
        UpdatedAt = now;
    }

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
        ImageUrl = Guard.OptionalWebUrl(data.ImageUrl, "imageUrl");
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
    string? Notes = null,
    string? ImageUrl = null,
    /// <summary>Nur beim Anlegen relevant; danach bleibt die Herkunft unverändert.</summary>
    string? Provider = null,
    string? ExternalId = null);
