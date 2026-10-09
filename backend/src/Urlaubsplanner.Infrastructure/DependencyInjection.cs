using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Urlaubsplanner.Domain.Trips;
using Urlaubsplanner.Infrastructure.Persistence;

namespace Urlaubsplanner.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<JsonStorageOptions>(configuration.GetSection(JsonStorageOptions.Section));
        services.AddSingleton<ITripRepository, JsonTripRepository>();
        return services;
    }
}
