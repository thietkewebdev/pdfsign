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

export const metadata: Metadata = {
  title: "PDFSignPro Cloud",
  description: "Ký số PDF — nhanh, chuẩn, an toàn. Tải PDF lên, đặt vị trí chữ ký, ký số bằng USB Token trên Windows.",
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
