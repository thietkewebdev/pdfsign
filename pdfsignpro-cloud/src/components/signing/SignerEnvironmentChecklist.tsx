"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CircleX,
  Loader2,
  MonitorSmartphone,
  Plug,
  RefreshCw,
  ShieldCheck,
  Usb,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  hasOpenedSignerBefore,
  isHttpsClient,
  isWindowsClient,
} from "@/lib/signer-launch";
import {
  probeLocalSigner,
  type LocalSignerHealthResponse,
} from "@/lib/local-signer";

type ChecklistItem = {
  id: string;
  label: string;
  hint: string;
  state: "ok" | "warn" | "fail" | "pending";
  href?: string;
};

interface SignerEnvironmentChecklistProps {
  className?: string;
}

function statusIcon(state: ChecklistItem["state"]) {
  if (state === "pending")
    return <Loader2 className="size-4 animate-spin text-slate-400" aria-hidden />;
  if (state === "ok")
    return <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />;
  if (state === "warn")
    return <CircleAlert className="size-4 text-amber-600" aria-hidden />;
  return <CircleX className="size-4 text-rose-600" aria-hidden />;
}

function itemIcon(id: string) {
  if (id === "os") return <MonitorSmartphone className="size-4 text-slate-500" aria-hidden />;
  if (id === "https") return <ShieldCheck className="size-4 text-slate-500" aria-hidden />;
  if (id === "bridge") return <Plug className="size-4 text-slate-500" aria-hidden />;
  if (id === "pkcs11") return <Usb className="size-4 text-slate-500" aria-hidden />;
  return <Workflow className="size-4 text-slate-500" aria-hidden />;
}

export function SignerEnvironmentChecklist({
  className,
}: SignerEnvironmentChecklistProps) {
  const [health, setHealth] = useState<LocalSignerHealthResponse | null>(null);
  const [probing, setProbing] = useState(true);

  const refresh = useCallback(async () => {
    setProbing(true);
    const h = await probeLocalSigner();
    setHealth(h);
    setProbing(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 8000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const bridgeOk = !!health?.ok;
  const pkcs11Found = !!health?.pkcs11?.found;
  const dllCount = health?.pkcs11?.dllCount ?? 0;

  const items: ChecklistItem[] = [
    {
      id: "os",
      label: "Hệ điều hành Windows",
      hint: isWindowsClient()
        ? "Đã hỗ trợ ký bằng USB Token."
        : "Signer hiện chỉ hỗ trợ Windows.",
      state: isWindowsClient() ? "ok" : "fail",
    },
    {
      id: "https",
      label: "Kết nối truy cập",
      hint: isHttpsClient()
        ? "Kết nối phù hợp để mở Signer."
        : "Nên dùng HTTPS (hoặc localhost) để ổn định hơn.",
      state: isHttpsClient() ? "ok" : "warn",
    },
    {
      id: "bridge",
      label: "PDFSignPro Signer đang chạy",
      hint: probing
        ? "Đang kiểm tra kết nối local (cổng 17886)…"
        : bridgeOk
          ? `Đã kết nối${health?.version ? ` · v${health.version}` : ""}${
              health?.installMode ? ` · ${health.installMode}` : ""
            }.`
          : "Chưa thấy Signer. Cài Setup (không cần admin) rồi mở app, hoặc bấm Ký để tự mở.",
      state: probing ? "pending" : bridgeOk ? "ok" : "warn",
      href: bridgeOk ? undefined : "/signer",
    },
    {
      id: "pkcs11",
      label: "Driver USB Token (PKCS#11)",
      hint: !bridgeOk
        ? "Cần mở Signer trước để quét driver trên máy."
        : pkcs11Found
          ? `Đã thấy ${dllCount} module PKCS#11${
              health?.pkcs11?.dlls?.length
                ? `: ${health.pkcs11.dlls.slice(0, 2).join(", ")}`
                : ""
            }.`
          : "Chưa thấy DLL PKCS#11. Cài middleware từ Viettel / VNPT / FPT / BKAV… rồi cắm token.",
      state: !bridgeOk
        ? "warn"
        : probing
          ? "pending"
          : pkcs11Found
            ? "ok"
            : "fail",
      href: !bridgeOk || pkcs11Found ? undefined : "/signer",
    },
    {
      id: "deeplink",
      label: "Trình duyệt đã từng mở Signer",
      hint: hasOpenedSignerBefore()
        ? "Đã nhận diện mở Signer trên máy này."
        : "Nếu bấm Ký chưa mở app: tải lại Setup để đăng ký pdfsignpro://.",
      state: hasOpenedSignerBefore() ? "ok" : "warn",
      href: hasOpenedSignerBefore() ? undefined : "/signer",
    },
  ];

  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Sẵn sàng ký
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <RefreshCw className={cn("size-3", probing && "animate-spin")} />
          Kiểm tra lại
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              {itemIcon(item.id)}
              <span className="min-w-0 flex-1">{item.label}</span>
              {statusIcon(item.state)}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{item.hint}</p>
            {item.href && (
              <Link
                href={item.href}
                className="mt-1 inline-block text-[11px] font-semibold text-primary hover:underline"
              >
                Tải / hướng dẫn cài Signer →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
