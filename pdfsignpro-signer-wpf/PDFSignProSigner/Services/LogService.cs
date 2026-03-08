using System.IO;
using System.Text;

namespace PDFSignProSigner.Services;

public static class LogService
{
    private static readonly object Lock = new();
    private static string? _logPath;

    private static string LogPath
    {
        get
        {
            if (_logPath != null) return _logPath;
            var baseDir = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var dir = Path.Combine(baseDir, "PDFSignProSigner", "logs");
            Directory.CreateDirectory(dir);
            _logPath = Path.Combine(dir, "app.log");
            return _logPath;
        }
    }

    public static void Info(string message) => Write("INFO", message);
    public static void Warn(string message) => Write("WARN", message);
    public static void Error(string message) => Write("ERROR", message);
    public static void Error(string message, Exception ex) => Write("ERROR", $"{message} {ex}");

    private static void Write(string level, string message)
    {
        lock (Lock)
        {
            try
            {
                var line = $"{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} [{level}] {message}";
                File.AppendAllText(LogPath, line + Environment.NewLine, Encoding.UTF8);
            }
            catch { /* ignore */ }
        }
    }
}
