using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace PDFSignProSigner.Services;

/// <summary>Lưu PIN đã mã hóa (DPAPI) theo token. Chỉ dùng khi cùng user, cùng máy.</summary>
public static class PinCacheStorage
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = false };
    private static string CachePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "PDFSignProSigner",
        "pin_cache.dat");

    public static void Save(string tokenId, string pin)
    {
        try
        {
            var dir = Path.GetDirectoryName(CachePath);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);

            var plain = JsonSerializer.Serialize(new CacheEntry { TokenId = tokenId, Pin = pin }, JsonOpts);
            var plainBytes = Encoding.UTF8.GetBytes(plain);
            var encrypted = ProtectedData.Protect(plainBytes, null, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(CachePath, encrypted);
        }
        catch
        {
            TryDelete();
        }
    }

    public static (string? TokenId, string? Pin) Load()
    {
        try
        {
            if (!File.Exists(CachePath)) return (null, null);

            var encrypted = File.ReadAllBytes(CachePath);
            var plainBytes = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
            var plain = Encoding.UTF8.GetString(plainBytes);
            var entry = JsonSerializer.Deserialize<CacheEntry>(plain);
            if (entry == null || string.IsNullOrEmpty(entry.TokenId) || string.IsNullOrEmpty(entry.Pin))
                return (null, null);

            return (entry.TokenId, entry.Pin);
        }
        catch
        {
            TryDelete();
            return (null, null);
        }
    }

    public static void Delete()
    {
        TryDelete();
    }

    private static void TryDelete()
    {
        try
        {
            if (File.Exists(CachePath))
                File.Delete(CachePath);
        }
        catch { /* ignore */ }
    }

    private sealed class CacheEntry
    {
        public string TokenId { get; set; } = "";
        public string Pin { get; set; } = "";
    }
}
