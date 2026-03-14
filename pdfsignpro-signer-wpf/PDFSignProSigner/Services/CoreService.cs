using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
using PDFSignProSigner.Models;

namespace PDFSignProSigner.Services;

public record CoreSignResult(bool Success, string Stdout, string Stderr, int ExitCode);

public class CoreService
{
    private readonly string _coreExePath;
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public CoreService()
    {
        var dir = Path.GetDirectoryName(AppContext.BaseDirectory) ?? AppContext.BaseDirectory;
        _coreExePath = Path.Combine(dir, "PDFSignProSignerCore.exe");
    }

    public string CoreExePath => _coreExePath;

    public bool CoreExists => File.Exists(_coreExePath);

    /// <summary>Run --list-certs and parse JSON. Returns (dllPath, certs). dllPath from core when not provided.</summary>
    public async Task<(string DllPath, List<CertInfo> Certs, string Stdout, string Stderr)> ListCertsAsync(string? dllPath, string pin, CancellationToken ct = default)
    {
        var args = new List<string> { "--list-certs", "--pin", pin };
        if (!string.IsNullOrEmpty(dllPath))
            args.AddRange(new[] { "--dll", dllPath });

        var (exitCode, stdout, stderr) = await RunCoreAsync(args.ToArray(), ct);
        if (exitCode != 0)
            return ("", new List<CertInfo>(), stdout, stderr);

        try
        {
            var doc = JsonDocument.Parse(stdout);
            var root = doc.RootElement;
            var resolvedDll = root.TryGetProperty("dllPath", out var dp) ? dp.GetString() ?? "" : "";
            var arr = root.TryGetProperty("certs", out var c) ? c : root;
            var list = JsonSerializer.Deserialize<List<CertInfoJson>>(arr.GetRawText(), JsonOpts) ?? new List<CertInfoJson>();
            var certs = list.Select(c => new CertInfo(
                c.Index,
                c.SubjectO,
                c.SubjectCN,
                c.IssuerCN,
                c.Serial ?? "",
                c.ValidTo ?? "",
                c.DisplayName ?? $"{c.SubjectCN ?? "Unknown"} ({c.Serial ?? ""})"
            )).ToList();
            return (resolvedDll, certs, stdout, stderr);
        }
        catch
        {
            return ("", new List<CertInfo>(), stdout, stderr);
        }
    }

    /// <summary>Run sign mode. templateId: classic, modern, minimal, stamp, valid.</summary>
    public async Task<CoreSignResult> SignAsync(
        string inputPath,
        string outputPath,
        string dllPath,
        int certIndex,
        string pin,
        string page,
        RectPct rect,
        string? templateId = null,
        CancellationToken ct = default)
    {
        var (valid, err) = rect.Validate();
        if (!valid)
            throw new ArgumentException(err ?? "Invalid rectPct");

        var rectStr = rect.ToRectPctString();
        var args = new List<string>
        {
            "--in", inputPath,
            "--out", outputPath,
            "--dll", dllPath,
            "--cert-index", certIndex.ToString(),
            "--pin", pin,
            "--page", page,
            "--rectPct", rectStr
        };
        if (!string.IsNullOrEmpty(templateId))
        {
            args.Add("--template");
            args.Add(templateId);
        }
        var (exitCode, stdout, stderr) = await RunCoreAsync(args.ToArray(), ct);
        return new CoreSignResult(exitCode == 0, stdout, stderr, exitCode);
    }

    private async Task<(int ExitCode, string Stdout, string Stderr)> RunCoreAsync(string[] args, CancellationToken ct)
    {
        if (!CoreExists)
            throw new FileNotFoundException($"PDFSignProSignerCore.exe not found at {_coreExePath}");

        var psi = new ProcessStartInfo
        {
            FileName = _coreExePath,
            Arguments = string.Join(" ", args.Select(a => $"\"{a.Replace("\"", "\\\"")}\"")),
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = Path.GetDirectoryName(_coreExePath) ?? "."
        };
        psi.Environment["PYTHONUTF8"] = "1";

        using var proc = new Process { StartInfo = psi };
        var stdoutSb = new StringBuilder();
        var stderrSb = new StringBuilder();
        proc.OutputDataReceived += (_, e) => { if (e.Data != null) stdoutSb.AppendLine(e.Data); };
        proc.ErrorDataReceived += (_, e) => { if (e.Data != null) stderrSb.AppendLine(e.Data); };

        proc.Start();
        proc.BeginOutputReadLine();
        proc.BeginErrorReadLine();

        await proc.WaitForExitAsync(ct);
        return (proc.ExitCode, stdoutSb.ToString().TrimEnd(), stderrSb.ToString().TrimEnd());
    }

        private record CertInfoJson(int Index, string? SubjectO, string? SubjectCN, string? IssuerCN, string? Serial, string? ValidTo, string? DisplayName);
}
