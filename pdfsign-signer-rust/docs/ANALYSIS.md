# Phân tích PDFSignPro Signer (WPF + pyHanko) cho bản viết lại bằng Rust

Phạm vi: đọc mã nguồn, không sửa `pdfsignpro-signer-wpf/`, `pdfsignpro-cloud/`, `desktop-signer/`.
Các kết luận về định dạng chữ ký đã được kiểm chứng bằng cách chạy chính `desktop-signer/sign_core.py`
với SoftHSM2 (xem `docs/COMPARE.md`).

## 1. Kiến trúc hiện tại

- `pdfsignpro-signer-wpf/` (.NET 8 WPF) chỉ lo UI, deep link, local bridge, gọi API cloud.
- Toàn bộ phần ký nằm trong `PDFSignProSignerCore.exe` = PyInstaller onefile của
  `desktop-signer/sign_core.py` (pyHanko + python-pkcs11 + pikepdf + reportlab), build bởi
  `desktop-signer/build-core.ps1`, được copy cạnh WPF exe (`pdfsignpro-signer-wpf/build-installer.ps1`).
- WPF gọi Core bằng tiến trình con, tham số qua argv, đọc JSON ở stdout và dòng `ERRCODE:<CODE>` ở stderr
  (`Services/CoreService.cs`, `desktop-signer/sign_core.py`, `desktop-signer/signer/errors.py`).

| Lệnh Core | Mục đích | Đầu ra |
|---|---|---|
| `--probe-pkcs11` | dò DLL, không cần PIN | `{ok, dllCount, found, dlls[]}` |
| `--list-certs --pin P [--dll D]` | liệt kê chứng thư | `{dllPath, certs:[{index, subjectO, subjectCN, issuerCN, serial, validTo, displayName}]}` |
| `--in --out --dll --cert-index --pin --page --rectPct x,y,w,h [--template] [--seal-image]` | ký | `OK` |

## 2. Nạp module PKCS#11 (driver token)

Lưu ý cho chủ dự án: installer WPF **không đóng gói driver** của nhà cung cấp nào.
`installer/PDFSignProSigner.iss` chỉ copy `publish\*` (WPF + Core) và font; trong git không có DLL token nào.
Signer dựa vào driver do phần mềm token của CA cài sẵn, và tự dò theo heuristic trong
`desktop-signer/signer/pkcs11_discovery.py`:

- Thư mục quét: `C:\Windows\System32`, `C:\Program Files`, `C:\Program Files (x86)`; sâu tối đa 2 cấp,
  hoặc 8 cấp khi đã vào thư mục có tên hãng (Viettel, VNPT, BKAV, FPT, SafeNet, Feitian, ...).
- Tên file `.dll` phải chứa một mẫu: `pkcs11, csp11, viettel, vnpt, ca2, fpt, newtel, safe, safenet,
  smartsign, efy, trustca, trust-ca, misa, cmc, oneca, one-ca, easyca, bkav, etoken, ngp11, castle,
  epass, eps2003, shuttle, ftpkcs11, ftsafe, wdpkcs, watchdata, aetpkss, opensc, idprime, starcos,
  cardos, safesign, gclib, nacencomm, savis, softdreams, winca, newca, ksign`.
- DLL hợp lệ khi load được và có export `C_GetFunctionList`.
- Thứ tự ưu tiên: `C:\Windows\System32\viettel-ca_v6.dll` > `_v5` > ... > `_v1` > `viettel-ca.dll`;
  nếu không có thì DLL có chữ "viettel" với số `_vN` cao nhất; còn lại sắp theo đường dẫn.
  Khi liệt kê chứng thư, thử lần lượt từng DLL cho đến khi có token (chỉ bỏ qua lỗi `TOKEN_NOT_FOUND`).
- Biến môi trường `PKCS11_DLL` ép dùng một DLL.

Bảng ánh xạ hãng: chỉ Viettel có tên DLL cụ thể trong code. VNPT, BKAV, FPT, CA2/Nacencomm, EasyCA/SoftDreams,
TrustCA/SAVIS, MISA, EFY, CMC, NewTel, One-CA, SmartSign, WinCA, K-Sign và các middleware Feitian/Watchdata/
SafeNet/Gemalto chỉ được nhận diện theo **chuỗi con trong tên file/thư mục**, không có đường dẫn cố định.

