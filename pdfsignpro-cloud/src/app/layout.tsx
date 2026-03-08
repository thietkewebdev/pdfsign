import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { LazyMotion, domAnimation } from "motion/react";
import { ThemeProvider } from "@/components/theme-provider";
import { UploadProvider } from "@/contexts/upload-context";
import { ConditionalShell } from "@/components/conditional-shell";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfsign.vn";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "PDFSignPro Cloud",
    template: "%s | PDFSignPro Cloud",
  },
  description:
    "Ký số PDF online miễn phí bằng USB Token. Tải PDF lên, đặt vị trí chữ ký, ký số chuẩn PAdES. Hỗ trợ Viettel, EasyCA, FastCA.",
  keywords: [
    "ký số PDF",
    "chữ ký số PDF",
    "USB Token",
    "PAdES",
    "PDF signing",
    "Viettel",
    "EasyCA",
    "FastCA",
  ],
  openGraph: {
    type: "website",
    siteName: "PDFSignPro Cloud",
    url: baseUrl,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "PDFSignPro Cloud — Ký số PDF online bằng USB Token",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased text-[15px] leading-normal`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <LazyMotion features={domAnimation}>
            <UploadProvider>
              <ConditionalShell>{children}</ConditionalShell>
              <Toaster richColors position="top-right" />
            </UploadProvider>
          </LazyMotion>
        </ThemeProvider>
      </body>
    </html>
  );
}
