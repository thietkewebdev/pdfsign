"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as m from "motion/react-m";
import { useReducedMotion } from "motion/react";
import {
  Upload,
  Monitor,
  X,
  Loader2,
  ArrowRight,
  Shield,
  Lock,
  Usb,
  BadgeCheck,
  Gavel,
  UserCog,
  GitBranch,
  CheckCircle2,
  Quote,
  Headphones,
  ChevronDown,
  Verified,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  UploadDropzoneCard,
  UploadProgress,
  type UploadDropzoneCardHandle,
} from "@/components/upload";
import { ContactSection } from "@/components/home/ContactSection";
import { cn } from "@/lib/utils";

const MOTION_SLOW = { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const };

const CA_LOGOS = [
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBKveIda054RjfPUVz4Dizt7fPKY1L3cSHB2bFbEuCaOq9rYw0e_C2UCYC2bnN9U46TDVpiFZ545Vh11AMuK835Q9IgIo69p69NiKEjJ0e4bCwvvu3mZpEPF4Vrga-xwz2kAPonn8qjVVMQ0K0DK1oBuj7Gzmfuj8CjEL1gddxaFTYLqO8QSKasSYAN8wpRtqXe-OzG3Y2RVz2ZHbY0FXObk08kNjqAu2dUasiQuPb_v358GXpzO9L5qcjA0mS2lCWHM4aP2Jq14Fs",
    alt: "Viettel-CA",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuANzSSYEM5I3DedtJRBAaMuoSCkvnk39hbYUVAnEoKhPlng1BwEiz1-vmbL4_klbMj6i-bVIUz5FgyXphL0OUl5-3lZeUKNoy4vmQdW2w_BVtDsY4c6_WnR_3tgyEbChM0ZILlHs94b51Kq_csppIg4mSZ6zn-oVMcwR5HY4gZtpmTRnRLJtHhXOEHkd80XtK6FEqnqDDySxEVV7SkaDHVzvKcEiP55f3Pvge6xXb3p_1KgvM5Waw4Jx8PRldWGWMlAiCb2CsJmNm8",
    alt: "VNPT-CA",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBbXelHznXzUefUl6rP2gVUrvg4zFeCyTKD11Ot7FwPw-K3AJBG9FcBOWe1tTNGqnO3i9l0Efy69m_ydX1gipoZcmQHZlLEuGuMIXjxv3zoaQaPp2bZtfmPwXgBk3ZNGIAhAgYoQgnDt0yonR3aCsC-N5A4Svzjh0EGCUWh72pB7RUVbmgSInsNnYVneO0j3MRihjSpxKvnQ5HJJZERIonY2sd5hchid-6FrAEceD0T0eK09HrwPZmuFJ3BR8REd6gTm_qjsXc5SPA",
    alt: "FPT-CA",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuCfdDvZ6jMn6taYWMkrokdCkhcuWhkvWZnIgfSBqUfAz2drAMkLES70EBQYK-hn89w23wOpGdUpmwax7TA_M95IJZnDQJttIh1cA8itbD2BHOSrwDHrvE4s9yOsS0zvbOSusEpLusJGQIvAEE6r0AGtjnn_V5f01iFP2TlRKW7uapaV1K5l6olysoe5tjPGcURDkUQ59fzqLKv-pRaB_Lp0X8zv83BpGwm5LkS8rETMSFS19ZgTY_Brlt1rTPfhI5tHQizEsjvMdNw",
    alt: "BKAV-CA",
  },
] as const;

const DASHBOARD_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCjYuKmtJ3R_Zb0BYoqvLZBCVMrNYMht9VlYEgoAt6QN67h_p6TDi1sehgHMTc1wxAkm5Bcb28GMPKpOjhEtNRpWule2EHVRvmCwH35CVK7Xy-W5rM_fLS_8-RC1VTCOV7X1Aeh2twCi8b8xJFoUGEZ23YLTdDksKg2Bzc3yqnwRhQRnpZjxqSlrPtUIxb0BiVcVbE9GSxFiGGzscE296ieOvNKKtYy0Pidj4Wy95SxMWR16d_dxVuyqEiS5RQGf4_ou8v0pavZwQ8";

