# PDFSignPro Desktop Signer

Ký số PDF bằng USB token (PKCS#11) trên Windows. Output PAdES chuẩn, xem được certificate trong Adobe Reader.

## Yêu cầu

- Windows 10/11
- Python 3.10+
- USB token đã cài driver PKCS#11 (Viettel, VNPT, EasyCA, BKAV, FPT, v.v.)
- Token đã cắm và có chứng thư số
- **Font file**: `assets/fonts/NotoSans-Regular.ttf` (hỗ trợ tiếng Việt, hiển thị appearance không bị tách ký tự)

## Cài đặt

```bash
cd desktop-signer
pip install -r requirements.txt
```

### Font (bắt buộc)

Đặt file `NotoSans-Regular.ttf` vào `assets/fonts/`:

```bash
# Tải từ Google Fonts hoặc:
# https://github.com/openmaptiles/fonts/raw/master/noto-sans/NotoSans-Regular.ttf
mkdir -p assets/fonts
# Sau khi tải, copy NotoSans-Regular.ttf vào assets/fonts/
```

## Build EXE (Windows)

```powershell
.\build.ps1
```

Output: `dist/PDFSignProSigner.exe` (onefile). Upload lên R2 tại key `signer/PDFSignProSigner.exe` để dùng với PDFSignPro Cloud.

## Sử dụng

### 1. Từ web (deep link)

1. Trên PDFSignPro Cloud, bấm "Ký số" → chọn "Open PDFSignPro Desktop"
2. Đăng ký protocol: Sửa `register-protocol.reg` (đường dẫn exe) → double-click để chạy
3. Lần sau khi bấm deep link, exe sẽ mở và hướng dẫn ký

### 2. Từ dòng lệnh

```bash
# Lệnh mẫu: ký trang cuối, ô chữ ký góc phải dưới
python sign_from_web.py --in input.pdf --out signed.pdf --page LAST --rectPct 0.64,0.06,0.32,0.10
# Hoặc dùng exe:
PDFSignProSigner.exe --in input.pdf --out signed.pdf
```

### Tham số

| Tham số | Mô tả | Mặc định |
|---------|-------|----------|
| `--in` | Đường dẫn PDF đầu vào | (bắt buộc) |
| `--out` | Đường dẫn PDF đã ký | (bắt buộc) |
| `--page` | Số trang (1-based) hoặc `LAST` | `LAST` |
| `--rectPct` | Vị trí ô chữ ký: `x,y,w,h` (0..1, góc trái dưới) | `0.64,0.06,0.32,0.10` |

### Ví dụ

```bash
# Ký trang cuối, ô chữ ký góc phải dưới (mặc định)
python sign_pades.py --in contract.pdf --out signed.pdf

# Ký trang 1, ô chữ ký tùy chỉnh
python sign_pades.py --in doc.pdf --out signed.pdf --page 1 --rectPct 0.1,0.8,0.5,0.15

# Chỉ định DLL PKCS#11 (nếu auto-scan không tìm thấy)
set PKCS11_DLL=C:\Path\To\viettel_pkcs11.dll
python sign_pades.py --in input.pdf --out signed.pdf
```

## Quy trình

1. **Sanitize PDF** (pikepdf): Mở input PDF và save lại thành bản cleaned trong memory để tránh lỗi parse (incorrect startxref, Object Streams, Dictionary read error).
2. **Auto-scan PKCS#11 DLL**: Quét `C:\Windows\System32`, `C:\Program Files`, `C:\Program Files (x86)` tìm file chứa `pkcs11`, `viettel`, `vnpt`, `easyca`, `bkav`, `fpt`, v.v.
3. **Nhập PIN**: Prompt ẩn (không hiển thị khi gõ)
4. **Chọn chứng thư**: Liệt kê cert trên token, chọn theo index
5. **Ký**: Tạo chữ ký PAdES, appearance text-only:
   - Ký bởi: \<O fallback CN\>
   - Ngày ký: \<Asia/Ho_Chi_Minh\>

## Hệ tọa độ rectPct

- `x,y` = góc trái dưới của ô chữ ký (0=trái/dưới, 1=phải/trên)
- `w,h` = chiều rộng, chiều cao (0..1)
- Ví dụ: `0.64,0.06,0.32,0.10` = ô 32%×10% trang, góc phải dưới

## Xử lý lỗi

| Lỗi | Nguyên nhân |
|-----|-------------|
| Font file not found | Thiếu `assets/fonts/NotoSans-Regular.ttf`. Tải từ [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans) hoặc [GitHub](https://github.com/openmaptiles/fonts/raw/master/noto-sans/NotoSans-Regular.ttf) |
| PDF sanitization failed | PDF bị lỗi cấu trúc. Thử: (1) Mở bằng Adobe Reader → Save As, (2) Print to PDF, hoặc (3) `qpdf --linearize input.pdf output.pdf` |
| No PKCS#11 DLL found | Chưa cài driver token hoặc set `PKCS11_DLL` |
| No token found | Token chưa cắm |
| Wrong PIN | Sai mật khẩu |
| No certificates found | Token không có chứng thư |

## Kiểm tra

Sau khi ký, mở `signed.pdf` bằng Adobe Reader:

1. Panel Signatures (hoặc View → Signatures)
2. Click chuột phải vào chữ ký → Show Signature Properties
3. Xem Certificate details
