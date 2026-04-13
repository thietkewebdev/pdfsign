"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  FilePlus,
  Download,
  Users,
  Shield,
  CheckCircle2,
  Usb,
  User,
  Settings2,
  ArrowLeft,
  FileText,
  ChevronRight,
  XCircle,
  Info,
  CircleHelp,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { JobStatusCard, UploadModal } from "@/components/upload";
import {
  DocumentPageSkeleton,
  DocumentEmptyState,
  SignatureInfoPanel,
  type SignInfo,
} from "@/components/document";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSignaturePlacement } from "@/hooks/use-signature-placement";
import {
  CreateJobResponseSchema,
  JobStatusResponseSchema,
} from "@/lib/job-status";
import { SIGNATURE_TEMPLATES } from "@/lib/signature-templates";
import { SignatureTemplateSelector } from "@/components/signature/SignatureTemplateSelector";
import { SignaturePlacementFields } from "@/components/signature/SignaturePlacementFields";
import { CreateContractModal } from "@/components/contract/CreateContractModal";
import { getPdfViewerUrl } from "@/lib/pdf-view-url";
import { SignerEnvironmentChecklist, SigningFlowGuideDialog } from "@/components/signing";
import { cn } from "@/lib/utils";
import { trackGaEvent } from "@/lib/analytics";
import { isWindowsClient, launchSignerWithFallback } from "@/lib/signer-launch";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const CREATED_HINT_AFTER_MS = 60 * 1000;

interface DocumentData {
  document: {
    id: string;
    publicId: string;
    title: string;
    status: string;
    createdAt: string;
  };
  currentVersion: {
    version: number;
    sizeBytes: number;
    createdAt: string;
  };
  presignedUrl: string;
  viewUrl?: string;
  signInfo?: SignInfo | null;
}

/** Format ISO to HH:mm dd/MM/yyyy (VN timezone) */
function formatSigningTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const h = d.toLocaleString("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const date = d.toLocaleString("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    return `${h} ${date}`;
  } catch {
    return iso;
  }
}

function StatusBadge({
  status,
  signedAt,
}: {
  status: "pending" | "signed" | "unsigned";
  signedAt?: string;
}) {
  const variant =
    status === "signed"
      ? "success"
      : status === "pending"
        ? "warning"
        : "secondary";
  const label =
    status === "signed"
      ? "Đã ký"
      : status === "pending"
        ? "Đang chờ ký"
        : "Chưa ký";
  return (
    <div className="flex items-center gap-2">
      <Badge variant={variant}>{label}</Badge>
      {status === "signed" && signedAt && (
        <span className="text-xs text-muted-foreground">
          {formatSigningTime(signedAt)}
        </span>
      )}
    </div>
  );
}

