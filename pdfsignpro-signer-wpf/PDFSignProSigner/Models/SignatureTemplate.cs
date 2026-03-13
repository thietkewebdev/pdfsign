namespace PDFSignProSigner.Models;

/// <summary>Signature template configuration for visible signature appearance.</summary>
public record SignatureTemplate(
    string Id,
    string DisplayName,
    string FontFamily,
    double FontSize,
    string Color,
    string BorderStyle,
    string Background,
    string Layout,
    bool ShowDate,
    string DateFormat,
    string? StampText
)
{
    /// <summary>Short preview text for card thumbnail.</summary>
    public string PreviewText => Id switch
    {
        "classic" => "Nguyễn Văn A · 10/12/2026",
        "modern" => "Nguyễn Văn A · Giám đốc",
        "minimal" => "Nguyễn Văn A",
        "stamp" => "Đã ký số · 10/12/2026",
        _ => DisplayName,
    };
    public const string BorderNone = "none";
    public const string BorderSolid = "solid";
    public const string BgTransparent = "transparent";
    public const string BgWhite = "white";
    public const string BgSoft = "soft";
    public const string LayoutStack = "stack";
    public const string LayoutCenter = "center";
}