const STITCH_TESTIMONIALS = [
  {
    quote:
      "Hệ thống ký rất mượt, tương thích hoàn toàn với Token Viettel tôi đang dùng. Giúp việc ký hồ sơ thầu nhanh hơn gấp 10 lần.",
    name: "Chị Mai Phương",
    role: "Kế toán trưởng — TechCorp Vietnam",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDAoeRHwbin0bJIUU9maWynVxDQdWSSCr3Wu0mq2Twb5KY-ug8A70jqqXdPk7Cs52XIqiAws_RKZVW_Pju9iG5hTs6DEhQMtaDqVRIQ3k8r2kBZvOd14--vg-bDE7ce0UTeGaLbVnkRvlyKNZ-eXMhEHauPqNB9hUNWQoHmvetlz0S4HQT0Q689fxBzsbs62mX1au6s0Ugnf1RVpFPUQip3lffZTzlxespdt0cKYjU2CkiD-E3V5BBHUpdEOLE451qcKNU47HsNnTo",
    leftBorder: "border-l-stitch-primary",
  },
  {
    quote:
      "Tính pháp lý là điều tôi quan tâm nhất. pdfsign.vn đã giải quyết triệt để bài toán này với sự hỗ trợ nhiệt tình cho doanh nghiệp.",
    name: "Anh Hoàng Nam",
    role: "Giám đốc điều hành — NamAn Logistic",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCGYX-hCnkIVINCH0TFydzRFyoi_GKmMy8T1RJOrYA0L2hDlHf9cQAtlPOmNtwqX5jdDY44RlCcwvibrkmsjYI9MJ1RmPXWTl5YoAeVtFJZKeVkx2e0hLdCNl83ZbZAtYV6_McdIH_X0MwdNqB8im0YIVjqYpUp1F3DLvsY2dU23li-DV4REAwRmT9hlC4jBiLJZ8cCnnxuzNWHfLLyMTsAqYpo-Hyx0oOLlqy6r4RwFY2Je2Y_s83aaZakG-WH_p46tCgGaFIFp0Q",
    leftBorder: "border-l-stitch-primary-strong",
  },
] as const;

const FAQ_STITCH = [
  {
    q: "Chữ ký số USB Token có hợp pháp không?",
    a: "Hoàn toàn hợp pháp. Theo Luật Giao dịch điện tử và Nghị định 130/2018/NĐ-CP, chữ ký số sử dụng chứng thư số công cộng (như USB Token của Viettel, VNPT…) có giá trị pháp lý tương đương chữ ký tay và con dấu của tổ chức.",
  },
  {
    q: "Tôi có thể ký trên nhiều thiết bị không?",
    a: "Có, pdfsign.vn là nền tảng web. Bạn có thể đăng nhập từ bất kỳ máy tính nào có cài đặt PDFSignPro Signer để thực hiện thao tác ký với USB Token.",
  },
  {
    q: "Làm sao để kiểm tra tính toàn vẹn của file?",
    a: "Bạn có thể dùng Adobe Acrobat Reader hoặc công cụ kiểm tra chữ ký để xác thực chữ ký và đảm bảo nội dung file không bị thay đổi sau khi ký.",
  },
] as const;

