"use client";

import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Copy,
  Check,
  ExternalLink,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
export type JobStatus = "CREATED" | "COMPLETED" | "EXPIRED" | "CANCELED";

interface JobStatusCardProps {
  status: JobStatus;
  deepLink?: string;
  signedDownloadUrl?: string | null;
  error?: "expired" | "timeout" | null;
  onCopyDeepLink?: () => void;
  onCopyShareLink?: () => void;
  copied?: boolean;
  shareLinkCopied?: boolean;
  shareLink?: string;
  onReset?: () => void;
  documentTitle?: string;
  showCreatedHint?: boolean;
}

export function JobStatusCard({
  status,
  deepLink,
  signedDownloadUrl,
  error,
  onCopyDeepLink,
  onCopyShareLink,
  copied = false,
  shareLinkCopied = false,
  shareLink,
  onReset,
  documentTitle = "document.pdf",
  showCreatedHint = false,
}: JobStatusCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {status === "CREATED" && (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin shrink-0" />
            <span>Đang chờ ứng dụng ký…</span>
          </div>
          {showCreatedHint && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="size-3.5 shrink-0" />
                Chưa thấy app ký – kiểm tra đã cài Signer chưa
              </p>
              <p className="text-xs text-muted-foreground">
                Bạn chưa cài Signer?{" "}
                <a
                  href="/api/signer/download"
                  className="underline hover:text-foreground"
                >
                  Tải về tại đây.
                </a>
              </p>
            </div>
          )}
          {deepLink && (
            <>
              <p className="text-xs text-muted-foreground">
                Nếu không tự mở, bấm để mở Signer
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCopyDeepLink}
                  className="flex-1"
                >
                  {copied ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {copied ? "Đã copy" : "Sao chép liên kết"}
                </Button>
                <Button size="sm" asChild className="flex-1">
                  <a href={deepLink}>
                    <ExternalLink className="size-4" />
                    Mở Signer
                  </a>
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {status === "COMPLETED" && signedDownloadUrl && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            Đã ký xong
          </p>
          <Button size="sm" className="w-full" asChild>
            <a href={signedDownloadUrl} download={documentTitle}>
              <Download className="size-4" />
              Tải PDF đã ký
            </a>
          </Button>
          {shareLink && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">
                Chia sẻ liên kết đã ký
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  className="flex-1 min-w-0 rounded-md border border-input bg-muted px-2 py-1.5 text-xs font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCopyShareLink}
                  className="shrink-0"
                >
                  {shareLinkCopied ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {shareLinkCopied ? "Đã copy" : "Copy"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {error === "expired" && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm text-destructive">
            <Clock className="size-4" />
            Phiên ký hết hạn
          </p>
          <Button size="sm" variant="outline" onClick={onReset} className="w-full">
            Tạo phiên mới
          </Button>
        </div>
      )}

      {error === "timeout" && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            Hết thời gian chờ (5 phút)
          </p>
          <Button size="sm" variant="outline" onClick={onReset} className="w-full">
            Thử lại
          </Button>
        </div>
      )}
    </div>
  );
}
