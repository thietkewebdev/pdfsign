"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  PENDING: { label: "Chờ xử lý", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
  IN_PROGRESS: { label: "Đang ký", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: PenLine },
  COMPLETED: { label: "Hoàn tất", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  EXPIRED: { label: "Hết hạn", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: AlertCircle },
};

const SIGNER_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Chưa đến lượt", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  INVITED: { label: "Đang chờ ký", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  COMPLETED: { label: "Đã ký", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

export default function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

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
    if (!contract || contract.status === "COMPLETED" || contract.status === "EXPIRED") return;

    const interval = setInterval(fetchContract, 5000);
    return () => clearInterval(interval);
  }, [contract, fetchContract]);

  const handleSign = async () => {
    if (!contract || !token) return;
    setSigning(true);

    try {
      const res = await fetch(`/api/contracts/${id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to initialize signing");
      }

      const { deepLink } = await res.json();
      toast.success("Đang mở ứng dụng ký số...");
      window.location.href = deepLink;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSigning(false);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </div>

        {/* Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400 shrink-0" />
                  <CardTitle className="text-xl truncate">{contract.title}</CardTitle>
                </div>
                <CardDescription>
                  Tạo bởi {contract.owner.name ?? "Ẩn danh"} &middot;{" "}
                  {new Date(contract.createdAt).toLocaleDateString("vi-VN")}
                </CardDescription>
              </div>
              <Badge className={`${statusConfig.color} shrink-0`}>
                <StatusIcon className="h-3.5 w-3.5 mr-1" />
                {statusConfig.label}
              </Badge>
            </div>
            {contract.message && (
              <p className="mt-3 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                {contract.message}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tiến độ ký</span>
                <span className="font-medium">
                  {contract.signedCount}/{contract.totalSigners} bên đã ký
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Hạn ký: {new Date(contract.expiresAt).toLocaleDateString("vi-VN")}
                </span>
                {contract.completedAt && (
                  <span>
                    Hoàn tất: {new Date(contract.completedAt).toLocaleDateString("vi-VN")}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sign CTA for current signer */}
        {contract.canSign && token && (
          <Card className="mb-6 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">Đến lượt bạn ký</h3>
                  <p className="text-sm text-muted-foreground">
                    Nhấn nút bên dưới để mở ứng dụng ký số và ký bằng USB Token.
                    Đảm bảo đã cài đặt PDFSignPro Signer trên máy tính.
                  </p>
                </div>
                <Button
                  size="lg"
                  onClick={handleSign}
                  disabled={signing}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shrink-0"
                >
                  <PenLine className="h-5 w-5 mr-2" />
                  {signing ? "Đang xử lý..." : "Ký hợp đồng"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Signers list */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" />
              Danh sách bên ký ({contract.totalSigners})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {contract.signers.map((signer) => {
                const signerStatus =
                  SIGNER_STATUS_CONFIG[signer.status] || SIGNER_STATUS_CONFIG.PENDING;

                return (
                  <div
                    key={signer.id}
                    className={`flex items-center gap-4 rounded-lg border p-4 transition-colors ${
                      signer.isCurrentUser
                        ? "border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/20"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white text-sm font-bold shrink-0">
                      {signer.order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{signer.name}</p>
                        {signer.isCurrentUser && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            Bạn
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        <span className="truncate">{signer.email}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge className={signerStatus.color}>
                        {signer.status === "COMPLETED" && (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        )}
                        {signerStatus.label}
                      </Badge>
                      {signer.completedAt && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(signer.completedAt).toLocaleDateString("vi-VN")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Document preview link */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{contract.document.title}</p>
                  <p className="text-sm text-muted-foreground">
                    Phiên bản {contract.document.latestVersion}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/d/${contract.document.publicId}`}>
                    <Download className="h-4 w-4 mr-1.5" />
                    Xem tài liệu
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
