using System;

namespace PDFSignProSigner.Services;

/// <summary>
/// Maps the stable error codes emitted by PDFSignProSignerCore.exe (lines prefixed
/// with "ERRCODE:") to friendly Vietnamese messages. Falls back to substring matching
/// for older cores / vendor messages that do not emit a code.
/// </summary>
public static class SignerErrorMessages
{
    /// <summary>Extract the ERRCODE token from core stderr, or null if none.</summary>
    public static string? ExtractCode(string? stderr)
    {
        if (string.IsNullOrWhiteSpace(stderr)) return null;
        foreach (var raw in stderr.Split('\n'))
        {
            var line = raw.Trim();
            if (line.StartsWith("ERRCODE:", StringComparison.OrdinalIgnoreCase))
            {
                var code = line.Substring("ERRCODE:".Length).Trim();
                if (!string.IsNullOrEmpty(code)) return code.ToUpperInvariant();
            }
        }
        return null;
    }

    public static string ForCode(string code) => code switch
    {
        "PIN_INCORRECT" => "Mã PIN không đúng. Cảnh báo: nhập sai nhiều lần có thể khóa token.",
        "PIN_LOCKED" => "Token đã bị KHÓA do nhập sai PIN quá nhiều lần. Hãy dùng phần mềm của nhà cung cấp token để mở khóa (PUK) trước khi ký.",
        "PIN_EXPIRED" => "Mã PIN đã hết hạn, cần đổi bằng phần mềm của nhà cung cấp token trước khi ký.",
        "PIN_INVALID" => "Mã PIN không hợp lệ (sai định dạng hoặc độ dài). Vui lòng kiểm tra lại.",
        "TOKEN_NOT_FOUND" => "Không tìm thấy USB token chữ ký số. Hãy cắm token vào máy và thử lại.",
        "TOKEN_REMOVED" => "Token đã bị rút ra trong khi ký. Hãy cắm lại token và thử lại.",
        "NO_CERTS" => "Không tìm thấy chứng thư số trên token. Một số token cần cài/nhập chứng thư bằng phần mềm nhà cung cấp trước.",
        "CERT_EXPIRED" => "Chứng thư số đã HẾT HẠN nên không thể ký. Vui lòng gia hạn chứng thư với nhà cung cấp.",
        "CERT_NOT_YET_VALID" => "Chứng thư số chưa đến thời điểm có hiệu lực nên không thể ký.",
        "NO_PKCS11_DLL" => "Không tìm thấy driver token (PKCS#11) trên máy. Hãy cài phần mềm token của nhà cung cấp (Viettel-CA, VNPT-CA, FPT-CA, BKAV-CA, ...).",
        "USER_CANCELLED" => "Đã hủy thao tác ký.",
        "DEVICE_ERROR" => "Lỗi thiết bị token. Hãy rút và cắm lại token, hoặc thử cổng USB khác.",
        _ => "Đã xảy ra lỗi khi ký. Vui lòng thử lại.",
    };

    /// <summary>True when the error means the PIN cache must be cleared (PIN issues).</summary>
    public static bool IsPinRelated(string? code) =>
        code is "PIN_INCORRECT" or "PIN_LOCKED" or "PIN_EXPIRED" or "PIN_INVALID";

    /// <summary>True when retrying with the same input cannot succeed (needs user action).</summary>
    public static bool IsBlocking(string? code) =>
        code is "PIN_LOCKED" or "PIN_EXPIRED" or "CERT_EXPIRED" or "CERT_NOT_YET_VALID" or "NO_PKCS11_DLL";

    /// <summary>
    /// Resolve the best message from core output: prefer ERRCODE, then substring
    /// heuristics on the raw text, then the raw text itself.
    /// </summary>
    public static (string Message, string? Code) Resolve(string? stderr, string? stdout = null)
    {
        var code = ExtractCode(stderr);
        if (code != null) return (ForCode(code), code);

        var text = (stderr ?? "").Trim();
        if (text.Length == 0) text = (stdout ?? "").Trim();
        var upper = text.ToUpperInvariant();

        if (upper.Contains("CKR_PIN_LOCKED")) return (ForCode("PIN_LOCKED"), "PIN_LOCKED");
        if (upper.Contains("CKR_PIN_EXPIRED")) return (ForCode("PIN_EXPIRED"), "PIN_EXPIRED");
        if (upper.Contains("CKR_PIN_INCORRECT") || upper.Contains("INCORRECT") || upper.Contains(" SAI"))
            return (ForCode("PIN_INCORRECT"), "PIN_INCORRECT");
        if (upper.Contains("NO PKCS#11") || upper.Contains("TOKEN DRIVER"))
            return (ForCode("NO_PKCS11_DLL"), "NO_PKCS11_DLL");
        if (upper.Contains("NOT FOUND") || upper.Contains("INSERT USB") || upper.Contains("NO TOKEN"))
            return (ForCode("TOKEN_NOT_FOUND"), "TOKEN_NOT_FOUND");
        if (upper.Contains("EXPIRED")) return (ForCode("CERT_EXPIRED"), "CERT_EXPIRED");

        return (string.IsNullOrEmpty(text) ? ForCode("GENERAL") : text, null);
    }
}
