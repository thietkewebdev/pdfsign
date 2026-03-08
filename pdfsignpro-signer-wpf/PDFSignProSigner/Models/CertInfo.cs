using System.Globalization;
using System.Text;

namespace PDFSignProSigner.Models;

public record CertInfo(
    int Index,
    string? SubjectO,
    string? SubjectCN,
    string Serial,
    string ValidTo,
    string DisplayName
)
{
    /// <summary>Company name: prefer O else CN. If both exist but normalize-equal, show only once.</summary>
    public string CompanyName
    {
        get
        {
            var o = string.IsNullOrWhiteSpace(SubjectO) ? null : SubjectO.Trim();
            var cn = string.IsNullOrWhiteSpace(SubjectCN) ? null : SubjectCN.Trim();
            if (string.IsNullOrEmpty(o)) return cn ?? "Unknown";
            if (string.IsNullOrEmpty(cn)) return o;
            if (NormalizeForCompare(o) == NormalizeForCompare(cn))
                return o;
            return $"{o} / {cn}";
        }
    }

    /// <summary>Expiry display: Hết hạn: dd-MM-yyyy. ValidTo format: "YYYY-MM-DD HH:MM" from Python.</summary>
    public string ExpiryDisplay
    {
        get
        {
            if (string.IsNullOrEmpty(ValidTo)) return "";
            if (DateTime.TryParse(ValidTo, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dt))
                return $"Hết hạn: {dt:dd-MM-yyyy}";
            return $"Hết hạn: {ValidTo}";
        }
    }

    /// <summary>Whether cert is valid (not expired). ValidTo format: "YYYY-MM-DD HH:MM" (UTC from Python).</summary>
    public bool IsValid
    {
        get
        {
            if (string.IsNullOrEmpty(ValidTo)) return true;
            if (DateTime.TryParse(ValidTo, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dt))
                return dt > DateTime.UtcNow;
            return true;
        }
    }

    private static string NormalizeForCompare(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var normalized = s.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        }
        return sb.ToString().Normalize(NormalizationForm.FormC).Trim().ToLowerInvariant();
    }
}
