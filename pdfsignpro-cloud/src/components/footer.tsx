"use client";

import Link from "next/link";
import {
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_LEGAL_NAME,
  COMPANY_TAX_ID,
  SUPPORT_ZALO_DISPLAY,
  SUPPORT_ZALO_URL,
} from "@/lib/company-legal";

const year = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="w-full border-t border-blue-100 bg-gradient-to-b from-white to-blue-50/40 py-12">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 md:grid-cols-4 md:gap-8">
        <div>
          <div className="mb-4 text-lg font-bold text-stitch-primary">pdfsign.vn</div>
          <p className="text-xs leading-relaxed text-stitch-muted">
            Giải pháp ký số chuyên nghiệp giúp chuyển đổi số quy trình ký kết tài liệu cho doanh nghiệp Việt Nam.
          </p>
          <p className="mt-4 text-xs font-medium text-stitch-on-surface">{COMPANY_LEGAL_NAME}</p>
          <p className="mt-1 text-xs text-stitch-muted">MST: {COMPANY_TAX_ID}</p>
          <p className="mt-2 text-xs leading-relaxed text-stitch-muted">{COMPANY_ADDRESS}</p>
        </div>
        <div className="space-y-4">
          <h5 className="text-sm font-bold uppercase tracking-widest text-stitch-on-surface">Sản phẩm</h5>
          <ul className="space-y-2 text-xs text-stitch-muted">
            <li>
              <Link href="/#why-pdfsign" className="hover:text-stitch-primary hover:underline">
                Tính năng chính
              </Link>
            </li>
            <li>
              <Link href="/#pricing" className="hover:text-stitch-primary hover:underline">
                Bảng giá
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className="hover:text-stitch-primary hover:underline">
                Bảng điều khiển
              </Link>
            </li>
          </ul>
        </div>
        <div className="space-y-4">
          <h5 className="text-sm font-bold uppercase tracking-widest text-stitch-on-surface">Pháp lý</h5>
          <ul className="space-y-2 text-xs text-stitch-muted">
            <li>
              <Link href="/terms" className="hover:text-stitch-primary hover:underline">
                Điều khoản sử dụng
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-stitch-primary hover:underline">
                Chính sách bảo mật
              </Link>
            </li>
            <li>
              <Link href="/faq" className="hover:text-stitch-primary hover:underline">
                Câu hỏi thường gặp
              </Link>
            </li>
          </ul>
        </div>
        <div className="space-y-4">
          <h5 className="text-sm font-bold uppercase tracking-widest text-stitch-on-surface">Hỗ trợ</h5>
          <ul className="space-y-2 text-xs text-stitch-muted">
            <li>
              <Link href="/blog" className="hover:text-stitch-primary hover:underline">
                Blog &amp; hướng dẫn
              </Link>
            </li>
            <li>
              <Link href="/signer" className="hover:text-stitch-primary hover:underline">
                Tải phần mềm Signer
              </Link>
            </li>
            <li>
              <a
                href={SUPPORT_ZALO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-stitch-primary hover:underline"
              >
                Zalo: {SUPPORT_ZALO_DISPLAY}
              </a>
            </li>
            <li>
              <a
                href={`mailto:${COMPANY_EMAIL}`}
                className="hover:text-stitch-primary hover:underline"
              >
                {COMPANY_EMAIL}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-7xl border-t border-blue-100/80 px-6 pt-8">
        <p className="text-center text-xs text-stitch-muted">
          © {year} pdfsign.vn / PDFSignPro Cloud — {COMPANY_LEGAL_NAME}.
        </p>
      </div>
    </footer>
  );
}