macOS: code WPF/Python không có gì cho macOS (chỉ Windows). Danh sách dylib macOS trong
`crates/pdfsign-token/src/discovery.rs` (`KNOWN_MACOS`: OpenSC, SafeNet `libeTPkcs11.dylib`,
Feitian `libcastle.1.0.0.dylib`, SoftHSM2) là **chưa xác minh**; đường dẫn dylib của Viettel, VNPT, BKAV trên macOS
cần chủ dự án đo thực tế (checklist trong `docs/TEST-TOKEN-THAT.md`). Bản Rust quét thêm `/usr/local/lib`,
`/opt/homebrew/lib`, `/Library`, `/Applications` với cùng bộ mẫu tên.

Bản Rust (`pdfsign-token`) dùng lại nguyên các danh sách và thứ tự trên làm mặc định cho Windows,
cộng thêm `--module <đường dẫn>` và biến `PDFSIGN_PKCS11_MODULE`.

## 3. Chọn chứng thư và khóa

- Slot: lấy **tất cả** slot rồi giữ slot trả lời được `C_GetTokenInfo` (driver Viettel không bật
  `CKF_TOKEN_PRESENT`), dùng slot đầu tiên (`signer/cert_selector.py`).
- Đăng nhập PIN rồi tìm `CKO_CERTIFICATE`; nếu rỗng thì quét mọi object có `CKA_VALUE` giống DER X.509.
- Tên hiển thị: `O` nếu có, không thì `CN`. Serial: hex in hoa.
- WPF bỏ chứng thư hết hạn, tự chọn theo `PreferredCertSerial` trong `settings.json`
  (`MainWindow.xaml.cs`, `Services/AppSettings.cs`); Core chặn ký khi cert hết hạn/chưa hiệu lực
  (trừ khi `PDFSIGN_ALLOW_EXPIRED=1`).
- Ghép khóa riêng (`signer/pades_signer.py`): theo `CKA_ID` (bỏ byte 0 ở cuối), rồi `CKA_LABEL`,
  lọc theo loại khóa RSA/EC; nếu chỉ có 1 khóa thì dùng nó; cuối cùng ghép theo thứ tự (cert thứ i với khóa thứ i).
- Rủi ro (tái hiện được với SoftHSM2): `cert-index` dựa trên thứ tự `C_FindObjects`, thứ tự này có thể khác
  giữa phiên chưa đăng nhập và phiên đã đăng nhập. Nếu token có thêm cert CA, index có thể trỏ vào cert CA;
  khi đó luật "chỉ có 1 khóa thì dùng nó" ký bằng khóa người dùng nhưng nhúng cert CA, tạo chữ ký sai.
  Bản Rust: sắp xếp cert cố định (cert người dùng trước, CA sau), ghép khóa theo modulus RSA (`CKA_MODULUS`)
  trước tiên, không bao giờ dùng khóa có modulus khác cert, từ chối ký bằng cert CA, GUI chọn cert theo serial.

## 4. Xử lý PIN (rủi ro cần biết)

- Nhập trong `PasswordBox`. Sau khi đúng, PIN được **lưu bằng DPAPI (CurrentUser)** vào
  `%LOCALAPPDATA%\PDFSignProSigner\pin_cache.dat`, khóa theo `tokenId = dllPath|serials`, tự dùng lại ở lần ký sau,
  xóa khi PIN sai (`Services/PinCacheStorage.cs`, `MainWindow.xaml.cs`).
- PIN được truyền sang Core qua **argv** (`--pin`), nên các tiến trình cùng user có thể đọc được qua command line.
- Local bridge nhận PIN dạng JSON từ trình duyệt (`POST /certs`).
- Bản Rust: PIN chỉ đọc từ prompt ẩn hoặc stdin, giữ trong `AuthPin` (SecretString, tự xóa), không bao giờ log.
  Có cảnh báo khi token báo "còn 1 lần nhập PIN" và từ chối đăng nhập khi PIN đã khóa.

## 5. Hình thức chữ ký hiển thị

