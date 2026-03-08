using System.Globalization;

namespace PDFSignProSigner.Models;

public record JobInfo(
    string JobId,
    string JobToken,
    string ApiBaseUrl,
    string InputPdfUrl,
    string DocumentTitle,
    string PublicId,
    PlacementInfo Placement
);

public record PlacementInfo(string Page, RectPct Rect);

public record RectPct(double X, double Y, double W, double H)
{
    /// <summary>Format as x,y,w,h using InvariantCulture (avoids comma decimal issues).</summary>
    public string ToRectPctString() =>
        string.Format(CultureInfo.InvariantCulture, "{0},{1},{2},{3}", X, Y, W, H);

    /// <summary>Validate all 4 values are in 0..1. Returns (true, null) if valid, else (false, error message).</summary>
    public (bool IsValid, string? Error) Validate()
    {
        if (double.IsNaN(X) || double.IsNaN(Y) || double.IsNaN(W) || double.IsNaN(H))
            return (false, "Vị trí chữ ký không hợp lệ (thiếu giá trị).");
        if (X < 0 || X > 1 || Y < 0 || Y > 1 || W < 0 || W > 1 || H < 0 || H > 1)
            return (false, "Vị trí chữ ký phải có x,y,w,h trong khoảng 0..1.");
        return (true, null);
    }
}
