export const FAQ_ITEMS = [
  {
    question: "PDFSignPro Cloud hỗ trợ USB Token nào?",
    answer:
      "PDFSignPro hỗ trợ hầu hết USB Token chữ ký số tại Việt Nam sử dụng giao diện PKCS#11, bao gồm: Viettel-CA, EasyCA, FastCA, VNPT-CA, FPT-CA, BKAV-CA, CyberLotus, và các nhà cung cấp CA khác. Chỉ cần USB Token có driver PKCS#11 trên Windows là sử dụng được.",
  },
  {
    question: "Chữ ký số trên PDFSignPro có hợp lệ theo pháp luật Việt Nam không?",
    answer:
      "Có. PDFSignPro sử dụng chữ ký số chuẩn PAdES (PDF Advanced Electronic Signatures) theo tiêu chuẩn quốc tế. Tính hợp lệ pháp lý của chữ ký phụ thuộc vào chứng thư số (USB Token) do nhà cung cấp CA được Bộ TT&TT cấp phép. Nếu bạn dùng Token từ CA hợp pháp tại Việt Nam (Viettel, VNPT, FPT...), chữ ký hoàn toàn có giá trị pháp lý theo Luật Giao dịch điện tử 2023.",
  },
  {
    question: "Adobe Acrobat có xác minh (verify) được chữ ký không?",
    answer:
      'Có. Chữ ký PAdES tạo bởi PDFSignPro được Adobe Acrobat Reader nhận diện và xác minh. Khi mở PDF đã ký trong Adobe, bạn sẽ thấy thông báo "Signed and all signatures are valid" nếu chứng thư số còn hiệu lực và thuộc CA được Adobe tin cậy (AATL). Hầu hết CA lớn tại Việt Nam đều nằm trong danh sách AATL.',
  },
  {
    question: "Dữ liệu tài liệu có an toàn không?",
    answer:
      "An toàn. Tài liệu được truyền tải qua HTTPS (mã hóa TLS), lưu trữ trên Cloudflare R2 với kiểm soát truy cập nghiêm ngặt. Quan trọng nhất: khóa riêng (private key) không bao giờ rời khỏi USB Token — quá trình ký diễn ra hoàn toàn trên máy tính của bạn thông qua phần mềm PDFSignPro Signer, không gửi khóa lên server.",
  },
  {
    question: "PDFSignPro Signer là gì? Có bắt buộc cài không?",
    answer:
      'PDFSignPro Signer là phần mềm nhỏ chạy trên Windows, đóng vai trò cầu nối giữa trình duyệt và USB Token. Khi bạn nhấn "Ký số" trên web, Signer tự động mở, đọc chứng thư từ Token và thực hiện ký. Bắt buộc cài để ký số vì trình duyệt không thể truy cập USB Token trực tiếp.',
  },
  {
    question: "Có thể ký nhiều chữ ký trên cùng một tài liệu không?",
    answer:
      "Có. Bạn có thể ký nhiều lần trên cùng tài liệu. Mỗi lần ký tạo một phiên bản mới (version) của PDF. Tất cả chữ ký trước đó vẫn được giữ nguyên và hợp lệ.",
  },
  {
    question: "Có phí sử dụng không?",
    answer:
      "PDFSignPro Cloud hiện cung cấp miễn phí cho người dùng cá nhân. Tải lên, ký số và chia sẻ tài liệu không tốn phí. Chúng tôi có thể giới thiệu gói doanh nghiệp với tính năng nâng cao trong tương lai.",
  },
  {
    question: "Tài liệu đã ký được lưu trữ bao lâu?",
    answer:
      "Tài liệu được lưu trữ trong suốt thời gian bạn sử dụng dịch vụ. Đối với tài khoản miễn phí, tài liệu không hoạt động có thể bị xóa sau 90 ngày. Bạn nên tải về và lưu bản sao tài liệu đã ký.",
  },
  {
    question: "Có hỗ trợ ký trên macOS / Linux không?",
    answer:
      "Hiện tại PDFSignPro Signer chỉ hỗ trợ Windows (Windows 10/11). Hầu hết USB Token tại Việt Nam cũng chỉ có driver cho Windows. Chúng tôi đang nghiên cứu hỗ trợ thêm nền tảng khác trong tương lai.",
  },
  {
    question: "Có thể ký offline (không cần internet) không?",
    answer:
      "Có. PDFSignPro cung cấp phiên bản Offline (PDFSignPro Offline) — ứng dụng Windows độc lập, ký PDF mà không cần trình duyệt hay kết nối internet. Phù hợp cho môi trường nội bộ hoặc máy tính không có mạng.",
  },
] as const;
