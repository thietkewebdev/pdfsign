"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, Loader2, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PLAN_IDS, PLANS, formatVnd, type PlanId } from "@/lib/plans";

interface PaymentInfo {
  id: string;
  code: string;
  plan: string;
  planName: string;
  amountVnd: number;
  qrUrl: string;
  bank: string;
  accountNumber: string;
  accountName: string;
  transferContent: string;
  status: string;
  expiresAt: string;
}

export function UpgradePlans({
  currentPlan,
  onActivated,
}: {
  currentPlan: PlanId;
  onActivated?: () => void;
}) {
  const [creating, setCreating] = useState<PlanId | null>(null);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [paid, setPaid] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(
    (paymentId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/payments/${paymentId}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.status === "PAID") {
            stopPolling();
            setPaid(true);
            toast.success("Thanh toán thành công! Gói của bạn đã được kích hoạt.");
            onActivated?.();
          } else if (data.status === "EXPIRED") {
            stopPolling();
            toast.error("Mã thanh toán đã hết hạn. Vui lòng tạo lại.");
          }
        } catch {
          // transient network error, keep polling
        }
      }, 4000);
    },
    [onActivated, stopPolling]
  );

  const handleUpgrade = useCallback(
    async (plan: PlanId) => {
      setCreating(plan);
      setPaid(false);
      try {
        const res = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Không tạo được thanh toán");
          return;
        }
        setPayment(data);
        startPolling(data.id);
      } catch {
        toast.error("Có lỗi kết nối. Vui lòng thử lại.");
      } finally {
        setCreating(null);
      }
    },
    [startPolling]
  );

  const closeDialog = useCallback(() => {
    stopPolling();
    setPayment(null);
    setPaid(false);
  }, [stopPolling]);

  const copy = useCallback((text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`Đã sao chép ${label}`),
      () => undefined
    );
  }, []);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const isCurrent = id === currentPlan;
          return (
            <Card key={id} className={isCurrent ? "border-primary ring-1 ring-primary" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {isCurrent && <Badge>Đang dùng</Badge>}
                </div>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">
                    {plan.priceVnd === 0 ? "Miễn phí" : formatVnd(plan.priceVnd)}
                  </span>
                  {plan.priceVnd > 0 && <span className="text-sm"> / tháng</span>}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {plan.paid ? (
                  <Button
                    className="w-full"
                    variant={isCurrent ? "outline" : "default"}
                    disabled={creating !== null}
                    onClick={() => void handleUpgrade(id)}
                  >
                    {creating === id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : isCurrent ? (
                      "Gia hạn"
                    ) : (
                      "Nâng cấp"
                    )}
                  </Button>
                ) : (
                  <Button className="w-full" variant="outline" disabled>
                    {isCurrent ? "Đang dùng" : "Gói cơ bản"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={payment !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {paid ? "Kích hoạt thành công" : `Thanh toán gói ${payment?.planName ?? ""}`}
            </DialogTitle>
            <DialogDescription>
              {paid
                ? "Cảm ơn bạn! Gói dịch vụ đã được kích hoạt tự động."
                : "Quét mã QR bằng app ngân hàng. Gói sẽ tự kích hoạt sau khi nhận được tiền."}
            </DialogDescription>
          </DialogHeader>

          {paid ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="size-16 text-green-600" />
              <Button onClick={closeDialog}>Hoàn tất</Button>
            </div>
          ) : payment ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <Image
                  src={payment.qrUrl}
                  alt="Mã QR thanh toán"
                  width={240}
                  height={240}
                  unoptimized
                  className="rounded-lg border"
                />
              </div>
              <div className="space-y-1.5 rounded-lg border p-3 text-sm">
                <Row label="Ngân hàng" value={payment.bank} />
                <Row
                  label="Số tài khoản"
                  value={payment.accountNumber}
                  onCopy={() => copy(payment.accountNumber, "số tài khoản")}
                />
                {payment.accountName && <Row label="Chủ tài khoản" value={payment.accountName} />}
                <Row
                  label="Số tiền"
                  value={formatVnd(payment.amountVnd)}
                  onCopy={() => copy(String(payment.amountVnd), "số tiền")}
                />
                <Row
                  label="Nội dung CK"
                  value={payment.transferContent}
                  onCopy={() => copy(payment.transferContent, "nội dung chuyển khoản")}
                />
              </div>
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Đang chờ thanh toán...
              </p>
              <p className="text-center text-xs text-muted-foreground">
                Lưu ý: giữ nguyên nội dung chuyển khoản <strong>{payment.transferContent}</strong> để
                hệ thống tự nhận diện.
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 font-medium">
        {value}
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Sao chép ${label}`}
          >
            <Copy className="size-3.5" />
          </button>
        )}
      </span>
    </div>
  );
}
