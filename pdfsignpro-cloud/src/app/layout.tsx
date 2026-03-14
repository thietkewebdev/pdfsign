import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { Toaster } from "sonner";
import { LazyMotion, domAnimation } from "motion/react";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";
import { UploadProvider } from "@/contexts/upload-context";
import { ConditionalShell } from "@/components/conditional-shell";
import { GA4 } from "@/components/analytics/ga4";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfsign.vn";
const ga4Id = process.env.NEXT_PUBLIC_GA4_ID;

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
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "PDFSignPro Cloud",
    url: baseUrl,
    logo: `${baseUrl}/icon-192.png`,
    contactPoint: {
      "@type": "ContactPoint",
      email: "info@thietkeweb.dev",
      contactType: "customer service",
      availableLanguage: "Vietnamese",
    },
    sameAs: ["https://github.com/thietkewebdev/pdfsign"],
  };

  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased text-[15px] leading-normal`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
          <LazyMotion features={domAnimation}>
            <UploadProvider>
              <ConditionalShell>{children}</ConditionalShell>
              <Toaster richColors position="top-right" />
              {ga4Id && (
                <>
                  <Script
                    src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
                    strategy="afterInteractive"
                  />
                  <Script id="ga4-init" strategy="afterInteractive">
                    {`
                      window.dataLayer = window.dataLayer || [];
                      function gtag(){dataLayer.push(arguments);}
                      gtag('js', new Date());
                    `}
                  </Script>
                  <GA4 />
                </>
              )}
              <Script
                src="https://code.jivosite.com/widget/9n5ITyZv5a"
                strategy="afterInteractive"
              />
            </UploadProvider>
          </LazyMotion>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
