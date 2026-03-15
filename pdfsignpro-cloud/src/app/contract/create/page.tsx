"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Users,
  Mail,
  User,
  Plus,
  Trash2,
  ArrowUpDown,
  Send,
  ArrowLeft,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

interface SignerInput {
  id: string;
  name: string;
  email: string;
  order: number;
}

interface DocItem {
  id: string;
  publicId: string;
  title: string;
  latestVersion: number;
}

let nextSignerId = 1;

export default function CreateContractPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CreateContractContent />
    </Suspense>
  );
}

function CreateContractContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; title: string } | null>(null);

  // Step 2 form
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [signers, setSigners] = useState<SignerInput[]>([
    { id: `s_${nextSignerId++}`, name: "", email: "", order: 1 },
    { id: `s_${nextSignerId++}`, name: "", email: "", order: 2 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/contract/create");
      return;
    }
  }, [status, router]);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents?mine=1");
      if (res.status === 401) {
        router.push("/login?callbackUrl=/contract/create");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } finally {
      setLoadingDocs(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "authenticated") fetchDocuments();
  }, [status, fetchDocuments]);

  const handleFileSelect = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Chỉ chấp nhận file PDF");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name.replace(/\.pdf$/i, ""));

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setSelectedDoc({ id: data.documentId, title: data.title || file.name });
      setTitle(data.title || file.name.replace(/\.pdf$/i, ""));
      setStep(2);
      toast.success("Đã tải PDF lên");
    } catch {
      toast.error("Không thể tải tài liệu lên");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleSelectExisting = (doc: DocItem) => {
    setSelectedDoc({ id: doc.id, title: doc.title });
    setTitle(doc.title);
    setStep(2);
  };

  const addSigner = () => {
    const maxOrder = Math.max(0, ...signers.map((s) => s.order));
    setSigners([
      ...signers,
      { id: `s_${nextSignerId++}`, name: "", email: "", order: maxOrder + 1 },
    ]);
  };

  const removeSigner = (id: string) => {
    if (signers.length <= 1) return;
    const remaining = signers.filter((s) => s.id !== id);
    setSigners(remaining.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const updateSigner = (id: string, field: keyof SignerInput, value: string | number) => {
    setSigners(signers.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const moveSigner = (index: number, direction: "up" | "down") => {
    const next = [...signers];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    setSigners(next.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const isValid =
    selectedDoc &&
    title.trim().length > 0 &&
    signers.length >= 1 &&
    signers.every(
      (s) =>
        s.name.trim().length > 0 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)
    );

  const handleSubmit = async () => {
    if (!isValid || !selectedDoc) return;
    setSubmitting(true);
    try {
      const signersPayload = signers.map((s) => {
        const signerIndex = s.order - 1;
        const signatureHeight = 0.08;
        const signatureWidth = 0.25;
        const gap = 0.02;
        const startY = 0.05 + signerIndex * (signatureHeight + gap);

        return {
          email: s.email.trim(),
          name: s.name.trim(),
          order: s.order,
          templateId: "valid",
          placement: {
            page: "LAST" as const,
            rectPct: {
              x: 0.55,
              y: Math.min(startY, 1 - signatureHeight),
              w: signatureWidth,
              h: signatureHeight,
            },
          },
        };
      });

      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: selectedDoc.id,
          title: title.trim(),
          message: message.trim() || undefined,
          expiresInDays,
          signers: signersPayload,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to create contract");
      }

      const data = await res.json();
      toast.success("Đã tạo hợp đồng và gửi email cho bên ký đầu tiên!");
      router.push(`/contract/${data.contractId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard?tab=contracts" className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 text-white">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tạo hợp đồng điện tử</h1>
          <p className="text-sm text-muted-foreground">
            {step === 1
              ? "Chọn tài liệu PDF để gửi ký nhiều bên"
              : "Thêm người ký và cấu hình hợp đồng"}
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-8 flex items-center gap-2">
        <div
          className={`flex items-center gap-2 ${step >= 1 ? "text-primary" : "text-muted-foreground"}`}
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}
          >
            {step > 1 ? <Check className="h-4 w-4" /> : 1}
          </div>
          <span className="text-sm font-medium">Chọn tài liệu</span>
        </div>
        <div className="h-px flex-1 bg-border" />
        <div
          className={`flex items-center gap-2 ${step >= 2 ? "text-primary" : "text-muted-foreground"}`}
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}
          >
            2
          </div>
          <span className="text-sm font-medium">Thêm người ký</span>
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          {/* Upload zone */}
          <Card
            className={`cursor-pointer border-2 border-dashed transition-colors hover:border-primary/50 ${
              uploading ? "pointer-events-none opacity-70" : ""
            }`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !uploading && document.getElementById("file-upload")?.click()}
          >
            <CardContent className="flex flex-col items-center justify-center py-12">
              <input
                id="file-upload"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = "";
                }}
              />
              {uploading ? (
                <Loader2 className="mb-3 h-12 w-12 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="mb-3 h-12 w-12 text-muted-foreground" />
              )}
              <p className="font-medium">
                {uploading ? "Đang tải lên..." : "Kéo thả PDF vào đây hoặc bấm để chọn"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Chỉ chấp nhận file PDF
              </p>
            </CardContent>
          </Card>

          {/* Existing documents */}
          {documents.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Hoặc chọn từ tài liệu đã có
              </h3>
              <div className="space-y-2">
                {documents.map((doc) => (
                  <Card
                    key={doc.id}
                    className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30"
                    onClick={() => handleSelectExisting(doc)}
                  >
                    <CardContent className="flex items-center gap-3 py-3">
                      <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">v{doc.latestVersion}</p>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <span>Chọn</span>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {documents.length === 0 && !loadingDocs && (
            <p className="text-center text-sm text-muted-foreground">
              Chưa có tài liệu. Tải PDF lên ở trên để bắt đầu.
            </p>
          )}
        </div>
      )}

      {step === 2 && selectedDoc && (
        <div className="space-y-6">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 py-3">
              <FileText className="h-8 w-8 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{selectedDoc.title}</p>
                <p className="text-xs text-muted-foreground">Tài liệu đã chọn</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep(1);
                  setSelectedDoc(null);
                }}
              >
                Đổi
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contract-title">Tên hợp đồng</Label>
              <Input
                id="contract-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Hợp đồng hợp tác kinh doanh"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contract-message">Lời nhắn (tùy chọn)</Label>
              <Input
                id="contract-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="VD: Vui lòng ký trong 3 ngày"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contract-expires">Hạn ký (ngày)</Label>
              <Input
                id="contract-expires"
                type="number"
                min={1}
                max={90}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(parseInt(e.target.value) || 7)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Bên ký ({signers.length})</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSigner}
                  disabled={signers.length >= 10}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Thêm
                </Button>
              </div>

              <div className="space-y-3">
                {signers.map((signer, index) => (
                  <Card key={signer.id}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs font-bold">
                            {signer.order}
                          </div>
                          <span className="text-sm font-medium">Bên ký #{signer.order}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => moveSigner(index, "up")}
                            disabled={index === 0}
                          >
                            <ArrowUpDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                            onClick={() => removeSigner(signer.id)}
                            disabled={signers.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs flex items-center gap-1">
                            <User className="h-3 w-3" /> Họ tên
                          </Label>
                          <Input
                            value={signer.name}
                            onChange={(e) => updateSigner(signer.id, "name", e.target.value)}
                            placeholder="Nguyễn Văn A"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs flex items-center gap-1">
                            <Mail className="h-3 w-3" /> Email
                          </Label>
                          <Input
                            type="email"
                            value={signer.email}
                            onChange={(e) => updateSigner(signer.id, "email", e.target.value)}
                            placeholder="email@example.com"
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="flex-1"
            >
              Quay lại
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isValid || submitting}
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
            >
              <Send className="h-4 w-4 mr-1.5" />
              {submitting ? "Đang tạo..." : "Tạo & Gửi email"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
