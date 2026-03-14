import type { Metadata } from "next";
import { HomePage } from "@/components/pages/HomePage";

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfsign.vn";

export const metadata: Metadata = {
  title: "Ký số PDF online bằng USB Token | PDFSignPro Cloud",
  description:
    "Ký số PDF miễn phí, chuẩn PAdES với USB Token. Tải PDF lên, đặt vị trí chữ ký, ký số trên Windows. Hỗ trợ Viettel, EasyCA, FastCA.",
  alternates: {
    canonical: baseUrl,
  },
};

const webAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "PDFSignPro Cloud",
  url: baseUrl,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Windows",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "VND",
  },
  description:
    "Ký số PDF online miễn phí bằng USB Token. Chuẩn PAdES, Adobe verify. Hỗ trợ Viettel, EasyCA, FastCA.",
  featureList: [
    "Ký số PDF chuẩn PAdES",
    "Hỗ trợ USB Token PKCS#11",
    "Adobe Acrobat xác minh chữ ký",
    "Chia sẻ tài liệu đã ký qua link",
    "Quản lý tài liệu cá nhân",
  ],
  screenshot: `${baseUrl}/opengraph-image`,
};

const homeFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "PDFSignPro Cloud hỗ trợ USB Token nào?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Hỗ trợ hầu hết USB Token chữ ký số tại Việt Nam sử dụng giao diện PKCS#11: Viettel-CA, EasyCA, FastCA, VNPT-CA, FPT-CA, BKAV-CA, CyberLotus và các nhà cung cấp CA khác.",
      },
    },
    {
      "@type": "Question",
      name: "Chữ ký số trên PDFSignPro có hợp lệ theo pháp luật Việt Nam không?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Có. PDFSignPro sử dụng chữ ký số chuẩn PAdES theo tiêu chuẩn quốc tế. Tính hợp lệ pháp lý phụ thuộc vào chứng thư số do CA được Bộ TT&TT cấp phép. Hoàn toàn có giá trị pháp lý theo Luật Giao dịch điện tử 2023.",
      },
    },
    {
      "@type": "Question",
      name: "Adobe Acrobat có xác minh (verify) được chữ ký không?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Có. Chữ ký PAdES tạo bởi PDFSignPro được Adobe Acrobat Reader nhận diện và xác minh. Hầu hết CA lớn tại Việt Nam đều nằm trong danh sách Adobe AATL.",
      },
    },
    {
      "@type": "Question",
      name: "Dữ liệu tài liệu có an toàn không?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "An toàn. Truyền tải qua HTTPS, lưu trữ trên Cloudflare R2. Khóa riêng không bao giờ rời khỏi USB Token — quá trình ký diễn ra hoàn toàn trên máy tính của bạn.",
      },
    },
    {
      "@type": "Question",
      name: "Có phí sử dụng không?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "PDFSignPro Cloud miễn phí cho người dùng cá nhân. Tải lên, ký số và chia sẻ tài liệu không tốn phí.",
      },
    },
    {
      "@type": "Question",
      name: "PDFSignPro Signer là gì?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Phần mềm nhỏ chạy trên Windows, đóng vai trò cầu nối giữa trình duyệt và USB Token. Bắt buộc cài để ký số vì trình duyệt không thể truy cập USB Token trực tiếp.",
      },
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeFaqJsonLd) }}
      />
      <HomePage />
    </>
  );
}
