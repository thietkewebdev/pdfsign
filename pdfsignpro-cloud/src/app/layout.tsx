import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
  description: "Upload PDF. Route signers. Done.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <UploadProvider>
            <ConditionalShell>{children}</ConditionalShell>
          </UploadProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
