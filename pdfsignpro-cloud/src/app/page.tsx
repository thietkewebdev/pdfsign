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

export default function Page() {
  return <HomePage />;
}
