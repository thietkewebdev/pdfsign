using System;
using System.Diagnostics;
using System.Net.Http;
using System.Net.Http.Json;
using System.Reflection;
using System.Windows;

namespace PDFSignProSigner.Services;

/// <summary>
/// So sánh phiên bản Signer với manifest JSON (mặc định trên GitHub raw).
/// Có thể ghi đè URL bằng settings.json → updateManifestUrlOverride.
/// </summary>
public static class SignerUpdateChecker
{
    /// <summary>Đổi URL nếu fork repo hoặc dùng manifest nội bộ.</summary>
    public const string DefaultManifestUrl =
        "https://raw.githubusercontent.com/thietkewebdev/pdfsign/main/pdfsignpro-signer-wpf/signer-manifest.json";

    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromSeconds(12),
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

    /// <summary>Kiểm tra và hỏi mở trình duyệt tải bản mới nếu có.</summary>
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
            ? "https://github.com/thietkewebdev/pdfsign/releases/latest"
            : manifest.DownloadUrl.Trim();

        await owner!.Dispatcher.InvokeAsync(() =>
        {
            var msg =
                $"Đã có phiên bản Signer mới: {manifest.Version}\n\nPhiên bản hiện tại: {current}\n\nMở trang tải?";
            var r = System.Windows.MessageBox.Show(
                msg,
                "PDFSignPro Signer — Cập nhật",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);
            if (r == MessageBoxResult.Yes)
            {
                try
                {
                    Process.Start(new ProcessStartInfo(download) { UseShellExecute = true });
                }
                catch (Exception ex)
                {
                    LogService.Error("Open download URL failed", ex);
                    System.Windows.MessageBox.Show(
                        $"Không mở được liên kết:\n{download}",
                        "PDFSignPro Signer",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning);
                }
            }
        });
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
    }
}
