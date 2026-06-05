"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { PlanId } from "@/lib/plans";

export interface PaymentInfo {
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

/**
 * Shared SePay payment flow: create a payment, render its QR, and poll until it
 * is PAID (auto-activated) or EXPIRED. Reused by the homepage pricing section
 * and the dashboard upgrade panel.
 */
export function usePaymentFlow(onActivated?: () => void) {
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

  const start = useCallback(
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

  const close = useCallback(() => {
    stopPolling();
    setPayment(null);
    setPaid(false);
  }, [stopPolling]);

  return { creating, payment, paid, start, close };
}
