"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCcw, Shield, Users, FileText, Files, HardDrive, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

type OverviewResponse = {
  kpis: {
    totalUsers: number;
    verifiedUsers: number;
    totalDocuments: number;
    totalContracts: number;
    totalCompletedJobs: number;
    monthlyUploads: number;
    monthlyContracts: number;
    monthlyCompletedJobs: number;
    signingErrors24h: number;
    topSigningErrorCodes24h: { errorCode: string; count: number }[];
  };
};

type UserItem = {
  id: string;
  name: string | null;
  email: string | null;
  isDisabled: boolean;
  role: string;
  plan: string;
  emailVerified: string | null;
  counts: { documents: number; contracts: number };
  providers: string[];
};

type UsersResponse = {
  users: UserItem[];
};

type PlanResponse = {
  distribution: { plan: string; count: number }[];
  overQuotaUsers: { id: string; email: string | null; plan: string; usedBytes: number; quotaBytes: number }[];
};

type DocumentItem = {
  publicId: string;
  title: string | null;
  status: string;
  owner: { email: string | null; name: string | null } | null;
  latestVersion: { version: number; sizeBytes: number } | null;
};

type DocumentsResponse = {
  documents: DocumentItem[];
};

type ContractItem = {
  id: string;
  title: string;
  status: string;
  expiresAt: string;
  owner: { email: string | null; name: string | null } | null;
  signedCount: number;
  signers: { id: string; status: string; email: string; name: string }[];
};

type ContractsResponse = { contracts: ContractItem[] };

type UsageResponse = {
  rangeDays: number;
  timeline: {
    uploads: { day: string; count: number; bytes: number }[];
    completedJobs: { day: string; count: number }[];
    signingErrors: { day: string; count: number }[];
  };
  topUsersByRecentActivity: { id: string; email: string | null; name: string | null; documents: number; contracts: number }[];
};

