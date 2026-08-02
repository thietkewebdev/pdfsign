"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import * as m from "motion/react-m";
import { useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  Download,
  FileSignature,
  PenLine,
  Shield,
  Upload,
  Usb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { useSignaturePlacement } from "@/hooks/use-signature-placement";
import { trackGaEvent } from "@/lib/analytics";
import {
  downloadBytes,
  embedVisualSignature,
} from "@/lib/visual-sign";
import { AddSignatureModal } from "./AddSignatureModal";
import { cn } from "@/lib/utils";

const MOTION = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };

export function SignPdfApp() {
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [exporting, setExporting] = useState(false);

  const {
    placements,
    updatePlacementFromPixels,
    setPlacements,
  } = useSignaturePlacement(totalPages);

  const handleFile = useCallback((f: File | null) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Vui lòng chọn file PDF");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      toast.error("File tối đa 25MB");
      return;
    }
    setFile(f);
    setSignatureUrl(null);
    setCurrentPage(1);
    setTotalPages(0);
    setPlacements([]);
    trackGaEvent("visual_sign_upload", { surface: "sign_pdf" });
    setModalOpen(true);
  }, [setPlacements]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handlePlacementUpdate = useCallback(
    (
      index: number,
      pageWidth: number,
      pageHeight: number,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      updatePlacementFromPixels(index, pageWidth, pageHeight, x, y, w, h);
    },
    [updatePlacementFromPixels]
  );

  const onSignatureDone = (dataUrl: string) => {
    setSignatureUrl(dataUrl);
    trackGaEvent("visual_sign_created", { surface: "sign_pdf" });
  };

  // Ensure a placement box exists once PDF pages + signature are ready
  useEffect(() => {
    if (!signatureUrl || totalPages < 1) return;
    if (placements.length > 0) return;
    setPlacements([
      {
        page: totalPages,
        xPct: 0.58,
        yPct: 0.78,
        wPct: 0.34,
        hPct: 0.12,
      },
    ]);
  }, [signatureUrl, totalPages, placements.length, setPlacements]);

  const handleDownload = async () => {
    if (!file || !signatureUrl || placements.length === 0) {
      toast.error("Hãy tạo chữ ký và đặt vị trí trên PDF");
      return;
    }
    setExporting(true);
    try {
      const bytes = await file.arrayBuffer();
      const placement = placements[0];
      const signed = await embedVisualSignature(bytes, signatureUrl, {
        page: placement.page,
        xPct: placement.xPct,
        yPct: placement.yPct,
        wPct: placement.wPct,
        hPct: placement.hPct,
      });
      const name = file.name.replace(/\.pdf$/i, "") + "-signed.pdf";
      downloadBytes(signed, name);
      trackGaEvent("visual_sign_downloaded", { surface: "sign_pdf" });
      toast.success("Đã tải PDF đã ký");
    } catch (err) {
      console.error(err);
      toast.error("Không thể gắn chữ ký vào PDF. Thử lại với file khác.");
    } finally {
      setExporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setSignatureUrl(null);
    setPlacements([]);
    setTotalPages(0);
  };

  // ─── Editor ───────────────────────────────────────────────
  if (file) {
    return (
      <div className="flex h-screen min-h-0 flex-col bg-slate-100 text-slate-900">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">Quay lại</span>
            </button>
            <Link
              href="/"
              className="truncate text-base font-black tracking-tight text-primary"
            >
              pdfsign.vn
            </Link>
            <span className="hidden truncate text-sm text-slate-500 sm:inline">
              {file.name}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(true)}
            >
              <PenLine className="size-4" />
              <span className="hidden sm:inline">
                {signatureUrl ? "Đổi chữ ký" : "Thêm chữ ký"}
              </span>
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={!signatureUrl || exporting}
            >
              <Download className="size-4" />
              {exporting ? "Đang xuất…" : "Tải PDF"}
            </Button>
          </div>
        </header>

        {!signatureUrl && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
            Tạo chữ ký (Vẽ / Ảnh / Gõ) rồi kéo thả vào vị trí cần ký trên PDF.
            <button
              type="button"
              className="ml-2 font-semibold underline"
              onClick={() => setModalOpen(true)}
            >
              Thêm chữ ký
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <PdfViewer
            file={file}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            scale={scale}
            onScaleChange={setScale}
            totalPages={totalPages}
            onTotalPagesChange={setTotalPages}
            placements={signatureUrl ? placements : []}
            onPlacementUpdate={handlePlacementUpdate}
            activePageForPlacement={currentPage}
            overlayImageUrl={signatureUrl}
            continuousScroll={false}
          />
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-3xl flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <p className="text-xs text-slate-500">
              Đây là chữ ký điện tử hình ảnh (không dùng USB Token). Cần giá trị
              pháp lý PAdES?{" "}
              <Link href="/" className="font-semibold text-primary underline">
                Ký số USB Token
              </Link>
            </p>
            <Button
              size="sm"
              variant="secondary"
              asChild
              className="shrink-0"
            >
              <Link href="/">
                <Usb className="size-4" />
                Nâng cấp ký số
              </Link>
            </Button>
          </div>
        </div>

        <AddSignatureModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          onDone={onSignatureDone}
        />
      </div>
    );
  }

  // ─── Landing ──────────────────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(1200px_600px_at_10%_-10%,#dbe8fd_0%,transparent_55%),radial-gradient(900px_500px_at_90%_0%,#e8f0fc_0%,transparent_50%),linear-gradient(180deg,#f3f7fd_0%,#ffffff_45%,#eef4fc_100%)] text-stitch-on-surface">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-xl font-black tracking-tighter text-stitch-primary">
          pdfsign.vn
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link
            href="/"
            className="hidden font-medium text-stitch-muted hover:text-stitch-primary sm:inline"
          >
            Ký số USB Token
          </Link>
          <Button size="sm" asChild>
            <Link href="/login">Đăng nhập</Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-10 md:pt-16">
        <section className="relative grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-7">
            <m.p
              className="text-xs font-bold uppercase tracking-[0.2em] text-stitch-primary"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={MOTION}
            >
              Ký PDF online miễn phí
            </m.p>
            <m.h1
              className="max-w-xl text-4xl font-black tracking-tighter text-stitch-on-surface sm:text-5xl md:text-6xl"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...MOTION, delay: 0.05 }}
            >
              Sign PDF — vẽ, gõ hoặc tải chữ ký ngay trên trình duyệt
            </m.h1>
            <m.p
              className="max-w-lg text-base leading-relaxed text-stitch-muted sm:text-lg"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...MOTION, delay: 0.1 }}
            >
              Không cần cài phần mềm. Kéo file PDF vào, tạo chữ ký, đặt vị trí
              và tải về trong vài giây.
            </m.p>
            <m.div
              className="flex flex-wrap gap-3"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...MOTION, delay: 0.15 }}
            >
              <Button
                size="lg"
                className="h-12 px-6 text-base"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="size-5" />
                Chọn PDF để ký
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-6" asChild>
                <Link href="/">
                  <Shield className="size-5" />
                  Cần ký số pháp lý?
                </Link>
              </Button>
            </m.div>
          </div>

          <m.div
            className="relative"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...MOTION, delay: 0.12 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <div
              className={cn(
                "relative overflow-hidden rounded-2xl border border-white/70 bg-white/70 p-8 shadow-[0_30px_80px_-40px_rgba(0,59,147,0.45)] backdrop-blur-md",
                "ring-1 ring-stitch-outline/40"
              )}
            >
              <div
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 20% 20%, #c7dbff 0, transparent 40%), radial-gradient(circle at 80% 80%, #e0ebff 0, transparent 45%)",
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="relative flex min-h-[260px] w-full flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-stitch-primary/35 bg-white/80 px-6 py-10 text-center transition-colors hover:border-stitch-primary hover:bg-white"
              >
                <span className="flex size-14 items-center justify-center rounded-2xl bg-stitch-primary text-white shadow-lg shadow-stitch-primary/25">
                  <FileSignature className="size-7" />
                </span>
                <span className="text-lg font-bold text-stitch-on-surface">
                  Kéo thả PDF vào đây
                </span>
                <span className="max-w-xs text-sm text-stitch-muted">
                  Hoặc bấm để chọn file · Vẽ / Ảnh / Gõ chữ ký · Tối đa 25MB
                </span>
              </button>
            </div>
          </m.div>
        </section>

        <section className="mt-24 grid gap-10 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Tải PDF lên",
              body: "Chọn hoặc kéo thả file — xử lý ngay trên trình duyệt, không bắt buộc đăng nhập.",
            },
            {
              step: "02",
              title: "Tạo chữ ký",
              body: "Vẽ bằng chuột/ngón tay, gõ tên kiểu chữ ký, hoặc tải ảnh chữ ký tay của bạn.",
            },
            {
              step: "03",
              title: "Đặt & tải về",
              body: "Kéo chữ ký vào đúng chỗ trên tài liệu, bấm Tải PDF — xong.",
            },
          ].map((item, i) => (
            <m.div
              key={item.step}
              className="space-y-3"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...MOTION, delay: i * 0.06 }}
            >
              <p className="text-xs font-bold tracking-[0.2em] text-stitch-primary">
                {item.step}
              </p>
              <h2 className="text-xl font-bold tracking-tight">{item.title}</h2>
              <p className="text-sm leading-relaxed text-stitch-muted">
                {item.body}
              </p>
            </m.div>
          ))}
        </section>

        <section className="mt-24 rounded-2xl border border-stitch-outline/50 bg-white/80 px-6 py-10 sm:px-10">
          <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
                Chữ ký hình ảnh hay chữ ký số USB Token?
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-stitch-muted sm:text-base">
                Trang này tạo chữ ký điện tử dạng hình ảnh — nhanh, miễn phí,
                phù hợp hợp đồng nội bộ, phiếu giao hàng, xác nhận. Khi cần giá
                trị pháp lý theo Luật Giao dịch điện tử (PAdES + USB Token
                Viettel/VNPT/FPT…), dùng luồng ký số của pdfsign.vn.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Button size="lg" onClick={() => inputRef.current?.click()}>
                Ký PDF ngay
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/">
                  <Usb className="size-4" />
                  Ký số USB Token
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </div>
  );
}
