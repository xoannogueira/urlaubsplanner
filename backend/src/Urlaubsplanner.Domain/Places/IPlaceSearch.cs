namespace Urlaubsplanner.Domain.Places;

/// <summary>Ein gefundener Ort, z. B. eine Stadt, ein Hotel oder eine Sehenswürdigkeit.</summary>
/// <param name="Name">Kurzer Name, z. B. "Lissabon".</param>
/// <param name="Label">Zum Anzeigen in der Liste, z. B. "Lissabon, Portugal".</param>
/// <param name="Type">Grobe Art, z. B. "city", "hotel", "attraction" – nur zur Anzeige.</param>
public sealed record Place(string Name, string Label, double Latitude, double Longitude, string? Type);

/// <summary>
/// Ortssuche (Geocoding). Die Implementierung ist austauschbar, aktuell Photon (OpenStreetMap-Daten).
/// </summary>
public interface IPlaceSearch
{
    /// <param name="near">Optional: Ergebnisse in der Nähe bevorzugen, z. B. Hotels nahe der Etappe.</param>
    Task<IReadOnlyList<Place>> SearchAsync(string query, Coordinates? near, CancellationToken cancellationToken);
}

/// <summary>
/// Umgekehrte Ortssuche: Namen der Orte und Regionen rund um einen Punkt, vom kleinsten zum größten
/// (z. B. „Höfn“, „Hornafjörður“, „Suðurland“). Hilft, wenn ein Etappenname zu klein für andere Dienste ist.
/// </summary>
public interface IPlaceNames
{
    Task<IReadOnlyList<string>> NamesAroundAsync(Coordinates point, CancellationToken cancellationToken);
}

/// <summary>Ein Punkt auf der Karte (WGS84).</summary>
public readonly record struct Coordinates(double Latitude, double Longitude)
{
    public static Coordinates? TryCreate(double? latitude, double? longitude) =>
        latitude is >= -90 and <= 90 && longitude is >= -180 and <= 180 ? new Coordinates(latitude.Value, longitude.Value) : null;
}

/// <summary>Der Suchdienst ist gerade nicht erreichbar. Die API antwortet dann mit 503.</summary>
public sealed class PlaceSearchUnavailableException(string message, Exception? inner = null) : Exception(message, inner);
