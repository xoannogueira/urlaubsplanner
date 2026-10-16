namespace Urlaubsplanner.Api;

/// <summary>
/// Der Server läuft nur auf dem eigenen Rechner. Fremde Webseiten im Browser dürfen ihn nicht fernsteuern:
/// Ändernde Anfragen (POST/PUT/PATCH/DELETE) mit einer fremden Herkunft werden abgelehnt. Zusammen mit
/// <c>AllowedHosts</c> (nur localhost/127.0.0.1) schützt das vor Cross-Site-Requests und DNS-Rebinding.
/// </summary>
public static class LocalRequestGuard
{
    public static IApplicationBuilder UseLocalRequestGuard(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            var request = context.Request;
            var changes = !(HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method) || HttpMethods.IsOptions(request.Method));
            if (changes && request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase) && !IsTrusted(request))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new
                {
                    title = "Anfrage abgelehnt",
                    detail = "Änderungen sind nur aus der App selbst erlaubt, nicht von anderen Webseiten.",
                    status = 403,
                }).ConfigureAwait(false);
                return;
            }

            await next(context).ConfigureAwait(false);
        });

    internal static bool IsTrusted(HttpRequest request)
    {
        var origin = request.Headers.Origin.ToString();
        if (!string.IsNullOrEmpty(origin))
        {
            return IsLocal(origin);
        }

        // Ohne Origin: Browser kennzeichnen fremde Anfragen über Sec-Fetch-Site; Programme (Tests, curl) schicken nichts.
        var site = request.Headers["Sec-Fetch-Site"].ToString();
        return site is "" or "same-origin" or "none";
    }

    private static bool IsLocal(string origin) =>
        Uri.TryCreate(origin, UriKind.Absolute, out var uri)
        && (uri.IsLoopback || string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase));
}
