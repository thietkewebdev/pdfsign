/**
 * Public home copy + optional facts.
 * Leave optional fields `null` to hide the related UI (never show `[brackets]`).
 *
 * Free trial: 2 files only for guests who have not registered (not a monthly
 * free-account quota). Server guest limit stays unchanged.
 */

/** Same-origin installer hosted from DOWNLOADS_DIR (see server `/downloads/*`). */
export const WINDOWS_INSTALLER_URL = "/downloads/PDFSign-setup.exe";

export const WINDOWS_APP_VERSION = "0.3.3";

export const WINDOWS_INSTALL_GUIDE_URL = "/#tai-app";

export type HomeFacts = {
  /** e.g. 7 — "File tự xóa sau 7 ngày" */
  fileRetentionDays: number | null;
  /** e.g. "Việt Nam" */
  dataLocation: string | null;
  /** e.g. 48 — Windows installer size MB */
  windowsAppSizeMb: number | null;
  /** e.g. "12.450" */
  statsSignedFiles: string | null;
  /** e.g. "1.280" */
  statsCompanies: string | null;
  testimonial: {
    quote: string;
    name: string;
    role: string;
    company: string;
  } | null;
  /** Pro yearly price label, e.g. "1.990.000đ" */
  proYearlyPrice: string | null;
  /** e.g. 17 */
  proYearlySavingsPercent: number | null;
  /** Pro monthly file allowance label, e.g. "200" */
  proFileCount: string | null;
  /** Display hotline, e.g. "0984.056.777" */
  hotline: string | null;
  /** Digits-only for tel:, e.g. "0984056777" */
  hotlineTel: string | null;
  zaloUrl: string | null;
  address: string | null;
};

/** From live pdfsign.vn + pdfsignpro-cloud/src/lib/company-legal.ts */
export const HOME_FACTS: HomeFacts = {
  fileRetentionDays: 2,
  dataLocation: null,
  // From CI NSIS artifact PDFSign_0.3.3_x64-setup.exe (8762061 bytes ≈ 8.4 MiB).
  windowsAppSizeMb: 8.4,
  statsSignedFiles: null,
  statsCompanies: null,
  testimonial: null,
  proYearlyPrice: null,
  proYearlySavingsPercent: null,
  proFileCount: null,
  hotline: "0984.056.777",
  hotlineTel: "0984056777",
  zaloUrl: "https://zalo.me/0984056777",
  address:
    "L17-11, Tầng 17, Tòa nhà Vincom Center, 72 Lê Thánh Tôn, Phường Sài Gòn, Thành phố Hồ Chí Minh, Việt Nam",
};

