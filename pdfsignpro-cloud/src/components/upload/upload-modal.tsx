"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UploadDropzoneCard, UploadProgress } from "@/components/upload";

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function UploadModal({
  open,
  onOpenChange,
  onSuccess,
}: UploadModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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
            onOpenChange(false);
            onSuccess?.();
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

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !isSubmitting) {
        handleClear();
      }
      onOpenChange(next);
    },
    [onOpenChange, isSubmitting, handleClear]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!isSubmitting}
        onPointerDownOutside={(e) => isSubmitting && e.preventDefault()}
        onEscapeKeyDown={(e) => isSubmitting && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Ký tài liệu mới</DialogTitle>
          <DialogDescription>
            Tải lên file PDF để tạo liên kết ký số. Sau khi tải lên, bạn sẽ được
            chuyển đến trang đặt vị trí chữ ký.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!selectedFile ? (
            <UploadDropzoneCard
              onFileSelect={handleFileSelect}
              disabled={isSubmitting}
              className="min-h-[180px]"
            />
          ) : (
            <div className="space-y-4">
              {isSubmitting ? (
                <UploadProgress
                  fileName={selectedFile.name}
                  progress={uploadProgress}
                  status={uploadProgress >= 100 ? "done" : "uploading"}
                />
              ) : (
                <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                    <span className="text-xs font-medium text-muted-foreground">
                      PDF
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleClear}
                    disabled={isSubmitting}
                    className="shrink-0"
                    aria-label="Xóa file"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              )}

              {!isSubmitting && (
                <form onSubmit={handleUpload} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="upload-modal-title">Tiêu đề tài liệu</Label>
                    <Input
                      id="upload-modal-title"
                      placeholder="VD: Hợp đồng 2024"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="rounded-md"
                      disabled={isSubmitting}
                    />
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full rounded-md"
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
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
