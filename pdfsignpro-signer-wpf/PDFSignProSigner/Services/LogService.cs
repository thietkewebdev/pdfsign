using System.IO;
using System.Text;

namespace PDFSignProSigner.Services;

public static class LogService
{
    private static readonly object Lock = new();
    private static string? _logDir;

    private const long MaxLogBytes = 512 * 1024;
    private const int MaxRotatedFiles = 4;
    private const string LogFileName = "app.log";

    private static string LogDirectory
    {
        get
        {
            if (_logDir != null) return _logDir;
            var baseDir = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            _logDir = Path.Combine(baseDir, "PDFSignProSigner", "logs");
            Directory.CreateDirectory(_logDir);
            return _logDir;
        }
    }

    private static string LogPath => Path.Combine(LogDirectory, LogFileName);

    /// <summary>Thư mục chứa app.log (xoay vòng).</summary>
    public static string GetLogDirectoryPath() => LogDirectory;

    public static void Info(string message) => Write("INFO", message);
    public static void Warn(string message) => Write("WARN", message);
    public static void Error(string message) => Write("ERROR", message);
    public static void Error(string message, Exception ex) => Write("ERROR", $"{message} {ex}");

    /// <summary>Sự kiện luồng ký (grep [SIGN] trong app.log).</summary>
    public static void Signing(string message) => Write("SIGN", message);

    private static void Write(string level, string message)
    {
        lock (Lock)
        {
            try
            {
                var path = LogPath;
                if (File.Exists(path))
                {
                    var len = new FileInfo(path).Length;
                    if (len > MaxLogBytes)
                        RotateLogs(path);
                }

                var line = $"{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} [{level}] {message}";
                File.AppendAllText(path, line + Environment.NewLine, Encoding.UTF8);
            }
            catch { /* ignore */ }
        }
    }

    private static void RotateLogs(string path)
    {
        try
        {
            var dir = Path.GetDirectoryName(path);
            if (string.IsNullOrEmpty(dir)) return;
            var baseName = LogFileName;
            var oldest = Path.Combine(dir, $"{baseName}.{MaxRotatedFiles}");
            if (File.Exists(oldest))
                File.Delete(oldest);
            for (var i = MaxRotatedFiles - 1; i >= 1; i--)
            {
                var src = Path.Combine(dir, $"{baseName}.{i}");
                var dst = Path.Combine(dir, $"{baseName}.{i + 1}");
                if (File.Exists(src))
                    File.Move(src, dst, overwrite: true);
            }

            var firstRotated = Path.Combine(dir, $"{baseName}.1");
            if (File.Exists(path))
                File.Move(path, firstRotated, overwrite: true);
        }
        catch { /* ignore */ }
    }
}
