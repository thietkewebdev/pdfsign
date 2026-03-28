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
import {
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_LEGAL_NAME,
  COMPANY_TAX_ID,
} from "@/lib/company-legal";
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
    legalName: COMPANY_LEGAL_NAME,
    taxID: COMPANY_TAX_ID,
    url: baseUrl,
    logo: `${baseUrl}/icon-192.png`,
    address: {
      "@type": "PostalAddress",
      streetAddress: COMPANY_ADDRESS,
      addressCountry: "VN",
    },
    contactPoint: {
      "@type": "ContactPoint",
      email: COMPANY_EMAIL,
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
          defaultTheme="light"
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
                  <Script
                    src="https://www.googletagmanager.com/gtag/js?id=AW-464110369"
                    strategy="afterInteractive"
                  />
                  <Script id="ga-init" strategy="afterInteractive">
                    {`
                      window.dataLayer = window.dataLayer || [];
                      function gtag(){dataLayer.push(arguments);}
                      gtag('js', new Date());
                      gtag('config', '${ga4Id}');
                      gtag('config', 'AW-464110369');
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