function FaqStitchBlock({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <m.h2
          className="mb-12 text-center text-3xl font-black tracking-tighter text-stitch-on-surface"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={MOTION_SLOW}
        >
          Câu hỏi thường gặp
        </m.h2>
        <div className="space-y-4">
          {FAQ_STITCH.map((item, i) => (
            <details
              key={item.q}
              className="group cursor-pointer rounded-xl bg-stitch-container-low p-6"
              open={i === 0}
            >
              <summary className="flex list-none items-center justify-between gap-4 text-lg font-bold text-stitch-on-surface [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="size-5 shrink-0 text-stitch-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-4 leading-relaxed text-stitch-muted">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-stitch-muted">
          <Link href="/faq" className="font-medium text-stitch-primary underline-offset-4 hover:underline">
            Xem thêm câu hỏi thường gặp →
          </Link>
        </p>
      </div>
    </section>
  );
}

export function HomePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadRef = useRef<HTMLDivElement>(null);
  const homeDropzoneRef = useRef<UploadDropzoneCardHandle>(null);
  const reduceMotion = useReducedMotion();

  const scrollToUpload = useCallback(() => {
    uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  /** Cuộn tới khối upload và mở chọn file PDF (khi chưa chọn file). */
  const handleTryFreeClick = useCallback(() => {
    scrollToUpload();
    window.setTimeout(() => {
      if (!selectedFile && !isSubmitting) {
        homeDropzoneRef.current?.openFilePicker();
      }
    }, 280);
  }, [scrollToUpload, selectedFile, isSubmitting]);

  /** / hoặc /#upload từ menu — cuộn + mở chọn file một lần khi vào trang. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#upload") return;
    const t1 = window.setTimeout(() => {
      uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        homeDropzoneRef.current?.openFilePicker();
      }, 320);
    }, 120);
    return () => clearTimeout(t1);
  }, []);

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

      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
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
    <div className="relative min-h-screen home-bg text-stitch-on-surface">
      {/* Hero */}
      <header className="overflow-hidden px-6 pb-20 pt-28 md:pt-32">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 lg:grid-cols-2">
          <div className="space-y-8">
            <m.div
              className="inline-flex items-center gap-2 rounded-full bg-stitch-primary-fixed px-3 py-1 text-stitch-on-primary-fixed"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={MOTION_SLOW}
            >
              <Verified className="size-4 shrink-0" aria-hidden />
              <span className="text-[11px] font-bold uppercase tracking-widest">Chuẩn pháp lý Việt Nam</span>
            </m.div>
            <m.h1
              className="text-4xl font-black leading-[1.1] tracking-tighter text-stitch-on-surface md:text-5xl lg:text-6xl"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...MOTION_SLOW, delay: 0.05 }}
            >
              Ký tài liệu PDF <br />
              <span className="text-stitch-primary-strong">chuyên nghiệp</span>
              {" "}&amp; bảo mật pháp lý
            </m.h1>
            <m.p
              className="max-w-xl text-lg leading-relaxed text-stitch-muted"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...MOTION_SLOW, delay: 0.12 }}
            >
              Giải pháp ký số USB Token tối ưu cho Giám đốc &amp; Kế toán. Tương thích với Viettel, VNPT, FPT,
              BKAV, EasyCA… Đảm bảo tính pháp lý theo Luật Giao dịch điện tử.
            </m.p>
            <m.div
              className="flex flex-col gap-4 sm:flex-row"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...MOTION_SLOW, delay: 0.18 }}
            >
              <Button
                size="lg"
                type="button"
                className="hero-gradient-stitch h-14 gap-2 rounded-lg px-8 text-lg font-bold text-white ambient-shadow-stitch"
                onClick={handleTryFreeClick}
              >
                Thử ngay miễn phí
                <ArrowRight className="size-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 rounded-lg border-2 border-blue-200 bg-white px-8 text-lg font-bold text-stitch-primary shadow-sm hover:bg-blue-50/90"
                asChild
              >
                <Link href="/contract/create">Giải pháp doanh nghiệp</Link>
              </Button>
            </m.div>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="/api/signer/download"
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border-2 border-stitch-outline/60 bg-white px-3.5 text-sm font-semibold text-stitch-primary shadow-sm",
                  "transition-colors hover:border-stitch-primary/45 hover:bg-stitch-container-low hover:text-stitch-primary-strong",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stitch-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f3f7fd]"
                )}
              >
                <Monitor className="size-4 shrink-0 text-stitch-primary-strong" aria-hidden />
                Tải Signer
              </a>
              <Link
                href="/signer"
                className="text-sm text-stitch-primary underline-offset-4 hover:underline"
              >
                Hướng dẫn cài đặt
              </Link>
            </div>
          </div>

          {/* Upload — Stitch card */}
          <div className="relative" id="upload" ref={uploadRef}>
            <div className="rounded-xl border-2 border-dashed border-stitch-outline/30 bg-stitch-container-low p-6 ambient-shadow-stitch md:p-8">
              <div className="flex flex-col space-y-6 rounded-lg bg-white p-8 md:p-10">
                <div className="flex flex-col items-center text-center">
                  <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-stitch-primary-fixed text-stitch-primary-strong">
                    <Upload className="size-9" strokeWidth={2} />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-stitch-on-surface">Tải tài liệu lên để ký</h3>
                  <p className="text-sm text-stitch-muted">Kéo thả file PDF vào đây hoặc chọn file bên dưới</p>
                </div>
                {!selectedFile ? (
                  <UploadDropzoneCard
                    ref={homeDropzoneRef}
                    onFileSelect={handleFileSelect}
                    disabled={isSubmitting}
                    variant="stitch"
                    className="min-h-[160px] rounded-lg"
                  />
                ) : (
                  <div className="space-y-4">
                    {isSubmitting ? (
                      <UploadProgress
                        fileName={selectedFile.name}
                        progress={uploadProgress}
                        status={uploadProgress >= 100 ? "done" : "uploading"}
                        className="rounded-lg border border-stitch-outline/30 bg-stitch-container-low"
                      />
                    ) : (
                      <>
                        <div className="flex items-center gap-4 rounded-lg border border-stitch-outline/30 bg-stitch-container-low p-4">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-medium">
                            PDF
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                            <p className="text-xs text-stitch-muted">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleClear}
                            disabled={isSubmitting}
                            aria-label="Xóa file"
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                        <form onSubmit={handleUpload} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="title">Tiêu đề tài liệu</Label>
                            <Input
                              id="title"
                              placeholder="VD: Hợp đồng 2024"
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              disabled={isSubmitting}
                              className="rounded-lg border-stitch-outline/40 bg-stitch-container-low"
                            />
                          </div>
                          <Button
                            type="submit"
                            size="lg"
                            className="hero-gradient-stitch w-full font-bold text-white"
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                            {isSubmitting
                              ? uploadProgress >= 100
                                ? "Hoàn tất"
                                : "Đang tải lên…"
                              : "Upload và ký số"}
                          </Button>
                        </form>
                      </>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 border-t border-stitch-outline/20 pt-6">
                  <div className="flex items-center gap-3 rounded-lg border border-stitch-outline/15 bg-stitch-container-low p-3">
                    <Usb className="size-5 shrink-0 text-stitch-primary" />
                    <span className="text-xs font-medium">Hỗ trợ USB Token</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-stitch-outline/15 bg-stitch-container-low p-3">
                    <BadgeCheck className="size-5 shrink-0 text-stitch-primary" />
                    <span className="text-xs font-medium">Chứng thực CA</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute -right-10 -top-10 -z-10 size-40 rounded-full bg-stitch-primary/5 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute -bottom-10 -left-10 -z-10 size-40 rounded-full bg-stitch-primary-strong/5 blur-3xl" aria-hidden />
          </div>
        </div>
      </header>

      {/* Trust */}
      <section className="bg-stitch-container-low py-12">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-8 text-center text-xs font-bold uppercase tracking-widest text-stitch-muted/80">
            Tương thích với tất cả nhà cung cấp CA &amp; chứng chỉ bảo mật
          </p>
          <div className="flex flex-wrap items-center justify-center gap-10 grayscale transition-all duration-500 hover:grayscale-0 md:gap-12">
            {CA_LOGOS.map((logo) => (
              <Image
                key={logo.alt}
                src={logo.src}
                alt={logo.alt}
                width={120}
                height={32}
                className="h-8 w-auto object-contain opacity-70"
              />
            ))}
            <div className="hidden h-10 w-px bg-stitch-outline/30 md:block" />
            <div className="flex items-center gap-2">
              <Shield className="size-5 text-stitch-primary" />
              <span className="text-sm font-bold">ISO 27001</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="size-5 text-stitch-primary" />
              <span className="text-sm font-bold">AES-256</span>
            </div>
          </div>
        </div>
      </section>

      {/* Why — bento */}
      <section id="why-pdfsign" className="bg-stitch-bg px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16">
            <h2 className="mb-4 text-4xl font-black tracking-tighter text-stitch-on-surface">
              Tại sao chọn pdfsign.vn?
            </h2>
            <div className="h-1.5 w-24 rounded-full bg-stitch-primary-strong" />
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="flex flex-col justify-between rounded-xl bg-white p-10 ambient-shadow-stitch md:col-span-2">
              <div>
                <div className="mb-6 flex size-14 items-center justify-center rounded-xl bg-stitch-primary-fixed text-stitch-primary-strong">
                  <Gavel className="size-7" />
                </div>
                <h3 className="mb-4 text-2xl font-bold">Tính pháp lý tuyệt đối</h3>
                <p className="max-w-lg leading-relaxed text-stitch-muted">
                  Mọi chữ ký tuân thủ Luật Giao dịch điện tử và quy định hiện hành. Có giá trị tương đương chữ ký tay và con dấu khi dùng chứng thư số hợp lệ.
                </p>
              </div>
              <Link
                href="/faq"
                className="mt-8 flex items-center gap-2 border-t border-stitch-outline/15 pt-8 text-sm font-bold text-stitch-primary"
              >
                Xem chi tiết cơ sở pháp lý
                <ArrowRight className="size-4 rotate-[-45deg]" />
              </Link>
            </div>
            <div className="hero-gradient-stitch flex flex-col justify-between rounded-xl p-10 text-white">
              <div className="mb-6 flex size-14 items-center justify-center rounded-xl bg-white/20">
                <UserCog className="size-7" />
              </div>
              <h3 className="mb-4 text-2xl font-bold">Bảo mật chuẩn ngân hàng</h3>
              <p className="leading-relaxed text-blue-100/85">
                Dữ liệu truyền tải qua HTTPS, lưu trữ an toàn. Khóa bí mật không rời USB Token — ký cục bộ qua Signer trên máy bạn.
              </p>
            </div>
            <div className="flex flex-col justify-between rounded-xl bg-stitch-container-high p-10">
              <div className="mb-6 flex size-14 items-center justify-center rounded-xl bg-white shadow-sm">
                <GitBranch className="size-7 text-stitch-primary" />
              </div>
              <h3 className="mb-4 text-2xl font-bold">Ký nhiều bên cùng lúc</h3>
              <p className="leading-relaxed text-stitch-muted">
                Hợp đồng điện tử: ký tuần tự hoặc song song, email mời từng bên, theo dõi tiến độ trên dashboard.
              </p>
            </div>
            <div className="flex flex-col items-center gap-10 rounded-xl border border-stitch-outline/15 bg-stitch-container-low p-10 md:col-span-2 md:flex-row">
              <div className="hidden shrink-0 sm:block">
                <Image
                  src={DASHBOARD_IMG}
                  alt="Giao diện quản lý tài liệu"
                  width={256}
                  height={180}
                  className="w-64 rotate-2 rounded-lg shadow-xl"
                />
              </div>
              <div>
                <h3 className="mb-4 text-2xl font-bold">Quản lý tập trung</h3>
                <p className="leading-relaxed text-stitch-muted">
                  Theo dõi trạng thái tài liệu thời gian thực. Nhắc các bên chưa ký qua email khi dùng hợp đồng nhiều bên.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-white px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-black tracking-tighter text-stitch-on-surface">
              Bảng giá linh hoạt
            </h2>
            <p className="text-stitch-muted">Phù hợp cho cả cá nhân và doanh nghiệp</p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="flex flex-col rounded-xl border border-stitch-outline/20 bg-stitch-bg p-8">
              <div className="mb-8">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-stitch-muted">Miễn phí</h4>
                <div className="text-4xl font-black">
                  0đ<span className="text-lg font-normal text-stitch-muted">/tháng</span>
                </div>
              </div>
              <ul className="mb-10 flex flex-grow flex-col gap-4 text-sm">
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="size-4 shrink-0 text-stitch-primary" />
                  50 tài liệu ký thành công / tháng
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="size-4 shrink-0 text-stitch-primary" />
                  Ký đơn &amp; hợp đồng nhiều bên
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="size-4 shrink-0 text-stitch-primary" />
                  Dashboard &amp; chia sẻ link
                </li>
              </ul>
              <Button variant="outline" className="w-full rounded-lg border-stitch-primary font-bold text-stitch-primary" asChild>
                <Link href="/#upload">Bắt đầu ngay</Link>
              </Button>
            </div>
            <div className="relative flex flex-col rounded-xl border-2 border-stitch-primary-strong bg-white p-8 ambient-shadow-stitch">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-stitch-primary-strong px-4 py-1 text-xs font-bold uppercase tracking-widest text-white">
                Phổ biến nhất
              </div>
              <div className="mb-8">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-stitch-primary-strong">Chuyên nghiệp</h4>
                <div className="text-4xl font-black text-stitch-primary-strong">
                  99.000đ<span className="text-lg font-normal text-stitch-muted">/tháng</span>
                </div>
                <p className="mt-2 text-xs text-stitch-muted">Đang mở đăng ký — liên hệ để ưu tiên truy cập.</p>
              </div>
              <ul className="mb-10 flex flex-grow flex-col gap-4 text-sm">
                <li className="flex items-center gap-3 font-medium">
                  <CheckCircle2 className="size-4 shrink-0 text-stitch-primary" />
                  Nâng hạn mức &amp; tính năng nâng cao
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="size-4 shrink-0 text-stitch-primary" />
                  Lưu trữ &amp; quy trình doanh nghiệp
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="size-4 shrink-0 text-stitch-primary" />
                  Hỗ trợ ưu tiên
                </li>
              </ul>
              <Button className="hero-gradient-stitch h-12 w-full font-bold text-white" asChild>
                <Link href="/#contact">Liên hệ nâng cấp</Link>
              </Button>
            </div>
            <div className="flex flex-col rounded-xl border border-stitch-outline/20 bg-stitch-bg p-8">
              <div className="mb-8">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-stitch-muted">Doanh nghiệp</h4>
                <div className="text-4xl font-black">Liên hệ</div>
              </div>
              <ul className="mb-10 flex flex-grow flex-col gap-4 text-sm">
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="size-4 shrink-0 text-stitch-primary" />
                  Quản trị nhóm &amp; phân quyền
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="size-4 shrink-0 text-stitch-primary" />
                  Tích hợp API / ERP
                </li>
                <li className="flex items-center gap-3 font-medium text-stitch-primary">
                  <Headphones className="size-4 shrink-0" />
                  Hỗ trợ trực tiếp
                </li>
              </ul>
              <Button className="w-full rounded-lg bg-stitch-container-highest font-bold" asChild>
                <Link href="/#contact">Liên hệ chúng tôi</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-stitch-container-low px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-16 text-center text-3xl font-black tracking-tighter text-stitch-on-surface">
            Khách hàng nói về chúng tôi
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {STITCH_TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className={cn(
                  "rounded-xl border border-stitch-outline/20 bg-white p-8 shadow-sm",
                  "border-l-4",
                  t.leftBorder
                )}
              >
                <Quote className="mb-4 size-10 text-stitch-primary-fixed opacity-80" />
                <p className="mb-6 text-lg italic text-stitch-on-surface">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-4">
                  <div className="relative size-12 overflow-hidden rounded-full bg-stitch-primary-fixed">
                    <Image src={t.image} alt={t.name} fill className="object-cover" sizes="48px" />
                  </div>
                  <div>
                    <div className="font-bold">{t.name}</div>
                    <div className="text-sm text-stitch-muted">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FaqStitchBlock reduceMotion={!!reduceMotion} />
      <ContactSection variant="stitch" />
    </div>
  );
}
