"use client";

import Link from "next/link";

const SERVICES = [
  { label: "Thiết kế web", href: "https://thietkeweb.dev/" },
  { label: "Chữ ký số Viettel", href: "https://tokenviettel.com/" },
  { label: "Hóa đơn điện tử Viettel", href: "https://viettel-invoice.vn/" },
  { label: "Chữ ký số EasyCA", href: "https://chukysoeasyca.vn/" },
  { label: "Chữ ký số FastCA", href: "https://chukysofastca.com/" },
  { label: "Đại lý chữ ký số", href: "https://dailychukyso.com.vn/" },
] as const;

const LEGAL_LINKS = [
  { label: "Blog & Hướng dẫn", href: "/blog" },
  { label: "Câu hỏi thường gặp", href: "/faq" },
  { label: "Gói & Bảng giá", href: "/#pricing" },
  { label: "Điều khoản dịch vụ", href: "/terms" },
  { label: "Chính sách bảo mật", href: "/privacy" },
] as const;

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background/50">
      <div className="container mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-3 md:gap-16">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Liên hệ
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  href="https://zalo.me/0984056777"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-4 hover:underline hover:text-foreground transition-colors duration-150"
                >
                  Zalo: 0984.056.777
                </a>
              </li>
              <li>
                <a
                  href="mailto:info@thietkeweb.dev"
                  className="underline-offset-4 hover:underline hover:text-foreground transition-colors duration-150"
                >
                  info@thietkeweb.dev
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Hỗ trợ & Pháp lý
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {LEGAL_LINKS.map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="underline-offset-4 hover:underline hover:text-foreground transition-colors duration-150"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Dịch vụ
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {SERVICES.map(({ label, href }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-4 hover:underline hover:text-foreground transition-colors duration-150"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-10 pt-8 border-t border-border text-xs text-muted-foreground">
          © {year} PDFSignPro Cloud. Mr Chí.
        </p>
      </div>
    </footer>
  );
}
