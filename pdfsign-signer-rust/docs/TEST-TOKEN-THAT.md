# Checklist thử token thật trên Windows (Viettel, VNPT, BKAV, ...)

Mục tiêu: xác nhận ứng dụng PDFSign (bản Rust) nạp đúng driver PKCS#11 của token, đọc được chứng thư, ký được
(đơn lẻ, hàng loạt, nhiều chữ ký, các mức B-B/B-T/B-LT/B-LTA) và Adobe Reader xác minh được. macOS tạm dừng.

Lưu ý an toàn:

- Token thường **khóa sau 3 đến 5 lần nhập sai PIN**. Nếu ứng dụng báo "còn 1 lần nhập PIN", dừng lại.
- PIN chỉ nhập vào ô PIN (ẩn). Ứng dụng không lưu PIN, không ghi PIN vào log; chỉ nhớ đường dẫn driver và serial chứng thư.
- Dùng file PDF thử, không dùng hợp đồng thật.

## 0. Cài đặt

1. Gỡ bản PDFSign cũ (nếu có). Tải bộ cài 0.3.3: https://pdfsign.thietkeweb.dev/downloads/PDFSign-setup.exe
   (hoặc vào PR, tab Checks, workflow `pdfsign-signer-rust`, tải artifact `pdfsign-windows-installers`).
2. Chạy `PDFSign-setup.exe` / `PDFSign_0.3.3_x64-setup.exe` (cài cho user hiện tại, không cần quyền admin).
   Bản chưa ký số nên SmartScreen báo "Windows protected your PC": bấm **More info** rồi **Run anyway**.
   Hoặc dùng `PDFSign_0.3.3_x64_en-US.msi` (có thể cần quyền admin).
   Khi có lỗi, gửi file log `%APPDATA%\PDFSign\logs\pdfsign.log` (không kèm PIN).
3. Mở **PDFSign** từ Start menu. Nếu báo thiếu WebView2: cài "Microsoft Edge WebView2 Runtime" rồi mở lại.
4. CLI đi kèm: `%LOCALAPPDATA%\PDFSign\pdfsign-cli.exe` (bản NSIS). Dùng để lấy log chi tiết khi có lỗi.

## 1. Driver token

1. Cài phần mềm token mới nhất của nhà cung cấp (Viettel-CA Token Manager, phần mềm token VNPT-CA, BkavCA Token Manager,
   FPT-CA, EasyCA, CA2, NewTel, ...). Cắm token, kiểm tra phần mềm của CA thấy chứng thư.
2. Trong PDFSign, tab **Ký số**, mục 3: bấm **Dò token**.
   - Kỳ vọng: `<nhãn token> · <hãng>` và chứng thư `<Tên công ty> · hết hạn dd-mm-yyyy`.
   - Nếu không thấy: bấm **Chọn driver…** và chọn file DLL. Tìm DLL bằng PowerShell:

     ```powershell
     Get-ChildItem C:\Windows\System32, "C:\Program Files", "C:\Program Files (x86)" -Recurse -Include *pkcs11*.dll,*csp11*.dll,*viettel*.dll,*vnpt*.dll,*bkav*.dll -ErrorAction SilentlyContinue | Select FullName
     ```

3. Ghi lại đường dẫn DLL thực tế vào bảng ở cuối file.

## 2. Ký trong giao diện

Làm lần lượt, mỗi bước ghi Đạt/Không đạt:

- [ ] **Ký đơn lẻ B-B**: Thêm 1 file, kéo vẽ 1 ô ở góc dưới phải, mẫu "Mặc định", mức B-B, nhập PIN, **Ký số**.
      Kết quả xanh "B-B · 1 chữ ký". Bấm **Mở** để xem file.
- [ ] **Nhiều chữ ký trên một file**: vẽ 2 ô (trái và phải), ký. Kỳ vọng "2 chữ ký"; Adobe thấy 2 chữ ký đều hợp lệ.
- [ ] **Ký hàng loạt**: thêm 5 đến 10 file khác nhau (có file nhiều trang, có trang xoay), giữ ô ở trang cuối và tick
      "Ô ở trang cuối áp dụng cho trang cuối của mọi file", chọn thư mục lưu + hậu tố, ký. Tất cả kết quả xanh,
      chỉ nhập PIN 1 lần.
