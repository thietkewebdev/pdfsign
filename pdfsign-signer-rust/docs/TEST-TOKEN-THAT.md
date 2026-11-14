# Checklist thử token thật (Viettel, VNPT, BKAV, ...) trên Windows và macOS

Mục tiêu: xác nhận `pdfsign` nạp đúng driver PKCS#11, đọc được chứng thư, ký được, và Adobe Reader
xác minh chữ ký. Ghi kết quả vào bảng cuối file rồi gửi lại.

Lưu ý an toàn:

- Token thường **khóa sau 3 đến 5 lần nhập sai PIN**. Nếu `pdfsign` báo "còn 1 lần nhập PIN", dừng lại.
- Không gõ PIN vào dòng lệnh. `pdfsign` hỏi PIN ở chế độ ẩn (`--pin-prompt`), không ghi PIN vào log.
- Dùng file PDF thử, không dùng hợp đồng thật.

## 0. Lấy bản build

- Vào tab Actions của PR, workflow `pdfsign-signer-rust`, tải artifact:
  `pdfsign-windows-x64` (`pdfsign.exe`) hoặc `pdfsign-macos-universal` (`pdfsign`).
- macOS: `chmod +x pdfsign && xattr -d com.apple.quarantine pdfsign` (bản chưa ký số/notarize).
- Hoặc tự build: `cargo build --release -p pdfsign-cli` trong `pdfsign-signer-rust/`.

## 1. Windows

1. Cài phần mềm token của nhà cung cấp (bản mới nhất từ trang CA):
   - Viettel-CA: "Viettel-CA Token Manager" (thường cài `C:\Windows\System32\viettel-ca_v*.dll`).
   - VNPT-CA: phần mềm quản lý token/plugin của VNPT-CA.
   - BKAV-CA: "BkavCA Token Manager".
   - FPT-CA, EasyCA, CA2, NewTel, ... tương tự.
2. Cắm token, kiểm tra phần mềm của CA thấy chứng thư (và Device Manager nhận thiết bị).
3. Mở PowerShell tại thư mục chứa `pdfsign.exe`:

   ```powershell
   .\pdfsign.exe --version
   .\pdfsign.exe list-tokens
   ```

   - Kỳ vọng: có dòng DLL của hãng và `slot 0: <nhãn token> | <hãng> <model> | serial ...`.
   - Nếu không thấy DLL: tìm thủ công rồi chạy lại với `--module`:

     ```powershell
     Get-ChildItem C:\Windows\System32, "C:\Program Files", "C:\Program Files (x86)" -Recurse -Include *pkcs11*.dll,*csp11*.dll,*viettel*.dll,*vnpt*.dll,*bkav*.dll -ErrorAction SilentlyContinue | Select FullName
     .\pdfsign.exe list-tokens --module "C:\duong\dan\toi\driver.dll"
     ```

4. Liệt kê chứng thư (đa số token cho đọc cert không cần PIN; nếu rỗng thì thêm `--pin-prompt`):

   ```powershell
   .\pdfsign.exe list-certs
   .\pdfsign.exe list-certs --json
   ```

5. Ký thử (hỏi PIN ẩn):

   ```powershell
   .\pdfsign.exe sign --pin-prompt --cert 0 --in test.pdf --out test-signed.pdf --page LAST --rect 0.55,0.06,0.40,0.11
   .\pdfsign.exe verify test-signed.pdf
   ```

   Thêm timestamp (PAdES B-T), ví dụ TSA của CA hoặc `http://timestamp.digicert.com`:

   ```powershell
   .\pdfsign.exe sign --pin-prompt --cert 0 --in test.pdf --out test-signed-bt.pdf --tsa http://timestamp.digicert.com
   ```

6. Thử lỗi có kiểm soát: rút token rồi ký (kỳ vọng `ERRCODE:TOKEN_NOT_FOUND` hoặc `TOKEN_REMOVED`).
   **Không** cố tình nhập sai PIN quá 1 lần.
