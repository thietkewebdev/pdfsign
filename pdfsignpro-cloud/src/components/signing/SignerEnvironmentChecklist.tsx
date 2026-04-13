"use client";

import { CheckCircle2, CircleAlert, CircleX, MonitorSmartphone, ShieldCheck, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasOpenedSignerBefore, isHttpsClient, isWindowsClient } from "@/lib/signer-launch";

type ChecklistItem = {
  id: string;
  label: string;
  hint: string;
  state: "ok" | "warn" | "fail";
};

interface SignerEnvironmentChecklistProps {
  className?: string;
}

function statusIcon(state: ChecklistItem["state"]) {
  if (state === "ok") return <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />;
  if (state === "warn") return <CircleAlert className="size-4 text-amber-600" aria-hidden />;
  return <CircleX className="size-4 text-rose-600" aria-hidden />;
}

export function SignerEnvironmentChecklist({ className }: SignerEnvironmentChecklistProps) {
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
        : "Nên dùng HTTPS để ổn định hơn.",
      state: isHttpsClient() ? "ok" : "warn",
    },
    {
      id: "deeplink",
      label: "Trình duyệt đã từng mở Signer",
      hint: hasOpenedSignerBefore()
        ? "Đã nhận diện mở Signer trên máy này."
        : "Nếu bấm Ký chưa mở app, hãy dùng 'Mở Signer lại'.",
      state: hasOpenedSignerBefore() ? "ok" : "warn",
    },
  ];

  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-3", className)}>
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">
        Sẵn sàng ký
      </p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              {item.id === "os" ? (
                <MonitorSmartphone className="size-4 text-slate-500" aria-hidden />
              ) : item.id === "https" ? (
                <ShieldCheck className="size-4 text-slate-500" aria-hidden />
              ) : (
                <Workflow className="size-4 text-slate-500" aria-hidden />
              )}
              <span className="min-w-0 flex-1">{item.label}</span>
              {statusIcon(item.state)}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{item.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
