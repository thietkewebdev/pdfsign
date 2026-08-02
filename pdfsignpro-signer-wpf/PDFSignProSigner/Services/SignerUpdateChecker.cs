using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace PDFSignProSigner.Services;

/// <summary>
/// Kiểm tra manifest JSON, tải Setup.exe in-app, xác minh SHA-256, cài silent và thoát app.
/// </summary>
public static class SignerUpdateChecker
{
    public const string DefaultManifestUrl =
        "https://raw.githubusercontent.com/thietkewebdev/pdfsign/main/pdfsignpro-signer-wpf/signer-manifest.json";
    public const string DefaultDownloadUrl =
        "https://pdfsign.vn/api/signer/download";

    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromMinutes(10),
    };

    public static string GetCurrentVersionString()
    {
        var asm = Assembly.GetExecutingAssembly();
        var info = asm.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        if (!string.IsNullOrEmpty(info))
        {
            var plus = info.IndexOf('+', StringComparison.Ordinal);
            return plus > 0 ? info[..plus] : info;
        }

        return asm.GetName().Version?.ToString(3) ?? "1.0.0";
    }

    /// <summary>Kiểm tra và (nếu đồng ý) tải + cài bản mới trong app.</summary>
    public static async Task CheckAndOfferUpdateAsync(Window? owner, AppSettings settings, bool silentIfUpToDate)
    {
        if (!settings.CheckUpdatesOnStartup && silentIfUpToDate)
            return;

        var url = string.IsNullOrWhiteSpace(settings.UpdateManifestUrlOverride)
            ? DefaultManifestUrl
            : settings.UpdateManifestUrlOverride.Trim();

        if (string.IsNullOrEmpty(url))
            return;

        SignerManifestDto? manifest;
        try
        {
            manifest = await Http.GetFromJsonAsync<SignerManifestDto>(url).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            LogService.Warn($"Update check failed: {ex.Message}");
            if (!silentIfUpToDate)
            {
                await owner!.Dispatcher.InvokeAsync(() =>
                    System.Windows.MessageBox.Show(
                        $"Không kiểm tra được bản mới.\n\n{ex.Message}",
                        "PDFSignPro Signer",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning));
            }

            return;
        }

        if (manifest == null || string.IsNullOrWhiteSpace(manifest.Version))
            return;

        var current = GetCurrentVersionString();
        if (!IsRemoteNewer(current, manifest.Version.Trim()))
        {
            if (!silentIfUpToDate)
            {
                await owner!.Dispatcher.InvokeAsync(() =>
                    System.Windows.MessageBox.Show(
                        $"Bạn đang dùng phiên bản mới nhất ({current}).",
                        "PDFSignPro Signer",
                        MessageBoxButton.OK,
                        MessageBoxImage.Information));
            }

            return;
        }

        var download = string.IsNullOrWhiteSpace(manifest.DownloadUrl)
            ? DefaultDownloadUrl
            : manifest.DownloadUrl.Trim();

        var notes = string.IsNullOrWhiteSpace(manifest.ReleaseNotes)
            ? ""
            : $"\n\n{manifest.ReleaseNotes.Trim()}";

        var proceed = false;
        await owner!.Dispatcher.InvokeAsync(() =>
        {
            var msg =
                $"Đã có phiên bản Signer mới: {manifest.Version}\n\n" +
                $"Phiên bản hiện tại: {current}{notes}\n\n" +
                "Tải và cài đặt ngay trong ứng dụng?\n" +
                "(Signer sẽ đóng để Setup cập nhật — không cần admin.)";
            var r = System.Windows.MessageBox.Show(
                msg,
                "PDFSignPro Signer — Cập nhật",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);
            proceed = r == MessageBoxResult.Yes;
        });

        if (!proceed)
            return;

        try
        {
            await DownloadVerifyAndInstallAsync(owner, download, manifest).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            LogService.Error("In-app update failed", ex);
            await owner.Dispatcher.InvokeAsync(() =>
            {
                var openBrowser = System.Windows.MessageBox.Show(
                    $"Cập nhật trong app thất bại:\n{ex.Message}\n\nMở trang tải thủ công?",
                    "PDFSignPro Signer",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Warning);
                if (openBrowser == MessageBoxResult.Yes)
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo(download) { UseShellExecute = true });
                    }
                    catch (Exception openEx)
                    {
                        LogService.Error("Open download URL failed", openEx);
                    }
                }
            });
        }
    }

    private static async Task DownloadVerifyAndInstallAsync(
        Window owner,
        string downloadUrl,
        SignerManifestDto manifest)
    {
        UpdateProgressWindow? progress = null;
        await owner.Dispatcher.InvokeAsync(() =>
        {
            progress = new UpdateProgressWindow
            {
                Owner = owner,
            };
            progress.Show();
        });

        var tempDir = Path.Combine(Path.GetTempPath(), "PDFSignProSignerUpdate");
        Directory.CreateDirectory(tempDir);
        var setupPath = Path.Combine(tempDir, "PDFSignProSignerSetup.exe");

        try
        {
            await owner.Dispatcher.InvokeAsync(() => progress!.SetStatus("Đang tải bản cập nhật…"));

            using (var response = await Http.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead)
                       .ConfigureAwait(false))
            {
                response.EnsureSuccessStatusCode();
                var total = response.Content.Headers.ContentLength ?? manifest.SizeBytes ?? -1;
                await using var remote = await response.Content.ReadAsStreamAsync().ConfigureAwait(false);
                await using var local = new FileStream(
                    setupPath,
                    FileMode.Create,
                    FileAccess.Write,
                    FileShare.None,
                    81920,
                    useAsync: true);

                var buffer = new byte[81920];
                long readTotal = 0;
                int n;
                while ((n = await remote.ReadAsync(buffer.AsMemory(0, buffer.Length)).ConfigureAwait(false)) > 0)
                {
                    await local.WriteAsync(buffer.AsMemory(0, n)).ConfigureAwait(false);
                    readTotal += n;
                    if (total > 0)
                    {
                        var pct = (double)readTotal / total;
                        await owner.Dispatcher.InvokeAsync(() =>
                            progress!.SetProgress(pct, $"Đang tải… {FormatBytes(readTotal)} / {FormatBytes(total)}"));
                    }
                    else
                    {
                        await owner.Dispatcher.InvokeAsync(() =>
                            progress!.SetProgress(-1, $"Đang tải… {FormatBytes(readTotal)}"));
                    }
                }
            }

            if (!string.IsNullOrWhiteSpace(manifest.Sha256))
            {
                await owner.Dispatcher.InvokeAsync(() => progress!.SetStatus("Đang kiểm tra SHA-256…"));
                var actual = await ComputeSha256HexAsync(setupPath).ConfigureAwait(false);
                var expected = manifest.Sha256.Trim().ToLowerInvariant();
                if (!string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException(
                        $"SHA-256 không khớp.\nMong đợi: {expected}\nThực tế: {actual}");
                }
            }

            await owner.Dispatcher.InvokeAsync(() =>
                progress!.SetStatus("Đang khởi chạy Setup (cài silent)…"));

            // Per-user Inno: /SILENT closes apps, no admin UAC.
            // /FORCECLOSEAPPLICATIONS helps replace running Signer binaries.
            var psi = new ProcessStartInfo
            {
                FileName = setupPath,
                Arguments =
                    "/SILENT /CLOSEAPPLICATIONS /FORCECLOSEAPPLICATIONS /NORESTART " +
                    "/SUPPRESSMSGBOXES",
                UseShellExecute = true,
            };

            if (!Process.Start(psi))
                throw new InvalidOperationException("Không khởi chạy được Setup.");

            LogService.Info($"Update setup launched: {setupPath} → v{manifest.Version}");

            await owner.Dispatcher.InvokeAsync(() =>
            {
                progress?.Close();
                // Exit so Inno can replace files under LocalAppData.
                System.Windows.Application.Current.Shutdown(0);
            });
        }
        finally
        {
            await owner.Dispatcher.InvokeAsync(() =>
            {
                try { progress?.Close(); } catch { /* ignore */ }
            });
        }
    }

    private static async Task<string> ComputeSha256HexAsync(string path)
    {
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
        using var sha = SHA256.Create();
        var hash = await sha.ComputeHashAsync(stream).ConfigureAwait(false);
        var sb = new StringBuilder(hash.Length * 2);
        foreach (var b in hash)
            sb.Append(b.ToString("x2"));
        return sb.ToString();
    }

    private static string FormatBytes(long n)
    {
        if (n < 1024) return $"{n} B";
        if (n < 1024 * 1024) return $"{n / 1024.0:0.#} KB";
        return $"{n / (1024.0 * 1024.0):0.#} MB";
    }

    internal static bool IsRemoteNewer(string current, string remote)
    {
        if (!TryParseVersion(current, out var c))
            return false;
        if (!TryParseVersion(remote, out var r))
            return false;
        return r > c;
    }

    private static bool TryParseVersion(string s, out Version v)
    {
        v = new Version(0, 0, 0);
        if (string.IsNullOrWhiteSpace(s)) return false;
        var t = s.Trim();
        var dash = t.IndexOf('-', StringComparison.Ordinal);
        if (dash > 0)
            t = t[..dash];
        if (!Version.TryParse(t, out var parsed))
            return false;
        v = parsed;
        return true;
    }

    private sealed class SignerManifestDto
    {
        public string? Version { get; set; }
        public string? DownloadUrl { get; set; }
        public string? Sha256 { get; set; }
        public long? SizeBytes { get; set; }
        public string? ReleaseNotes { get; set; }
    }

    /// <summary>Minimal progress UI (code-only, no XAML).</summary>
    private sealed class UpdateProgressWindow : Window
    {
        private readonly TextBlock _status;
        private readonly ProgressBar _bar;

        public UpdateProgressWindow()
        {
            Title = "Đang cập nhật PDFSignPro Signer";
            Width = 420;
            Height = 140;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            ResizeMode = ResizeMode.NoResize;
            ShowInTaskbar = false;
            Background = new SolidColorBrush(Color.FromRgb(0xF8, 0xFA, 0xFC));

            _status = new TextBlock
            {
                Text = "Đang chuẩn bị…",
                Margin = new Thickness(16, 16, 16, 8),
                TextWrapping = TextWrapping.Wrap,
                Foreground = new SolidColorBrush(Color.FromRgb(0x1E, 0x29, 0x3B)),
            };
            _bar = new ProgressBar
            {
                Height = 14,
                Margin = new Thickness(16, 0, 16, 16),
                Minimum = 0,
                Maximum = 100,
                IsIndeterminate = true,
            };

            Content = new StackPanel
            {
                Children = { _status, _bar },
            };
        }

        public void SetStatus(string text)
        {
            _status.Text = text;
            _bar.IsIndeterminate = true;
        }

        public void SetProgress(double fraction01OrMinus1, string text)
        {
            _status.Text = text;
            if (fraction01OrMinus1 < 0)
            {
                _bar.IsIndeterminate = true;
                return;
            }

            _bar.IsIndeterminate = false;
            _bar.Value = Math.Max(0, Math.Min(100, fraction01OrMinus1 * 100));
        }
    }
}