- Vị trí: `placement = {page: số trang 1-based | "LAST", rectPct: {x, y, w, h}}`, tỉ lệ 0..1,
  gốc **góc dưới trái của trang đang hiển thị**; quy đổi theo MediaBox và `/Rotate`
  (`_box_from_pct` trong `pades_signer.py`). Mặc định `0.64,0.06,0.32,0.10`.
- **Lỗi đang có trên production**: với trang `/Rotate 90` hoặc `270`, công thức đổi tọa độ bị đảo
  (90 và 270 hoán đổi), và stamp không được xoay. Kết quả: khung ký nằm sai góc, chữ bị xoay ngang
  (ảnh trong `COMPARE.md`). Bản Rust đã sửa (đổi đúng tọa độ + `/Matrix` xoay ngược để chữ đứng thẳng).
- Mẫu (`signer/sig_appearance.py`, `Services/SignatureTemplateManager.cs`): `classic`, `modern`, `minimal`,
  `stamp` (tiêu đề "Đã ký số"), `valid` (khung đỏ, vòng tròn đỏ dấu tích trắng), `seal` (ảnh con dấu bên trái + chữ).
  Core mặc định `valid`; WPF mặc định `classic` nếu chưa chọn; deep link `t` ghi đè.
- Nội dung: `Ký bởi: <O hoặc CN>` và `Thời gian: dd/MM/yyyy HH:mm:ss` theo giờ `Asia/Ho_Chi_Minh`;
  font `NotoSans-Regular.ttf` (đóng vào Core), tự giảm cỡ chữ và xuống dòng để vừa khung.
- Ảnh con dấu: cloud trả `sealImageUrl` (PNG/JPG), WPF tải về rồi truyền `--seal-image`.

## 6. Định dạng chữ ký mà pyHanko tạo ra (đã kiểm chứng)

`PdfSignatureMetadata(field_name=...)` không đặt `subfilter`, không có timestamper, không có `embed_validation_info`,
nên pyHanko dùng mặc định (`pyhanko/sign/signers/pdf_signer.py`: `subfilter = ADOBE_PKCS7_DETACHED`):

