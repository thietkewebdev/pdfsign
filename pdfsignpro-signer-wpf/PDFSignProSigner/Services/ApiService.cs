using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using PDFSignProSigner.Models;

namespace PDFSignProSigner.Services;

public class ApiService
{
    private readonly HttpClient _http = new();
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public async Task<(string JobToken, string ApiBaseUrl)> ClaimAsync(string apiBaseUrl, string jobId, string code, CancellationToken ct = default)
    {
        var url = $"{apiBaseUrl.TrimEnd('/')}/api/jobs/{jobId}/claim";
        var body = JsonSerializer.Serialize(new { code }, JsonOpts);
        var content = new StringContent(body, Encoding.UTF8, "application/json");
        var res = await _http.PostAsync(url, content, ct);
        res.EnsureSuccessStatusCode();
        var json = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
        return (
            json.GetProperty("jobToken").GetString() ?? throw new Exception("Missing jobToken"),
            json.GetProperty("apiBaseUrl").GetString() ?? apiBaseUrl
        );
    }

    public async Task<JobInfo> GetJobAsync(string apiBaseUrl, string jobId, string jobToken, CancellationToken ct = default)
    {
        var url = $"{apiBaseUrl.TrimEnd('/')}/api/jobs/{jobId}";
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Add("x-job-token", jobToken);
        var res = await _http.SendAsync(req, ct);
        res.EnsureSuccessStatusCode();
        var json = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
        var doc = json.GetProperty("document");
        var placement = json.GetProperty("placement");
        var (pageStr, rect) = ParsePlacement(placement);
        return new JobInfo(
            jobId,
            jobToken,
            apiBaseUrl.TrimEnd('/'),
            json.GetProperty("inputPdfUrl").GetString() ?? "",
            doc.GetProperty("title").GetString() ?? "Document",
            doc.GetProperty("publicId").GetString() ?? "",
            new PlacementInfo(pageStr, rect)
        );
    }

    public async Task<byte[]> DownloadPdfAsync(string url, CancellationToken ct = default)
    {
        return await _http.GetByteArrayAsync(url, ct);
    }

    public async Task<string> CompleteAsync(JobInfo job, string signedPdfPath, string subjectO, string subjectCN, string serial, string signingTime, CancellationToken ct = default)
    {
        var url = $"{job.ApiBaseUrl}/api/jobs/{job.JobId}/complete";

        var fileBytes = await File.ReadAllBytesAsync(signedPdfPath, ct);
        var fileContent = new ByteArrayContent(fileBytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");

        using var content = new MultipartFormDataContent();
        content.Add(fileContent, "file", "signed.pdf");

        var certMeta = JsonSerializer.Serialize(new { subjectO, subjectCN, serial, signingTime }, JsonOpts);
        content.Add(new StringContent(certMeta, Encoding.UTF8, "text/plain"), "certMeta");

        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Content = content;
        req.Headers.Add("x-job-token", job.JobToken);

        var res = await _http.SendAsync(req, ct);

        if (!res.IsSuccessStatusCode)
        {
            var body = await res.Content.ReadAsStringAsync(ct);
            LogService.Error($"Complete upload failed {(int)res.StatusCode}: {body}");
            res.EnsureSuccessStatusCode();
        }

        var json = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
        return json.GetProperty("signedPublicUrl").GetString() ?? "";
    }

    /// <summary>Parse placement object { page, rectPct: { x, y, w, h } }. Throws with clear message if invalid.</summary>
    private static (string Page, RectPct Rect) ParsePlacement(JsonElement placement)
    {
        if (placement.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException("placement must be a JSON object { page, rectPct: { x, y, w, h } }");

        var pageStr = "LAST";
        if (placement.TryGetProperty("page", out var pEl))
        {
            pageStr = pEl.ValueKind == JsonValueKind.Number
                ? pEl.GetInt32().ToString()
                : (pEl.GetString() ?? "LAST");
        }

        if (!placement.TryGetProperty("rectPct", out var rectEl) || rectEl.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException("placement.rectPct must be { x, y, w, h } with 4 numeric values 0..1");

        static double GetRectVal(JsonElement r, string name)
        {
            if (!r.TryGetProperty(name, out var el))
                throw new InvalidOperationException($"placement.rectPct.{name} is required (0..1)");
            var v = el.GetDouble();
            if (double.IsNaN(v) || double.IsInfinity(v))
                throw new InvalidOperationException($"placement.rectPct.{name} must be a valid number 0..1");
            if (v < 0 || v > 1)
                throw new InvalidOperationException($"placement.rectPct.{name} must be 0..1, got {v}");
            return v;
        }

        var rect = new RectPct(
            GetRectVal(rectEl, "x"),
            GetRectVal(rectEl, "y"),
            GetRectVal(rectEl, "w"),
            GetRectVal(rectEl, "h")
        );
        return (pageStr, rect);
    }
}
