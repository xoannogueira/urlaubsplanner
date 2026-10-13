using System.Text.Json.Serialization;
using Microsoft.AspNetCore.StaticFiles;
using Urlaubsplanner.Api;
using Urlaubsplanner.Api.Desktop;
using Urlaubsplanner.Api.Endpoints;
using Urlaubsplanner.Infrastructure;
using Urlaubsplanner.Infrastructure.Persistence;

// Desktop-App (Doppelklick aufs Icon): Programmordner als Inhaltsordner, Daten im Benutzerordner, eigenes Fenster.
var desktop = AppPaths.IsDesktopRequested(args);
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = desktop ? AppContext.BaseDirectory : null,
});

var paths = AppPaths.Resolve(desktop, builder.Configuration[$"{JsonStorageOptions.Section}:FilePath"]);
Directory.CreateDirectory(paths.DataDirectory);

// In der App eingetragene Einstellungen (z. B. der eigene SerpApi-Key) – überschreiben alles andere.
builder.Configuration.AddJsonFile(paths.SettingsFile, optional: true, reloadOnChange: true);

var port = 0;
if (desktop)
{
    // Läuft die App schon, nur ein weiteres Fenster öffnen.
    if (await DesktopLauncher.TryActivateExistingAsync(paths))
    {
        return;
    }

    port = DesktopLauncher.ChoosePort();
    builder.WebHost.UseUrls($"http://127.0.0.1:{port}");
    builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
    {
        [$"{JsonStorageOptions.Section}:FilePath"] = paths.TripsFile,
    });
    builder.Logging.AddProvider(new FileLoggerProvider(paths.LogFile));
    builder.Services.AddSingleton<DesktopLifetime>();
    builder.Services.AddHostedService(sp => sp.GetRequiredService<DesktopLifetime>());
}

builder.Services.AddSingleton(paths);
builder.Services.AddSingleton<AppSettingsStore>();

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
app.MapAppEndpoints();
app.MapTripEndpoints();
app.MapPlaceEndpoints();
app.MapHotelEndpoints();
app.MapFlightEndpoints();
app.MapAirportEndpoints();
app.MapActivityEndpoints();

// Im Produktivbetrieb liefert die API auch das gebaute Frontend aus (frontend/dist → wwwroot).
// .mjs (z. B. der Web-Worker der Karte) kennt ASP.NET nicht von Haus aus – ohne Eintrag würde er nicht ausgeliefert.
var contentTypes = new FileExtensionContentTypeProvider();
contentTypes.Mappings[".mjs"] = "text/javascript";
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = contentTypes });

// Seiten-Pfade (ohne Dateiendung, nicht /api/...) landen in der React-App (Client-Routing).
// Fehlende Dateien und unbekannte API-Pfade bleiben ein sauberes 404 statt HTML.
app.MapFallbackToFile("{*path:nonfile:regex(^(?!api(/|$)).*$)}", "index.html");

if (desktop)
{
    await app.StartAsync();
    var url = $"http://127.0.0.1:{port}/";
    DesktopLauncher.WriteInstance(paths, port);
    DesktopLauncher.OpenWindow(url, paths);
    await app.WaitForShutdownAsync();
    DesktopLauncher.DeleteInstance(paths);
}
else
{
    await app.RunAsync();
}

/// <summary>Für spätere Integrationstests (WebApplicationFactory) sichtbar.</summary>
public partial class Program;
