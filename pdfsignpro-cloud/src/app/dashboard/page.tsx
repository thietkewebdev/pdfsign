"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Upload,
  Clock,
  CheckCircle2,
  Loader2,
  Users,
  PenLine,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface ContractItem {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  document: { publicId: string; title: string };
  signers: { id: string; name: string; email: string; order: number; status: string }[];
  signedCount: number;
  totalSigners: number;
}

const CONTRACT_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Chờ xử lý", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  IN_PROGRESS: { label: "Đang ký", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  COMPLETED: { label: "Hoàn tất", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  EXPIRED: { label: "Hết hạn", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  CANCELED: { label: "Đã hủy", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" },
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") === "contracts" ? "contracts" : "documents";
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [docsRes, contractsRes] = await Promise.all([
        fetch("/api/documents?mine=1"),
        fetch("/api/contracts"),
      ]);
      if (docsRes.status === 401 || contractsRes.status === 401) {
        router.push("/login");
        return;
      }
      if (!docsRes.ok) throw new Error("Failed to fetch documents");
      const docsData = await docsRes.json();
      setDocuments(docsData.documents);

      if (contractsRes.ok) {
        const contractsData = await contractsRes.json();
        setContracts(contractsData.contracts);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchData();
    } else if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, fetchData, router]);

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
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý tài liệu và hợp đồng điện tử
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/contract/create" className="gap-2">
              <Users className="size-4" />
              Tạo hợp đồng
            </Link>
          </Button>
          <Button onClick={handleUpload} className="gap-2">
            <Upload className="size-4" />
            Tải PDF lên
          </Button>
        </div>
      </div>

      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="py-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="size-4" />
            Tài liệu ({documents.length})
          </TabsTrigger>
          <TabsTrigger value="contracts" className="gap-1.5">
            <Users className="size-4" />
            Hợp đồng ({contracts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
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
        </TabsContent>

        <TabsContent value="contracts">
          {contracts.length === 0 && !loading ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="mb-4 size-12 text-muted-foreground/50" />
                <CardTitle className="mb-2 text-lg">Chưa có hợp đồng nào</CardTitle>
                <CardDescription className="mb-6">
                  Tạo hợp đồng điện tử mới để gửi cho nhiều bên ký theo thứ tự
                </CardDescription>
                <div className="flex gap-2">
                  <Button asChild className="gap-2">
                    <Link href="/contract/create">
                      <Users className="size-4" />
                      Tạo hợp đồng mới
                    </Link>
                  </Button>
                  <Button variant="outline" onClick={handleUpload} className="gap-2">
                    <Upload className="size-4" />
                    Tải PDF lên
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {contracts.map((contract) => {
                const statusConf = CONTRACT_STATUS[contract.status] || CONTRACT_STATUS.PENDING;
                const progressPercent =
                  contract.totalSigners > 0
                    ? Math.round((contract.signedCount / contract.totalSigners) * 100)
                    : 0;

                return (
                  <Link key={contract.id} href={`/contract/${contract.id}`}>
                    <Card className="transition-colors hover:bg-muted/50">
                      <CardContent className="py-4">
                        <div className="flex items-center gap-4">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10">
                            <Users className="size-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{contract.title}</p>
                            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="size-3" />
                                {new Date(contract.createdAt).toLocaleDateString("vi-VN", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                })}
                              </span>
                              <span>
                                {contract.signedCount}/{contract.totalSigners} đã ký
                              </span>
                            </div>
                          </div>
                          <Badge className={statusConf.color}>
                            {statusConf.label}
                          </Badge>
                        </div>
                        <div className="mt-3 pl-14">
                          <Progress value={progressPercent} className="h-1.5" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
