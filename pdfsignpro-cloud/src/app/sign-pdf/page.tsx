import type { Metadata } from "next";
import { Great_Vibes } from "next/font/google";
import { SignPdfApp } from "@/components/sign-pdf/SignPdfApp";

const greatVibes = Great_Vibes({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-signature",
  display: "swap",
});

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfsign.vn";

export const metadata: Metadata = {
  title: "Ký PDF Online Miễn Phí — Vẽ, Gõ hoặc Tải Chữ Ký",
  description:
    "Sign PDF online miễn phí: vẽ chữ ký, gõ tên hoặc tải ảnh chữ ký tay, đặt lên PDF và tải về ngay. Không cần cài phần mềm. Cần giá trị pháp lý? Nâng cấp ký số USB Token trên pdfsign.vn.",
  keywords: [
    "ký PDF online",
    "sign PDF",
    "ký PDF miễn phí",
    "chữ ký điện tử PDF",
    "vẽ chữ ký PDF",
    "upload chữ ký PDF",
    "ký hợp đồng PDF",
    "thebestpdf alternative",
  ],
  alternates: {
    canonical: `${baseUrl}/sign-pdf`,
  },
  openGraph: {
    title: "Ký PDF Online Miễn Phí | pdfsign.vn",
    description:
      "Vẽ, gõ hoặc tải chữ ký lên PDF trong trình duyệt — nhanh, miễn phí, không cần USB Token.",
    url: `${baseUrl}/sign-pdf`,
    type: "website",
  },
};

export default function SignPdfPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "pdfsign.vn — Ký PDF Online",
    url: `${baseUrl}/sign-pdf`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "VND",
    },
    description:
      "Công cụ ký PDF online: vẽ chữ ký, gõ tên hoặc tải ảnh chữ ký và gắn vào file PDF.",
  };

  return (
    <div className={greatVibes.variable}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SignPdfApp />
    </div>
  );
}
