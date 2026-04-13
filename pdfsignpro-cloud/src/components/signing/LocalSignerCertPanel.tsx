"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { probeLocalSigner } from "@/lib/local-signer";
import { CheckCircle2, Loader2, ShieldX } from "lucide-react";
import { launchSignerWithFallback } from "@/lib/signer-launch";

interface LocalSignerCertPanelProps {
  autoLaunchDeepLink?: string | null;
}

export function LocalSignerCertPanel({ autoLaunchDeepLink }: LocalSignerCertPanelProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [autoConnecting, setAutoConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastAutoLaunchedDeepLinkRef = useRef<string | null>(null);

  const checkConnection = useCallback(async () => {
    const health = await probeLocalSigner();
    setConnected(!!health?.ok);
    return !!health?.ok;
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void checkConnection();
    }, 0);
    return () => window.clearTimeout(t);
  }, [checkConnection]);

  const autoOpenSigner = useCallback(async () => {
    if (!autoLaunchDeepLink) {
      setError("Signer chưa sẵn sàng. Hãy bấm Ký để hệ thống tự mở ứng dụng ký.");
      return;
    }
    setAutoConnecting(true);
    setError("Đang mở PDFSignPro Signer...");
    launchSignerWithFallback({
      deepLink: autoLaunchDeepLink,
      fallbackDelayMs: 2200,
      onFallback: () => {
        setError("Chưa mở được Signer tự động. Vui lòng thử lại thao tác ký.");
      },
      onLikelyOpened: () => {
        window.setTimeout(() => {
          void checkConnection();
        }, 1200);
      },
    });

    const maxRetries = 7;
    let found = false;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 800 : 1200));
      const ok = await checkConnection();
      if (ok) {
        found = true;
        break;
      }
    }

    if (found) {
      setError(null);
    } else {
      setError("Signer chưa phản hồi. Bạn có thể thử bấm Ký lại.");
    }
    setAutoConnecting(false);
  }, [autoLaunchDeepLink, checkConnection]);

  useEffect(() => {
    if (!autoLaunchDeepLink) return;
    if (lastAutoLaunchedDeepLinkRef.current === autoLaunchDeepLink) return;
    lastAutoLaunchedDeepLinkRef.current = autoLaunchDeepLink;
    const t = window.setTimeout(() => {
      void autoOpenSigner();
    }, 0);
    return () => window.clearTimeout(t);
  }, [autoLaunchDeepLink, autoOpenSigner]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        {connected ? (
          <CheckCircle2 className="size-4 text-emerald-600" />
        ) : (
          <ShieldX className="size-4 text-amber-600" />
        )}
        <p className="text-sm font-semibold text-slate-900">
          Kết nối Signer local
        </p>
        <button
          type="button"
          onClick={() => void checkConnection()}
          className="ml-auto text-xs font-medium text-primary hover:underline"
        >
          Kiểm tra lại
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {connected
          ? "Đã kết nối Signer. Hãy nhập PIN trực tiếp trong ứng dụng Signer để ký."
          : "Không bắt buộc mở trước. Khi bấm Ký, web sẽ tự mở PDFSignPro Signer."}
      </p>

      {!connected && autoLaunchDeepLink && (
        <button
          type="button"
          onClick={() => void autoOpenSigner()}
          disabled={autoConnecting}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          {autoConnecting ? "Đang kết nối Signer..." : "Mở Signer tự động"}
        </button>
      )}

      {autoConnecting && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
          <Loader2 className="size-3.5 animate-spin" />
          Đang tự mở và kết nối Signer...
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
