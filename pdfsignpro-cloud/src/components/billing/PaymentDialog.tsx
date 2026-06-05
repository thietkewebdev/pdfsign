"use client";

import { useCallback } from "react";
import Image from "next/image";
import { Loader2, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatVnd } from "@/lib/plans";
import type { PaymentInfo } from "./usePaymentFlow";

/** Presentational SePay payment dialog (QR + bank details + paid state). */
export function PaymentDialog({
  payment,
  paid,
  onClose,
}: {
  payment: PaymentInfo | null;
  paid: boolean;
  onClose: () => void;
}) {
  const copy = useCallback((text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`Đã sao chép ${label}`),
      () => undefined
    );
  }, []);

  return (
    <Dialog open={payment !== null} onOpenChange={(open) => !open && onClose()}>
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
            <Button onClick={onClose}>Hoàn tất</Button>
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
