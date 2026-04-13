using System.IO;
using System.Net;
using System.Reflection;
using System.Text;
using System.Text.Json;
using PDFSignProSigner.Models;

namespace PDFSignProSigner.Services;

public sealed class LocalBridgeService : IDisposable
{
    private readonly CoreService _core;
    private readonly JsonSerializerOptions _jsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private readonly HttpListener _listener = new();
    private CancellationTokenSource? _cts;
    private Task? _loopTask;

    private const string Prefix = "http://127.0.0.1:17886/";

    public LocalBridgeService(CoreService core)
    {
        _core = core;
    }

    public void Start()
    {
        if (_loopTask != null) return;
        _listener.Prefixes.Add(Prefix);
        _listener.Start();
        _cts = new CancellationTokenSource();
        _loopTask = Task.Run(() => AcceptLoopAsync(_cts.Token), _cts.Token);
        LogService.Info($"Local bridge started at {Prefix}");
    }

    private async Task AcceptLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            HttpListenerContext? ctx = null;
            try
            {
                ctx = await _listener.GetContextAsync();
                _ = Task.Run(() => HandleRequestAsync(ctx, ct), ct);
            }
            catch (HttpListenerException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (ObjectDisposedException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                LogService.Error("Local bridge accept loop error", ex);
                if (ctx != null)
                {
                    try { await WriteErrorAsync(ctx.Response, 500, "LOCAL_BRIDGE_ERROR", "Lỗi local bridge."); }
                    catch { /* ignore */ }
                }
            }
        }
    }

    private async Task HandleRequestAsync(HttpListenerContext ctx, CancellationToken ct)
    {
        var req = ctx.Request;
        var res = ctx.Response;
        try
        {
            ApplyCors(req, res);
            if (req.HttpMethod.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
            {
                res.StatusCode = 204;
                res.Close();
                return;
            }

            var path = (req.Url?.AbsolutePath ?? "/").TrimEnd('/').ToLowerInvariant();
            if (string.IsNullOrEmpty(path)) path = "/";

            if (req.HttpMethod.Equals("GET", StringComparison.OrdinalIgnoreCase) && path == "/health")
            {
                var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "dev";
                await WriteJsonAsync(res, 200, new { ok = true, app = "PDFSignProSigner", version });
                return;
            }

            if (req.HttpMethod.Equals("POST", StringComparison.OrdinalIgnoreCase) && path == "/certs")
            {
                var body = await ReadJsonBodyAsync<CertsRequest>(req, ct);
                var pin = body?.Pin?.Trim() ?? "";
                if (string.IsNullOrEmpty(pin))
                {
                    await WriteErrorAsync(res, 400, "PIN_REQUIRED", "Vui lòng nhập PIN token.");
                    return;
                }

                var (dllPath, certs, _, stderr) = await _core.ListCertsAsync(null, pin, ct);
                var validCerts = certs.Where(c => c.IsValid).ToList();
                if (validCerts.Count == 0)
                {
                    var msg = string.IsNullOrWhiteSpace(stderr) ? "Không tìm thấy chứng thư còn hiệu lực." : stderr.Trim();
                    await WriteErrorAsync(res, 400, "NO_VALID_CERTS", msg);
                    return;
                }

                await WriteJsonAsync(res, 200, new
                {
                    ok = true,
                    dllPath,
                    count = validCerts.Count,
                    certs = validCerts.Select(ToLocalCert).ToList()
                });
                return;
            }

            await WriteErrorAsync(res, 404, "NOT_FOUND", "Endpoint không tồn tại.");
        }
        catch (OperationCanceledException)
        {
            if (!res.OutputStream.CanWrite) return;
            await WriteErrorAsync(res, 499, "CANCELED", "Yêu cầu bị hủy.");
        }
        catch (Exception ex)
        {
            LogService.Error("Local bridge request error", ex);
            if (!res.OutputStream.CanWrite) return;
            await WriteErrorAsync(res, 500, "INTERNAL_ERROR", ex.Message);
        }
    }

    private static object ToLocalCert(CertInfo c) =>
        new
        {
            c.Index,
            c.SubjectO,
            c.SubjectCN,
            c.IssuerCN,
            c.Serial,
            c.ValidTo,
            c.DisplayName
        };

    private void ApplyCors(HttpListenerRequest req, HttpListenerResponse res)
    {
        var origin = req.Headers["Origin"];
        if (string.IsNullOrWhiteSpace(origin)) return;

        if (IsAllowedOrigin(origin))
            res.Headers["Access-Control-Allow-Origin"] = origin;
        res.Headers["Vary"] = "Origin";
        res.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
        res.Headers["Access-Control-Allow-Headers"] = "Content-Type";
        res.Headers["Access-Control-Allow-Private-Network"] = "true";
    }

    private static bool IsAllowedOrigin(string origin)
    {
        return origin.Equals("https://pdfsign.vn", StringComparison.OrdinalIgnoreCase)
            || origin.Equals("https://www.pdfsign.vn", StringComparison.OrdinalIgnoreCase)
            || origin.Equals("http://localhost:3000", StringComparison.OrdinalIgnoreCase)
            || origin.Equals("http://127.0.0.1:3000", StringComparison.OrdinalIgnoreCase);
    }

    private async Task<T?> ReadJsonBodyAsync<T>(HttpListenerRequest req, CancellationToken ct)
    {
        using var reader = new StreamReader(req.InputStream, req.ContentEncoding ?? Encoding.UTF8);
        var content = await reader.ReadToEndAsync(ct);
        if (string.IsNullOrWhiteSpace(content)) return default;
        return JsonSerializer.Deserialize<T>(content, _jsonOpts);
    }

    private async Task WriteJsonAsync(HttpListenerResponse res, int statusCode, object payload)
    {
        var json = JsonSerializer.Serialize(payload, _jsonOpts);
        var bytes = Encoding.UTF8.GetBytes(json);
        res.StatusCode = statusCode;
        res.ContentType = "application/json; charset=utf-8";
        res.ContentLength64 = bytes.Length;
        await res.OutputStream.WriteAsync(bytes);
        res.Close();
    }

    private Task WriteErrorAsync(HttpListenerResponse res, int statusCode, string code, string message)
    {
        return WriteJsonAsync(res, statusCode, new { ok = false, errorCode = code, error = message });
    }

    public void Dispose()
    {
        try
        {
            _cts?.Cancel();
            _listener.Stop();
            _listener.Close();
            _loopTask?.Wait(200);
        }
        catch
        {
            // Ignore shutdown race.
        }
    }

    private sealed record CertsRequest(string? Pin);
}
