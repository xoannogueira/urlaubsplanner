using Microsoft.AspNetCore.Http.HttpResults;
using Urlaubsplanner.Api.Packing;
using Urlaubsplanner.Domain.Packing;

namespace Urlaubsplanner.Api.Endpoints;

public sealed record PackingTemplateRequest(string? Name, IReadOnlyList<PackingTemplateItem>? Items);

public sealed record PackingTemplateRename(string? Name);

/// <summary>Packlisten-Vorlagen: speichern, übernehmen (geschieht in der App), umbenennen, löschen.</summary>
public static class PackingTemplateEndpoints
{
    public static IEndpointRouteBuilder MapPackingTemplateEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/packing-templates").WithTags("Packliste");
        group.MapGet("/", (PackingTemplateStore store) => TypedResults.Ok(store.List()));
        group.MapPost("/", (PackingTemplateRequest request, PackingTemplateStore store) =>
            TypedResults.Ok(store.Save(request.Name, request.Items)));
        group.MapPut("/{id:guid}", (Guid id, PackingTemplateRename request, PackingTemplateStore store) =>
            TypedResults.Ok(store.Rename(id, request.Name)));
        group.MapDelete("/{id:guid}", (Guid id, PackingTemplateStore store) =>
        {
            store.Delete(id);
            return TypedResults.NoContent();
        });
        return app;
    }
}
