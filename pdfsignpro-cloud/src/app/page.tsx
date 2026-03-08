"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as m from "motion/react-m";
import { useInView, useReducedMotion } from "motion/react";
import {
  Upload,
  Monitor,
  FileUp,
  MousePointer,
  Shield,
  Check,
  FileCheck,
  Usb,
  BadgeCheck,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  UploadDropzoneCard,
  UploadProgress,
} from "@/components/upload";
import { FeatureMockStrip } from "@/components/home/FeatureMockStrip";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const MOTION = { duration: 0.2, ease: [0, 0, 0.2, 1] as const };

const STEPS = [
  {
    icon: FileUp,
    title: "Tải lên PDF",
    copy: "Kéo thả hoặc chọn file. Tối đa 50MB.",
  },
  {
    icon: MousePointer,
    title: "Đặt vị trí chữ ký",
    copy: "Chọn vị trí ô ký trên tài liệu.",
  },
  {
    icon: Shield,
    title: "Ký số USB Token",
    copy: "Cắm Token, mở Signer và ký. PDF lưu tự động.",
  },
] as const;

const FEATURES = [
  "Ký số PDF chuẩn PKCS#7 với USB Token (Viettel, EasyCA, FastCA…)",
  "Signer chạy trên Windows, kết nối trực tiếp trình duyệt",
  "Xem trước chữ ký, thông tin chứng thư, thời gian ký",
  "Chia sẻ liên kết đã ký, tải PDF đã ký",
] as const;

const TRUST_ITEMS = [
  { icon: FileCheck, label: "PAdES" },
  { icon: Usb, label: "USB Token" },
  { icon: BadgeCheck, label: "Adobe Verify" },
] as const;

