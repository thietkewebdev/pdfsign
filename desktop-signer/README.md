# PDFSignPro Desktop Signer

Ký số PDF bằng USB token (PKCS#11) trên Windows. Ứng dụng GUI PySide6, output PAdES chuẩn, xem được certificate trong Adobe Reader.

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

Output: `dist/PDFSignProSigner.exe` (onefile, GUI, --noconsole). Build từ `gui_main.py`. Upload lên R2 tại key `signer/PDFSignProSigner.exe` để dùng với PDFSignPro Cloud.

## Windows Installer (Inno Setup)

### Build installer

```powershell
cd desktop-signer
.\installer\build-installer.ps1
```

- Builds PyInstaller exe if `dist/PDFSignProSigner.exe` is missing
- Runs Inno Setup (ISCC) to produce `dist-installer/PDFSignProSignerSetup.exe`
- Inno Setup path: `C:\Program Files (x86)\Inno Setup 6\ISCC.exe` (override with `$env:INNO_SETUP_ISCC`)

### Install steps

1. Run `PDFSignProSignerSetup.exe` (bắt buộc – chỉ installer mới đăng ký `pdfsignpro://`)
2. Follow the wizard (install path: `%LOCALAPPDATA%\PDFSignProSigner`)
3. Optionally create desktop shortcut
4. Optionally launch the app after install

**Nếu bấm "Mở PDFSignPro Signer" mà app không hiện:**
- Phải cài qua `PDFSignProSignerSetup.exe`, không chạy trực tiếp file .exe tải từ web
- Nếu đã cài: gỡ cài đặt cũ → chạy lại installer
- Hoặc dùng `installer/register-protocol.reg` (sửa đường dẫn exe trong file) → double-click để đăng ký

### Chạy GUI qua deep link

**Cách 1: Từ web** – Trên PDFSignPro Cloud, bấm "Ký số" → "Mở PDFSignPro Signer". Ứng dụng mở qua `pdfsignpro://sign?p=<base64url>` (URL ngắn, một param duy nhất, Windows launch ổn định).

**Cách 2: Test không cần web** – Dùng deep link mẫu (sẽ lỗi claim nhưng đủ để kiểm tra GUI mở):

```powershell
# PowerShell (p = base64url của {"j":"job_test","c":"abc12345","h":"localhost"})
Start-Process "pdfsignpro://sign?p=eyJqIjoiam9iX3Rlc3QiLCJjIjoiYWJjMTIzNDUiLCJoIjoibG9jYWxob3N0In0"
```

Hoặc chạy trực tiếp với tham số:

```powershell
python gui_main.py "pdfsignpro://sign?p=eyJqIjoiam9iX3Rlc3QiLCJjIjoiYWJjMTIzNDUiLCJoIjoibG9jYWxob3N0In0"
```

Nếu PDFSignPro Cloud chạy local tại `http://localhost:3000`, tạo job thật trên web rồi copy deep link từ response `POST /api/jobs`.

### Test deep link locally

Lấy deep link từ response `POST /api/jobs` khi bấm "Ký số" trên web, rồi chạy:

```powershell
# Python
python gui_main.py "pdfsignpro://sign?p=eyJqIjoiam9iX2FiYzEyMyIsImMiOiJhMWIyYzNkNCIsImgiOiJteWFwcC5vbnJlbmRlci5jb20ifQ"

# Exe (sau khi build)
PDFSignProSigner.exe "pdfsignpro://sign?p=..."
```

## Sử dụng

### 1. Từ web (deep link) – GUI

1. Cài đặt qua `PDFSignProSignerSetup.exe` (Inno Setup) để đăng ký `pdfsignpro://`
2. Trên PDFSignPro Cloud, bấm "Ký số" → "Mở PDFSignPro Signer"
3. Ứng dụng mở qua deep link, hiển thị:
   - Màn hình tải job
   - Màn hình chính: thông tin tài liệu, danh sách chứng thư, ô nhập PIN, nút "Ký"
   - Màn hình thành công: "Mở tài liệu đã ký trong trình duyệt"

**Luồng GUI:**
- Nhập PIN → "Tải chứng thư" → chọn chứng thư → "Ký"
- Lỗi rõ ràng: sai PIN, token không tìm thấy, lỗi mạng

### 2. Chạy GUI trực tiếp (không deep link)

```bash
python gui_main.py
```

Hiển thị màn hình chờ: "Mở ứng dụng từ PDFSignPro Cloud".

### 3. Từ dòng lệnh (CLI) – debug

```bash
# Exe với --in/--out → delegate tới sign_pades
PDFSignProSigner.exe --in input.pdf --out signed.pdf

# Chạy sign_pades trực tiếp
python sign_pades.py --in input.pdf --out signed.pdf
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

## Quy trình (GUI)

1. **Deep link**: Parse `pdfsignpro://sign?p=<base64url>` từ `argv[1]`, decode JSON `{j,c,h}`
2. **Claim job**: `POST {apiBaseUrl}/api/jobs/{jobId}/claim` với body `{code}` → nhận `jobToken`, `apiBaseUrl`
3. **Fetch job**: `GET {apiBaseUrl}/api/jobs/{jobId}` với header `x-job-token`
4. **Tải chứng thư**: Nhập PIN → "Tải chứng thư" → liệt kê O/CN, serial, validity
5. **Ký**: Chọn cert → "Ký" → tải PDF, ký PAdES (pikepdf sanitize + pyHanko), upload
6. **Upload**: `POST /api/jobs/{jobId}/complete` multipart (file + certMeta JSON)
7. **Hoàn tất**: Hiển thị nút "Mở tài liệu đã ký trong trình duyệt"

**certMeta JSON:** `subjectO`, `subjectCN`, `serial`, `signingTime`

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
| Wrong PIN | Sai mật khẩu (hiển thị khi bấm "Tải chứng thư") |
| No certificates found | Token không có chứng thư |
| Không lấy được job / Lỗi mạng | Kiểm tra kết nối, URL API, token job còn hạn |

## Kiểm tra

Sau khi ký, mở `signed.pdf` bằng Adobe Reader:

1. Panel Signatures (hoặc View → Signatures)
2. Click chuột phải vào chữ ký → Show Signature Properties
3. Xem Certificate details
