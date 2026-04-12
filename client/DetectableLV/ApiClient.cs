using System.Net.Http.Json;
using DetectableLV.Models;

namespace DetectableLV;

public static class ApiClient
{
    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromSeconds(60)
    };

    public static async Task NotifyStartAsync(string baseUrl, string sessionId)
    {
        try
        {
            await Http.PostAsync($"{baseUrl}/api/submit/{sessionId}/start", null);
        }
        catch { /* non-critical */ }
    }

    public static async Task SubmitResultAsync(string baseUrl, string sessionId, ScanResult result)
    {
        var response = await Http.PostAsJsonAsync(
            $"{baseUrl}/api/submit/{sessionId}",
            result,
            new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
            });

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            throw new Exception($"Server returned {(int)response.StatusCode}: {body}");
        }
    }
}
