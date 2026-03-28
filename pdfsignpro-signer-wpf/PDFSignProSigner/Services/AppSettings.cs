using System.IO;
using System.Text.Json;

namespace PDFSignProSigner.Services;

public class AppSettings
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
    };

    private static string SettingsPath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "PDFSignProSigner",
            "settings.json"
        );

    public string? SelectedTemplateId { get; set; }
    /// <summary>Serial chứng chỉ ưu tiên khi token có nhiều cert.</summary>
    public string? PreferredCertSerial { get; set; }
    public bool CheckUpdatesOnStartup { get; set; } = true;
    public bool RemindUnplugTokenAfterSign { get; set; } = true;
    /// <summary>Ghi đè URL manifest JSON (version + downloadUrl). Để trống = dùng mặc định GitHub raw.</summary>
    public string? UpdateManifestUrlOverride { get; set; }

    public static AppSettings Load()
    {
        try
        {
            var path = SettingsPath;
            if (!File.Exists(path))
                return new AppSettings();

            var json = File.ReadAllText(path);
            var dto = JsonSerializer.Deserialize<AppSettingsJsonDto>(json, JsonOpts);
            return new AppSettings
            {
                SelectedTemplateId = dto?.SelectedTemplateId,
                PreferredCertSerial = dto?.PreferredCertSerial,
                CheckUpdatesOnStartup = dto?.CheckUpdatesOnStartup ?? true,
                RemindUnplugTokenAfterSign = dto?.RemindUnplugTokenAfterSign ?? true,
                UpdateManifestUrlOverride = dto?.UpdateManifestUrlOverride,
            };
        }
        catch
        {
            return new AppSettings();
        }
    }

    public void Save()
    {
        try
        {
            var dir = Path.GetDirectoryName(SettingsPath);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);

            var json = JsonSerializer.Serialize(
                new AppSettingsJsonDto
                {
                    SelectedTemplateId = SelectedTemplateId,
                    PreferredCertSerial = PreferredCertSerial,
                    CheckUpdatesOnStartup = CheckUpdatesOnStartup,
                    RemindUnplugTokenAfterSign = RemindUnplugTokenAfterSign,
                    UpdateManifestUrlOverride = UpdateManifestUrlOverride,
                },
                JsonOpts);
            File.WriteAllText(SettingsPath, json);
        }
        catch (Exception ex)
        {
            LogService.Error("AppSettings.Save failed", ex);
        }
    }

    private sealed class AppSettingsJsonDto
    {
        public string? SelectedTemplateId { get; set; }
        public string? PreferredCertSerial { get; set; }
        public bool? CheckUpdatesOnStartup { get; set; }
        public bool? RemindUnplugTokenAfterSign { get; set; }
        public string? UpdateManifestUrlOverride { get; set; }
    }
}
