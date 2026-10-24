using Urlaubsplanner.Api.PriceStats;

namespace Urlaubsplanner.Api.Endpoints;

/// <summary>Gespeicherte Preisdaten verwalten: Übersicht, Ungenutztes auslagern, zurückholen, Ausgewähltes löschen.</summary>
public static class DataEndpoints
{
    public static IEndpointRouteBuilder MapDataEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/data").WithTags("Daten");
        group.MapGet("/", (DataOffload offload) => TypedResults.Ok(new { Stored = offload.Stored(), Offloaded = offload.Offloaded() }));
        group.MapPost("/offload", (int? days, DataOffload offload, TimeProvider clock) =>
            TypedResults.Ok(new { Count = offload.OffloadUnused(days ?? 30, clock.GetUtcNow()) }));
        group.MapPost("/delete", (DeleteDataRequest request, DataOffload offload, TimeProvider clock) =>
            TypedResults.Ok(new { Count = offload.DeleteSelected(request, clock.GetUtcNow()) }));
        group.MapPost("/offloaded/{name}/restore", (string name, DataOffload offload) =>
        {
            offload.Restore(name);
            return Results.NoContent();
        });
        group.MapDelete("/offloaded/{name}", (string name, DataOffload offload) =>
        {
            offload.Delete(name);
            return Results.NoContent();
        });
        return app;
    }
}