- [ ] **Mẫu chữ ký**: tab **Mẫu chữ ký**, tạo mẫu mới có ảnh con dấu (PNG nền trong) + ảnh chữ ký tay, sửa các dòng
      (thử `{reason}`, `{location}`), lưu. Ký thử với mẫu đó, kiểm tra hình hiển thị đúng như xem trước.
- [ ] **B-T**: mức B-T với từng TSA đang bật (tab **Cài đặt** có nút **Kiểm tra** từng TSA). Ghi TSA nào chạy được.
      Thử thêm URL TSA của chính CA (Viettel, VNPT, BKAV...) nếu có.
- [ ] **B-LT**: mức B-LT. Cần mạng để lấy OCSP/CRL của CA. Nếu kết quả có "cảnh báo" (rê chuột để xem),
      ghi lại nội dung (ví dụ CA không có OCSP, CRL quá lớn).
- [ ] **B-LTA**: mức B-LTA. Kỳ vọng thêm một "dấu thời gian tài liệu".
- [ ] **Nhớ token**: đóng và mở lại ứng dụng: token và chứng thư được chọn sẵn, ô PIN trống.
- [ ] **Rút token khi đang ký hàng loạt**: kỳ vọng báo lỗi token, các file còn lại được bỏ qua, không treo.
- [ ] **Xác minh**: tab **Xác minh**, mở file vừa ký: thẻ "Hợp lệ", đúng người ký, đúng mức PAdES, LTV "Đầy đủ" với B-LT/B-LTA.
      Thêm chứng thư CA gốc của nhà cung cấp trong **Cài đặt > CA gốc tin cậy** để mục "Tin cậy CA gốc" thành "Có".
- [ ] **Xác minh file do WPF ký**: kỳ vọng mức "PKCS#7 (không phải PAdES)" và vẫn toàn vẹn.

## 3. Token không hỗ trợ RSA thô

Một số token chỉ có `CKM_SHA256_RSA_PKCS`. Ứng dụng tự chuyển cơ chế. Để kiểm tra cả hai đường với cùng token:

```powershell
cd $env:LOCALAPPDATA\PDFSign
.\pdfsign-cli.exe -v sign test.pdf --out t1.pdf --pin-prompt
$env:PDFSIGN_PKCS11_MECHANISM = "sha256-rsa-pkcs"
.\pdfsign-cli.exe -v sign test.pdf --out t2.pdf --pin-prompt
Remove-Item Env:PDFSIGN_PKCS11_MECHANISM
.\pdfsign-cli.exe verify t1.pdf
.\pdfsign-cli.exe verify t2.pdf
```


Dòng log `token signer ready mechanism=...` cho biết cơ chế đã dùng. Ghi lại nếu một trong hai lỗi.

## 4. Kiểm tra trong Adobe Acrobat Reader

Mở file đã ký ở từng mức:

- [ ] Thanh trên cùng: "Signed and all signatures are valid" (nếu khác, ghi nguyên văn).
- [ ] Signature Properties: "Document has not been modified since this signature was applied".
- [ ] "Signer's identity is valid". Nếu "unknown": Edit > Preferences > Signatures > Verification > More, bật
      "Validating Signatures/Certified Documents" với Windows Integration, mở lại file. Ghi CA có trong AATL không.
- [ ] Advanced Properties: Hash = SHA256; Format = "CAdES Equivalent" (bản WPF hiện là "PKCS#7 - Detached").
- [ ] B-T trở lên: "Signature includes an embedded timestamp", thời gian là của TSA.
- [ ] B-LT/B-LTA: "Signature is LTV enabled".
- [ ] Hình chữ ký đúng trang, đúng vị trí, tiếng Việt có dấu đúng, ảnh con dấu rõ, in ra giấy vẫn thấy.

## 5. Bảng kết quả (điền và gửi lại)

| Hãng / model token | Windows | Đường dẫn DLL | Dò token | Ký B-B | Hàng loạt | 2 chữ ký | B-T (TSA nào) | B-LT | B-LTA | Adobe (hợp lệ / danh tính / LTV) | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Viettel-CA | 10/11 x64 | | | | | | | | | | |
| VNPT-CA | 10/11 x64 | | | | | | | | | | |
| BKAV-CA | 10/11 x64 | | | | | | | | | | |

Gửi kèm: ảnh chụp kết quả trong ứng dụng, file PDF đã ký, ảnh Signature Properties trong Adobe. Khi lỗi, chạy lại bằng CLI
với `-v` và gửi phần stderr (không chứa PIN).
