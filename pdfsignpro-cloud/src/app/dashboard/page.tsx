"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Upload, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface DocumentItem {
  id: string;
  publicId: string;
  title: string;
  status: string;
  createdAt: string;
  latestVersion: number;
  isSigned: boolean;
  signingJobCount: number;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/documents?mine=1");
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch documents");
      }
      const data = await res.json();
      setDocuments(data.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchDocuments();
    } else if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, fetchDocuments, router]);

  const handleUpload = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name.replace(/\.pdf$/i, ""));

      try {
        const res = await fetch("/api/documents", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        router.push(`/d/${data.publicId}`);
      } catch {
        setError("Không thể tải tài liệu lên");
      }
    };
    input.click();
  }, [router]);

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tài liệu của tôi</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý và theo dõi tài liệu đã tải lên
          </p>
        </div>
        <Button onClick={handleUpload} className="gap-2">
          <Upload className="size-4" />
          Tải PDF lên
        </Button>
      </div>

      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="py-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {documents.length === 0 && !loading ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="mb-4 size-12 text-muted-foreground/50" />
            <CardTitle className="mb-2 text-lg">Chưa có tài liệu nào</CardTitle>
            <CardDescription className="mb-6">
              Tải tài liệu PDF lên để bắt đầu ký số
            </CardDescription>
            <Button onClick={handleUpload} className="gap-2">
              <Upload className="size-4" />
              Tải PDF đầu tiên
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {documents.map((doc) => (
            <Link key={doc.id} href={`/d/${doc.publicId}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{doc.title || "Untitled"}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {new Date(doc.createdAt).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>v{doc.latestVersion}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.isSigned ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="size-3" />
                        Đã ký
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Chưa ký</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
