using System.Globalization;

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
    /// <summary>O/CN for display (bold line).</summary>
    public string OrgCn => string.IsNullOrEmpty(SubjectO)
        ? (SubjectCN ?? "Unknown")
        : $"{SubjectO} / {SubjectCN ?? "Unknown"}";

    /// <summary>Serial + expiry for muted line.</summary>
    public string SerialAndExpiry => $"Serial: {Serial} • Hết hạn: {ValidTo}";

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
}
