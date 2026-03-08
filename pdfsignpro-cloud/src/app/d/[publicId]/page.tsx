"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Download,
  X,
  PenLine,
  Monitor,
  Share2,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { JobStatusCard } from "@/components/upload";
import {
  DocumentPageSkeleton,
  DocumentEmptyState,
  SignatureInfoPanel,
  type SignInfo,
} from "@/components/document";
import { useSignaturePlacement } from "@/hooks/use-signature-placement";
import {
  CreateJobResponseSchema,
  JobStatusResponseSchema,
} from "@/lib/job-status";

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

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "SIGNED"
      ? "success"
      : status === "ACTIVE"
        ? "warning"
        : "secondary";
  const label =
    status === "SIGNED"
      ? "Đã ký"
      : status === "ACTIVE"
        ? "Đang chờ"
        : status;
  return <Badge variant={variant}>{label}</Badge>;
}

export default function SigningViewerPage() {
  const params = useParams();
  const publicId = params.publicId as string;
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
  const pollStartRef = useRef<number | null>(null);
  const searchParams = useSearchParams();

  const {
    placements,
    defaultPlacementEnabled,
    toggleDefaultPlacement,
    addSignatureBox,
    updatePlacementFromPixels,
  } = useSignaturePlacement(totalPages);

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
    const placement = placements[0];
    const page =
      placement.page === totalPages ? ("LAST" as const) : placement.page;

    // Convert UI coords (top-left origin) to PDF rectPct (bottom-left origin)
    const pdfY = 1 - placement.yPct - placement.hPct;
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: data.document.id,
        placement: {
          page,
          rectPct: {
            x: placement.xPct,
            y: Math.max(0, Math.min(1, pdfY)),
            w: placement.wPct,
            h: placement.hPct,
          },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
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
    setJobState({
      jobId,
      deepLink,
      status: "CREATED",
      signedDownloadUrl: null,
      error: null,
    });
    pollStartRef.current = Date.now();
    toast.success("Đã tạo phiên ký. Mở Signer để ký số.");
    window.location.href = deepLink;
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

  const copyDocumentLink = () => {
    if (typeof window === "undefined" || !publicId) return;
    const link = `${window.location.origin}/d/${publicId}`;
    navigator.clipboard.writeText(link);
    toast.success("Đã sao chép liên kết");
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
        toast.success("Đã ký xong. Có thể tải PDF đã ký.");
        return;
      }

      if (status === "EXPIRED") {
        setJobState((prev) =>
          prev ? { ...prev, status, error: "expired" } : null
        );
        return;
      }

      const elapsed = Date.now() - (pollStartRef.current ?? Date.now());
      if (elapsed >= POLL_TIMEOUT_MS) {
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

  const activePlacement = placements[0];
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
  const basePdfUrl = viewUrl ?? presignedUrl;
  const cacheBust =
    jobState?.status === "COMPLETED" && jobState.cacheBustAt
      ? (basePdfUrl.includes("?") ? "&" : "?") + "t=" + jobState.cacheBustAt
      : "";
  const pdfUrl = basePdfUrl + cacheBust;
  // Download URL: use download endpoint to force download (Chrome/Edge)
  const downloadUrl = `/api/documents/${publicId}/download?v=${currentVersion.version}`;

  const SigningPanel = () => (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">
        Chữ ký số
      </h3>
      <Button
        variant="outline"
        size="sm"
        onClick={addSignatureBox}
        className="w-full rounded-md"
      >
        Thêm ô chữ ký
      </Button>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="default-placement">Vị trí mặc định</Label>
        <button
          id="default-placement"
          type="button"
          role="switch"
          aria-checked={defaultPlacementEnabled}
          onClick={toggleDefaultPlacement}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors ${
            defaultPlacementEnabled ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`${
              defaultPlacementEnabled ? "translate-x-4" : "translate-x-1"
            } inline-block size-3.5 rounded-full bg-background transition-transform`}
          />
        </button>
      </div>
      {activePlacement && (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p>Trang: {activePlacement.page}</p>
          <p>
            Ô: {Math.round(activePlacement.wPct * 100)}% ×{" "}
            {Math.round(activePlacement.hPct * 100)}%
          </p>
        </div>
      )}
      <Button
        onClick={handleSign}
        disabled={placements.length === 0 || !!jobState}
        className="w-full rounded-md"
      >
        <PenLine className="size-4" />
        Ký số
      </Button>
    </div>
  );

  const JobStatusCardContent = jobState ? (
    <JobStatusCard
      status={jobState.status}
      deepLink={jobState.deepLink}
      signedDownloadUrl={jobState.signedDownloadUrl}
      downloadLink={
        jobState.status === "COMPLETED" && typeof window !== "undefined"
          ? `${window.location.origin}/api/documents/${publicId}/download?v=${currentVersion.version}`
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
          ? `${window.location.origin}/api/documents/${publicId}/download?v=${currentVersion.version}`
          : undefined
      }
      onReset={resetJobState}
      documentTitle={doc.title ?? "signed.pdf"}
      showCreatedHint={showCreatedHint}
      signInfo={jobState.status === "COMPLETED" ? data.signInfo : undefined}
    />
  ) : null;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-2.5 bg-background/95">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="truncate text-[15px] font-medium text-foreground">
            {doc.title}
          </h2>
          <Badge variant="outline" className="shrink-0 text-[11px] font-medium px-2 py-0 rounded-md">
            v{currentVersion.version}
          </Badge>
          <StatusBadge status={doc.status} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
            <a href="/api/signer/download">
              <Monitor className="size-4" />
              Tải Signer
            </a>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyDocumentLink}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Chia sẻ"
          >
            <Share2 className="size-4" />
            Chia sẻ
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={downloadUrl} download={doc.title ?? "document.pdf"}>
              <Download className="size-4" />
              Tải PDF
            </a>
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="Đóng" className="text-muted-foreground hover:text-foreground">
            <Link href="/">
              <X className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="hidden lg:grid lg:grid-cols-[320px_1fr_280px] lg:h-full">
          <div className="border-r border-border p-4 flex flex-col min-h-0 overflow-y-auto">
            <div className="space-y-4 pr-4">
              {JobStatusCardContent && (
                <div className="sticky top-4 z-10 -mt-1 pt-1 bg-background/95 backdrop-blur-sm rounded-lg">
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Trạng thái ký
                  </h3>
                  {JobStatusCardContent}
                </div>
              )}
              {data.signInfo && (
                <SignatureInfoPanel signInfo={data.signInfo} />
              )}
              <SigningPanel />
            </div>
          </div>
          <div className="overflow-hidden">
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
            />
          </div>
          <div className="border-l border-border p-4 overflow-y-auto flex flex-col min-h-0">
            <div className="space-y-4 pr-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Trang
                </h3>
                <div className="space-y-2">
                  {Array.from({ length: Math.max(totalPages, 1) }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrentPage(i + 1)}
                      className={`flex w-full items-center gap-3 rounded-md border p-2 text-left transition-all duration-150 ${
                        currentPage === i + 1
                          ? "border-primary bg-primary/10 ring-1 ring-primary/20"
                          : "border-border hover:border-muted-foreground/30 hover:bg-accent/50"
                      }`}
                    >
                      <div className="size-12 shrink-0 rounded-md bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                        {i + 1}
                      </div>
                      <span className="text-sm">Trang {i + 1}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:hidden h-full">
          <Tabs defaultValue="document" className="h-full flex flex-col">
            <div className="border-b border-border px-4">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="timeline">Chữ ký</TabsTrigger>
                <TabsTrigger value="document">Tài liệu</TabsTrigger>
                <TabsTrigger value="pages">Pages</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 overflow-auto">
              <TabsContent value="timeline" className="m-0 p-4 h-full overflow-y-auto">
                <div className="space-y-4">
                  {JobStatusCardContent && (
                    <div className="sticky top-0 z-10 -mt-1 pt-1 pb-4 bg-background/95 backdrop-blur-sm">
                      <h3 className="text-sm font-semibold text-foreground mb-3">
                        Trạng thái ký
                      </h3>
                      {JobStatusCardContent}
                    </div>
                  )}
                  {data.signInfo && (
                    <SignatureInfoPanel signInfo={data.signInfo} />
                  )}
                  <SigningPanel />
                </div>
              </TabsContent>
              <TabsContent value="document" className="m-0 p-0 h-full">
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
                />
              </TabsContent>
              <TabsContent value="pages" className="m-0 p-4 h-full overflow-auto">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">
                      Trang
                    </h3>
                    <div className="space-y-2">
                      {Array.from({ length: Math.max(totalPages, 1) }, (_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setCurrentPage(i + 1)}
                          className={`flex w-full items-center gap-3 rounded-md border p-2 text-left transition-all duration-150 ${
                            currentPage === i + 1
                              ? "border-primary bg-primary/10 ring-1 ring-primary/20"
                              : "border-border hover:border-muted-foreground/30 hover:bg-accent/50"
                          }`}
                        >
                          <div className="size-12 shrink-0 rounded-md bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                            {i + 1}
                          </div>
                          <span className="text-sm">Trang {i + 1}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
