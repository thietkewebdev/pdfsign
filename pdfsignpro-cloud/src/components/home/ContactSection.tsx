"use client";

import { useState } from "react";
import * as m from "motion/react-m";
import { Mail, Clock, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MOTION = { duration: 0.2, ease: [0, 0, 0.2, 1] as const };

const TOPIC_OPTIONS = [
  { value: "", label: "Chọn chủ đề" },
  { value: "bug", label: "Báo lỗi" },
  { value: "demo", label: "Tư vấn / Demo" },
  { value: "payment", label: "Thanh toán" },
  { value: "other", label: "Khác" },
] as const;

export function ContactSection() {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim() || !topic || !message.trim() || !consent) {
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
          topic,
          message: message.trim(),
          consent,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok !== false) {
        setStatus("success");
        setName("");
        setContact("");
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

  return (
    <section className="relative border-t border-zinc-200/80 bg-zinc-50/50 px-6 py-20 dark:border-white/5 dark:bg-transparent sm:py-28">
      <div className="container mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left column */}
          <m.div
            className="space-y-6"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={MOTION}
          >
            <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white sm:text-3xl">
              Liên hệ
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Gửi yêu cầu, team sẽ phản hồi sớm.
            </p>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                <Mail className="size-4 shrink-0 text-violet-500 dark:text-violet-400" />
                <a
                  href="mailto:support@pdfsignpro.vn"
                  className="underline-offset-4 hover:underline hover:text-zinc-900 dark:hover:text-white"
                >
                  support@pdfsignpro.vn
                </a>
              </li>
              <li className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                <Clock className="size-4 shrink-0 text-violet-500 dark:text-violet-400" />
                <span>Phản hồi trong 24h (giờ hành chính)</span>
              </li>
            </ul>
          </m.div>

          {/* Right column - Form card */}
          <m.div
            className={cn(
              "rounded-lg border bg-white p-6 shadow-sm dark:bg-white/[0.03] dark:shadow-none",
              "border-zinc-200/80 dark:border-white/10"
            )}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ ...MOTION, delay: 0.05 }}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contact-name" className="text-zinc-700 dark:text-zinc-300">
                  Họ tên <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="contact-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  disabled={isLoading}
                  className="rounded-lg border-zinc-200 bg-white dark:border-white/20 dark:bg-white/5"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-contact" className="text-zinc-700 dark:text-zinc-300">
                  Email / SĐT <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="contact-contact"
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="email@example.com hoặc 0901234567"
                  disabled={isLoading}
                  className="rounded-lg border-zinc-200 bg-white dark:border-white/20 dark:bg-white/5"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-topic" className="text-zinc-700 dark:text-zinc-300">
                  Chủ đề <span className="text-red-500">*</span>
                </Label>
                <select
                  id="contact-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={isLoading}
                  className={cn(
                    "flex h-9 w-full rounded-lg border px-3 py-1 text-sm",
                    "bg-white text-slate-900 border-zinc-200",
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
                <Label htmlFor="contact-message" className="text-zinc-700 dark:text-zinc-300">
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
                    "flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm",
                    "placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:cursor-not-allowed disabled:opacity-50 resize-none",
                    "dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500"
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
                  className="mt-1 size-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500 dark:border-white/20"
                />
                <Label
                  htmlFor="contact-consent"
                  className="cursor-pointer text-sm text-zinc-600 dark:text-zinc-400"
                >
                  Tôi đồng ý chia sẻ thông tin để được hỗ trợ <span className="text-red-500">*</span>
                </Label>
              </div>

              {status === "success" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                  Đã gửi. Team sẽ liên hệ sớm.
                </div>
              )}

              {status === "error" && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
                  {errorMessage}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={isLoading}
                className="w-full rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
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
