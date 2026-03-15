"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Users,
  Mail,
  User,
  ArrowUpDown,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SignerInput {
  id: string;
  name: string;
  email: string;
  order: number;
}

interface CreateContractModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  totalPages: number;
}

let nextSignerId = 1;

export function CreateContractModal({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  totalPages,
}: CreateContractModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState(documentTitle || "Hợp đồng");
  const [message, setMessage] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [signers, setSigners] = useState<SignerInput[]>([
    { id: `s_${nextSignerId++}`, name: "", email: "", order: 1 },
    { id: `s_${nextSignerId++}`, name: "", email: "", order: 2 },
  ]);
  const [submitting, setSubmitting] = useState(false);

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
    setSigners(
      remaining.map((s, i) => ({ ...s, order: i + 1 }))
    );
  };

  const updateSigner = (id: string, field: keyof SignerInput, value: string | number) => {
    setSigners(
      signers.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const moveSigner = (index: number, direction: "up" | "down") => {
    const next = [...signers];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    setSigners(next.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const isValid =
    title.trim().length > 0 &&
    signers.length >= 1 &&
    signers.every(
      (s) =>
        s.name.trim().length > 0 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)
    );

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);

    try {
      const signersPayload = signers.map((s) => {
        const signerIndex = s.order - 1;
        const signersCount = signers.length;
        const signatureHeight = 0.08;
        const signatureWidth = 0.25;
        const gap = 0.02;
        const startY = 0.05 + signerIndex * (signatureHeight + gap);

        return {
          email: s.email.trim(),
          name: s.name.trim(),
          order: s.order,
          templateId: "classic",
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
          documentId,
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
      onOpenChange(false);
      router.push(`/contract/${data.contractId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Gửi ký nhiều bên
          </DialogTitle>
          <DialogDescription>
            Thêm các bên cần ký. Mỗi bên sẽ nhận email mời ký theo thứ tự.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
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
                <div
                  key={signer.id}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs font-bold">
                        {signer.order}
                      </div>
                      <span className="text-sm font-medium">
                        Bên ký #{signer.order}
                      </span>
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
                        onChange={(e) =>
                          updateSigner(signer.id, "name", e.target.value)
                        }
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
                        onChange={(e) =>
                          updateSigner(signer.id, "email", e.target.value)
                        }
                        placeholder="email@example.com"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
          >
            <Send className="h-4 w-4 mr-1.5" />
            {submitting ? "Đang tạo..." : "Tạo & Gửi email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
