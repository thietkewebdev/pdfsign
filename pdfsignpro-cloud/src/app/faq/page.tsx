import type { Metadata } from "next";
import { FAQ_ITEMS } from "@/lib/faq-data";
import { COMPANY_EMAIL, SUPPORT_ZALO_DISPLAY, SUPPORT_ZALO_URL } from "@/lib/company-legal";
import { FaqAccordion } from "./faq-accordion";

export const metadata: Metadata = {
  title: "Câu hỏi thường gặp",
  description:
    "Giải đáp các thắc mắc phổ biến về PDFSignPro Cloud: USB Token, pháp lý, Adobe verify, bảo mật, phí sử dụng.",
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function FaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="container mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Câu hỏi thường gặp
          </h1>
          <p className="text-muted-foreground">
            Giải đáp các thắc mắc phổ biến về PDFSignPro Cloud
          </p>
        </div>

        <FaqAccordion items={FAQ_ITEMS as unknown as { question: string; answer: string }[]} />

        <div className="mt-10 rounded-xl border border-border bg-card p-6 text-center">
          <p className="mb-2 font-medium">Còn thắc mắc?</p>
          <p className="text-sm text-muted-foreground">
            Liên hệ Zalo:{" "}
            <a
              href={SUPPORT_ZALO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {SUPPORT_ZALO_DISPLAY}
            </a>{" "}
            hoặc email:{" "}
            <a href={`mailto:${COMPANY_EMAIL}`} className="text-primary hover:underline">
              {COMPANY_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
