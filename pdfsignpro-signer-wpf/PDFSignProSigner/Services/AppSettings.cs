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

    public static AppSettings Load()
    {
        try
        {
            var path = SettingsPath;
            if (!File.Exists(path))
                return new AppSettings();

            var json = File.ReadAllText(path);
            var settings = JsonSerializer.Deserialize<AppSettingsJson>(json, JsonOpts);
            return new AppSettings
            {
                SelectedTemplateId = settings?.SelectedTemplateId,
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

            var json = JsonSerializer.Serialize(new AppSettingsJson(SelectedTemplateId), JsonOpts);
            File.WriteAllText(SettingsPath, json);
        }
        catch (Exception ex)
        {
            LogService.Error("AppSettings.Save failed", ex);
        }
    }

    private record AppSettingsJson(string? SelectedTemplateId);
}
