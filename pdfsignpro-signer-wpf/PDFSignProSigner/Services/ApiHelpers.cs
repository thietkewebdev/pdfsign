namespace PDFSignProSigner.Services;

public static class ApiHelpers
{
    /// <summary>Build apiBaseUrl from host. localhost uses http and :3000.</summary>
    public static string BuildApiBaseUrl(string host)
    {
        var h = (host ?? "").Trim();
        if (string.IsNullOrEmpty(h)) return "https://localhost:3000";
        var isLocal = h.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                      h.StartsWith("localhost:", StringComparison.OrdinalIgnoreCase);
        var scheme = isLocal ? "http" : "https";
        var withPort = isLocal && !h.Contains(':') ? "localhost:3000" : h;
        return $"{scheme}://{withPort}".TrimEnd('/');
    }
}