| Mục | Giá trị thực tế |
|---|---|
| Filter / SubFilter | `Adobe.PPKLite` / **`adbe.pkcs7.detached`** (không phải `ETSI.CAdES.detached`) |
| Băm / thuật toán ký | SHA-256 / `sha256WithRSAEncryption` (RSA PKCS#1 v1.5) |
| Signed attributes | content-type, **signing-time**, cms-algorithm-protection, message-digest, signing-certificate-v2 (ESSCertIDv2 SHA-256 + issuerSerial) |
| Unsigned attributes | không có |
| Chứng thư nhúng | chỉ cert người ký, bị nhúng **2 lần** (trùng trong SET); không nhúng chuỗi CA (`other_certs_to_pull=()` mặc định) |
| TSA | không dùng |
| LTV / DSS / OCSP / CRL | không có |
| `/M` | giờ UTC (`D:...Z`) |
| Mức | **không đạt PAdES baseline**: là chữ ký CMS/PKCS#7 tách rời; có thuộc tính CAdES nhưng SubFilter và signing-time không đúng chuẩn ETSI EN 319 142-1. Gần nhất là "PAdES B-B" về nội dung, nhưng không đúng tên gọi. |

Cập nhật tăng dần: với PDF **chưa có chữ ký**, Core **ghi lại toàn bộ file bằng pikepdf** trước rồi mới
thêm 1 incremental update (`_pdf_bytes_for_signing`), nên byte gốc trên cloud không được giữ nguyên.
PDF đã có `/ByteRange` thì dùng nguyên file (giữ chữ ký trước).

Phụ thuộc phiên bản: `pades_signer.py` import hàm riêng `pyhanko.sign.pkcs11._pull_cert`, hàm này bị xóa từ
pyHanko 0.29.1. `requirements.txt` ghi `pyHanko>=0.25.0`, nên build lại Core với pyHanko mới sẽ hỏng ngay khi import.

## 7. Giao thức `pdfsignpro://`

- Đăng ký ở HKCU: `Software\Classes\pdfsignpro\shell\open\command = "<app>\PDFSignProSigner.exe" "%1"`
  (`installer/PDFSignProSigner.iss`). Một instance: Mutex `PDFSignProSigner_SingleInstance` + named pipe
  `PDFSignProSigner_DeepLinkPipe` chuyển URL cho instance đang chạy (`Services/SingleInstanceService.cs`).
- Định dạng: `pdfsignpro://sign?p=<base64url(JSON)>`, JSON = `{"j": jobId, "c": claimCode, "h": host, "t"?: templateId}`
  (tạo ở `pdfsignpro-cloud/src/app/api/jobs/route.ts`, đọc ở `Services/DeepLinkService.cs`).
- `h` -> API base: `https://<h>`; riêng `localhost` -> `http://localhost:3000` (`Services/ApiHelpers.cs`).

## 8. Local bridge `http://127.0.0.1:17886`

`Services/LocalBridgeService.cs` (HttpListener), web gọi từ `pdfsignpro-cloud/src/lib/local-signer.ts`.

| Endpoint | Request | Response |
|---|---|---|
| `GET /health`, `GET /ready` | | `{ok:true, app:"PDFSignProSigner", version, installMode:"per-user", bridge:true, coreExists, pkcs11:{found, dllCount, dlls[≤8 tên file]}}` (probe cache 20 s) |
| `POST /certs` | `{"pin": "..."}` | `{ok:true, dllPath, count, certs:[{index, subjectO, subjectCN, issuerCN, serial, validTo, displayName}]}` (chỉ cert còn hạn) |
| lỗi | | `{ok:false, errorCode, error}`; mã: `PIN_REQUIRED`, `NO_VALID_CERTS`, `NOT_FOUND`, `INTERNAL_ERROR`, `CANCELED` |

CORS chỉ cho `https://pdfsign.vn`, `https://www.pdfsign.vn`, `http://localhost:3000`, `http://127.0.0.1:3000`;
có `Access-Control-Allow-Private-Network: true`. Không có xác thực nào khác.

## 9. Luồng job với pdfsignpro-cloud

1. Web `POST /api/jobs` `{documentId, placement, templateId?, sealImage? (data URL)}` ->
   `{jobId, deepLink, placement, documentId, expiresAt}`; job hết hạn sau 90 phút
   (`src/app/api/jobs/route.ts`, `src/lib/signing-job-config.ts`).
2. Signer `POST /api/jobs/{jobId}/claim` `{code}` -> `{jobToken, apiBaseUrl}`. Claim code 8 hex, dùng 1 lần,
   giới hạn 20 lần/phút/IP. Lỗi: `JOB_NOT_FOUND` 404, `JOB_NOT_AVAILABLE` 400, `JOB_EXPIRED` 410,
   `CLAIM_ALREADY_USED` 409, `INVALID_CLAIM_CODE` 401 (`claim/route.ts`, `src/lib/claim-code.ts`).
3. `GET /api/jobs/{jobId}` header `x-job-token` -> `{document:{title, publicId}, inputPdfUrl (presigned 1 giờ),
   sealImageUrl?, placement:{page, rectPct}, status}` (`[jobId]/route.ts`).
4. Tải PDF (và ảnh con dấu), ký cục bộ.
5. `POST /api/jobs/{jobId}/complete` header `x-job-token`, multipart: `file` (application/pdf, tối đa 25 MB),
   `certMeta` = JSON `{subjectO, subjectCN, issuerCN, serial, signingTime}` ->
   `{signedPublicUrl, signedDownloadUrl, publicId, versionNumber}` (`complete/route.ts`).
   Server không kiểm tra chữ ký trong file.
6. Web theo dõi `GET /api/jobs/{jobId}/status` (không cần token).

Xác thực: claim code (từ deep link) đổi lấy `jobToken` 48 hex; server chỉ lưu SHA-256 của token.

## 10. Quyết định cho bản Rust (giai đoạn 1)

- Giữ tương thích: `rectPct`, `page`, mã lỗi `ERRCODE:*`, JSON của `list-certs`, thứ tự dò DLL.
- Đổi có chủ đích: SubFilter `ETSI.CAdES.detached`, bỏ signing-time (PAdES B-B), tùy chọn TSA (B-T),
  giữ nguyên byte gốc (không ghi lại bằng pikepdf), sửa lỗi trang xoay, PIN không qua argv.
- Chưa làm: LTV/DSS (B-LT), deep link, bridge, upload job; GUI mới là bộ khung. Xem roadmap trong `README.md`.
