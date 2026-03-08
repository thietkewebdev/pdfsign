"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Upload, Loader2, Monitor, X, FileUp, MousePointer, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  UploadDropzoneCard,
  UploadProgress,
} from "@/components/upload";

export default function HomePage() {
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
            router.push(`/d/${data.publicId}`);
            resolve();
          } catch {
            toast.error("Lỗi xử lý phản hồi");
            reject();
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            toast.error(data.error ?? "Tải lên thất bại");
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

  const handleClear = () => {
    setSelectedFile(null);
    setTitle("");
    setUploadProgress(0);
  };

  return (
    <div className="container mx-auto max-w-2xl px-6 py-16 sm:py-20">
      <div className="space-y-12">
        <header className="space-y-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Ký số PDF — nhanh, chuẩn, an toàn
          </h1>
          <p className="text-lg text-muted-foreground">
            Tải PDF lên, đặt vị trí chữ ký, ký số bằng USB Token trên Windows.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/api/signer/download">
                <Monitor className="size-4" />
                Tải PDFSignPro Signer (Windows)
              </a>
            </Button>
            <Link
              href="/signer"
              className="text-sm text-muted-foreground underline hover:text-foreground transition-colors duration-150"
            >
              Hướng dẫn cài đặt
            </Link>
          </div>
        </header>

        <div className="space-y-6">
          {!selectedFile ? (
            <UploadDropzoneCard
              onFileSelect={handleFileSelect}
              disabled={isSubmitting}
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
                <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors duration-150">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
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

              <form onSubmit={handleUpload} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Tiêu đề tài liệu</Label>
                  <Input
                    id="title"
                    placeholder="VD: Hợp đồng 2024"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="rounded-lg"
                    disabled={isSubmitting}
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full rounded-lg"
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
                    : "Tải lên & tạo liên kết"}
                </Button>
              </form>
            </div>
          )}
        </div>

        <section className="space-y-6 pt-8 border-t border-border">
          <h2 className="text-xl font-semibold text-foreground">
            Cách hoạt động
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="flex gap-4 rounded-lg border border-border bg-card p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <FileUp className="size-5 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">1. Tải lên PDF</p>
                <p className="text-sm text-muted-foreground">
                  Kéo thả file hoặc chọn file PDF từ máy. Hỗ trợ tối đa 50MB.
                </p>
              </div>
            </div>
            <div className="flex gap-4 rounded-lg border border-border bg-card p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <MousePointer className="size-5 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">2. Đặt vị trí chữ ký</p>
                <p className="text-sm text-muted-foreground">
                  Chọn vị trí ô chữ ký trên tài liệu. Mở Signer để ký số.
                </p>
              </div>
            </div>
            <div className="flex gap-4 rounded-lg border border-border bg-card p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Shield className="size-5 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">3. Ký số bằng USB Token</p>
                <p className="text-sm text-muted-foreground">
                  Cắm USB Token, mở Signer và ký. PDF đã ký được lưu tự động.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4 pt-8 border-t border-border">
          <h2 className="text-xl font-semibold text-foreground">
            Tính năng
          </h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              Ký số PDF chuẩn PKCS#7 với USB Token (Viettel, Viettel CA, EasyCA, FastCA…)
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              Ứng dụng Signer chạy trên Windows, kết nối trực tiếp với trình duyệt
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              Xem trước chữ ký, thông tin chứng thư số, thời gian ký
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              Chia sẻ liên kết đã ký, tải PDF đã ký
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
