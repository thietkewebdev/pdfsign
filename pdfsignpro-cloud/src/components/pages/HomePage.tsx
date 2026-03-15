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
  Cloud,
  Laptop,
  FileUp,
  MousePointer,
  Shield,
  Check,
  FileCheck,
  Usb,
  BadgeCheck,
  X,
  Loader2,
  Download,
  ChevronDown,
  ArrowRight,
  Calendar,
  Users,
  Mail,
  ClipboardCheck,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  UploadDropzoneCard,
  UploadProgress,
} from "@/components/upload";
import { FeatureMockStrip } from "@/components/home/FeatureMockStrip";
import { ContactSection } from "@/components/home/ContactSection";
import { BLOG_POSTS } from "@/lib/blog-data";
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
  "Hợp đồng điện tử nhiều bên — ký theo thứ tự, email thông báo tự động",
  "Signer chạy trên Windows, kết nối trực tiếp trình duyệt",
  "Xem trước chữ ký, thông tin chứng thư, thời gian ký",
  "Dashboard quản lý tài liệu & hợp đồng đã tạo",
  "Chia sẻ liên kết đã ký, tải PDF đã ký",
] as const;

const TRUST_ITEMS = [
  { icon: FileCheck, label: "PAdES" },
  { icon: Usb, label: "USB Token" },
  { icon: BadgeCheck, label: "Adobe Verify" },
] as const;

const TESTIMONIALS = [
  {
    name: "Nguyễn Văn Minh",
    role: "Giám đốc, Công ty TNHH Thiên An",
    quote:
      "Trước đây ký hợp đồng phải cài phần mềm rất nặng. Giờ chỉ cần tải PDF lên, đặt vị trí ký là xong. Tiết kiệm rất nhiều thời gian cho đội ngũ.",
  },
  {
    name: "Trần Thị Hương",
    role: "Kế toán trưởng, Tập đoàn Phú Thịnh",
    quote:
      "Ký hóa đơn và chứng từ hàng ngày rất nhanh. Adobe verify được ngay, đối tác rất yên tâm. Giao diện đơn giản, nhân viên mới cũng dùng được luôn.",
  },
  {
    name: "Lê Hoàng Nam",
    role: "Luật sư, Văn phòng luật Nam Phong",
    quote:
      "Chữ ký PAdES chuẩn quốc tế, hợp lệ theo Luật Giao dịch điện tử. Tôi dùng ký văn bản pháp lý hàng ngày, rất tin tưởng về mặt pháp lý.",
  },
  {
    name: "Phạm Quốc Bảo",
    role: "CTO, Startup GreenTech",
    quote:
      "Tích hợp dễ dàng vào quy trình nội bộ. API rõ ràng, Signer chạy mượt. Team dev chúng tôi rất thích cách nó hoạt động — đơn giản mà hiệu quả.",
  },
  {
    name: "Võ Thị Mai Anh",
    role: "Trưởng phòng HC, Bệnh viện Đa khoa Sài Gòn",
    quote:
      "Bệnh viện ký rất nhiều văn bản mỗi ngày. PDFSignPro giúp số hóa quy trình ký hoàn toàn, giảm giấy tờ và lưu trữ gọn gàng hơn nhiều.",
  },
  {
    name: "Đặng Minh Tuấn",
    role: "Freelancer, Tư vấn tài chính",
    quote:
      "Không cần cài phần mềm nặng nề, chỉ cần trình duyệt và USB Token là ký được. Chia sẻ link cho khách hàng xem tài liệu đã ký rất tiện lợi.",
  },
] as const;