type StorageResponse = {
  totalVersions: number;
  byDriver: { storageDriver: string; versionCount: number; totalBytes: number }[];
  byUser: { userId: string; email: string | null; bytes: number; versions: number }[];
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Yeu cau that bai: ${url}`);
  }
  return res.json() as Promise<T>;
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchUser, setSearchUser] = useState("");
  const [searchDocument, setSearchDocument] = useState("");
  const [searchContract, setSearchContract] = useState("");

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [users, setUsers] = useState<UsersResponse | null>(null);
  const [plans, setPlans] = useState<PlanResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentsResponse | null>(null);
  const [contracts, setContracts] = useState<ContractsResponse | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [storage, setStorage] = useState<StorageResponse | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [overviewData, usersData, plansData, documentsData, contractsData, usageData, storageData] =
        await Promise.all([
          fetchJson<OverviewResponse>("/api/admin/overview"),
          fetchJson<UsersResponse>(`/api/admin/users?search=${encodeURIComponent(searchUser)}`),
          fetchJson<PlanResponse>("/api/admin/plans"),
          fetchJson<DocumentsResponse>(
            `/api/admin/documents?search=${encodeURIComponent(searchDocument)}`
          ),
          fetchJson<ContractsResponse>(
            `/api/admin/contracts?search=${encodeURIComponent(searchContract)}`
          ),
          fetchJson<UsageResponse>("/api/admin/usage?days=30"),
          fetchJson<StorageResponse>("/api/admin/storage"),
        ]);

      setOverview(overviewData);
      setUsers(usersData);
      setPlans(plansData);
      setDocuments(documentsData);
      setContracts(contractsData);
      setUsage(usageData);
      setStorage(storageData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu admin");
    } finally {
      setLoading(false);
    }
  }, [searchContract, searchDocument, searchUser]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const userCount = users?.users.length ?? 0;
  const docCount = documents?.documents.length ?? 0;
  const contractCount = contracts?.contracts.length ?? 0;

  const totalStorageBytes = useMemo(
    () => storage?.byDriver.reduce((sum, item) => sum + item.totalBytes, 0) ?? 0,
    [storage]
  );

  async function updateUser(
    userId: string,
    action: "verifyEmail" | "lock" | "unlock" | "setPlan",
    plan?: string
  ) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, plan }),
    });
    if (!res.ok) {
      throw new Error("Không cập nhật được user");
    }
    await reload();
  }

  async function updateDocument(publicId: string, action: "archive" | "restore" | "delete") {
    const method = action === "delete" ? "DELETE" : "PATCH";
    const payload = action === "delete" ? { publicId } : { publicId, action };
    const res = await fetch("/api/admin/documents", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error("Không cập nhật được tài liệu");
    }
    await reload();
  }

  async function updateContract(contractId: string, action: "cancel" | "remind" | "extendExpiry") {
    const expiresAt =
      action === "extendExpiry"
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : undefined;
    const res = await fetch("/api/admin/contracts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractId, action, expiresAt }),
    });
    if (!res.ok) {
      throw new Error("Không cập nhật được hợp đồng");
    }
    await reload();
  }

  if (loading && !overview) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bảng điều khiển quản trị</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Giám sát hệ thống và thao tác quản trị users, tài liệu, hợp đồng, tài nguyên.
          </p>
        </div>
        <Button onClick={() => void reload()} variant="outline" className="gap-2">
          <RefreshCcw className="size-4" />
          Làm mới
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {overview && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Tổng users</CardDescription>
              <CardTitle className="text-2xl">{overview.kpis.totalUsers}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Tài liệu</CardDescription>
              <CardTitle className="text-2xl">{overview.kpis.totalDocuments}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Hợp đồng</CardDescription>
              <CardTitle className="text-2xl">{overview.kpis.totalContracts}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ký thành công</CardDescription>
              <CardTitle className="text-2xl">{overview.kpis.totalCompletedJobs}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Lỗi ký 24h</CardDescription>
              <CardTitle className="text-2xl">{overview.kpis.signingErrors24h}</CardTitle>
            </CardHeader>
            {overview.kpis.topSigningErrorCodes24h.length > 0 && (
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {overview.kpis.topSigningErrorCodes24h.map((item) => (
                    <div key={item.errorCode} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{item.errorCode}</span>
                      <Badge variant="outline">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      <Tabs defaultValue="users">
        <TabsList className="flex w-full flex-wrap gap-1">
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="size-4" />
            Người dùng ({userCount})
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-1.5">
            <Shield className="size-4" />
            Gói dịch vụ
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="size-4" />
            Tài liệu ({docCount})
          </TabsTrigger>
          <TabsTrigger value="contracts" className="gap-1.5">
            <Files className="size-4" />
            Hợp đồng ({contractCount})
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-1.5">
            <BarChart3 className="size-4" />
            Sử dụng
          </TabsTrigger>
          <TabsTrigger value="storage" className="gap-1.5">
            <HardDrive className="size-4" />
            Lưu trữ
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Quản lý người dùng</CardTitle>
              <CardDescription>Tìm kiếm, khóa/mở khóa, xác minh email, đổi gói.</CardDescription>
              <Input
                placeholder="Tìm theo tên hoặc email..."
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
              />
            </CardHeader>
            <CardContent className="space-y-2">
              {users?.users.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.name ?? u.email ?? u.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.email ?? "chưa có email"} · {u.plan} · {u.providers.join(", ") || "tài khoản thường"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {u.isDisabled ? (
                      <Badge variant="destructive">Đã khóa</Badge>
                    ) : (
                      <Badge variant="secondary">Hoạt động</Badge>
                    )}
                    {!u.emailVerified && (
                      <Button size="sm" variant="outline" onClick={() => void updateUser(u.id, "verifyEmail")}>
                        Xác minh
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void updateUser(u.id, u.isDisabled ? "unlock" : "lock")}
                    >
                      {u.isDisabled ? "Mở khóa" : "Khóa"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void updateUser(u.id, "setPlan", "free")}>
                      Miễn phí
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void updateUser(u.id, "setPlan", "pro")}>
                      Chuyên nghiệp
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Phân bố gói dịch vụ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {plans?.distribution.map((p) => (
                <div key={p.plan} className="flex items-center justify-between rounded-md border p-3">
                  <span className="font-medium">{p.plan}</span>
                  <Badge>{p.count} người dùng</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Người dùng vượt quota</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {plans?.overQuotaUsers.length ? (
                plans.overQuotaUsers.map((u) => (
                  <div key={u.id} className="rounded-md border p-3 text-sm">
                    <p className="font-medium">{u.email ?? u.id}</p>
                    <p className="text-muted-foreground">
                      {u.plan} · {formatBytes(u.usedBytes)} / {formatBytes(u.quotaBytes)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Không có user vượt quota.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Thao tác tài liệu</CardTitle>
              <Input
                placeholder="Tìm theo title/publicId/email..."
                value={searchDocument}
                onChange={(e) => setSearchDocument(e.target.value)}
              />
            </CardHeader>
            <CardContent className="space-y-2">
              {documents?.documents.map((d) => (
                <div key={d.publicId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.title ?? d.publicId}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.publicId} · {d.owner?.email ?? "không rõ"} · {formatBytes(d.latestVersion?.sizeBytes ?? 0)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {d.latestVersion ? (
                      <Button size="sm" variant="secondary" asChild>
                        <a
                          href={`/api/admin/documents/${encodeURIComponent(d.publicId)}/file`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Xem PDF
                        </a>
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" disabled title="Chưa có phiên bản file">
                        Xem PDF
                      </Button>
                    )}
                    {d.status === "ARCHIVED" ? (
                      <Button size="sm" variant="outline" onClick={() => void updateDocument(d.publicId, "restore")}>
                        Khôi phục
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => void updateDocument(d.publicId, "archive")}>
                        Lưu trữ
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void updateDocument(d.publicId, "delete")}
                    >
                      Xóa
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contracts" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Thao tác hợp đồng</CardTitle>
              <Input
                placeholder="Tìm theo tiêu đề/email bên ký..."
                value={searchContract}
                onChange={(e) => setSearchContract(e.target.value)}
              />
            </CardHeader>
            <CardContent className="space-y-2">
              {contracts?.contracts.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.owner?.email ?? "không rõ chủ sở hữu"} · {c.signedCount}/{c.signers.length} đã ký ·
                      {" "}Hết hạn: {new Date(c.expiresAt).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => void updateContract(c.id, "remind")}>
                      Nhắc nhở
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void updateContract(c.id, "extendExpiry")}>
                      +7 ngày
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void updateContract(c.id, "cancel")}>
                      Hủy
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Dòng thời gian sử dụng (30 ngày)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {usage?.timeline.uploads.map((item) => (
                <div key={item.day} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <span>{item.day}</span>
                  <span>{item.count} lượt tải lên · {formatBytes(item.bytes)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Lỗi ký theo ngày (7 ngày)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {usage?.timeline.signingErrors.length ? (
                usage.timeline.signingErrors.map((item) => (
                  <div key={item.day} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <span>{item.day}</span>
                    <Badge variant={item.count > 0 ? "destructive" : "secondary"}>
                      {item.count} lỗi
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Không có lỗi ký trong 7 ngày gần nhất.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Người dùng hoạt động nhiều nhất</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {usage?.topUsersByRecentActivity.map((u) => (
                <div key={u.id} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{u.email ?? u.name ?? u.id}</p>
                  <p className="text-muted-foreground">{u.documents} tài liệu · {u.contracts} hợp đồng</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Tổng quan lưu trữ</CardTitle>
              <CardDescription>
                Tổng {storage?.totalVersions ?? 0} phiên bản · {formatBytes(totalStorageBytes)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {storage?.byDriver.map((d) => (
                <div key={d.storageDriver} className="flex items-center justify-between rounded-md border p-3">
                  <span className="font-medium">{d.storageDriver}</span>
                  <span className="text-sm text-muted-foreground">
                    {d.versionCount} tệp · {formatBytes(d.totalBytes)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Người dùng dùng nhiều dung lượng nhất</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {storage?.byUser.slice(0, 20).map((u) => (
                <div key={u.userId} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{u.email ?? u.userId}</p>
                  <p className="text-muted-foreground">{u.versions} phiên bản · {formatBytes(u.bytes)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
