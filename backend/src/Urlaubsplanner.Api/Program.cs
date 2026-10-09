using System.Text.Json.Serialization;
using Urlaubsplanner.Api;
using Urlaubsplanner.Api.Endpoints;
using Urlaubsplanner.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<DomainExceptionHandler>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddResponseCompression(options => options.EnableForHttps = true);
builder.Services.AddInfrastructure(builder.Configuration);

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseResponseCompression();

app.MapGet("/api/health", () => TypedResults.Ok(new { status = "ok" }));
app.MapTripEndpoints();

// Im Produktivbetrieb liefert die API auch das gebaute Frontend aus (frontend/dist → wwwroot).
app.UseDefaultFiles();
app.UseStaticFiles();
// Alle Pfade außer /api/... landen in der React-App (Client-Routing); unbekannte API-Pfade bleiben 404.
app.MapFallbackToFile("{*path:regex(^(?!api(/|$)).*$)}", "index.html");

await app.RunAsync();

/// <summary>Für spätere Integrationstests (WebApplicationFactory) sichtbar.</summary>
public partial class Program;