export default function SigningViewerPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const params = useParams();
  const publicId = params.publicId as string;
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [data, setData] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const [jobState, setJobState] = useState<{
    jobId: string;
    deepLink: string;
    status: "CREATED" | "COMPLETED" | "EXPIRED" | "CANCELED";
    signedDownloadUrl: string | null;
    cacheBustAt?: number;
    error: "expired" | "timeout" | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [signerDownloadModalOpen, setSignerDownloadModalOpen] = useState(false);
  const [signingGuideOpen, setSigningGuideOpen] = useState(false);
  const pollStartRef = useRef<number | null>(null);
  /** Mỗi phiên bản tài liệu chỉ cuộn tới trang cuối một lần khi PDF đã biết số trang. */
  const scrollSigningDocToLastRef = useRef<string | null>(null);
  const pdfMetaRef = useRef<{ publicId: string; version: number } | null>(
    null
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState("valid");
  const [sealImageBase64, setSealImageBase64] = useState<string | null>(null);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [mobileDocTab, setMobileDocTab] = useState("document");
  const [pageMode, setPageMode] = useState<"last" | "custom">("last");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const searchParams = useSearchParams();
  const isWindows = isWindowsClient();

  const {
    placements,
    defaultPlacementEnabled,
    toggleDefaultPlacement,
    addSignatureBox,
    updatePlacement,
    updatePlacementFromPixels,
  } = useSignaturePlacement(totalPages);

  const [placementEditorIdx, setPlacementEditorIdx] = useState(0);
  const safePlacementEditorIdx =
    placements.length === 0
      ? 0
      : Math.min(placementEditorIdx, placements.length - 1);

  const versionParam = searchParams.get("v");
  const fetchDocument = useCallback(
    async (version?: number) => {
      if (!publicId) return null;
      const url =
        version != null
          ? `/api/documents/${publicId}?v=${version}`
          : `/api/documents/${publicId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Document not found");
      const json = await res.json();
      setData(json);
      return json;
    },
    [publicId]
  );

  useEffect(() => {
    if (!publicId) {
      setLoading(false);
      return;
    }
    const v = versionParam ? parseInt(versionParam, 10) : undefined;
    fetchDocument(Number.isNaN(v) ? undefined : v)
      .catch((err) => {
        setError(err.message);
        toast.error(err.message ?? "Không tìm thấy tài liệu");
      })
      .finally(() => setLoading(false));
  }, [publicId, versionParam, fetchDocument]);

  const docVersionForScrollKey = data
    ? `${publicId}-v${data.currentVersion.version}`
    : null;

  useEffect(() => {
    if (!data) return;
    const v = data.currentVersion.version;
    const prev = pdfMetaRef.current;
    if (
      prev &&
      (prev.publicId !== publicId || prev.version !== v)
    ) {
      setTotalPages(0);
    }
    pdfMetaRef.current = { publicId, version: v };
  }, [publicId, data]);

  useEffect(() => {
    if (!docVersionForScrollKey || totalPages < 1) return;
    if (scrollSigningDocToLastRef.current === docVersionForScrollKey) return;
    scrollSigningDocToLastRef.current = docVersionForScrollKey;
    setCurrentPage(totalPages);
    setMobileDocTab("document");
    const scroll = () => {
      document
        .querySelector(`[data-pdf-page="${totalPages}"]`)
        ?.scrollIntoView({ behavior: "auto", block: "center" });
    };
    const t1 = window.setTimeout(scroll, 80);
    const t2 = window.setTimeout(scroll, 320);
    const t3 = window.setTimeout(scroll, 650);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [docVersionForScrollKey, totalPages]);

  const handleTotalPagesChange = useCallback((n: number) => {
    setTotalPages(n);
  }, []);

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

  const handleSign = async () => {
    if (placements.length === 0 || !data) return;
    trackGaEvent("sign_start_clicked", {
      surface: "shared_signing_page",
      template_id: selectedTemplateId,
      placement_count: placements.length,
    });
    const placement = placements[safePlacementEditorIdx];
    if (!placement) return;
    const page =
      placement.page === totalPages ? ("LAST" as const) : placement.page;

    // Convert UI coords (top-left origin) to PDF rectPct (bottom-left origin)
    const pdfY = 1 - placement.yPct - placement.hPct;
    const jobBody: Record<string, unknown> = {
      documentId: data.document.id,
      templateId: selectedTemplateId,
      placement: {
        page,
        rectPct: {
          x: placement.xPct,
          y: Math.max(0, Math.min(1, pdfY)),
          w: placement.wPct,
          h: placement.hPct,
        },
      },
    };
    if (selectedTemplateId === "seal" && sealImageBase64) {
      jobBody.sealImage = sealImageBase64;
    }
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobBody),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 402 && err.code === "QUOTA_EXCEEDED") {
        toast.error(err.error ?? "Đã đạt giới hạn 50 file/tháng", {
          action: { label: "Xem gói", onClick: () => window.open("/dashboard?tab=usage", "_self") },
        });
        return;
      }
      toast.error(err.error ?? "Tạo phiên ký thất bại");
      return;
    }

    const raw = await res.json();
    const parsed = CreateJobResponseSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("Invalid create job response", parsed.error);
      return;
    }

    const { jobId, deepLink } = parsed.data;
    trackGaEvent("sign_job_created", {
      surface: "shared_signing_page",
      template_id: selectedTemplateId,
    });
    setJobState({
      jobId,
      deepLink,
      status: "CREATED",
      signedDownloadUrl: null,
      error: null,
    });
    pollStartRef.current = Date.now();
    toast.success("Đã tạo phiên ký. Mở Signer để ký số.");
    launchSignerWithFallback({
      deepLink,
      onFallback: () => {
        trackGaEvent("signer_launch_fallback_shown", {
          surface: "shared_signing_page",
        });
        setSignerDownloadModalOpen(true);
      },
      onLikelyOpened: () => {
        trackGaEvent("signer_launch_likely_opened", {
          surface: "shared_signing_page",
        });
      },
    });
  };

  const copyDeepLink = () => {
    if (!jobState) return;
    navigator.clipboard.writeText(jobState.deepLink);
    setCopied(true);
    toast.success("Đã sao chép liên kết ký");
    setTimeout(() => setCopied(false), 2000);
  };

  const copyShareLink = () => {
    if (typeof window === "undefined" || !publicId) return;
    const link = `${window.location.origin}/d/${publicId}`;
    navigator.clipboard.writeText(link);
    setShareLinkCopied(true);
    toast.success("Đã sao chép liên kết chia sẻ");
    setTimeout(() => setShareLinkCopied(false), 2000);
  };

  const resetJobState = () => {
    setJobState(null);
    pollStartRef.current = null;
  };


  useEffect(() => {
    if (!jobState || jobState.status !== "CREATED") return;

    const poll = async () => {
      const res = await fetch(`/api/jobs/${jobState.jobId}/status`);
      if (!res.ok) return;

      const raw = await res.json();
      const parsed = JobStatusResponseSchema.safeParse(raw);
      if (!parsed.success) return;

      const { status, signedDownloadUrl } = parsed.data;

      if (status === "COMPLETED" && signedDownloadUrl) {
        trackGaEvent("sign_completed", {
          surface: "shared_signing_page",
        });
        await fetchDocument();
        setJobState((prev) =>
          prev
            ? {
                ...prev,
                status,
                signedDownloadUrl,
                cacheBustAt: Date.now(),
                error: null,
              }
            : null
        );
        setSignerDownloadModalOpen(false);
        toast.success("Đã ký xong. Có thể tải PDF đã ký.");
        return;
      }

      if (status === "EXPIRED") {
        trackGaEvent("sign_failed", {
          surface: "shared_signing_page",
          reason: "job_expired",
        });
        setJobState((prev) =>
          prev ? { ...prev, status, error: "expired" } : null
        );
        return;
      }

      const elapsed = Date.now() - (pollStartRef.current ?? Date.now());
      if (elapsed >= POLL_TIMEOUT_MS) {
        trackGaEvent("sign_failed", {
          surface: "shared_signing_page",
          reason: "poll_timeout",
        });
        setJobState((prev) =>
          prev ? { ...prev, error: "timeout" } : null
        );
        return;
      }

      setJobState((prev) => (prev ? { ...prev, status } : null));
    };

    const id = setInterval(poll, POLL_INTERVAL_MS);
    poll();
    return () => clearInterval(id);
  }, [jobState?.jobId, jobState?.status, fetchDocument]);

  const goToPdfPage = useCallback((p: number) => {
    setCurrentPage(p);
    setMobileDocTab("document");
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-pdf-page="${p}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const onPlacementPageChange = useCallback(
    (idx: number, page: number) => {
      updatePlacement(idx, { page });
      goToPdfPage(page);
    },
    [updatePlacement, goToPdfPage]
  );

  const pageForNewBox = useCallback(() => {
    if (pageMode === "last" && totalPages > 0) return totalPages;
    if (currentPage >= 1 && currentPage <= totalPages) return currentPage;
    return undefined;
  }, [pageMode, totalPages, currentPage]);

  const activateLastPageMode = useCallback(() => {
    setPageMode("last");
    if (totalPages > 0 && placements.length > 0) {
      const idx = Math.min(placementEditorIdx, placements.length - 1);
      updatePlacement(idx, { page: totalPages });
      goToPdfPage(totalPages);
    }
  }, [
    totalPages,
    placements.length,
    placementEditorIdx,
    updatePlacement,
    goToPdfPage,
  ]);

  const activePlacement = placements[safePlacementEditorIdx];
  const activePage = activePlacement?.page ?? currentPage;
  const pollElapsed =
    jobState && pollStartRef.current
      ? Date.now() - pollStartRef.current
      : 0;
  const showCreatedHint =
    jobState?.status === "CREATED" && pollElapsed >= CREATED_HINT_AFTER_MS;

  if (loading) {
    return <DocumentPageSkeleton />;
  }

  if (error || !data) {
    return (
      <DocumentEmptyState
        title="Không tìm thấy tài liệu"
        description={error ?? "Tài liệu không tồn tại hoặc đã bị xóa."}
      />
    );
  }

  const { document: doc, currentVersion, presignedUrl, viewUrl } = data;
  const basePdfUrl = getPdfViewerUrl(presignedUrl, viewUrl);
  const cacheBust =
    jobState?.status === "COMPLETED" && jobState.cacheBustAt
      ? (basePdfUrl.includes("?") ? "&" : "?") + "t=" + jobState.cacheBustAt
      : "";
  const pdfUrl = basePdfUrl + cacheBust;

  const isSigned = currentVersion.version >= 2 || jobState?.status === "COMPLETED";
  const signingFlowComplete = isSigned;

  const completedDownloadPath = `/api/documents/${publicId}/download?v=${currentVersion.version}`;

  const JobStatusCardContent = jobState ? (
    <JobStatusCard
      status={jobState.status}
      deepLink={jobState.deepLink}
      signedDownloadUrl={jobState.signedDownloadUrl}
      downloadLink={
        jobState.status === "COMPLETED"
          ? typeof window !== "undefined"
            ? `${window.location.origin}${completedDownloadPath}`
            : completedDownloadPath
          : undefined
      }
      error={jobState.error}
      onCopyDeepLink={copyDeepLink}
      onCopyShareLink={copyShareLink}
      copied={copied}
      shareLinkCopied={shareLinkCopied}
      shareLink={
        jobState.status === "COMPLETED" && typeof window !== "undefined"
          ? `${window.location.origin}/d/${publicId}`
          : undefined
      }
      viewLink={
        jobState.status === "COMPLETED" && typeof window !== "undefined"
          ? `${window.location.origin}${completedDownloadPath}`
          : undefined
      }
      onReset={resetJobState}
      documentTitle={doc.title ?? "signed.pdf"}
      showCreatedHint={showCreatedHint}
      signInfo={jobState.status === "COMPLETED" ? data.signInfo : undefined}
      onShowDownloadHelp={() => setSignerDownloadModalOpen(true)}
      onSignNewDocument={isSigned ? () => setUploadModalOpen(true) : undefined}
    />
  ) : isSigned ? (
    <JobStatusCard
      status="COMPLETED"
      downloadLink={completedDownloadPath}
      onCopyShareLink={copyShareLink}
      shareLinkCopied={shareLinkCopied}
      shareLink={
        typeof window !== "undefined"
          ? `${window.location.origin}/d/${publicId}`
          : undefined
      }
      documentTitle={doc.title ?? "signed.pdf"}
      signInfo={data.signInfo ?? undefined}
      onSignNewDocument={() => setUploadModalOpen(true)}
    />
  ) : null;

  const handleFooterBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

  const handleFooterCancel = () => {
    if (jobState) resetJobState();
    router.push("/dashboard");
  };

  const pageThumbnailButtons = Array.from(
    { length: Math.max(totalPages, 1) },
    (_, i) => (
      <button
        key={i}
        type="button"
        onClick={() => goToPdfPage(i + 1)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-all duration-150",
          currentPage === i + 1
            ? "border-primary bg-primary/10 ring-1 ring-primary/20"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
        )}
      >
        <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-medium text-slate-500">
          {i + 1}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-800">Trang {i + 1}</span>
          {totalPages > 0 && i + 1 === totalPages && (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              Trang cuối
            </span>
          )}
        </div>
      </button>
    )
  );

  const signingLeftConfig = !isSigned ? (
    <>
      <SignatureTemplateSelector
        variant="stitch"
        templates={SIGNATURE_TEMPLATES}
        selectedId={selectedTemplateId}
        onSelect={(id) => {
          setSelectedTemplateId(id);
          if (placements.length === 0 && totalPages > 0) {
            addSignatureBox(pageForNewBox());
          }
        }}
        sealImageBase64={sealImageBase64}
        onSealImageChange={setSealImageBase64}
      />
      <div>
        <label className="mb-4 block text-[11px] font-bold uppercase tracking-widest text-slate-400">
          Chọn trang ký
        </label>
        <div className="mb-3 flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={activateLastPageMode}
            className={cn(
              "flex-1 rounded-md py-2 text-xs font-bold transition-colors",
              pageMode === "last"
                ? "bg-white text-primary shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            Trang cuối
          </button>
          <button
            type="button"
            onClick={() => setPageMode("custom")}
            className={cn(
              "flex-1 rounded-md py-2 text-xs font-bold transition-colors",
              pageMode === "custom"
                ? "bg-white text-primary shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            Tùy chọn
          </button>
        </div>
        {pageMode === "last" ? (
          <div className="relative">
            <FileText className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              readOnly
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700"
              value={
                totalPages > 0
                  ? `Trang ${totalPages} (Trang cuối)`
                  : "Đang tải số trang..."
              }
            />
          </div>
        ) : (
          <SignaturePlacementFields
            placements={placements}
            totalPages={totalPages}
            selectedIdx={safePlacementEditorIdx}
            onSelectIdx={setPlacementEditorIdx}
            onPlacementPageChange={onPlacementPageChange}
            lang="vi"
          />
        )}
      </div>
      <div className="border-t border-slate-100 pt-6">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-black"
        >
          <Settings2 className="size-4" />
          Cấu hình nâng cao
        </button>
        {advancedOpen && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
              <Label htmlFor="default-placement-d">Vị trí mặc định</Label>
              <button
                id="default-placement-d"
                type="button"
                role="switch"
                aria-checked={defaultPlacementEnabled}
                onClick={toggleDefaultPlacement}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-slate-200 transition-colors",
                  defaultPlacementEnabled ? "bg-primary" : "bg-slate-200"
                )}
              >
                <span
                  className={cn(
                    "inline-block size-3.5 rounded-full bg-white shadow transition-transform",
                    defaultPlacementEnabled ? "translate-x-4" : "translate-x-1"
                  )}
                />
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-lg border-slate-200"
              onClick={() => addSignatureBox(pageForNewBox())}
            >
              Thêm ô chữ ký
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-lg border-slate-200"
              onClick={() => setContractModalOpen(true)}
            >
              <Users className="size-4" />
              Gửi ký nhiều bên
            </Button>
          </div>
        )}
      </div>
    </>
  ) : (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-800">
        Tài liệu đã được ký hoặc đang xem bản đã ký.
      </p>
      <Button
        className="w-full rounded-lg bg-primary text-primary-foreground shadow-md hover:bg-[var(--signing-kyso-hover)]"
        onClick={() => setUploadModalOpen(true)}
      >
        <FilePlus className="size-4" />
        Ký tài liệu mới
      </Button>
    </div>
  );

  const signingRightAside = (
    <div className="flex flex-col gap-4">
      {JobStatusCardContent && (
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          {JobStatusCardContent}
        </div>
      )}
      {data.signInfo && <SignatureInfoPanel signInfo={data.signInfo} />}
      {!isSigned && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Usb className="size-5 text-primary" />
            <span className="text-sm font-bold text-slate-900">USB Token</span>
            <span
              className="ml-auto size-2 rounded-full bg-emerald-500"
              title="Sẵn sàng"
              aria-hidden
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Cắm USB Token. Khi bấm Ký, trình duyệt mở PDFSignPro Signer để hoàn tất ký số.
          </p>
          <button
            type="button"
            className="mt-2 text-left text-xs font-semibold text-primary underline-offset-2 hover:underline"
            onClick={() => setSigningGuideOpen(true)}
          >
            Hướng dẫn từng bước &amp; tải Signer
          </button>
        </div>
      )}
      {!isSigned && <SignerEnvironmentChecklist />}
      {!isSigned && (
        <div className="rounded-xl border border-[var(--signing-kyso-info-border)] bg-[var(--signing-kyso-info-bg)] p-4">
          <div className="flex gap-3">
            <Info className="size-5 shrink-0 text-primary" aria-hidden />
            <p className="text-[11px] font-medium leading-relaxed text-[var(--signing-kyso-info-text)]">
              Quý khách vui lòng kiểm tra kỹ nội dung văn bản trước khi thực hiện thao tác ký số.
              Chữ ký số có giá trị pháp lý tương đương chữ ký tay và con dấu.
            </p>
          </div>
        </div>
      )}
      <div>
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
          Trang
        </h3>
        <div className="space-y-2">{pageThumbnailButtons}</div>
      </div>
    </div>
  );

  const renderPdfViewer = () => (
    <PdfViewer
      key={`pdf-v${currentVersion.version}`}
      pdfUrl={pdfUrl}
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      scale={scale}
      onScaleChange={setScale}
      totalPages={totalPages}
      onTotalPagesChange={handleTotalPagesChange}
      placements={placements}
      onPlacementUpdate={handlePlacementUpdate}
      activePageForPlacement={activePage}
      readOnly={isSigned}
      selectedTemplateId={selectedTemplateId}
      sealImageBase64={sealImageBase64}
      continuousScroll
      signatureChrome="stitch"
    />
  );

  return (
    <div className="signing-page-kyso flex h-screen min-h-0 flex-col overflow-hidden bg-slate-100 text-slate-900">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 shadow-sm sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary">
              <Shield className="size-4 text-primary-foreground" />
            </div>
            <span className="hidden text-lg font-extrabold tracking-tight text-primary sm:inline">
              PDFSignPro
            </span>
          </Link>
          <div className="hidden h-6 w-px bg-slate-200 lg:block" />
          <div className="hidden min-w-0 flex-1 flex-col lg:flex lg:max-w-md">
            <p className="truncate text-sm font-medium text-slate-800">{doc.title}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="rounded-md px-2 py-0 text-[10px] font-medium"
              >
                v{currentVersion.version}
              </Badge>
              <StatusBadge
                status={
                  jobState?.status === "CREATED"
                    ? "pending"
                    : currentVersion.version >= 2
                      ? "signed"
                      : "unsigned"
                }
                signedAt={data.signInfo?.signingTime}
              />
            </div>
          </div>
          <div className="hidden h-6 w-px bg-slate-200 xl:block" />
          <div className="hidden items-center gap-6 xl:flex">
            <div className="flex items-center gap-2 text-slate-400">
              <span className="flex size-6 items-center justify-center rounded-full border border-slate-300 text-xs font-bold">
                1
              </span>
              <span className="text-xs font-bold uppercase tracking-wider">
                Tải lên
              </span>
            </div>
            <div
              className={cn(
                "flex items-center gap-2 border-b-2 pb-1",
                !signingFlowComplete
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-400"
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs font-bold",
                  !signingFlowComplete
                    ? "bg-primary text-white"
                    : "border border-slate-300"
                )}
              >
                2
              </span>
              <span className="text-xs font-bold uppercase tracking-wider">
                Thiết lập & Ký
              </span>
            </div>
            <div
              className={cn(
                "flex items-center gap-2 border-b-2 pb-1",
                signingFlowComplete
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-400"
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs font-bold",
                  signingFlowComplete
                    ? "bg-primary text-white"
                    : "border border-slate-300"
                )}
              >
                3
              </span>
              <span className="text-xs font-bold uppercase tracking-wider">
                Hoàn tất
              </span>
            </div>
          </div>
        </div>
        <nav className="flex shrink-0 items-center gap-2 sm:gap-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-slate-200 px-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => setSigningGuideOpen(true)}
          >
            <CircleHelp className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="hidden sm:inline">Hướng dẫn ký</span>
          </Button>
          <Link
            href="/dashboard"
            className="hidden text-sm font-semibold text-slate-600 transition-colors hover:text-primary sm:inline"
          >
            Tài liệu của tôi
          </Link>
          {session?.user && (
            <div className="hidden items-center gap-3 border-l border-slate-200 pl-3 sm:flex sm:pl-4">
              <div className="text-right">
                <p className="text-xs font-bold leading-none text-slate-800">
                  {session.user.name ?? "Tài khoản"}
                </p>
                {session.user.email && (
                  <p className="mt-0.5 max-w-[140px] truncate text-[10px] text-slate-500">
                    {session.user.email}
                  </p>
                )}
              </div>
              <div className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100">
                <User className="size-4 text-slate-600" />
              </div>
            </div>
          )}
        </nav>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden pt-16 pb-28 sm:pb-24">
        <div className="hidden min-h-0 flex-1 lg:flex lg:overflow-hidden">
          <aside className="z-10 flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-white shadow-sm">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="space-y-8 p-6">{signingLeftConfig}</div>
            </div>
            <div className="border-t border-slate-200 bg-slate-50 p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-xs font-bold leading-tight text-slate-900">
                    Môi trường bảo mật
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Kết nối SSL 256-bit mã hóa toàn bộ dữ liệu ký.
                  </p>
                </div>
              </div>
            </div>
          </aside>

          <section className="signing-pdf-canvas flex min-h-0 flex-1 flex-col overflow-auto p-6 sm:p-8 lg:p-10">
            <div className="signing-document-shadow mx-auto w-full max-w-4xl overflow-hidden rounded-lg bg-white">
              {renderPdfViewer()}
            </div>
          </section>

          <aside className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            {signingRightAside}
          </aside>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:hidden">
          <Tabs
            value={mobileDocTab}
            onValueChange={setMobileDocTab}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-b border-slate-200 bg-white px-3">
              <TabsList className="grid h-11 w-full grid-cols-3 bg-slate-100 p-1">
                <TabsTrigger
                  value="timeline"
                  className="rounded-md text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm"
                >
                  Thiết lập
                </TabsTrigger>
                <TabsTrigger
                  value="document"
                  className="rounded-md text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm"
                >
                  Tài liệu
                </TabsTrigger>
                <TabsTrigger
                  value="pages"
                  className="rounded-md text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm"
                >
                  Trang & trạng thái
                </TabsTrigger>
              </TabsList>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-slate-50">
              <TabsContent
                value="timeline"
                className="m-0 h-full overflow-y-auto p-4 data-[state=inactive]:hidden"
              >
                <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  {signingLeftConfig}
                </div>
              </TabsContent>
              <TabsContent
                value="document"
                className="m-0 flex h-full min-h-0 flex-1 flex-col p-0 data-[state=inactive]:hidden"
              >
                <div className="signing-pdf-canvas flex min-h-0 flex-1 flex-col overflow-auto p-3">
                  <div className="signing-document-shadow mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-hidden rounded-lg bg-white">
                    {renderPdfViewer()}
                  </div>
                </div>
              </TabsContent>
              <TabsContent
                value="pages"
                className="m-0 h-full overflow-y-auto p-4 data-[state=inactive]:hidden"
              >
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  {signingRightAside}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-40 flex min-h-24 flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-8 sm:py-0">
        <div className="flex items-center gap-2 sm:gap-0">
          <button
            type="button"
            onClick={handleFooterBack}
            className="flex h-16 w-[5.5rem] flex-col items-center justify-center text-slate-400 transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-6 shrink-0" strokeWidth={1.75} />
            <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">
              Quay lại
            </span>
          </button>
          <div className="mx-1 hidden h-8 w-px bg-slate-100 sm:mx-2 sm:block" />
          <button
            type="button"
            onClick={handleFooterCancel}
            className="flex h-16 w-[5.5rem] flex-col items-center justify-center text-slate-400 transition-colors hover:text-red-500"
          >
            <XCircle className="size-6 shrink-0" strokeWidth={1.75} />
            <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">
              Hủy bỏ
            </span>
          </button>
        </div>
        <div className="flex flex-1 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-6">
          <div className="text-center sm:hidden">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {isSigned ? "Đã hoàn tất" : "Đang thực hiện ký"}
            </p>
            <p className="truncate text-xs font-black text-primary">{doc.title}</p>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              {isSigned ? "Đã hoàn tất" : "Đang thực hiện ký"}
            </p>
            <p className="truncate text-sm font-black text-primary sm:max-w-[14rem] md:max-w-xs lg:max-w-md">
              {doc.title}
            </p>
          </div>
          {!isSigned ? (
            <button
              type="button"
              onClick={handleSign}
              disabled={placements.length === 0 || !!jobState}
              className={cn(
                "group flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 py-4 text-white shadow-[0_25px_50px_-12px_rgba(0,71,187,0.4)] transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none sm:w-auto sm:gap-4 sm:px-10 sm:py-5",
                "hover:bg-[var(--signing-kyso-hover)]"
              )}
            >
              <div className="rounded-lg bg-white/20 p-2 transition-transform group-hover:scale-105">
                <Usb className="size-6 shrink-0 sm:size-7" strokeWidth={2.25} />
              </div>
              <div className="min-w-0 flex-1 text-left sm:flex-none">
                <span className="mb-1 block text-[10px] font-black uppercase leading-none tracking-[0.2em] text-white/80">
                  Xác nhận thực hiện
                </span>
                <span className="block text-base font-black uppercase leading-none sm:text-lg">
                  Ký với USB Token
                </span>
              </div>
              <ChevronRight
                className="ml-1 size-7 shrink-0 opacity-90 sm:size-8"
                strokeWidth={2}
                aria-hidden
              />
            </button>
          ) : (
            <Button
              type="button"
              className="rounded-2xl px-8 py-5 text-base font-bold shadow-[0_25px_50px_-12px_rgba(0,71,187,0.35)] bg-primary text-primary-foreground hover:bg-[var(--signing-kyso-hover)]"
              onClick={() => setUploadModalOpen(true)}
            >
              <FilePlus className="size-5" />
              Ký tài liệu mới
            </Button>
          )}
          {!isSigned && !isWindows && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:max-w-xs">
              PDFSignPro Signer hiện hỗ trợ Windows. Vui lòng ký trên máy Windows có USB Token.
            </div>
          )}
        </div>
      </footer>

      <UploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
      />

      <CreateContractModal
        open={contractModalOpen}
        onOpenChange={setContractModalOpen}
        documentId={doc.id}
        documentTitle={doc.title ?? "Hợp đồng"}
        totalPages={totalPages}
      />

      <SigningFlowGuideDialog
        open={signingGuideOpen}
        onOpenChange={setSigningGuideOpen}
      />

      <Dialog open={signerDownloadModalOpen} onOpenChange={setSignerDownloadModalOpen}>
        <DialogContent className="sm:max-w-md shadow-xl ring-1 ring-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Download className="size-5 text-primary" />
              Chưa mở được ứng dụng ký số?
            </DialogTitle>
            <DialogDescription className="text-base pt-1">
              Có thể máy tính chưa cài PDFSignPro Signer. Tải và cài đặt ứng dụng (Windows) để ký số PDF bằng USB Token.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <Button
              variant="outline"
              onClick={() => setSignerDownloadModalOpen(false)}
            >
              Đóng
            </Button>
            {jobState?.deepLink && (
              <Button
                variant="outline"
                onClick={() => {
                  trackGaEvent("signer_reopen_clicked", {
                    surface: "shared_signing_page",
                  });
                  launchSignerWithFallback({
                    deepLink: jobState.deepLink,
                    onFallback: () => setSignerDownloadModalOpen(true),
                  })
                }}
              >
                <ExternalLink className="size-4" />
                Mở Signer lại
              </Button>
            )}
            <Button
              onClick={() => {
                window.open("/api/signer/download", "_blank");
                setSignerDownloadModalOpen(false);
              }}
            >
              <Download className="size-4" />
              Tải PDFSignPro Signer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
