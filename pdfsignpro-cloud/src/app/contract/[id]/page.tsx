"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  FileText,
  CheckCircle2,
  Clock,
  Mail,
  Download,
  Users,
  PenLine,
  AlertCircle,
  ArrowLeft,
  XCircle,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { SignatureTemplateSelector } from "@/components/signature/SignatureTemplateSelector";
import { SignaturePlacementFields } from "@/components/signature/SignaturePlacementFields";
import { SIGNATURE_TEMPLATES } from "@/lib/signature-templates";
import { useSignaturePlacement } from "@/hooks/use-signature-placement";
import { JobStatusResponseSchema } from "@/lib/job-status";
import { getPdfViewerUrl } from "@/lib/pdf-view-url";
import { trackGaEvent } from "@/lib/analytics";

interface Signer {
  id: string;
  email: string;
  name: string;
  order: number;
  status: string;
  templateId: string;
  invitedAt: string | null;
  completedAt: string | null;
  isCurrentUser: boolean;
}

interface ContractData {
  id: string;
  title: string;
  message: string | null;
  status: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  owner: { name: string | null; email: string | null };
  document: {
    id: string;
    publicId: string;
    title: string;
    latestVersion: number;
  };
  signers: Signer[];
  signedCount: number;
  totalSigners: number;
  canSign: boolean;
  currentSignerToken: string | null;
  isOwner: boolean;
  events: ContractEvent[];
}

interface ContractEvent {
  id: string;
  type: string;
  actor: string | null;
  detail: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  PENDING: { label: "Chờ xử lý", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
  IN_PROGRESS: { label: "Đang ký", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: PenLine },
  COMPLETED: { label: "Hoàn tất", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  EXPIRED: { label: "Hết hạn", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: AlertCircle },
  CANCELED: { label: "Đã hủy", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400", icon: XCircle },
};

const SIGNER_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Chưa đến lượt", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  INVITED: { label: "Đang chờ ký", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  COMPLETED: { label: "Đã ký", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

const EVENT_TYPE_LABELS: Record<string, string> = {
  CREATED: "Tạo hợp đồng",
  INVITED: "Gửi lời mời ký",
  VIEWED: "Xem hợp đồng",
  SIGNED: "Đã ký",
  COMPLETED: "Hoàn tất",
  CANCELED: "Đã hủy",
  REMINDED: "Nhắc nhở",
  EXPIRED: "Hết hạn",
};

function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] || type;
}

export default function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState("valid");
  const [sealImageBase64, setSealImageBase64] = useState<string | null>(null);

  const [jobState, setJobState] = useState<{
    jobId: string;
    deepLink: string;
    status: "CREATED" | "COMPLETED" | "EXPIRED" | "CANCELED";
  } | null>(null);
  const pollStartRef = useRef<number | null>(null);

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