const FAQ_HOME = [
  {
    q: "PDFSignPro Cloud hỗ trợ USB Token nào?",
    a: "Hỗ trợ hầu hết USB Token chữ ký số tại Việt Nam (PKCS#11): Viettel-CA, EasyCA, FastCA, VNPT-CA, FPT-CA, BKAV-CA, CyberLotus và các CA khác.",
  },
  {
    q: "Chữ ký có hợp lệ theo pháp luật Việt Nam không?",
    a: "Có. Chữ ký PAdES chuẩn quốc tế. Tính hợp lệ pháp lý phụ thuộc vào chứng thư số do CA được Bộ TT&TT cấp phép. Hoàn toàn có giá trị theo Luật Giao dịch điện tử 2023.",
  },
  {
    q: "Adobe Acrobat có verify được chữ ký không?",
    a: 'Có. Adobe Acrobat Reader nhận diện và xác minh chữ ký PAdES. Nếu CA nằm trong danh sách AATL (hầu hết CA lớn tại VN), bạn sẽ thấy "Signed and all signatures are valid".',
  },
  {
    q: "Dữ liệu tài liệu có an toàn không?",
    a: "An toàn. Truyền tải qua HTTPS, lưu trữ trên Cloudflare R2. Khóa riêng không bao giờ rời USB Token — ký diễn ra hoàn toàn trên máy bạn qua PDFSignPro Signer.",
  },
  {
    q: "Có phí sử dụng không?",
    a: "Miễn phí cho người dùng cá nhân. Tải lên, ký số và chia sẻ tài liệu không tốn phí.",
  },
  {
    q: "PDFSignPro Signer là gì?",
    a: "Phần mềm nhỏ trên Windows, cầu nối trình duyệt với USB Token. Nhấn \"Ký số\" trên web → Signer tự mở, đọc chứng thư và ký. Bắt buộc cài vì trình duyệt không truy cập USB Token trực tiếp.",
  },
  {
    q: "Hợp đồng điện tử nhiều bên hoạt động như thế nào?",
    a: "Bạn tải PDF lên, thêm email từng bên ký theo thứ tự. Bên ký đầu tiên nhận email mời, ký xong thì bên tiếp theo tự động nhận email. Khi tất cả ký xong, mọi bên đều nhận thông báo hoàn tất.",
  },
  {
    q: "Người ký hợp đồng có cần đăng nhập không?",
    a: "Không. Mỗi bên ký nhận link riêng qua email, chỉ cần mở link và ký bằng USB Token. Chỉ người tạo hợp đồng cần đăng nhập.",
  },
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

function FaqSection({ reduceMotion }: { reduceMotion: boolean }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="relative border-t border-zinc-200/80 px-6 py-20 dark:border-white/5 sm:py-28">
      <div className="container mx-auto max-w-3xl">
        <m.h2
          className="mb-4 text-center text-2xl font-semibold text-zinc-900 dark:text-white sm:text-3xl"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={MOTION}
        >
          Câu hỏi thường gặp
        </m.h2>
        <m.p
          className="mb-10 text-center text-zinc-500 dark:text-zinc-400"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ ...MOTION, delay: 0.05 }}
        >
          Giải đáp các thắc mắc phổ biến về PDFSignPro Cloud
        </m.p>
        <m.div
          className={cn(
            "rounded-xl border backdrop-blur-sm",
            "border-zinc-200/80 bg-white/60 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none"
          )}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-30px" }}
          transition={MOTION}
        >
          <div className="px-6">
            {FAQ_HOME.map((item, i) => (
              <div key={i} className="border-b border-zinc-200/80 last:border-b-0 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left transition-colors hover:text-zinc-900 dark:hover:text-white"
                >
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">{item.q}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-zinc-400 transition-transform duration-200 dark:text-zinc-500",
                      openIndex === i && "rotate-180"
                    )}
                  />
                </button>
                <div
                  className={cn(
                    "grid transition-all duration-200 ease-in-out",
                    openIndex === i ? "grid-rows-[1fr] pb-5 opacity-100" : "grid-rows-[0fr] opacity-0"
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{item.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </m.div>
        <m.div
          className="mt-6 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ ...MOTION, delay: 0.1 }}
        >
          <Link
            href="/faq"
            className="text-sm text-zinc-500 underline-offset-4 hover:underline hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Xem tất cả câu hỏi thường gặp →
          </Link>
        </m.div>
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
  const stepsRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLDivElement>(null);
  const stepsInView = useInView(stepsRef, { once: true, margin: "0px 0px -80px 0px" });

  const scrollToUpload = useCallback(() => {
    uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
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
        <div ref={uploadRef} className="container relative mx-auto max-w-2xl">
          <div className="space-y-8">
              <m.div
                className="space-y-5"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...MOTION, delay: 0.05 }}
              >
                <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-5xl md:text-6xl md:leading-[1.1]">
                  Ký số PDF & Hợp đồng điện tử
                </h1>
                <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400 sm:text-xl">
                  Cho kế toán, pháp chế, chủ doanh nghiệp: tải PDF lên, đặt vị trí chữ ký và ký bằng USB Token. Gửi hợp đồng cho nhiều bên ký theo thứ tự, có email thông báo.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    className="rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                    onClick={scrollToUpload}
                  >
                    <Upload className="size-4" />
                    Ký 1 file PDF ngay
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="rounded-lg border-zinc-200 bg-white/80 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-white/20 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    <Link href="/contract/create">
                      <Users className="size-4" />
                      Tạo hợp đồng điện tử nhiều bên
                    </Link>
                  </Button>
                </div>
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
                              : "Upload tài liệu và ký số"}
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

      {/* Chọn phiên bản */}
      <section className="relative border-t border-zinc-200/80 bg-zinc-50/30 px-6 py-20 dark:border-white/5 dark:bg-transparent sm:py-24">
        <div className="container mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-2xl font-semibold text-zinc-900 dark:text-white sm:text-3xl">
            Chọn cách ký
          </h2>
          <div
            className={cn(
              "grid gap-6",
              process.env.NEXT_PUBLIC_OFFLINE_APP_URL
                ? "sm:grid-cols-2"
                : "mx-auto max-w-md sm:max-w-lg"
            )}
          >
            {/* PDFSignPro Cloud */}
            <m.div
              className={cn(
                "group relative flex flex-col rounded-xl border p-6 backdrop-blur-sm transition-all duration-200",
                "border-zinc-200/80 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none",
                "hover:-translate-y-0.5 hover:border-violet-300/50 hover:shadow-md hover:shadow-violet-500/5 dark:hover:border-violet-400/30 dark:hover:bg-white/[0.08]"
              )}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={MOTION}
            >
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/25 to-blue-500/15">
                <Cloud className="size-6 text-violet-600 dark:text-violet-400" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-white">
                PDFSignPro Cloud
              </h3>
              <p className="mb-6 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
                Ký số PDF trực tuyến. Tải lên, đặt vị trí chữ ký, ký bằng USB Token qua Signer — không cần cài app.
              </p>
              <Button
                size="lg"
                onClick={scrollToUpload}
                className="w-full rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              >
                <Upload className="size-4" />
                Ký online ngay
              </Button>
            </m.div>

            {/* PDFSignPro Offline */}
            {process.env.NEXT_PUBLIC_OFFLINE_APP_URL ? (
              <m.div
                className={cn(
                  "group relative flex flex-col rounded-xl border p-6 backdrop-blur-sm transition-all duration-200",
                  "border-zinc-200/80 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none",
                  "hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:hover:border-white/20 dark:hover:bg-white/[0.08]"
                )}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ ...MOTION, delay: 0.05 }}
              >
                <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-500/20 to-zinc-400/10 dark:from-white/15 dark:to-white/5">
                  <Laptop className="size-6 text-zinc-600 dark:text-zinc-300" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-white">
                  PDFSignPro Offline
                </h3>
                <p className="mb-6 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Ứng dụng Windows độc lập. Ký PDF offline, không cần trình duyệt. Phù hợp môi trường nội bộ.
                </p>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="w-full rounded-lg border-zinc-200 bg-white/80 hover:bg-zinc-50 dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  <a href={process.env.NEXT_PUBLIC_OFFLINE_APP_URL} target="_blank" rel="noopener noreferrer">
                    <Download className="size-4" />
                    Tải PDFSignPro Offline
                  </a>
                </Button>
              </m.div>
            ) : null}
          </div>
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

      {/* Hợp đồng điện tử */}
      <section className="relative border-t border-zinc-200/80 px-6 py-20 dark:border-white/5 sm:py-28">
        <div className="container mx-auto max-w-6xl">
          <m.div
            className="mb-4 text-center"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={MOTION}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-200/80 bg-violet-50/80 px-4 py-1.5 dark:border-violet-500/20 dark:bg-violet-500/10">
              <Users className="size-4 text-violet-600 dark:text-violet-400" />
              <span className="text-sm font-medium text-violet-700 dark:text-violet-300">Mới</span>
            </div>
            <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white sm:text-3xl">
              Hợp đồng điện tử nhiều bên
            </h2>
          </m.div>
          <m.p
            className="mx-auto mb-14 max-w-2xl text-center text-zinc-500 dark:text-zinc-400"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ ...MOTION, delay: 0.05 }}
          >
            Gửi hợp đồng cho nhiều bên ký số theo thứ tự. Mỗi bên nhận email mời, tự chọn vị trí ký và ký bằng USB Token. Theo dõi tiến độ realtime.
          </m.p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {([
              { icon: FileUp, title: "Tải PDF lên", desc: "Upload hợp đồng, đặt tên và thêm lời nhắn" },
              { icon: Users, title: "Thêm bên ký", desc: "Nhập email, tên và thứ tự ký cho từng bên" },
              { icon: Send, title: "Gửi email mời", desc: "Bên ký nhận email với link riêng, ký bằng USB Token" },
              { icon: ClipboardCheck, title: "Hoàn tất", desc: "Tất cả bên ký xong → email thông báo & PDF có đầy đủ chữ ký" },
            ] as const).map((step, i) => (
              <m.div
                key={step.title}
                className={cn(
                  "relative rounded-xl border p-6 backdrop-blur-sm transition-colors",
                  "border-zinc-200/80 bg-white/60 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none",
                  "hover:border-violet-200 dark:hover:border-violet-500/20"
                )}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ ...MOTION, delay: i * 0.06 }}
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/10">
                    <step.icon className="size-5 text-violet-600 dark:text-violet-300" />
                  </div>
                  <span className="flex size-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white">{step.title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{step.desc}</p>
              </m.div>
            ))}
          </div>
          <m.div
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...MOTION, delay: 0.2 }}
          >
            <Button
              size="lg"
              asChild
              className="rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:from-violet-700 hover:to-blue-700"
            >
              <Link href="/contract/create">
                <Users className="size-4" />
                Tạo hợp đồng điện tử
              </Link>
            </Button>
            <Link
              href="/blog"
              className="text-sm text-zinc-500 underline-offset-4 hover:underline hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Tìm hiểu thêm →
            </Link>
          </m.div>
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

      {/* Gói & Bảng giá */}
      <section id="pricing" className="relative border-t border-zinc-200/80 px-6 py-20 dark:border-white/5 sm:py-28">
        <div className="container mx-auto max-w-6xl">
          <m.div
            className="mb-4 text-center"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={MOTION}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-zinc-50/80 px-4 py-1.5 dark:border-white/10 dark:bg-zinc-800/50">
              <Sparkles className="size-4 text-violet-600 dark:text-violet-400" />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Đơn giản, rõ ràng</span>
            </div>
            <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white sm:text-3xl">
              Gói miễn phí
            </h2>
          </m.div>
          <m.p
            className="mx-auto mb-12 max-w-xl text-center text-zinc-500 dark:text-zinc-400"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ ...MOTION, delay: 0.05 }}
          >
            50 file ký thành công mỗi tháng. Reset đầu tháng. Không cần thẻ tín dụng.
          </m.p>
          <m.div
            className="mx-auto max-w-md rounded-2xl border-2 border-violet-200/80 bg-white/80 p-8 shadow-sm dark:border-violet-500/30 dark:bg-white/5"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...MOTION, delay: 0.1 }}
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Free</h3>
              <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">Hiện tại</span>
            </div>
            <p className="mb-6 text-3xl font-bold text-zinc-900 dark:text-white">
              0₫<span className="text-sm font-normal text-muted-foreground">/tháng</span>
            </p>
            <ul className="mb-8 space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
              <li className="flex items-center gap-2">
                <Check className="size-4 text-violet-600 dark:text-violet-400" />
                50 file PDF ký thành công / tháng
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 text-violet-600 dark:text-violet-400" />
                Ký đơn & hợp đồng nhiều bên
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 text-violet-600 dark:text-violet-400" />
                Email mời ký & thông báo hoàn tất
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 text-violet-600 dark:text-violet-400" />
                Dashboard quản lý tài liệu & gói sử dụng
              </li>
            </ul>
            <Button
              size="lg"
              className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:from-violet-700 hover:to-blue-700"
              asChild
            >
              <Link href="/dashboard">
                Bắt đầu miễn phí <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </m.div>
        </div>
      </section>

      {/* Testimonials / Social proof */}
      <section className="relative border-t border-zinc-200/80 bg-zinc-50/30 px-6 py-20 dark:border-white/5 dark:bg-transparent sm:py-28">
        <div className="container mx-auto max-w-6xl">
          <m.h2
            className="mb-4 text-center text-2xl font-semibold text-zinc-900 dark:text-white sm:text-3xl"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={MOTION}
          >
            Khách hàng nói gì
          </m.h2>
          <m.p
            className="mb-14 text-center text-zinc-500 dark:text-zinc-400"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ ...MOTION, delay: 0.05 }}
          >
            Được tin dùng bởi doanh nghiệp và cá nhân trên toàn quốc
          </m.p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <m.div
                key={i}
                className={cn(
                  "flex flex-col rounded-xl border p-6 backdrop-blur-sm",
                  "border-zinc-200/80 bg-white/60 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none"
                )}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ ...MOTION, delay: i * 0.06 }}
              >
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <svg key={s} className="size-4 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="mb-4 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/30 to-blue-500/20 text-sm font-semibold text-violet-700 dark:text-violet-300">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{t.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">{t.role}</p>
                  </div>
                </div>
              </m.div>
            ))}
          </div>
        </div>
      </section>

      {/* Blog */}
      <section className="relative border-t border-zinc-200/80 px-6 py-20 dark:border-white/5 sm:py-28">
        <div className="container mx-auto max-w-6xl">
          <m.div
            className="mb-4 flex items-center justify-between"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={MOTION}
          >
            <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white sm:text-3xl">
              Blog & Hướng dẫn
            </h2>
            <Link
              href="/blog"
              className="hidden items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 sm:inline-flex"
            >
              Xem tất cả
              <ArrowRight className="size-3.5" />
            </Link>
          </m.div>
          <m.p
            className="mb-10 text-zinc-500 dark:text-zinc-400"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ ...MOTION, delay: 0.05 }}
          >
            Kiến thức chữ ký số, hướng dẫn sử dụng
          </m.p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {BLOG_POSTS.slice(0, 3).map((post, i) => (
              <m.div
                key={post.slug}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ ...MOTION, delay: i * 0.06 }}
              >
                <Link href={`/blog/${post.slug}`} className="group block h-full">
                  <div
                    className={cn(
                      "flex h-full flex-col overflow-hidden rounded-xl border backdrop-blur-sm transition-all duration-200",
                      "border-zinc-200/80 bg-white/60 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none",
                      "hover:-translate-y-0.5 hover:shadow-md dark:hover:bg-white/[0.08]"
                    )}
                  >
                    <div
                      className="flex h-32 items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${post.gradient[0]}, ${post.gradient[1]})`,
                      }}
                    >
                      <span className="text-4xl">{post.emoji}</span>
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
                          {post.category}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {new Date(post.date).toLocaleDateString("vi-VN")}
                        </span>
                      </div>
                      <h3 className="mb-2 font-semibold text-zinc-900 group-hover:text-violet-600 dark:text-white dark:group-hover:text-violet-400 transition-colors line-clamp-2">
                        {post.title}
                      </h3>
                      <p className="flex-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                        {post.description}
                      </p>
                    </div>
                  </div>
                </Link>
              </m.div>
            ))}
          </div>
          <m.div
            className="mt-6 text-center sm:hidden"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ ...MOTION, delay: 0.15 }}
          >
            <Link
              href="/blog"
              className="text-sm text-zinc-500 underline-offset-4 hover:underline hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Xem tất cả bài viết →
            </Link>
          </m.div>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection reduceMotion={!!reduceMotion} />

      {/* Liên hệ */}
      <ContactSection />
    </div>
  );
}
