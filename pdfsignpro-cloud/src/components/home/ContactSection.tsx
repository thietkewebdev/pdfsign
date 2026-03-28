"use client";

import { useState } from "react";
import * as m from "motion/react-m";
import { Mail, Clock, Send, Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_LEGAL_NAME,
  COMPANY_TAX_ID,
  SUPPORT_ZALO_DISPLAY,
  SUPPORT_ZALO_URL,
} from "@/lib/company-legal";

const MOTION = { duration: 0.2, ease: [0, 0, 0.2, 1] as const };

const TOPIC_OPTIONS = [
  { value: "", label: "Chọn chủ đề" },
  { value: "bug", label: "Báo lỗi" },
  { value: "demo", label: "Tư vấn / Demo" },
  { value: "payment", label: "Thanh toán" },
  { value: "other", label: "Khác" },
] as const;

export function ContactSection({ variant = "default" }: { variant?: "default" | "stitch" }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [company, setCompany] = useState("");
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveTopic = variant === "stitch" ? "demo" : topic;
    const bodyMessage =
      variant === "stitch" && company.trim()
        ? `Doanh nghiệp: ${company.trim()}\n\n${message.trim()}`
        : message.trim();

    if (!name.trim() || !contact.trim() || !effectiveTopic || !message.trim() || !consent) {
      setStatus("error");
      setErrorMessage("Vui lòng điền đầy đủ thông tin và đồng ý chia sẻ.");
      return;
    }

    setIsLoading(true);
    setStatus("idle");
    setErrorMessage("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          contact: contact.trim(),
          topic: effectiveTopic,
          message: bodyMessage,
          consent,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok !== false) {
        setStatus("success");
        setName("");
        setContact("");
        setCompany("");
        setTopic("");
        setMessage("");
        setConsent(false);
      } else {
        setStatus("error");
        const parts: string[] = [];
        if (!res.ok) parts.push(`[${res.status}]`);
        if (data.error) parts.push(data.error);
        if (data.detail?.description) parts.push(data.detail.description);
        const msg = parts.length > 0 ? parts.join(" ") : "Gửi thất bại. Vui lòng thử lại.";
        setErrorMessage(msg);

        const errDetail = { status: res.status, data };
        console.error("Contact form error:", errDetail);

        if (
          msg.toLowerCase().includes("telegram_bot_token") ||
          msg.toLowerCase().includes("missing telegram")
        ) {
          setErrorMessage(
            `${msg} Chưa cấu hình TELEGRAM_BOT_TOKEN trên Render.`
          );
        }
      }
    } catch (err) {
      setStatus("error");
      setErrorMessage("Lỗi kết nối. Vui lòng thử lại.");
      console.error("Contact form error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const inputStitch =
    "rounded-lg border-0 bg-stitch-container-low px-3 py-2.5 text-sm text-stitch-on-surface placeholder:text-stitch-muted/70 focus-visible:ring-2 focus-visible:ring-stitch-primary";

  if (variant === "stitch") {
    return (
      <section
        id="contact"
        className="bg-stitch-container-high/30 px-6 py-24"
      >
        <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl bg-white ambient-shadow-stitch">
          <div className="flex flex-col md:flex-row">
            <div className="hero-gradient-stitch md:w-1/3 p-10 text-white">
              <h3 className="mb-6 text-2xl font-bold">Liên hệ tư vấn</h3>
              <p className="mb-8 text-sm opacity-90">
                Chúng tôi luôn sẵn sàng hỗ trợ bạn triển khai giải pháp ký số cho doanh nghiệp.
              </p>
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-3">
                  <Mail className="size-4 shrink-0 opacity-90" />
                  <a href={`mailto:${COMPANY_EMAIL}`} className="underline-offset-2 hover:underline">
                    {COMPANY_EMAIL}
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="size-4 shrink-0 opacity-90" />
                  <a
                    href={SUPPORT_ZALO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-2 hover:underline"
                  >
                    Zalo {SUPPORT_ZALO_DISPLAY}
                  </a>
                </div>
              </div>
              <p className="mt-8 text-xs leading-relaxed opacity-75">{COMPANY_LEGAL_NAME}</p>
              <p className="mt-1 text-xs opacity-75">{COMPANY_ADDRESS}</p>
            </div>
            <div className="md:w-2/3 p-10">
              <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-stitch-muted">
                    Họ và tên
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    disabled={isLoading}
                    className={inputStitch}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-stitch-muted">
                    Số điện thoại / Email
                  </Label>
                  <Input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="0901 xxx xxx hoặc email"
                    disabled={isLoading}
                    className={inputStitch}
                  />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-stitch-muted">
                    Tên doanh nghiệp
                  </Label>
                  <Input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Công ty TNHH…"
                    disabled={isLoading}
                    className={inputStitch}
                  />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-stitch-muted">
                    Nội dung cần tư vấn
                  </Label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tôi cần tư vấn giải pháp ký số…"
                    rows={5}
                    disabled={isLoading}
                    className={cn(inputStitch, "min-h-32 resize-none")}
                  />
                </div>
                <div className="flex items-start gap-3 sm:col-span-2">
                  <input
                    type="checkbox"
                    id="contact-consent-stitch"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    disabled={isLoading}
                    className="mt-1 size-4 rounded border-stitch-outline text-stitch-primary focus:ring-stitch-primary"
                  />
                  <Label
                    htmlFor="contact-consent-stitch"
                    className="cursor-pointer text-sm text-stitch-muted"
                  >
                    Tôi đồng ý chia sẻ thông tin để được tư vấn <span className="text-red-500">*</span>
                  </Label>
                </div>
                {status === "success" && (
                  <div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    Đã gửi. Chúng tôi sẽ liên hệ sớm.
                  </div>
                )}
                {status === "error" && (
                  <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {errorMessage}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="hero-gradient-stitch sm:col-span-2 h-12 font-bold text-white ambient-shadow-stitch"
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Gửi yêu cầu ngay"
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative border-t border-zinc-200/80 bg-zinc-50/50 px-6 py-20 sm:py-28">
      <div className="container mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <m.div
            className="space-y-6"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={MOTION}
          >
            <h2 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
              Liên hệ
            </h2>
            <p className="text-sm font-medium text-zinc-800">
              {COMPANY_LEGAL_NAME}
            </p>
            <p className="text-xs text-zinc-600">
              MST: <span className="font-medium">{COMPANY_TAX_ID}</span>
            </p>
            <p className="text-sm leading-relaxed text-zinc-600">
              {COMPANY_ADDRESS}
            </p>
            <ul className="space-y-3 pt-1">
              <li className="flex items-start gap-3 text-sm text-zinc-600">
                <Mail className="mt-0.5 size-4 shrink-0 text-violet-500" />
                <a
                  href={`mailto:${COMPANY_EMAIL}`}
                  className="underline-offset-4 hover:text-stitch-primary hover:underline"
                >
                  {COMPANY_EMAIL}
                </a>
              </li>
              <li className="flex items-start gap-3 text-sm text-zinc-600">
                <Clock className="mt-0.5 size-4 shrink-0 text-violet-500" />
                <a
                  href={SUPPORT_ZALO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-4 hover:text-stitch-primary hover:underline"
                >
                  Zalo: {SUPPORT_ZALO_DISPLAY}
                </a>
              </li>
            </ul>
            <p className="pt-1 text-sm text-zinc-600">
              Gửi biểu mẫu bên cạnh, chúng tôi sẽ phản hồi sớm.
            </p>
          </m.div>

          <m.div
            className={cn(
              "rounded-lg border bg-white p-6 shadow-sm",
              "border-zinc-200/80"
            )}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ ...MOTION, delay: 0.05 }}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contact-name" className="text-zinc-700">
                  Họ tên <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="contact-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  disabled={isLoading}
                  className="rounded-lg border-zinc-200 bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-contact" className="text-zinc-700">
                  Email / SĐT <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="contact-contact"
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="email@example.com hoặc 0901234567"
                  disabled={isLoading}
                  className="rounded-lg border-zinc-200 bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-topic" className="text-zinc-700">
                  Chủ đề <span className="text-red-500">*</span>
                </Label>
                <select
                  id="contact-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={isLoading}
                  className={cn(
                    "flex h-9 w-full rounded-lg border px-3 py-1 text-sm",
                    "border-zinc-200 bg-white text-slate-900",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {TOPIC_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-message" className="text-zinc-700">
                  Nội dung <span className="text-red-500">*</span>
                </Label>
                <textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Mô tả yêu cầu của bạn..."
                  rows={4}
                  disabled={isLoading}
                  className={cn(
                    "flex w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm",
                    "placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                />
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="contact-consent"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  disabled={isLoading}
                  className="mt-1 size-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                />
                <Label
                  htmlFor="contact-consent"
                  className="cursor-pointer text-sm text-zinc-600"
                >
                  Tôi đồng ý chia sẻ thông tin để được hỗ trợ <span className="text-red-500">*</span>
                </Label>
              </div>

              {status === "success" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Đã gửi. Team sẽ liên hệ sớm.
                </div>
              )}

              {status === "error" && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {errorMessage}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={isLoading}
                className="hero-gradient-stitch w-full rounded-lg font-semibold text-white shadow-sm hover:opacity-95"
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Gửi liên hệ
              </Button>
            </form>
          </m.div>
        </div>
      </div>
    </section>
  );
}
