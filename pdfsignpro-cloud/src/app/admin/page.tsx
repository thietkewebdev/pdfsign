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
  latestVersion: { sizeBytes: number } | null;
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
    throw new Error(`Request failed: ${url}`);
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
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        </div>
      )}

      <Tabs defaultValue="users">
        <TabsList className="flex w-full flex-wrap gap-1">
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="size-4" />
            Users ({userCount})
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-1.5">
            <Shield className="size-4" />
            Plans
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="size-4" />
            Documents ({docCount})
          </TabsTrigger>
          <TabsTrigger value="contracts" className="gap-1.5">
            <Files className="size-4" />
            Contracts ({contractCount})
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-1.5">
            <BarChart3 className="size-4" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="storage" className="gap-1.5">
            <HardDrive className="size-4" />
            Storage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>User management</CardTitle>
              <CardDescription>Search, lock/unlock, verify email, change plan.</CardDescription>
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
                      {u.email ?? "no-email"} · {u.plan} · {u.providers.join(", ") || "credentials"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {u.isDisabled ? (
                      <Badge variant="destructive">Locked</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                    {!u.emailVerified && (
                      <Button size="sm" variant="outline" onClick={() => void updateUser(u.id, "verifyEmail")}>
                        Verify
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void updateUser(u.id, u.isDisabled ? "unlock" : "lock")}
                    >
                      {u.isDisabled ? "Unlock" : "Lock"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void updateUser(u.id, "setPlan", "free")}>
                      Free
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void updateUser(u.id, "setPlan", "pro")}>
                      Pro
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
              <CardTitle>Plan distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {plans?.distribution.map((p) => (
                <div key={p.plan} className="flex items-center justify-between rounded-md border p-3">
                  <span className="font-medium">{p.plan}</span>
                  <Badge>{p.count} users</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Users over quota</CardTitle>
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
              <CardTitle>Document operations</CardTitle>
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
                      {d.publicId} · {d.owner?.email ?? "unknown"} · {formatBytes(d.latestVersion?.sizeBytes ?? 0)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {d.status === "ARCHIVED" ? (
                      <Button size="sm" variant="outline" onClick={() => void updateDocument(d.publicId, "restore")}>
                        Restore
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => void updateDocument(d.publicId, "archive")}>
                        Archive
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void updateDocument(d.publicId, "delete")}
                    >
                      Delete
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
              <CardTitle>Contract operations</CardTitle>
              <Input
                placeholder="Tìm theo title/email signer..."
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
                      {c.owner?.email ?? "owner?"} · {c.signedCount}/{c.signers.length} signed ·
                      {" "}Hết hạn: {new Date(c.expiresAt).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => void updateContract(c.id, "remind")}>
                      Remind
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void updateContract(c.id, "extendExpiry")}>
                      +7 ngày
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void updateContract(c.id, "cancel")}>
                      Cancel
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
              <CardTitle>Usage timeline (30 ngày)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {usage?.timeline.uploads.map((item) => (
                <div key={item.day} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <span>{item.day}</span>
                  <span>{item.count} uploads · {formatBytes(item.bytes)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top users by activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {usage?.topUsersByRecentActivity.map((u) => (
                <div key={u.id} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{u.email ?? u.name ?? u.id}</p>
                  <p className="text-muted-foreground">{u.documents} docs · {u.contracts} contracts</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Storage overview</CardTitle>
              <CardDescription>
                Total {storage?.totalVersions ?? 0} versions · {formatBytes(totalStorageBytes)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {storage?.byDriver.map((d) => (
                <div key={d.storageDriver} className="flex items-center justify-between rounded-md border p-3">
                  <span className="font-medium">{d.storageDriver}</span>
                  <span className="text-sm text-muted-foreground">
                    {d.versionCount} files · {formatBytes(d.totalBytes)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top storage users</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {storage?.byUser.slice(0, 20).map((u) => (
                <div key={u.userId} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{u.email ?? u.userId}</p>
                  <p className="text-muted-foreground">{u.versions} versions · {formatBytes(u.bytes)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