export const HOME = {
  company: {
    name: "CÔNG TY CỔ PHẦN GIẢI PHÁP CÔNG NGHỆ SỐ DIGITECH VIỆT NAM",
    taxId: "0317056837",
    // Confirmed in pdfsignpro-cloud/src/lib/company-legal.ts (COMPANY_EMAIL)
    email: "info@pdfsign.vn",
  },
  nav: [
    { href: "/#cach-hoat-dong", label: "Cách hoạt động" },
    { href: "/#tinh-nang", label: "Tính năng" },
    { href: "/#bao-mat", label: "Bảo mật" },
    { href: "/#bang-gia", label: "Bảng giá" },
    { href: "/#faq", label: "Hỏi đáp" },
  ],
  hero: {
    badge: "Dùng được với token Viettel-CA, VNPT-CA, BKAV-CA, FastCA",
    title: "Ký số file PDF bằng USB token, ngay trên trình duyệt",
    lead:
      "Tải file lên, kéo ô chữ ký vào đúng chỗ, cắm token và bấm Ký. File ký xong mở bằng Adobe vẫn báo hợp lệ, còn khóa ký luôn nằm trong token của bạn.",
    primaryCta: "Ký thử miễn phí 2 file",
    secondaryCta: "Tải app Windows",
    checks: [
      "Ký thử miễn phí 2 file, không cần đăng ký",
      "Không cần thẻ thanh toán",
      "Có hóa đơn VAT",
    ],
  },
  providers: {
    label: "Dùng được với chứng thư số của",
    names: ["Viettel-CA", "VNPT-CA", "BKAV-CA", "FastCA"],
    suffix: "và các USB token phổ biến khác",
  },
  how: {
    eyebrow: "Cách hoạt động",
    title: "Ba bước, chưa tới một phút",
    lead:
      "Không cần cài phần mềm ký riêng cho từng nhà cung cấp. Cài app PDFSign một lần, sau đó mọi thao tác làm trên web.",
    steps: [
      {
        title: "Tải file PDF lên",
        body: "Kéo thả hoặc chọn file từ máy. Hợp đồng, hóa đơn, biên bản đều được.",
      },
      {
        title: "Kéo ô chữ ký vào chỗ cần ký",
        body: "Chọn trang, kéo và co giãn khung. Xem trước dấu chữ ký trước khi ký thật.",
      },
      {
        title: "Cắm token, nhập PIN, bấm Ký",
        body: "App PDFSign trên máy tự mở và ký bằng token. Xong là tải file về hoặc gửi link cho đối tác.",
      },
    ],
  },
  features: {
    eyebrow: "Tính năng",
    title: "Ký nhanh như web, an toàn như ký trên máy",
    local: {
      title: "Khóa ký không bao giờ rời khỏi token",
      body: "Việc ký diễn ra trong app PDFSign trên máy bạn. Máy chủ của chúng tôi chỉ nhận lại file đã ký, không bao giờ thấy khóa hay mã PIN.",
      nodes: [
        { label: "Trình duyệt", detail: "Bạn chọn file và vị trí ký" },
        { label: "App PDFSign + token", detail: "Ký ngay trên máy bạn, khóa nằm ở đây" },
        { label: "Máy chủ PDFSign", detail: "Chỉ nhận file đã ký để bạn tải về" },
      ],
    },
    verify: {
      title: "Xác minh file trong một giây",
      body: "Kéo file đã ký vào để biết ai ký, ký lúc nào và file có bị sửa sau đó không.",
      result: "Chữ ký hợp lệ",
      rows: [
        { k: "Người ký", v: "CÔNG TY TNHH ABC" },
        { k: "Nhà cung cấp", v: "Viettel-CA" },
        { k: "Thời điểm", v: "21/11/2026 09:42" },
        { k: "Nội dung", v: "Chưa bị sửa sau khi ký" },
      ],
    },
    cards: [
      {
        title: "Đặt đúng chỗ, trên mọi trang",
        body: "Chọn trang, kéo khung chữ ký vào vị trí cần ký và xem trước dấu trước khi ký thật.",
      },
      {
        title: "Mở bằng Adobe vẫn báo hợp lệ",
        body: "Ký theo chuẩn chữ ký PDF quốc tế, có dấu thời gian, kiểm tra được cả sau khi chứng thư hết hạn.",
      },
      {
        title: "Rớt mạng cũng không mất file",
        body: "Đang ký mà mất kết nối? App tự hoàn tất khi có mạng lại, không ký trùng, không phải làm lại từ đầu.",
      },
    ],
  },
  security: {
    eyebrow: "Bảo mật & pháp lý",
    title: "Giá trị pháp lý như chữ ký tay",
    lead:
      "Chữ ký số dùng chứng thư hợp lệ của tổ chức được cấp phép có giá trị pháp lý theo Luật Giao dịch điện tử 2023. PDFSign không thay chứng thư của bạn, chỉ giúp ký nhanh và đúng chuẩn hơn.",
    items: [
      {
        title: "Khóa nằm trong token",
        body: "Không tải lên, không sao chép, không lưu trên máy chủ.",
        always: true,
      },
      {
        title: "File tự xóa sau khi hết hạn lưu",
        body: "Bạn có thể xóa ngay sau khi tải file về.",
        fact: "fileRetentionDays" as const,
      },
      {
        title: "Truyền tải mã hóa",
        body: "Mọi kết nối giữa trình duyệt, app và máy chủ đều qua HTTPS.",
        always: true,
      },
      {
        title: "Dữ liệu đặt tại chỗ rõ ràng",
        body: "Máy chủ do Digitech vận hành, có hợp đồng và hóa đơn rõ ràng.",
        fact: "dataLocation" as const,
      },
    ],
  },
  windowsApp: {
    title: "App PDFSign cho Windows",
    lead:
      "Cài một lần. Mỗi lần bấm Ký trên web, app tự mở và dùng token đang cắm. Không phải cài phần mềm riêng của từng nhà cung cấp.",
    download: "Tải bản Windows",
    guide: "Hướng dẫn cài đặt",
    metaBase: "Windows 10/11 · 64-bit · Miễn phí",
  },
  pricing: {
    eyebrow: "Bảng giá",
    title: "Bắt đầu miễn phí, nâng cấp khi cần",
    lead: "Giá đã gồm VAT. Có hóa đơn điện tử.",
  },
  faq: {
    eyebrow: "Hỏi đáp",
    title: "Câu hỏi thường gặp",
    leadMissingHotline: "Chưa thấy câu trả lời? Nhắn email info@pdfsign.vn trong giờ hành chính.",
    /** Used when hotline is set; {hotline} replaced at render */
    leadWithHotline:
      "Chưa thấy câu trả lời? Gọi {hotline} hoặc nhắn Zalo, chúng tôi trả lời trong giờ hành chính.",
    items: [
      {
        q: "File ký trên PDFSign có giá trị pháp lý không?",
        a: "Có. Chữ ký số dùng chứng thư hợp lệ của tổ chức được cấp phép có giá trị pháp lý theo Luật Giao dịch điện tử 2023. File ký xong mở bằng Adobe Acrobat sẽ hiện trạng thái chữ ký hợp lệ.",
      },
      {
        q: "Khóa ký hay mã PIN có bị gửi lên máy chủ không?",
        a: "Không. Việc ký diễn ra trên máy bạn với USB token. Máy chủ chỉ nhận file đã ký.",
      },
      {
        q: "Token của nhà cung cấp nào dùng được?",
        a: "Viettel-CA, VNPT-CA, BKAV-CA, FastCA và các USB token phổ biến khác dùng chứng thư được cấp phép.",
      },
      {
        q: "Gói miễn phí được ký bao nhiêu file?",
        a: "Khách chưa đăng ký được ký thử 2 file. Tài khoản mới (gói Miễn phí) có thêm 5 file dùng thử một lần — không phải hạn mức hàng tháng. Sau đó cần chọn gói Cá nhân / Doanh nghiệp / Không giới hạn.",
      },
      {
        q: "File tải lên được lưu bao lâu?",
        a: "File tải lên và file đã ký tự xóa sau 2 ngày. Hãy tải về máy trước khi hết hạn.",
      },
      {
        q: "Làm sao kiểm tra một file đã ký?",
        a: "Dùng trang Xác minh trên PDFSign hoặc mở bằng Adobe Acrobat để xem trạng thái chữ ký.",
      },
      {
        q: "Có xuất hóa đơn VAT không?",
        a: "Có. Mọi gói trả phí đều có hóa đơn điện tử.",
      },
    ],
  },
  ctaBand: {
    title: "Ký file đầu tiên trong một phút",
    lead: "Ký thử miễn phí 2 file, không cần đăng ký. Không cần thẻ, không cần gọi tư vấn.",
    primary: "Tải PDF lên và ký",
    secondary: "Gọi tư vấn",
  },
  footer: {
    tagline: "Ký số file PDF bằng USB token ngay trên trình duyệt. Một sản phẩm của Digitech.",
    product: [
      { href: "/#cach-hoat-dong", label: "Cách hoạt động" },
      { href: "/#tinh-nang", label: "Tính năng" },
      { href: "/#bang-gia", label: "Bảng giá" },
      { href: "/#tai-app", label: "Tải app Windows" },
    ],
    support: [
      { href: "/#tai-app", label: "Hướng dẫn cài đặt" },
      { href: "/verify", label: "Xác minh file" },
      { href: "/#faq", label: "Câu hỏi thường gặp" },
      { href: "mailto:info@pdfsign.vn", label: "Liên hệ" },
      { href: "https://zalo.me/0984056777", label: "Zalo 0984.056.777" },
    ],
    legal: [
      { href: "#", label: "Điều khoản sử dụng" },
      { href: "#", label: "Chính sách bảo mật" },
      { href: "#", label: "Chính sách hoàn tiền" },
    ],
  },
} as const;
