namespace Urlaubsplanner.Domain.Trips;

/// <summary>
/// Speicher für Reisen. Phase 1 nutzt eine JSON-Datei; später kann hier PostgreSQL dahinter stehen,
/// ohne dass sich Domain oder API ändern.
/// </summary>
public interface ITripRepository
{
    Task<IReadOnlyList<Trip>> ListAsync(CancellationToken cancellationToken);

    Task<Trip?> GetAsync(Guid id, CancellationToken cancellationToken);

    Task AddAsync(Trip trip, CancellationToken cancellationToken);

    /// <summary>
    /// Lädt die Reise, wendet <paramref name="change"/> an und speichert atomar.
    /// Wirft <paramref name="change"/> eine Exception, wird nichts gespeichert.
    /// </summary>
    Task<TResult?> UpdateAsync<TResult>(Guid id, Func<Trip, TResult> change, CancellationToken cancellationToken)
        where TResult : class;

    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken);
}
