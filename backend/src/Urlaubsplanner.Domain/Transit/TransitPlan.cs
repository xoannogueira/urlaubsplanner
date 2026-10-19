using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Domain.Transit;

/// <summary>Verbindungssuche mit Bus & Bahn von einem Punkt zu einem anderen.</summary>
/// <param name="Time">Abfahrt ab (bzw. Ankunft bis, wenn <see cref="ArriveBy"/>).</param>
/// <param name="Cursor">Weitere (frühere/spätere) Verbindungen einer vorherigen Suche.</param>
public sealed record TransitPlanRequest(Coordinates From, Coordinates To, DateTimeOffset Time, bool ArriveBy, string? Cursor);

/// <summary>Halt einer Teilstrecke. <paramref name="Time"/> in UTC, <paramref name="TimeZone"/> z. B. „Europe/Lisbon“.</summary>
public sealed record TransitStop(string Name, double Latitude, double Longitude, DateTimeOffset Time, string? TimeZone, string? Track);

/// <summary>Eine Teilstrecke: zu Fuß oder mit einem Verkehrsmittel.</summary>
/// <param name="Mode">Art laut Fahrplan, z. B. WALK, BUS, TRAM, SUBWAY, REGIONAL_RAIL, HIGHSPEED_RAIL, FERRY, COACH.</param>
/// <param name="Line">Liniennummer bzw. Zugname, z. B. „ICE 9576“ oder „Bus 728“.</param>
/// <param name="Stops">Zwischenhalte.</param>
public sealed record TransitLeg(
    string Mode,
    string? Line,
    string? Headsign,
    string? Agency,
    TransitStop From,
    TransitStop To,
    int DurationMinutes,
    int? DistanceMeters,
    int Stops,
    string? Color);

/// <summary>
/// Fahrpreis laut Verkehrsverbund (GTFS-Tarifdaten bei Transitous, experimentell): nur gesetzt, wenn sich für alle
/// Abschnitte ein Preis in einer Währung ergibt. Name des Tickets nur bei genau einem Ticket.
/// </summary>
public sealed record TransitFare(decimal Amount, string Currency, string? Name);

public sealed record TransitItinerary(
    DateTimeOffset Departure,
    DateTimeOffset Arrival,
    int DurationMinutes,
    int Transfers,
    IReadOnlyList<TransitLeg> Legs,
    TransitFare? Fare = null);

/// <param name="EarlierCursor">Für „Früher“ (null = keine weiteren).</param>
/// <param name="LaterCursor">Für „Später“.</param>
public sealed record TransitPlan(IReadOnlyList<TransitItinerary> Itineraries, string? EarlierCursor, string? LaterCursor);

public interface ITransitPlanner
{
    Task<TransitPlan> PlanAsync(TransitPlanRequest request, CancellationToken cancellationToken);
}

public sealed class TransitUnavailableException(string message, Exception? inner = null) : Exception(message, inner);