  const fetchContract = useCallback(async () => {
    try {
      const url = `/api/contracts/${id}${token ? `?token=${token}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to load contract");
      }
      const data = await res.json();
      setContract(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    fetchContract();
  }, [fetchContract]);

  useEffect(() => {
    if (!contract) return;
    const fetchPdf = async () => {
      try {
        const res = await fetch(`/api/documents/${contract.document.publicId}`);
        if (res.ok) {
          const data = await res.json();
          const url = getPdfViewerUrl(data.presignedUrl, data.viewUrl);
          setPdfUrl(url);
        }
      } catch {
        /* PDF preview not critical */
      }
    };
    fetchPdf();
  }, [contract?.document.publicId, contract?.document.latestVersion]);

  useEffect(() => {
    if (!contract || contract.status === "COMPLETED" || contract.status === "EXPIRED") return;
    if (jobState) return;
    const interval = setInterval(fetchContract, 8000);
    return () => clearInterval(interval);
  }, [contract, fetchContract, jobState]);

  // Poll job status after signing starts
  useEffect(() => {
    if (!jobState || jobState.status !== "CREATED") return;

    const poll = async () => {
      const res = await fetch(`/api/jobs/${jobState.jobId}/status`);
      if (!res.ok) return;
      const raw = await res.json();
      const parsed = JobStatusResponseSchema.safeParse(raw);
      if (!parsed.success) return;

      const { status } = parsed.data;

      if (status === "COMPLETED") {
        trackGaEvent("sign_completed", {
          surface: "contract_page",
        });
        setJobState(null);
        pollStartRef.current = null;
        toast.success("Đã ký thành công! Đang cập nhật hợp đồng...");
        await fetchContract();
        // Refresh PDF
        if (contract) {
          const res2 = await fetch(`/api/documents/${contract.document.publicId}`);
          if (res2.ok) {
            const data2 = await res2.json();
            setPdfUrl(
              getPdfViewerUrl(data2.presignedUrl, data2.viewUrl) +
                "?t=" +
                Date.now()
            );
          }
        }
        return;
      }

      if (status === "EXPIRED") {
        trackGaEvent("sign_failed", {
          surface: "contract_page",
          reason: "job_expired",
        });
        setJobState(null);
        pollStartRef.current = null;
        toast.error("Phiên ký đã hết hạn. Vui lòng thử lại.");
        return;
      }

      const elapsed = Date.now() - (pollStartRef.current ?? Date.now());
      if (elapsed >= POLL_TIMEOUT_MS) {
        trackGaEvent("sign_failed", {
          surface: "contract_page",
          reason: "poll_timeout",
        });
        setJobState(null);
        pollStartRef.current = null;
        toast.error("Hết thời gian chờ ký.");
        return;
      }
    };

    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    poll();
    return () => clearInterval(intervalId);
  }, [jobState?.jobId, jobState?.status, fetchContract, contract]);

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

  const goToPdfPage = useCallback((p: number) => {
    setCurrentPage(p);
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

  const handleSign = async () => {
    const effectiveToken = token ?? contract?.currentSignerToken ?? null;
    if (!contract || !effectiveToken || placements.length === 0) return;
    trackGaEvent("sign_start_clicked", {
      surface: "contract_page",
      template_id: selectedTemplateId,
      placement_count: placements.length,
    });
    setSigning(true);

    try {
      const placement = placements[safePlacementEditorIdx];
      if (!placement) {
        setSigning(false);
        return;
      }
      const page =
        placement.page === totalPages ? ("LAST" as const) : placement.page;

      const pdfY = 1 - placement.yPct - placement.hPct;

      const res = await fetch(`/api/contracts/${id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: effectiveToken,
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
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to initialize signing");
      }

      const { jobId, deepLink } = await res.json();
      setJobState({ jobId, deepLink, status: "CREATED" });
      pollStartRef.current = Date.now();
      trackGaEvent("sign_job_created", {
        surface: "contract_page",
        template_id: selectedTemplateId,
      });
      toast.success("Đang mở ứng dụng ký số...");
      trackGaEvent("signer_launch_attempted", {
        surface: "contract_page",
      });
      window.location.href = deepLink;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSigning(false);
    }
  };

  const handleCancel = async () => {
    if (!contract || !confirm("Bạn có chắc muốn hủy hợp đồng này?")) return;
    setCanceling(true);
    try {
      const res = await fetch(`/api/contracts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to cancel");
      }
      toast.success("Đã hủy hợp đồng");
      await fetchContract();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setCanceling(false);
    }
  };

  const handleRemind = async () => {
    if (!contract) return;
    setReminding(true);
    try {
      const res = await fetch(`/api/contracts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remind" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to send reminder");
      }
      const data = await res.json();
      toast.success(`Đã gửi nhắc nhở cho ${data.remindedSigner}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setReminding(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-gray-300 dark:bg-gray-700" />
          <div className="h-4 w-48 rounded bg-gray-300 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Không thể tải hợp đồng</h2>
            <p className="text-muted-foreground">{error || "Contract not found"}</p>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/">Về trang chủ</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[contract.status] || STATUS_CONFIG.PENDING;
  const StatusIcon = statusConfig.icon;
  const progressPercent =
    contract.totalSigners > 0
      ? Math.round((contract.signedCount / contract.totalSigners) * 100)
      : 0;

  const activePlacement = placements[placementEditorIdx];
  const activePage = activePlacement?.page ?? currentPage;
  const showSigningUI = contract.canSign && token && !jobState;
  const usePdfScroll = !!(pdfUrl && showSigningUI);

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-2.5 bg-background/95 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="shrink-0 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <h2 className="truncate text-[15px] font-medium">{contract.title}</h2>
          <Badge className={`${statusConfig.color} shrink-0`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusConfig.label}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground shrink-0">
          {contract.signedCount}/{contract.totalSigners} đã ký
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[320px_1fr]">
          {/* Left sidebar */}
          <div className="space-y-4 overflow-y-auto border-r border-border p-4">
            {/* Progress */}
            <Card>
              <CardContent className="pt-4 pb-3 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tiến độ</span>
                  <span className="font-medium">{contract.signedCount}/{contract.totalSigners}</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                <div className="text-xs text-muted-foreground">
                  Hạn ký: {new Date(contract.expiresAt).toLocaleDateString("vi-VN")}
                </div>
              </CardContent>
            </Card>

            {/* Job polling status */}
            {jobState && (
              <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-sm font-medium">Đang chờ ký...</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ứng dụng PDFSignPro Signer đã được mở. Hoàn tất ký số trên ứng dụng.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Owner actions */}
            {contract.isOwner && contract.status !== "COMPLETED" && contract.status !== "EXPIRED" && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemind}
                  disabled={reminding}
                  className="flex-1 text-xs"
                >
                  <Bell className="size-3.5" />
                  {reminding ? "Đang gửi..." : "Nhắc nhở"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={canceling}
                  className="flex-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20"
                >
                  <XCircle className="size-3.5" />
                  {canceling ? "Đang hủy..." : "Hủy hợp đồng"}
                </Button>
              </div>
            )}

            {/* Signing panel for current signer */}
            {showSigningUI && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-4 shadow-sm">
                <h3 className="text-sm font-semibold">Chữ ký số</h3>
                <SignatureTemplateSelector
                  templates={SIGNATURE_TEMPLATES}
                  selectedId={selectedTemplateId}
                  onSelect={(tmplId) => {
                    setSelectedTemplateId(tmplId);
                    if (placements.length === 0 && totalPages > 0) {
                      addSignatureBox(
                        currentPage >= 1 && currentPage <= totalPages
                          ? currentPage
                          : undefined
                      );
                    }
                  }}
                  sealImageBase64={sealImageBase64}
                  onSealImageChange={setSealImageBase64}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    addSignatureBox(
                      currentPage >= 1 && currentPage <= totalPages
                        ? currentPage
                        : undefined
                    )
                  }
                  className="w-full rounded-md"
                >
                  Thêm ô chữ ký (trang đang xem)
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
                <SignaturePlacementFields
                  placements={placements}
                  totalPages={totalPages}
                  selectedIdx={safePlacementEditorIdx}
                  onSelectIdx={setPlacementEditorIdx}
                  onPlacementPageChange={onPlacementPageChange}
                  lang="vi"
                />
                <Button
                  onClick={handleSign}
                  disabled={placements.length === 0 || signing}
                  className="w-full rounded-md bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                >
                  <PenLine className="size-4" />
                  {signing ? "Đang xử lý..." : "Ký hợp đồng"}
                </Button>
              </div>
            )}

            {/* Signers list */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" />
                Bên ký ({contract.totalSigners})
              </h3>
              {contract.signers.map((signer) => {
                const signerStatus =
                  SIGNER_STATUS_CONFIG[signer.status] || SIGNER_STATUS_CONFIG.PENDING;
                return (
                  <div
                    key={signer.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                      signer.isCurrentUser
                        ? "border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/20"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs font-bold shrink-0">
                      {signer.order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{signer.name}</p>
                        {signer.isCurrentUser && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                            Bạn
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Mail className="h-3 w-3 shrink-0" />
                        {signer.email}
                      </p>
                    </div>
                    <Badge className={`${signerStatus.color} text-[10px] shrink-0`}>
                      {signer.status === "COMPLETED" && <CheckCircle2 className="h-3 w-3 mr-0.5" />}
                      {signerStatus.label}
                    </Badge>
                  </div>
                );
              })}
            </div>

            {/* Document info */}
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{contract.document.title}</p>
                  <p className="text-xs text-muted-foreground">v{contract.document.latestVersion}</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                  <Link href={`/d/${contract.document.publicId}`}>
                    <Download className="h-3 w-3 mr-1" />
                    Xem
                  </Link>
                </Button>
              </div>
            </div>

            {contract.message && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                <p className="font-medium text-xs mb-1">Lời nhắn:</p>
                {contract.message}
              </div>
            )}

            {/* Audit trail */}
            {contract.isOwner && contract.events && contract.events.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Nhật ký ({contract.events.length})
                </h3>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {contract.events.map((event) => (
                    <div key={event.id} className="flex gap-2 text-xs py-1.5 border-b border-border/50 last:border-0">
                      <span className="text-muted-foreground shrink-0 w-14">
                        {new Date(event.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <div className="min-w-0">
                        <span className="font-medium">{eventTypeLabel(event.type)}</span>
                        {event.detail && (
                          <span className="text-muted-foreground ml-1">— {event.detail}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* PDF Viewer */}
          <div className="flex min-h-0 flex-col overflow-hidden">
            {pdfUrl ? (
              <PdfViewer
                pdfUrl={pdfUrl}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                scale={scale}
                onScaleChange={setScale}
                totalPages={totalPages}
                onTotalPagesChange={handleTotalPagesChange}
                placements={showSigningUI ? placements : []}
                onPlacementUpdate={handlePlacementUpdate}
                activePageForPlacement={activePage}
                readOnly={!showSigningUI}
                selectedTemplateId={selectedTemplateId}
                sealImageBase64={sealImageBase64}
                continuousScroll={usePdfScroll}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Đang tải tài liệu...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