function StepCard({
  icon: Icon,
  title,
  copy,
  index,
  isInView,
  reduceMotion,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  copy: string;
  index: number;
  isInView: boolean;
  reduceMotion: boolean;
}) {
  const y = reduceMotion ? 0 : 12;
  const opacity = isInView ? 1 : 0.5;

  return (
    <m.div
      className={cn(
        "group relative overflow-hidden rounded-xl border p-6 backdrop-blur-sm transition-colors duration-200",
        "border-zinc-200/80 bg-white/60 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none",
        "hover:border-zinc-300 hover:bg-white/80 dark:hover:border-white/20 dark:hover:bg-white/[0.07]"
      )}
      initial={false}
      animate={{
        opacity,
        y: isInView ? 0 : y,
      }}
      transition={{ ...MOTION, delay: index * 0.06 }}
      whileHover={
        reduceMotion ? undefined : { y: -2, transition: MOTION }
      }
    >
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/10">
        <Icon className="size-6 text-violet-600 dark:text-violet-300" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-white">
        {title}
      </h3>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{copy}</p>
    </m.div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const stepsRef = useRef<HTMLDivElement>(null);
  const stepsInView = useInView(stepsRef, { once: true, margin: "0px 0px -80px 0px" });
  const reduceMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setTitle((prev) => prev || file.name.replace(/\.pdf$/i, "") || "Tài liệu");
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsSubmitting(true);
    setUploadProgress(0);

    return new Promise<void>((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", title || selectedFile.name || "Tài liệu");

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(pct);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            setUploadProgress(100);
            toast.success("Đã tải lên thành công");
            router.push(`/d/${data.publicId}`);
            resolve();
          } catch {
            toast.error("Lỗi xử lý phản hồi");
            reject();
          }
        } else {
          try {
            const res = JSON.parse(xhr.responseText);
            toast.error(res.error ?? "Tải lên thất bại");
          } catch {
            toast.error("Tải lên thất bại");
          }
          reject();
        }
      });

      xhr.addEventListener("error", () => {
        toast.error("Lỗi kết nối. Vui lòng thử lại.");
        reject();
      });

      xhr.open("POST", "/api/documents");
      xhr.send(formData);
    }).finally(() => {
      setIsSubmitting(false);
      setUploadProgress(0);
    });
  };

  const handleClear = useCallback(() => {
    setSelectedFile(null);
    setTitle("");
    setUploadProgress(0);
  }, []);

  return (
    <div className="relative min-h-screen home-bg">
      {/* Clean background — two subtle radial glows only */}
      <div className="home-glow-hero" />
      <div className="home-glow-upload" />

      {/* Hero — single column: headline + subtitle + upload */}
      <section className="relative px-6 pb-12 pt-16 sm:pb-16 sm:pt-20 md:pb-20 md:pt-24">
        <div className="container relative mx-auto max-w-2xl">
          <div className="space-y-8">
              <m.div
                className="space-y-4"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...MOTION, delay: 0.05 }}
              >
                <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-5xl md:text-6xl md:leading-[1.1]">
                  Ký số PDF — nhanh, chuẩn, an toàn
                </h1>
                <p className="text-lg text-zinc-600 dark:text-zinc-400 sm:text-xl">
                  Tải PDF lên, đặt vị trí chữ ký, ký số bằng USB Token trên Windows.
                </p>
              </m.div>

              {/* Upload card */}
              <m.div
                className={cn(
                  "rounded-xl border p-1 shadow-lg backdrop-blur-sm",
                  "border-zinc-200/80 bg-white/70 dark:border-white/15 dark:bg-white/[0.08] dark:shadow-xl dark:shadow-black/20"
                )}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...MOTION, delay: 0.1 }}
              >
                {!selectedFile ? (
                  <UploadDropzoneCard
                    onFileSelect={handleFileSelect}
                    disabled={isSubmitting}
                    variant={resolvedTheme === "dark" ? "dark" : "default"}
                    className="min-h-[200px]"
                  />
                ) : (
                  <div className="space-y-4 p-4">
                    {isSubmitting ? (
                      <UploadProgress
                        fileName={selectedFile.name}
                        progress={uploadProgress}
                        status={uploadProgress >= 100 ? "done" : "uploading"}
                        className="border-zinc-200/50 bg-white/50 dark:border-white/10 dark:bg-white/5 [&_p]:text-zinc-700 dark:[&_p]:text-zinc-300"
                      />
                    ) : (
                      <>
                        <div
                          className={cn(
                            "flex items-center gap-4 rounded-lg border p-4",
                            "border-zinc-200/60 bg-white/50 dark:border-white/10 dark:bg-white/5"
                          )}
                        >
                          <div
                            className={cn(
                              "flex size-10 shrink-0 items-center justify-center rounded-lg",
                              "bg-zinc-100 dark:bg-white/10"
                            )}
                          >
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                              PDF
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                              {selectedFile.name}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-500">
                              {(selectedFile.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleClear}
                            disabled={isSubmitting}
                            className="shrink-0 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                            aria-label="Xóa file"
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                        <form onSubmit={handleUpload} className="space-y-4">
                          <div className="space-y-2">
                            <Label
                              htmlFor="title"
                              className="text-zinc-700 dark:text-zinc-300"
                            >
                              Tiêu đề tài liệu
                            </Label>
                            <Input
                              id="title"
                              placeholder="VD: Hợp đồng 2024"
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              className="rounded-lg border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-zinc-400 dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500 dark:focus-visible:ring-white/30"
                              disabled={isSubmitting}
                            />
                          </div>
                          <Button
                            type="submit"
                            size="lg"
                            className="w-full rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Upload className="size-4" />
                            )}
                            {isSubmitting
                              ? uploadProgress >= 100
                                ? "Hoàn tất"
                                : "Đang tải lên…"
                              : "Tải lên & tạo liên kết"}
                          </Button>
                        </form>
                      </>
                    )}
                  </div>
                )}
              </m.div>

              <m.div
                className="flex flex-wrap items-center gap-3"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...MOTION, delay: 0.15 }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="rounded-lg border-zinc-200 bg-white/80 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-white/20 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <a href="/api/signer/download">
                    <Monitor className="size-4" />
                    Tải Signer
                  </a>
                </Button>
                <Link
                  href="/signer"
                  className="text-sm text-zinc-500 underline-offset-4 hover:underline hover:text-zinc-700 dark:hover:text-zinc-400"
                >
                  Hướng dẫn cài đặt
                </Link>
              </m.div>
          </div>
        </div>
      </section>

      {/* Mock cards strip */}
      <section className="relative px-0">
        <div className="container mx-auto max-w-6xl px-6">
          <FeatureMockStrip />
        </div>
      </section>

      {/* Cách hoạt động */}
      <section className="relative border-t border-zinc-200/80 bg-zinc-50/50 px-6 py-20 dark:border-white/5 dark:bg-transparent sm:py-28">
        <div className="container mx-auto max-w-6xl">
          <m.h2
            className="mb-14 text-left text-2xl font-semibold text-zinc-900 dark:text-white sm:text-3xl"
            ref={stepsRef}
          >
            Cách hoạt động
          </m.h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <StepCard
                key={step.title}
                {...step}
                index={i}
                isInView={!!stepsInView}
                reduceMotion={!!reduceMotion}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Tính năng */}
      <section className="relative border-t border-zinc-200/80 px-6 py-20 dark:border-white/5 sm:py-28">
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-start lg:gap-24">
            <div>
              <h2 className="mb-10 text-2xl font-semibold text-zinc-900 dark:text-white sm:text-3xl">
                Tính năng
              </h2>
              <ul className="space-y-5">
                {FEATURES.map((text, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-1.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20">
                      <Check className="size-3 text-violet-600 dark:text-violet-400" />
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <m.div
              className={cn(
                "rounded-xl border p-6 backdrop-blur-sm sm:p-8",
                "border-zinc-200/80 bg-white/60 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none"
              )}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={MOTION}
            >
              <h3 className="mb-6 text-lg font-semibold text-zinc-900 dark:text-white">
                Đáng tin cậy
              </h3>
              <div className="flex flex-wrap gap-3">
                {TRUST_ITEMS.map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-4 py-2.5",
                      "border-zinc-200/80 bg-white/50 dark:border-white/10 dark:bg-white/5"
                    )}
                  >
                    <Icon className="size-4 text-violet-600 dark:text-violet-400" />
                    <span className="text-sm font-medium text-zinc-900 dark:text-white">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </m.div>
          </div>
        </div>
      </section>
    </div>
  );
}
