export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: string;
  readingTime: string;
  content: string;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "huong-dan-ky-so-pdf-bang-usb-token",
    title: "Hướng dẫn ký số PDF bằng USB Token trên PDFSignPro Cloud",
    description:
      "Hướng dẫn chi tiết từng bước ký số PDF trực tuyến bằng USB Token (Viettel, EasyCA, FastCA) trên PDFSignPro Cloud.",
    date: "2025-03-10",
    category: "Hướng dẫn",
    readingTime: "5 phút",
    content: `## Chuẩn bị

Trước khi bắt đầu, bạn cần:

- **USB Token chữ ký số** đã được kích hoạt (Viettel-CA, EasyCA, FastCA, VNPT-CA, FPT-CA...)
- **Driver PKCS#11** của USB Token đã cài trên máy tính Windows
- **PDFSignPro Signer** — phần mềm cầu nối giữa trình duyệt và USB Token ([Tải tại đây](/signer))

## Bước 1: Tải PDF lên

1. Truy cập [pdfsign.vn](https://pdfsign.vn)
2. Kéo thả file PDF vào vùng upload, hoặc nhấn chọn file
3. Đặt tiêu đề cho tài liệu (VD: "Hợp đồng dịch vụ 2025")
4. Nhấn **"Upload tài liệu và ký số"**

## Bước 2: Đặt vị trí chữ ký

1. Sau khi upload, trang xem tài liệu sẽ hiện ra
2. Cuộn đến trang cần ký
3. Kéo thả ô chữ ký đến vị trí mong muốn trên tài liệu
4. Điều chỉnh kích thước ô ký nếu cần

## Bước 3: Chọn mẫu chữ ký

PDFSignPro cung cấp nhiều mẫu chữ ký:

- **Classic** — Mẫu cổ điển với tên, tổ chức, thời gian ký
- **Modern** — Mẫu hiện đại với bố cục gọn gàng
- **Minimal** — Tối giản, chỉ hiển thị thông tin cần thiết
- **Stamp** — Dạng con dấu với viền và tiêu đề
- **Valid** — Mẫu xác nhận hợp lệ
- **Seal** — Kèm hình ảnh con dấu công ty

Chọn mẫu phù hợp với nhu cầu của bạn.

## Bước 4: Ký số

1. Cắm USB Token vào máy tính
2. Nhấn nút **"Ký số"** trên trang web
3. PDFSignPro Signer sẽ tự động mở
4. Chọn chứng thư số từ Token
5. Nhập mã PIN của USB Token
6. Nhấn **"Ký"**

Quá trình ký diễn ra hoàn toàn trên máy tính của bạn — khóa riêng không bao giờ rời khỏi USB Token.

## Bước 5: Xem và chia sẻ

Sau khi ký xong:

- PDF đã ký được lưu tự động trên hệ thống
- Bạn có thể tải về hoặc chia sẻ liên kết cho đối tác
- Mở file bằng Adobe Acrobat Reader để xác minh chữ ký

## Lưu ý quan trọng

- Đảm bảo USB Token còn hiệu lực (chưa hết hạn chứng thư số)
- Driver PKCS#11 phải được cài đúng phiên bản cho USB Token của bạn
- Nếu gặp lỗi, hãy thử cắm lại Token hoặc khởi động lại PDFSignPro Signer`,
  },
  {
    slug: "chu-ky-so-hop-le-phap-luat-viet-nam",
    title: "Chữ ký số PDF có hợp lệ theo pháp luật Việt Nam không?",
    description:
      "Tìm hiểu tính pháp lý của chữ ký số PDF theo Luật Giao dịch điện tử 2023 và các quy định liên quan tại Việt Nam.",
    date: "2025-03-08",
    category: "Kiến thức",
    readingTime: "7 phút",
    content: `## Cơ sở pháp lý

Chữ ký số tại Việt Nam được quy định bởi:

- **Luật Giao dịch điện tử 2023** (Luật số 20/2023/QH15) — có hiệu lực từ 01/07/2024
- **Nghị định 130/2018/NĐ-CP** — hướng dẫn về chữ ký số và dịch vụ chứng thực chữ ký số
- **Nghị định 52/2024/NĐ-CP** — quy định về thanh toán không dùng tiền mặt

## Chữ ký số có giá trị pháp lý khi nào?

Theo Điều 22 Luật Giao dịch điện tử 2023, chữ ký số có giá trị pháp lý tương đương chữ ký tay khi:

1. **Chứng thư số** được cấp bởi Tổ chức cung cấp dịch vụ chứng thực chữ ký số (CA) được Bộ TT&TT cấp phép
2. **Chứng thư số còn hiệu lực** tại thời điểm ký
3. **Khóa riêng** được kiểm soát bởi người ký (lưu trong USB Token)
4. **Nội dung tài liệu** không bị thay đổi sau khi ký

## Các nhà cung cấp CA hợp pháp tại Việt Nam

Danh sách CA được Bộ TT&TT cấp phép:

- **Viettel-CA** — Tập đoàn Viettel
- **VNPT-CA** — Tập đoàn VNPT
- **FPT-CA** — Tập đoàn FPT
- **EasyCA** — Công ty CP EasyCA
- **FastCA** — Công ty CP FastCA
- **BKAV-CA** — Tập đoàn BKAV
- **CyberLotus** — Công ty CP CyberLotus
- **SmartSign** — Công ty CP SmartSign

## PDFSignPro và tính hợp lệ pháp lý

PDFSignPro Cloud ký số theo chuẩn **PAdES** (PDF Advanced Electronic Signatures) — tiêu chuẩn quốc tế cho chữ ký số trên PDF. Đặc điểm:

- **Tuân thủ chuẩn quốc tế**: PAdES theo ETSI EN 319 142
- **Adobe xác minh**: Chữ ký được Adobe Acrobat Reader nhận diện và xác minh
- **Khóa riêng an toàn**: Không bao giờ rời khỏi USB Token
- **Dấu thời gian**: Ghi nhận chính xác thời điểm ký

## Các trường hợp sử dụng phổ biến

Chữ ký số PDF được chấp nhận trong:

- Hợp đồng kinh tế, thương mại
- Hóa đơn điện tử
- Hồ sơ đấu thầu điện tử
- Văn bản hành chính nội bộ doanh nghiệp
- Hồ sơ thuế, bảo hiểm xã hội
- Chứng từ ngân hàng

## Kết luận

Chữ ký số PDF tạo bởi PDFSignPro hoàn toàn hợp lệ theo pháp luật Việt Nam, miễn là bạn sử dụng USB Token từ CA được cấp phép và chứng thư số còn hiệu lực.`,
  },
  {
    slug: "so-sanh-ky-so-online-va-offline",
    title: "So sánh ký số PDF online và offline — Nên chọn cách nào?",
    description:
      "Phân tích ưu nhược điểm của ký số PDF online (cloud) và offline (desktop). Giúp bạn chọn giải pháp phù hợp.",
    date: "2025-03-05",
    category: "Kiến thức",
    readingTime: "4 phút",
    content: `## Ký số online (PDFSignPro Cloud)

### Ưu điểm
- **Không cần cài phần mềm nặng** — chỉ cần cài PDFSignPro Signer (nhẹ, < 40MB)
- **Truy cập mọi nơi** — chỉ cần trình duyệt và USB Token
- **Chia sẻ dễ dàng** — gửi link cho đối tác xem tài liệu đã ký
- **Quản lý tập trung** — dashboard theo dõi tất cả tài liệu
- **Luôn cập nhật** — không cần update thủ công

### Nhược điểm
- Cần kết nối internet
- Tài liệu được upload lên cloud (dù đã mã hóa)

### Phù hợp cho
- Doanh nghiệp cần chia sẻ tài liệu đã ký
- Làm việc từ xa, nhiều địa điểm
- Cần quản lý lịch sử ký tập trung

## Ký số offline (PDFSignPro Offline)

### Ưu điểm
- **Không cần internet** — ký hoàn toàn offline
- **Dữ liệu không rời máy** — phù hợp tài liệu mật
- **Nhanh** — không phụ thuộc tốc độ mạng

### Nhược điểm
- Chỉ dùng trên máy đã cài
- Khó chia sẻ tài liệu đã ký
- Cần update thủ công

### Phù hợp cho
- Môi trường nội bộ, bảo mật cao
- Máy tính không có internet
- Tài liệu mật, không muốn upload cloud

## So sánh nhanh

| Tiêu chí | Online (Cloud) | Offline |
|----------|---------------|---------|
| Internet | Cần | Không cần |
| Cài đặt | Signer nhẹ | App đầy đủ |
| Chia sẻ link | Có | Không |
| Dashboard | Có | Không |
| Bảo mật dữ liệu | Cloud (mã hóa) | Local |
| Phù hợp | Đa số người dùng | Môi trường nội bộ |

## Kết luận

Đa số người dùng nên chọn **PDFSignPro Cloud** vì tiện lợi, dễ chia sẻ và quản lý. Chọn **PDFSignPro Offline** nếu bạn ở môi trường bảo mật cao hoặc không có internet.

Cả hai đều sử dụng cùng engine ký số, cùng chuẩn PAdES, và Adobe đều verify được.`,
  },
  {
    slug: "adobe-acrobat-xac-minh-chu-ky-so",
    title: "Cách xác minh chữ ký số PDF trên Adobe Acrobat Reader",
    description:
      "Hướng dẫn kiểm tra tính hợp lệ của chữ ký số PDF bằng Adobe Acrobat Reader. Hiểu các trạng thái xác minh.",
    date: "2025-03-01",
    category: "Hướng dẫn",
    readingTime: "4 phút",
    content: `## Mở file PDF đã ký

1. Tải file PDF đã ký về máy tính
2. Mở bằng **Adobe Acrobat Reader DC** (tải miễn phí tại [get.adobe.com/reader](https://get.adobe.com/reader))
3. Adobe sẽ tự động kiểm tra chữ ký

## Các trạng thái xác minh

### ✅ "Signed and all signatures are valid"
- Chữ ký hợp lệ
- Chứng thư số còn hiệu lực
- CA nằm trong danh sách Adobe AATL (Adobe Approved Trust List)
- Nội dung tài liệu chưa bị thay đổi sau khi ký

### ⚠️ "At least one signature has problems"
Có thể do:
- Chứng thư số đã hết hạn
- CA không nằm trong danh sách AATL
- Cần cập nhật danh sách trust trong Adobe

### ❌ "Document has been altered or corrupted"
- Nội dung tài liệu đã bị thay đổi sau khi ký
- Chữ ký không còn hợp lệ

## Xem chi tiết chữ ký

1. Nhấn vào chữ ký trên PDF
2. Chọn **"Signature Properties"**
3. Xem thông tin:
   - **Signer**: Tên người ký / tổ chức
   - **Date/Time**: Thời gian ký
   - **Reason**: Lý do ký (nếu có)
   - **Certificate**: Thông tin chứng thư số

## Cập nhật danh sách trust (AATL)

Nếu Adobe báo chữ ký "unknown" dù CA hợp lệ:

1. Mở Adobe Acrobat Reader
2. Vào **Edit → Preferences → Trust Manager**
3. Nhấn **"Update Now"** ở phần Automatic Adobe Approved Trust List (AATL) updates
4. Đóng và mở lại file PDF

Hầu hết CA lớn tại Việt Nam (Viettel, VNPT, FPT, EasyCA, FastCA) đều nằm trong AATL.

## Tại sao nên dùng Adobe để xác minh?

- Adobe Acrobat Reader là phần mềm đọc PDF phổ biến nhất thế giới
- Hỗ trợ xác minh chữ ký PAdES chuẩn quốc tế
- Tự động cập nhật danh sách CA tin cậy
- Miễn phí cho mọi người dùng`,
  },
  {
    slug: "cai-dat-pdfsignpro-signer-windows",
    title: "Cài đặt PDFSignPro Signer trên Windows — Hướng dẫn từ A-Z",
    description:
      "Hướng dẫn tải, cài đặt và cấu hình PDFSignPro Signer trên Windows 10/11 để ký số PDF bằng USB Token.",
    date: "2025-02-25",
    category: "Hướng dẫn",
    readingTime: "3 phút",
    content: `## Yêu cầu hệ thống

- **Hệ điều hành**: Windows 10 hoặc Windows 11 (64-bit)
- **Runtime**: .NET 8 Desktop Runtime (tự động cài nếu thiếu)
- **USB Token**: Đã cắm và cài driver PKCS#11

## Bước 1: Tải PDFSignPro Signer

1. Truy cập [pdfsign.vn/signer](/signer)
2. Nhấn nút **"Tải PDFSignPro Signer"**
3. File setup sẽ được tải về (khoảng 35MB)

## Bước 2: Cài đặt

1. Chạy file **PDFSignProSignerSetup.exe**
2. Nếu Windows SmartScreen cảnh báo, nhấn **"More info"** → **"Run anyway"**
3. Chọn thư mục cài đặt (mặc định: Program Files)
4. Nhấn **"Install"** và đợi hoàn tất
5. Nhấn **"Finish"**

Phần mềm sẽ tự đăng ký protocol **pdfsignpro://** để nhận lệnh ký từ trình duyệt.

## Bước 3: Kiểm tra

1. Cắm USB Token vào máy
2. Truy cập [pdfsign.vn](https://pdfsign.vn), upload một file PDF test
3. Đặt vị trí chữ ký và nhấn **"Ký số"**
4. PDFSignPro Signer sẽ tự động mở
5. Nếu thấy danh sách chứng thư số từ Token → cài đặt thành công!

## Xử lý sự cố thường gặp

### Signer không tự mở khi nhấn "Ký số"
- Kiểm tra đã cài PDFSignPro Signer chưa
- Thử mở thủ công từ Start Menu, sau đó ký lại trên web
- Kiểm tra trình duyệt có chặn protocol handler không

### Không thấy chứng thư số
- Kiểm tra USB Token đã cắm và đèn sáng
- Đảm bảo driver PKCS#11 đã cài đúng
- Thử cắm Token sang cổng USB khác
- Khởi động lại máy tính

### Lỗi "PIN incorrect"
- Kiểm tra lại mã PIN (thường là 6-8 số)
- Lưu ý: nhập sai PIN nhiều lần có thể khóa Token
- Liên hệ nhà cung cấp CA nếu quên PIN

## Cập nhật phần mềm

PDFSignPro Signer sẽ tự kiểm tra và thông báo khi có phiên bản mới. Bạn cũng có thể tải bản mới nhất từ [pdfsign.vn/signer](/signer).`,
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getAllSlugs(): string[] {
  return BLOG_POSTS.map((p) => p.slug);
}
