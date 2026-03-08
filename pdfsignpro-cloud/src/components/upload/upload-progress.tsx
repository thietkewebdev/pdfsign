"use client";

import { FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface UploadProgressProps {
  fileName: string;
  progress: number;
  status?: "uploading" | "processing" | "done";
  className?: string;
}

export function UploadProgress({
  fileName,
  progress,
  status = "uploading",
  className,
}: UploadProgressProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-4",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FileText className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {fileName}
          </p>
          <p className="text-xs text-muted-foreground">
            {status === "uploading" && "Đang tải lên…"}
            {status === "processing" && "Đang xử lý…"}
            {status === "done" && "Hoàn tất"}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Progress value={progress} className="h-1.5" />
        <p className="text-right text-xs text-muted-foreground">{progress}%</p>
      </div>
    </div>
  );
}
