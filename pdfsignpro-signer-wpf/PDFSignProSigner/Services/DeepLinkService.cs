using System.Text;
using System.Text.Json;

namespace PDFSignProSigner.Services;

public record DeepLinkPayload(string JobId, string ClaimCode, string Host);

public static class DeepLinkService
{
    public static string? ExtractFromArgs(string[] args)
    {
        foreach (var arg in args)
        {
            if (arg?.Trim().StartsWith("pdfsignpro://", StringComparison.OrdinalIgnoreCase) == true)
                return arg.Trim();
        }
        return null;
    }

    public static DeepLinkPayload? Parse(string url)
    {
        if (string.IsNullOrWhiteSpace(url) || !url.Trim().StartsWith("pdfsignpro://", StringComparison.OrdinalIgnoreCase))
            return null;

        try
        {
            var uri = new Uri(url);
            if (uri.Scheme.ToLowerInvariant() != "pdfsignpro" ||
                uri.Host.ToLowerInvariant().Replace("/", "") != "sign")
                return null;

            var p = ParseQueryParam(uri.Query, "p");
            if (string.IsNullOrEmpty(p))
                return null;

            var json = Base64UrlDecode(p);
            var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var j = root.GetProperty("j").GetString();
            var c = root.GetProperty("c").GetString();
            var h = root.GetProperty("h").GetString();
            if (string.IsNullOrEmpty(j) || string.IsNullOrEmpty(c) || string.IsNullOrEmpty(h))
                return null;

            return new DeepLinkPayload(j, c, h);
        }
        catch
        {
            return null;
        }
    }

    static string? ParseQueryParam(string query, string key)
    {
        var q = query.TrimStart('?');
        foreach (var part in q.Split('&'))
        {
            var kv = part.Split('=', 2);
            if (kv.Length == 2 && string.Equals(kv[0], key, StringComparison.OrdinalIgnoreCase))
                return Uri.UnescapeDataString(kv[1]);
        }
        return null;
    }

    static string Base64UrlDecode(string input)
    {
        var base64 = input.Replace('-', '+').Replace('_', '/');
        var pad = 4 - base64.Length % 4;
        if (pad != 4) base64 += new string('=', pad);
        return Encoding.UTF8.GetString(Convert.FromBase64String(base64));
    }
}