7. Nếu có nhiều phần mềm token cùng cài: chạy `list-tokens` và ghi lại thứ tự DLL; kiểm tra lệnh `sign`
   không chỉ định `--module` chọn đúng DLL (Viettel được ưu tiên giống bản WPF).

## 2. macOS (Apple Silicon và Intel)

1. Cài driver macOS của CA (nếu CA có cung cấp). Ghi lại tên gói và phiên bản.
2. Tìm thư viện PKCS#11 (dylib hoặc .so):

   ```bash
   ./pdfsign list-tokens
   find /usr/local/lib /opt/homebrew/lib /Library /Applications -iname '*pkcs11*' -o -iname '*.dylib' 2>/dev/null \
     | grep -i -E 'pkcs11|viettel|vnpt|bkav|fpt|castle|etpkcs|epass|safenet|opensc'
   ```

3. Nếu không tự dò được: `./pdfsign list-tokens --module /duong/dan/lib.dylib`.
4. Kiến trúc: `file /duong/dan/lib.dylib` phải có `arm64` trên máy M1/M2/M3 (bản `pdfsign` là universal).
   Nếu driver chỉ có `x86_64`, ghi lại: khi đó phải chạy `arch -x86_64 ./pdfsign ...`.
5. Nếu macOS chặn thư viện chưa ký: System Settings > Privacy & Security > Allow, rồi chạy lại.
6. Các lệnh `list-certs`, `sign`, `verify` giống Windows (thêm `--module` nếu cần).

## 3. Kiểm tra trong Adobe Acrobat Reader

Mở `test-signed.pdf` (và `test-signed-bt.pdf`):

- [ ] Thanh trên cùng: "Signed and all signatures are valid" (hoặc "At least one signature has problems":
      ghi lại nguyên văn).
- [ ] Bảng Signatures > chữ ký > "Signature Properties":
  - [ ] "Document has not been modified since this signature was applied".
  - [ ] "Signer's identity is valid". Nếu "unknown": Edit > Preferences > Signatures > Identities & Trusted
        Certificates / Verification > bật "Windows Integration" (tin kho chứng thư Windows), mở lại file.
        Ghi lại CA có nằm trong AATL không.
  - [ ] Show Signer's Certificate: đúng tên công ty/người ký, đúng CA, chuỗi đầy đủ đến Root.
  - [ ] Advanced Properties: Hash Algorithm = SHA256; Signature Format = **CAdES Equivalent / ETSI.CAdES.detached**
        (bản WPF hiện tại hiện "PKCS#7 - Detached").
  - [ ] Bản `--tsa`: "Signature includes an embedded timestamp", thời gian là của TSA.
- [ ] Hình chữ ký: đúng trang, đúng vị trí, tiếng Việt có dấu hiển thị đúng, in ra giấy vẫn thấy.
- [ ] Ký thêm lần 2 bằng Adobe hoặc bằng `pdfsign` lên file đã ký: chữ ký 1 vẫn hợp lệ.
- [ ] So với file ký bằng WPF hiện tại trên cùng tài liệu: ghi khác biệt Adobe hiển thị.

## 4. Bảng kết quả (điền và gửi lại)

| Hãng / model token | HĐH + CPU | Đường dẫn module | list-tokens | list-certs | sign | Adobe: hợp lệ / danh tính / định dạng | Ghi chú |
|---|---|---|---|---|---|---|---|
| Viettel-CA | Windows 11 x64 | | | | | | |
| VNPT-CA | Windows 11 x64 | | | | | | |
| BKAV-CA | Windows 11 x64 | | | | | | |
| Viettel-CA | macOS (M?) | | | | | | |
| VNPT-CA | macOS (M?) | | | | | | |
| BKAV-CA | macOS (M?) | | | | | | |

Gửi kèm: output `list-tokens`, `list-certs --json` (không chứa PIN), file PDF đã ký, ảnh chụp bảng Signature
Properties trong Adobe. Khi có lỗi, chạy lại với `-v` và gửi phần stderr.
