using System.Text.Json.Serialization;
using Microsoft.AspNetCore.StaticFiles;
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
app.MapPlaceEndpoints();
app.MapHotelEndpoints();
app.MapFlightEndpoints();
app.MapAirportEndpoints();

// Im Produktivbetrieb liefert die API auch das gebaute Frontend aus (frontend/dist → wwwroot).
// .mjs (z. B. der Web-Worker der Karte) kennt ASP.NET nicht von Haus aus – ohne Eintrag würde er nicht ausgeliefert.
var contentTypes = new FileExtensionContentTypeProvider();
contentTypes.Mappings[".mjs"] = "text/javascript";
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = contentTypes });

// Seiten-Pfade (ohne Dateiendung, nicht /api/...) landen in der React-App (Client-Routing).
// Fehlende Dateien und unbekannte API-Pfade bleiben ein sauberes 404 statt HTML.
app.MapFallbackToFile("{*path:nonfile:regex(^(?!api(/|$)).*$)}", "index.html");

await app.RunAsync();

/// <summary>Für spätere Integrationstests (WebApplicationFactory) sichtbar.</summary>
public partial class Program;
