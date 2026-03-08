"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Download,
  X,
  PenLine,
  Monitor,
  RefreshCw,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { JobStatusCard } from "@/components/upload";
import { DocumentPageSkeleton } from "@/components/document/document-page-skeleton";
import { DocumentEmptyState } from "@/components/document/document-empty-state";
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
    error: "expired" | "timeout" | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const pollStartRef = useRef<number | null>(null);

  const {
    placements,
    defaultPlacementEnabled,
    toggleDefaultPlacement,
    addSignatureBox,
    updatePlacementFromPixels,
  } = useSignaturePlacement(totalPages);

  const fetchDocument = useCallback(async () => {
    if (!publicId) return null;
    const res = await fetch(`/api/documents/${publicId}`);
    if (!res.ok) throw new Error("Document not found");
    const json = await res.json();
    setData(json);
    return json;
  }, [publicId]);

  useEffect(() => {
    if (!publicId) {
      setLoading(false);
      return;
    }
    fetchDocument()
      .catch((err) => {
        setError(err.message);
        toast.error(err.message ?? "Không tìm thấy tài liệu");
      })
      .finally(() => setLoading(false));
  }, [publicId, fetchDocument]);

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

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: data.document.id,
        placement: {
          page,
          rectPct: {
            x: placement.xPct,
            y: placement.yPct,
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
  };

  const copyDeepLink = () => {
    if (!jobState) return;
    navigator.clipboard.writeText(jobState.deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        setJobState((prev) =>
          prev ? { ...prev, status, signedDownloadUrl, error: null } : null
        );
        toast.success("Đã ký xong. Có thể tải PDF đã ký.");
        await fetchDocument();
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
  const pdfUrl =
    jobState?.status === "COMPLETED" && jobState.signedDownloadUrl
      ? jobState.signedDownloadUrl
      : basePdfUrl;
  const downloadUrl =
    jobState?.status === "COMPLETED" && jobState.signedDownloadUrl
      ? jobState.signedDownloadUrl
      : presignedUrl;

  const SigningPanel = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">
        Chữ ký số
      </h3>
      <Button
        variant="outline"
        size="sm"
        onClick={addSignatureBox}
        className="w-full"
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
        className="w-full"
      >
        <PenLine className="size-4" />
        Ký số
      </Button>
      {jobState && (
        <JobStatusCard
          status={jobState.status}
          deepLink={jobState.deepLink}
          signedDownloadUrl={jobState.signedDownloadUrl}
          error={jobState.error}
          onCopyDeepLink={copyDeepLink}
          copied={copied}
          onReset={resetJobState}
          documentTitle={doc.title ?? "signed.pdf"}
          showCreatedHint={showCreatedHint}
        />
      )}
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="truncate font-semibold text-foreground">
            {doc.title}
          </h2>
          <StatusBadge status={doc.status} />
          <Badge variant="outline" className="shrink-0">
            v{currentVersion.version}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <ThemeToggle />
          <Button variant="outline" size="sm" asChild>
            <a href="/api/signer/download">
              <Monitor className="size-4" />
              Tải Signer
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              fetchDocument().catch((err) =>
                toast.error(err?.message ?? "Không thể tải lại")
              )
            }
            aria-label="Làm mới"
          >
            <RefreshCw className="size-4" />
            Làm mới
          </Button>
          <span className="text-xs text-muted-foreground">
            <Link href="/signer" className="underline hover:text-foreground">
              Hướng dẫn cài đặt
            </Link>
          </span>
          <Button variant="outline" size="sm" asChild>
            <a href={downloadUrl} download={doc.title ?? "document.pdf"}>
              <Download className="size-4" />
              {jobState?.status === "COMPLETED" ? "Tải PDF đã ký" : "Tải xuống"}
            </a>
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="Đóng">
            <Link href="/">
              <X className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="hidden lg:grid lg:grid-cols-[320px_1fr_280px] lg:h-full">
          <div className="border-r border-border p-4 overflow-hidden">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Hướng dẫn
            </h3>
            <ol className="space-y-2 text-sm text-muted-foreground mb-4 list-decimal list-inside">
              <li>Cắm USB Token</li>
              <li>Bấm &quot;Ký số&quot; để tạo phiên ký</li>
              <li>Bấm &quot;Mở PDFSignPro Signer&quot;</li>
            </ol>
            <Separator className="my-3" />
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Tiến trình ký
            </h3>
            <ScrollArea className="h-[calc(100vh-14rem)]">
              <div className="space-y-2 pr-4 text-sm text-muted-foreground">
                <p>Đã tải lên</p>
                <p className="text-xs">
                  {new Date(doc.createdAt).toLocaleString("vi-VN")}
                </p>
                <Separator className="my-2" />
                <SigningPanel />
              </div>
            </ScrollArea>
          </div>
          <div className="overflow-hidden">
            <PdfViewer
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
          <div className="border-l border-border p-4 overflow-hidden">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Trang
            </h3>
            <ScrollArea className="h-[calc(100vh-12rem)]">
              <div className="space-y-2 pr-2">
                {Array.from({ length: Math.max(totalPages, 1) }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrentPage(i + 1)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                      currentPage === i + 1
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent/50"
                    }`}
                  >
                    <div className="size-12 shrink-0 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      {i + 1}
                    </div>
                    <span className="text-sm">Trang {i + 1}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
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
              <TabsContent value="timeline" className="m-0 p-4 h-full">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Hướng dẫn ký số
                </h3>
                <ol className="space-y-2 text-sm text-muted-foreground mb-4 list-decimal list-inside">
                  <li>Cắm USB Token</li>
                  <li>Bấm &quot;Ký số&quot; để tạo phiên ký</li>
                  <li>Bấm &quot;Mở PDFSignPro Signer&quot;</li>
                </ol>
                <Separator className="my-3" />
                <SigningPanel />
              </TabsContent>
              <TabsContent value="document" className="m-0 p-0 h-full">
                <PdfViewer
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
              <TabsContent value="pages" className="m-0 p-4 h-full">
                <div className="space-y-2">
                  {Array.from({ length: Math.max(totalPages, 1) }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrentPage(i + 1)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left ${
                        currentPage === i + 1
                          ? "border-primary bg-primary/10"
                          : "border-border"
                      }`}
                    >
                      <div className="size-12 shrink-0 rounded bg-muted flex items-center justify-center text-xs">
                        {i + 1}
                      </div>
                      <span className="text-sm">Trang {i + 1}</span>
                    </button>
                  ))}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
